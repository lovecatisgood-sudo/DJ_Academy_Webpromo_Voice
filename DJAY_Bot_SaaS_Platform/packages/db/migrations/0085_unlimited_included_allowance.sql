-- 0085 — NULL included_quantity means UNLIMITED, not zero.
--
-- ## The defect
--
-- The catalog convention for an unlimited allowance is `allowances.<unit>: null`, which reaches
-- the database as `tenancy.quota_accounts.included_quantity IS NULL`. Both funding paths wrapped
-- that value in `COALESCE(account.included_quantity, 0)`:
--
--   0048_usage_funding_authority.sql:81   reserve_customer_usage
--   0070_flowbot_social_usage_funding.sql:42  fund_restricted_runtime_reservation
--
-- So "unlimited" collapsed to an allowance of zero. With no usage packs and no overage consent,
-- `remaining > 0` on the very first unit and every reservation was refused as
-- `<product>_allowance_exhausted`. An unlimited plan would have been completely unusable.
--
-- Nothing currently sets NULL, so the defect is dormant — but it sits directly across the
-- upgrade path we intend to sell, and it fails in the least debuggable direction: an entitled,
-- paying tenant is told their allowance is exhausted.
--
-- ## The fix
--
-- Treat `included_quantity IS NULL` as unlimited: included funding covers the whole request, so
-- packs and overage are never consulted. `safety_cap_quantity` is deliberately still enforced —
-- unlimited is a commercial statement, not a licence to run away, and the cap is the abuse floor.
--
-- ## Why these functions are recreated
--
-- The arithmetic is inline in two function bodies, so it cannot be corrected additively. Both
-- bodies below are copied VERBATIM from their latest definitions — verified as latest:
-- `fund_restricted_runtime_reservation` was last defined in 0070 (previously 0050), and
-- `reserve_customer_usage` has only ever been defined in 0048. The only edits are the
-- included-funding branches, marked "0085:" in each body. All SECURITY DEFINER settings,
-- search_path, session_user guards, app.service guards, RETURNS TABLE columns, and grants are
-- preserved; `packages/db/src/migration-function-lineage.ts` asserts this mechanically.

CREATE OR REPLACE FUNCTION tenancy.fund_restricted_runtime_reservation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE
  account record; available_packs numeric := 0; prior_committed numeric;
  included_funding numeric; pack_funding numeric; overage_funding numeric := 0;
  remaining numeric; safe_error text;
BEGIN
  IF NEW.status <> 'reserved'
     OR NEW.funding_json IS DISTINCT FROM '{"included":0,"packs":0,"overage":0}'::jsonb THEN RETURN NEW; END IF;
  IF session_user = 'djay_runtime' THEN RAISE EXCEPTION 'unfunded_tenant_usage_reservation_forbidden'; END IF;
  IF session_user NOT IN ('djay_flowbot_runtime', 'djay_ai_runtime', 'djay_voice_runtime', 'djay_worker') THEN RETURN NEW; END IF;
  IF session_user = 'djay_worker'
     AND current_setting('app.service', true) NOT IN ('ai_social_worker', 'flow_social_worker') THEN
    RAISE EXCEPTION 'unfunded_worker_usage_reservation_forbidden'; END IF;

  SELECT quota.* INTO account FROM tenancy.quota_accounts quota
  WHERE quota.tenant_id = NEW.tenant_id AND quota.id = NEW.quota_account_id FOR UPDATE;
  IF account IS NULL OR account.reserved_quantity < NEW.reserved_quantity
     OR account.product_key || ':' || account.customer_unit NOT IN (
       'flowbot:flow_execution', 'ai_chat:ai_response', 'voice:voice_minute')
     OR NOT EXISTS (
       SELECT 1 FROM tenancy.entitlement_snapshots snapshot
       JOIN tenancy.product_subscriptions subscription ON subscription.tenant_id = snapshot.tenant_id
         AND subscription.id = snapshot.subscription_id
       WHERE snapshot.tenant_id = NEW.tenant_id AND snapshot.id = NEW.entitlement_snapshot_id
         AND snapshot.subscription_id = account.subscription_id AND snapshot.product_key = account.product_key
         AND snapshot.access_mode = 'active'
         AND subscription.status IN ('active', 'trialing', 'scheduled_change')) THEN
    RAISE EXCEPTION 'runtime_usage_authority_invalid';
  END IF;
  prior_committed := account.reserved_quantity + account.settled_quantity - NEW.reserved_quantity;
  IF prior_committed < 0 THEN RAISE EXCEPTION 'runtime_usage_ledger_invalid'; END IF;
  IF account.safety_cap_quantity IS NOT NULL
     AND prior_committed + NEW.reserved_quantity > account.safety_cap_quantity THEN
    safe_error := CASE account.product_key WHEN 'flowbot' THEN 'flowbot_safety_cap'
      WHEN 'ai_chat' THEN 'ai_safety_cap' ELSE 'voice_safety_cap' END;
    RAISE EXCEPTION '%', safe_error;
  END IF;

  remaining := NEW.reserved_quantity;
  -- 0085: NULL included_quantity means unlimited. Previously COALESCE(...,0) made it zero.
  IF account.included_quantity IS NULL THEN
    included_funding := remaining;
  ELSE
    included_funding := LEAST(remaining, GREATEST(account.included_quantity - prior_committed, 0));
  END IF;
  remaining := remaining - included_funding;
  SELECT COALESCE(sum(GREATEST(lot.purchased_quantity - COALESCE((
    SELECT sum(CASE consumption.event_type WHEN 'allocated' THEN consumption.quantity ELSE -consumption.quantity END)
    FROM tenancy.usage_pack_consumptions consumption
    WHERE consumption.tenant_id = lot.tenant_id AND consumption.pack_lot_id = lot.id), 0), 0)), 0)
  INTO available_packs FROM tenancy.usage_pack_lots lot
  WHERE lot.tenant_id = NEW.tenant_id AND lot.subscription_id = account.subscription_id
    AND lot.customer_unit = account.customer_unit AND lot.status = 'active'
    AND lot.effective_from <= now() AND lot.expires_at > now();
  pack_funding := LEAST(remaining, available_packs); remaining := remaining - pack_funding;
  IF remaining > 0 AND account.overage_consent_status = 'consented' THEN overage_funding := remaining; remaining := 0; END IF;
  IF remaining > 0 THEN
    safe_error := CASE account.product_key WHEN 'flowbot' THEN 'flowbot_allowance_exhausted'
      WHEN 'ai_chat' THEN 'ai_allowance_exhausted' ELSE 'voice_allowance_exhausted' END;
    RAISE EXCEPTION '%', safe_error;
  END IF;
  NEW.funding_json := jsonb_build_object('included', included_funding, 'packs', pack_funding, 'overage', overage_funding);
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION tenancy.fund_restricted_runtime_reservation() FROM PUBLIC;

CREATE OR REPLACE FUNCTION tenancy.reserve_customer_usage(
  target_tenant_id uuid, target_subscription_id uuid,
  target_entitlement_snapshot_id uuid, target_reservation_id uuid,
  target_product_key text, target_customer_unit text,
  target_operation_id text, target_idempotency_key text, target_quantity numeric
)
RETURNS TABLE (
  status text, reason_code text, reservation_id uuid,
  reserved_quantity numeric, replayed boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE
  account record;
  existing record;
  lot record;
  included_funding numeric := 0;
  pack_funding numeric := 0;
  available_packs numeric := 0;
  overage_funding numeric := 0;
  remaining numeric;
  allocation numeric;
  allocation_index integer := 0;
  rejection text;
BEGIN
  IF session_user NOT IN ('djay_runtime', 'djay_flowbot_runtime', 'djay_ai_runtime',
     'djay_voice_runtime', 'djay_worker') THEN
    RAISE EXCEPTION 'usage_funding_role_required';
  END IF;
  IF session_user = 'djay_runtime'
     AND nullif(current_setting('app.tenant_id', true), '')::uuid IS DISTINCT FROM target_tenant_id THEN
    RAISE EXCEPTION 'usage_funding_tenant_context_required';
  END IF;
  IF target_quantity <= 0 OR target_quantity <> trunc(target_quantity)
     OR target_product_key NOT IN ('flowbot', 'ai_chat', 'voice')
     OR target_customer_unit NOT IN ('flow_execution', 'ai_response', 'voice_minute')
     OR char_length(target_operation_id) NOT BETWEEN 1 AND 200
     OR char_length(target_idempotency_key) NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION 'invalid_usage_reservation_request';
  END IF;

  SELECT usage.status, usage.reason_code, usage.id, usage.reserved_quantity INTO existing
  FROM tenancy.usage_reservations usage
  WHERE usage.tenant_id = target_tenant_id AND usage.idempotency_key = target_idempotency_key;
  IF FOUND THEN
    RETURN QUERY SELECT existing.status, existing.reason_code, existing.id,
      existing.reserved_quantity, true;
    RETURN;
  END IF;

  SELECT quota.* INTO account
  FROM tenancy.quota_accounts quota
  WHERE quota.tenant_id = target_tenant_id
    AND quota.subscription_id = target_subscription_id
    AND quota.product_key = target_product_key
    AND quota.customer_unit = target_customer_unit
    AND now() >= quota.period_start AND now() < quota.period_end
  ORDER BY quota.period_start DESC, quota.id LIMIT 1 FOR UPDATE;
  IF account IS NULL OR NOT EXISTS (
    SELECT 1 FROM tenancy.entitlement_snapshots snapshot
    JOIN tenancy.product_subscriptions subscription
      ON subscription.tenant_id = snapshot.tenant_id
     AND subscription.id = snapshot.subscription_id
    WHERE snapshot.tenant_id = target_tenant_id
      AND snapshot.id = target_entitlement_snapshot_id
      AND snapshot.subscription_id = target_subscription_id
      AND snapshot.product_key = target_product_key
      AND snapshot.access_mode = 'active'
      AND subscription.status IN ('active', 'trialing', 'scheduled_change')
  ) THEN
    RETURN QUERY SELECT 'rejected', 'not_entitled', target_reservation_id, 0::numeric, false;
    RETURN;
  END IF;

  IF account.safety_cap_quantity IS NOT NULL
     AND account.reserved_quantity + account.settled_quantity + target_quantity
       > account.safety_cap_quantity THEN
    rejection := 'safety_cap';
  ELSE
    remaining := target_quantity;
    -- 0085: NULL included_quantity means unlimited. Previously COALESCE(...,0) made it zero.
    IF account.included_quantity IS NULL THEN
      included_funding := remaining;
    ELSE
      included_funding := LEAST(remaining, GREATEST(
        account.included_quantity
          - account.reserved_quantity - account.settled_quantity, 0));
    END IF;
    remaining := remaining - included_funding;
    SELECT COALESCE(sum(GREATEST(candidate.purchased_quantity - COALESCE((
      SELECT sum(CASE consumption.event_type WHEN 'allocated' THEN consumption.quantity
        ELSE -consumption.quantity END)
      FROM tenancy.usage_pack_consumptions consumption
      WHERE consumption.tenant_id = candidate.tenant_id
        AND consumption.pack_lot_id = candidate.id
    ), 0), 0)), 0) INTO available_packs
    FROM tenancy.usage_pack_lots candidate
    WHERE candidate.tenant_id = target_tenant_id
      AND candidate.subscription_id = target_subscription_id
      AND candidate.customer_unit = target_customer_unit
      AND candidate.status = 'active'
      AND candidate.effective_from <= now() AND candidate.expires_at > now();
    pack_funding := LEAST(remaining, available_packs);
    remaining := remaining - pack_funding;
    IF remaining > 0 AND account.overage_consent_status = 'consented' THEN
      overage_funding := remaining;
      remaining := 0;
    END IF;
    IF remaining > 0 THEN rejection := 'allowance_exhausted'; END IF;
  END IF;

  INSERT INTO tenancy.usage_reservations (
    id, tenant_id, quota_account_id, entitlement_snapshot_id, operation_id,
    idempotency_key, requested_quantity, reserved_quantity, status, reason_code, funding_json
  ) VALUES (
    target_reservation_id, target_tenant_id, account.id, target_entitlement_snapshot_id,
    target_operation_id, target_idempotency_key, target_quantity,
    CASE WHEN rejection IS NULL THEN target_quantity ELSE 0 END,
    CASE WHEN rejection IS NULL THEN 'reserved' ELSE 'rejected' END, rejection,
    CASE WHEN rejection IS NULL THEN jsonb_build_object(
      'included', included_funding, 'packs', pack_funding, 'overage', overage_funding)
    ELSE '{"included":0,"packs":0,"overage":0}'::jsonb END
  );

  IF rejection IS NULL THEN
    remaining := pack_funding;
    FOR lot IN
      SELECT candidate.id, GREATEST(candidate.purchased_quantity - COALESCE((
        SELECT sum(CASE consumption.event_type WHEN 'allocated' THEN consumption.quantity
          ELSE -consumption.quantity END)
        FROM tenancy.usage_pack_consumptions consumption
        WHERE consumption.tenant_id = candidate.tenant_id
          AND consumption.pack_lot_id = candidate.id
      ), 0), 0) AS available
      FROM tenancy.usage_pack_lots candidate
      WHERE candidate.tenant_id = target_tenant_id
        AND candidate.subscription_id = target_subscription_id
        AND candidate.customer_unit = target_customer_unit
        AND candidate.status = 'active'
        AND candidate.effective_from <= now() AND candidate.expires_at > now()
      ORDER BY candidate.expires_at, candidate.created_at, candidate.id
    LOOP
      EXIT WHEN remaining <= 0;
      allocation := LEAST(remaining, lot.available);
      IF allocation > 0 THEN
        INSERT INTO tenancy.usage_pack_consumptions (
          tenant_id, pack_lot_id, reservation_id, event_type, quantity, idempotency_key
        ) VALUES (target_tenant_id, lot.id, target_reservation_id, 'allocated', allocation,
          target_idempotency_key || ':pack:' || allocation_index::text);
        remaining := remaining - allocation;
        allocation_index := allocation_index + 1;
      END IF;
    END LOOP;
    UPDATE tenancy.quota_accounts account_target
    SET reserved_quantity = account_target.reserved_quantity + target_quantity, updated_at = now()
    WHERE account_target.tenant_id = target_tenant_id AND account_target.id = account.id;
    INSERT INTO tenancy.usage_events (
      tenant_id, subscription_id, entitlement_snapshot_id, reservation_id,
      product_key, operation_id, event_type, customer_unit, customer_quantity,
      idempotency_key, occurred_at
    ) VALUES (target_tenant_id, target_subscription_id, target_entitlement_snapshot_id,
      target_reservation_id, target_product_key, target_operation_id, 'reserved',
      target_customer_unit, target_quantity, target_idempotency_key || ':reserved', now());
  END IF;
  RETURN QUERY SELECT CASE WHEN rejection IS NULL THEN 'reserved' ELSE 'rejected' END,
    rejection, target_reservation_id,
    CASE WHEN rejection IS NULL THEN target_quantity ELSE 0 END, false;
END
$$;

REVOKE ALL ON FUNCTION tenancy.reserve_customer_usage(uuid, uuid, uuid, uuid, text, text, text, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.reserve_customer_usage(uuid, uuid, uuid, uuid, text, text, text, text, numeric)
  TO djay_runtime, djay_flowbot_runtime, djay_ai_runtime, djay_voice_runtime, djay_worker;
