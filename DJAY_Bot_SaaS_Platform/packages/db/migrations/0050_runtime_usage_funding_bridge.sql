CREATE OR REPLACE FUNCTION tenancy.fund_restricted_runtime_reservation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE
  account record;
  available_packs numeric := 0;
  prior_committed numeric;
  included_funding numeric;
  pack_funding numeric;
  overage_funding numeric := 0;
  remaining numeric;
  safe_error text;
BEGIN
  IF NEW.status <> 'reserved'
     OR NEW.funding_json IS DISTINCT FROM '{"included":0,"packs":0,"overage":0}'::jsonb THEN
    RETURN NEW;
  END IF;
  IF session_user = 'djay_runtime' THEN
    RAISE EXCEPTION 'unfunded_tenant_usage_reservation_forbidden';
  END IF;
  IF session_user NOT IN ('djay_flowbot_runtime', 'djay_ai_runtime', 'djay_voice_runtime', 'djay_worker') THEN
    RETURN NEW;
  END IF;
  IF session_user = 'djay_worker'
     AND current_setting('app.service', true) IS DISTINCT FROM 'ai_social_worker' THEN
    RAISE EXCEPTION 'unfunded_worker_usage_reservation_forbidden';
  END IF;

  SELECT quota.* INTO account
  FROM tenancy.quota_accounts quota
  WHERE quota.tenant_id = NEW.tenant_id AND quota.id = NEW.quota_account_id
  FOR UPDATE;
  IF account IS NULL
     OR account.reserved_quantity < NEW.reserved_quantity
     OR account.product_key || ':' || account.customer_unit NOT IN (
       'flowbot:flow_execution', 'ai_chat:ai_response', 'voice:voice_minute'
     )
     OR NOT EXISTS (
       SELECT 1 FROM tenancy.entitlement_snapshots snapshot
       JOIN tenancy.product_subscriptions subscription
         ON subscription.tenant_id = snapshot.tenant_id
        AND subscription.id = snapshot.subscription_id
       WHERE snapshot.tenant_id = NEW.tenant_id
         AND snapshot.id = NEW.entitlement_snapshot_id
         AND snapshot.subscription_id = account.subscription_id
         AND snapshot.product_key = account.product_key
         AND snapshot.access_mode = 'active'
         AND subscription.status IN ('active', 'trialing', 'scheduled_change')
     ) THEN
    RAISE EXCEPTION 'runtime_usage_authority_invalid';
  END IF;

  prior_committed := account.reserved_quantity + account.settled_quantity - NEW.reserved_quantity;
  IF prior_committed < 0 THEN RAISE EXCEPTION 'runtime_usage_ledger_invalid'; END IF;
  IF account.safety_cap_quantity IS NOT NULL
     AND prior_committed + NEW.reserved_quantity > account.safety_cap_quantity THEN
    safe_error := CASE account.product_key
      WHEN 'flowbot' THEN 'flowbot_safety_cap'
      WHEN 'ai_chat' THEN 'ai_safety_cap'
      ELSE 'voice_safety_cap'
    END;
    RAISE EXCEPTION '%', safe_error;
  END IF;

  remaining := NEW.reserved_quantity;
  included_funding := LEAST(remaining,
    GREATEST(COALESCE(account.included_quantity, 0) - prior_committed, 0));
  remaining := remaining - included_funding;
  SELECT COALESCE(sum(GREATEST(lot.purchased_quantity - COALESCE((
    SELECT sum(CASE consumption.event_type WHEN 'allocated' THEN consumption.quantity
      ELSE -consumption.quantity END)
    FROM tenancy.usage_pack_consumptions consumption
    WHERE consumption.tenant_id = lot.tenant_id AND consumption.pack_lot_id = lot.id
  ), 0), 0)), 0) INTO available_packs
  FROM tenancy.usage_pack_lots lot
  WHERE lot.tenant_id = NEW.tenant_id
    AND lot.subscription_id = account.subscription_id
    AND lot.customer_unit = account.customer_unit AND lot.status = 'active'
    AND lot.effective_from <= now() AND lot.expires_at > now();
  pack_funding := LEAST(remaining, available_packs);
  remaining := remaining - pack_funding;
  IF remaining > 0 AND account.overage_consent_status = 'consented' THEN
    overage_funding := remaining;
    remaining := 0;
  END IF;
  IF remaining > 0 THEN
    safe_error := CASE account.product_key
      WHEN 'flowbot' THEN 'flowbot_allowance_exhausted'
      WHEN 'ai_chat' THEN 'ai_allowance_exhausted'
      ELSE 'voice_allowance_exhausted'
    END;
    RAISE EXCEPTION '%', safe_error;
  END IF;
  NEW.funding_json := jsonb_build_object(
    'included', included_funding, 'packs', pack_funding, 'overage', overage_funding);
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.allocate_restricted_runtime_packs()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE
  account record;
  lot record;
  remaining numeric;
  allocation numeric;
  allocation_index integer := 0;
BEGIN
  remaining := COALESCE((NEW.funding_json->>'packs')::numeric, 0);
  IF NEW.status <> 'reserved' OR remaining <= 0 THEN RETURN NULL; END IF;
  SELECT quota.subscription_id, quota.customer_unit INTO account
  FROM tenancy.quota_accounts quota
  WHERE quota.tenant_id = NEW.tenant_id AND quota.id = NEW.quota_account_id;
  FOR lot IN
    SELECT candidate.id, GREATEST(candidate.purchased_quantity - COALESCE((
      SELECT sum(CASE consumption.event_type WHEN 'allocated' THEN consumption.quantity
        ELSE -consumption.quantity END)
      FROM tenancy.usage_pack_consumptions consumption
      WHERE consumption.tenant_id = candidate.tenant_id
        AND consumption.pack_lot_id = candidate.id
    ), 0), 0) AS available
    FROM tenancy.usage_pack_lots candidate
    WHERE candidate.tenant_id = NEW.tenant_id
      AND candidate.subscription_id = account.subscription_id
      AND candidate.customer_unit = account.customer_unit
      AND candidate.status = 'active'
      AND candidate.effective_from <= now() AND candidate.expires_at > now()
    ORDER BY candidate.expires_at, candidate.created_at, candidate.id
  LOOP
    EXIT WHEN remaining <= 0;
    allocation := LEAST(remaining, lot.available);
    IF allocation > 0 THEN
      INSERT INTO tenancy.usage_pack_consumptions (
        tenant_id, pack_lot_id, reservation_id, event_type, quantity, idempotency_key
      ) VALUES (NEW.tenant_id, lot.id, NEW.id, 'allocated', allocation,
        'runtime:pack:' || NEW.id::text || ':' || allocation_index::text);
      remaining := remaining - allocation;
      allocation_index := allocation_index + 1;
    END IF;
  END LOOP;
  IF remaining > 0 THEN RAISE EXCEPTION 'runtime_pack_allocation_incomplete'; END IF;
  RETURN NULL;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.protect_usage_reservation_authority()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, tenancy AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.quota_account_id IS DISTINCT FROM OLD.quota_account_id
     OR NEW.entitlement_snapshot_id IS DISTINCT FROM OLD.entitlement_snapshot_id
     OR NEW.operation_id IS DISTINCT FROM OLD.operation_id
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.requested_quantity IS DISTINCT FROM OLD.requested_quantity
     OR NEW.reserved_quantity IS DISTINCT FROM OLD.reserved_quantity
     OR NEW.funding_json IS DISTINCT FROM OLD.funding_json
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR (OLD.status <> 'reserved' AND NEW.status IS DISTINCT FROM OLD.status)
     OR (OLD.status = 'reserved' AND NEW.status NOT IN ('reserved', 'settled', 'released')) THEN
    RAISE EXCEPTION 'usage_reservation_authority_is_immutable';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.release_restricted_runtime_packs()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE
  allocation record;
  required_pack_funding numeric;
  release_remaining numeric;
  release_quantity numeric;
  release_index integer := 0;
BEGIN
  IF OLD.status <> 'reserved' OR NEW.status NOT IN ('settled', 'released') THEN RETURN NULL; END IF;
  required_pack_funding := LEAST(COALESCE((OLD.funding_json->>'packs')::numeric, 0),
    GREATEST(COALESCE(NEW.settled_quantity, 0)
      - COALESCE((OLD.funding_json->>'included')::numeric, 0), 0));
  SELECT GREATEST(COALESCE(sum(CASE consumption.event_type
      WHEN 'allocated' THEN consumption.quantity ELSE -consumption.quantity END), 0)
      - required_pack_funding, 0)
  INTO release_remaining
  FROM tenancy.usage_pack_consumptions consumption
  WHERE consumption.tenant_id = NEW.tenant_id AND consumption.reservation_id = NEW.id;
  FOR allocation IN
    SELECT consumption.pack_lot_id,
      sum(CASE consumption.event_type WHEN 'allocated' THEN consumption.quantity
        ELSE -consumption.quantity END) AS allocated
    FROM tenancy.usage_pack_consumptions consumption
    WHERE consumption.tenant_id = NEW.tenant_id AND consumption.reservation_id = NEW.id
    GROUP BY consumption.pack_lot_id
    ORDER BY min(consumption.created_at), consumption.pack_lot_id
  LOOP
    EXIT WHEN release_remaining <= 0;
    release_quantity := LEAST(release_remaining, GREATEST(allocation.allocated, 0));
    IF release_quantity > 0 THEN
      INSERT INTO tenancy.usage_pack_consumptions (
        tenant_id, pack_lot_id, reservation_id, event_type, quantity, idempotency_key
      ) VALUES (NEW.tenant_id, allocation.pack_lot_id, NEW.id, 'released', release_quantity,
        'runtime:pack-release:' || NEW.id::text || ':' || release_index::text)
      ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
      release_remaining := release_remaining - release_quantity;
      release_index := release_index + 1;
    END IF;
  END LOOP;
  RETURN NULL;
END
$$;

CREATE TRIGGER tenancy_usage_reservation_runtime_funding
BEFORE INSERT ON tenancy.usage_reservations
FOR EACH ROW EXECUTE FUNCTION tenancy.fund_restricted_runtime_reservation();

CREATE TRIGGER tenancy_usage_reservation_runtime_pack_allocation
AFTER INSERT ON tenancy.usage_reservations
FOR EACH ROW EXECUTE FUNCTION tenancy.allocate_restricted_runtime_packs();

CREATE TRIGGER tenancy_usage_reservation_authority_immutable
BEFORE UPDATE ON tenancy.usage_reservations
FOR EACH ROW EXECUTE FUNCTION tenancy.protect_usage_reservation_authority();

CREATE TRIGGER tenancy_usage_reservation_runtime_pack_release
AFTER UPDATE OF status, settled_quantity ON tenancy.usage_reservations
FOR EACH ROW EXECUTE FUNCTION tenancy.release_restricted_runtime_packs();

REVOKE ALL ON FUNCTION tenancy.fund_restricted_runtime_reservation() FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.allocate_restricted_runtime_packs() FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.protect_usage_reservation_authority() FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.release_restricted_runtime_packs() FROM PUBLIC;
