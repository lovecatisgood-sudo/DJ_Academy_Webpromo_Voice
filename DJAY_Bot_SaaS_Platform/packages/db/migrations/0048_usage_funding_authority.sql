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
    included_funding := LEAST(remaining, GREATEST(
      COALESCE(account.included_quantity, 0)
        - account.reserved_quantity - account.settled_quantity, 0));
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

CREATE OR REPLACE FUNCTION tenancy.finalize_customer_usage(
  target_tenant_id uuid, target_reservation_id uuid, target_actual_quantity numeric,
  target_idempotency_key text, target_reason_code text DEFAULT NULL
)
RETURNS TABLE (status text, replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE
  reservation record;
  allocation record;
  actual_pack_funding numeric;
  pack_release_remaining numeric;
  release_quantity numeric;
  release_index integer := 0;
  final_event_type text;
BEGIN
  IF session_user NOT IN ('djay_runtime', 'djay_flowbot_runtime', 'djay_ai_runtime',
     'djay_voice_runtime', 'djay_worker') THEN
    RAISE EXCEPTION 'usage_funding_role_required';
  END IF;
  IF session_user = 'djay_runtime'
     AND nullif(current_setting('app.tenant_id', true), '')::uuid IS DISTINCT FROM target_tenant_id THEN
    RAISE EXCEPTION 'usage_funding_tenant_context_required';
  END IF;
  IF target_actual_quantity < 0 OR target_actual_quantity <> trunc(target_actual_quantity)
     OR char_length(target_idempotency_key) NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION 'invalid_usage_settlement_request';
  END IF;
  IF EXISTS (SELECT 1 FROM tenancy.usage_events event
    WHERE event.tenant_id = target_tenant_id AND event.idempotency_key = target_idempotency_key) THEN
    RETURN QUERY SELECT 'finalized', true;
    RETURN;
  END IF;
  SELECT usage.*, account.subscription_id, account.product_key, account.customer_unit
  INTO reservation
  FROM tenancy.usage_reservations usage
  JOIN tenancy.quota_accounts account
    ON account.tenant_id = usage.tenant_id AND account.id = usage.quota_account_id
  WHERE usage.tenant_id = target_tenant_id AND usage.id = target_reservation_id
  FOR UPDATE OF usage, account;
  IF reservation IS NULL OR reservation.status <> 'reserved' THEN
    RETURN QUERY SELECT 'not_found', false;
    RETURN;
  END IF;
  IF target_actual_quantity > reservation.reserved_quantity THEN
    RETURN QUERY SELECT 'quantity_exceeds_reservation', false;
    RETURN;
  END IF;

  actual_pack_funding := LEAST(COALESCE((reservation.funding_json->>'packs')::numeric, 0),
    GREATEST(target_actual_quantity
      - COALESCE((reservation.funding_json->>'included')::numeric, 0), 0));
  pack_release_remaining := COALESCE((reservation.funding_json->>'packs')::numeric, 0)
    - actual_pack_funding;
  FOR allocation IN
    SELECT consumption.pack_lot_id,
      sum(CASE consumption.event_type WHEN 'allocated' THEN consumption.quantity
        ELSE -consumption.quantity END) AS allocated
    FROM tenancy.usage_pack_consumptions consumption
    WHERE consumption.tenant_id = target_tenant_id
      AND consumption.reservation_id = target_reservation_id
    GROUP BY consumption.pack_lot_id
    ORDER BY min(consumption.created_at), consumption.pack_lot_id
  LOOP
    EXIT WHEN pack_release_remaining <= 0;
    release_quantity := LEAST(pack_release_remaining, GREATEST(allocation.allocated, 0));
    IF release_quantity > 0 THEN
      INSERT INTO tenancy.usage_pack_consumptions (
        tenant_id, pack_lot_id, reservation_id, event_type, quantity, idempotency_key
      ) VALUES (target_tenant_id, allocation.pack_lot_id, target_reservation_id,
        'released', release_quantity,
        target_idempotency_key || ':pack-release:' || release_index::text);
      pack_release_remaining := pack_release_remaining - release_quantity;
      release_index := release_index + 1;
    END IF;
  END LOOP;

  final_event_type := CASE WHEN target_actual_quantity = 0 THEN 'released' ELSE 'settled' END;
  UPDATE tenancy.quota_accounts account_target
  SET reserved_quantity = account_target.reserved_quantity - reservation.reserved_quantity,
      settled_quantity = account_target.settled_quantity + target_actual_quantity, updated_at = now()
  WHERE account_target.tenant_id = target_tenant_id
    AND account_target.id = reservation.quota_account_id;
  UPDATE tenancy.usage_reservations reservation_target
  SET status = final_event_type, settled_quantity = target_actual_quantity,
      settled_at = now(), reason_code = left(target_reason_code, 100)
  WHERE reservation_target.tenant_id = target_tenant_id
    AND reservation_target.id = target_reservation_id;
  INSERT INTO tenancy.usage_events (
    tenant_id, subscription_id, entitlement_snapshot_id, reservation_id,
    product_key, operation_id, event_type, customer_unit, customer_quantity,
    idempotency_key, occurred_at
  ) VALUES (target_tenant_id, reservation.subscription_id,
    reservation.entitlement_snapshot_id, target_reservation_id,
    reservation.product_key, reservation.operation_id, final_event_type,
    reservation.customer_unit, target_actual_quantity, target_idempotency_key, now());
  RETURN QUERY SELECT final_event_type, false;
END
$$;

REVOKE ALL ON FUNCTION tenancy.reserve_customer_usage(uuid, uuid, uuid, uuid, text, text, text, text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.finalize_customer_usage(uuid, uuid, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.reserve_customer_usage(uuid, uuid, uuid, uuid, text, text, text, text, numeric)
  TO djay_runtime, djay_flowbot_runtime, djay_ai_runtime, djay_voice_runtime, djay_worker;
GRANT EXECUTE ON FUNCTION tenancy.finalize_customer_usage(uuid, uuid, numeric, text, text)
  TO djay_runtime, djay_flowbot_runtime, djay_ai_runtime, djay_voice_runtime, djay_worker;
