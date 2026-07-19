CREATE OR REPLACE FUNCTION tenancy.roll_usage_periods(
  target_now timestamptz DEFAULT now(),
  target_limit integer DEFAULT 100
)
RETURNS TABLE (periods_created integer, reservations_released integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE
  expired record;
  reservation record;
  latest_snapshot record;
  new_period_end timestamptz;
  new_included numeric;
  new_safety_cap numeric;
  created_count integer := 0;
  released_count integer := 0;
  inserted_count integer;
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'usage_period_worker' THEN
    RAISE EXCEPTION 'usage_period_worker_context_required';
  END IF;
  IF target_limit NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'invalid_usage_period_limit';
  END IF;

  FOR expired IN
    SELECT account.*
    FROM tenancy.quota_accounts account
    JOIN tenancy.product_subscriptions subscription
      ON subscription.tenant_id = account.tenant_id
     AND subscription.id = account.subscription_id
     AND subscription.status IN ('active', 'trialing', 'scheduled_change')
    WHERE account.period_end <= target_now
      AND NOT EXISTS (
        SELECT 1 FROM tenancy.quota_accounts successor
        WHERE successor.tenant_id = account.tenant_id
          AND successor.subscription_id = account.subscription_id
          AND successor.customer_unit = account.customer_unit
          AND successor.period_start = account.period_end
      )
    ORDER BY account.period_end, account.tenant_id, account.id
    LIMIT target_limit
    FOR UPDATE OF account SKIP LOCKED
  LOOP
    FOR reservation IN
      SELECT usage.id
      FROM tenancy.usage_reservations usage
      WHERE usage.tenant_id = expired.tenant_id
        AND usage.quota_account_id = expired.id AND usage.status = 'reserved'
      ORDER BY usage.created_at, usage.id
      FOR UPDATE SKIP LOCKED
    LOOP
      PERFORM * FROM tenancy.finalize_customer_usage(
        expired.tenant_id, reservation.id, 0,
        'usage:period-expired:' || reservation.id::text, 'period_expired'
      );
      released_count := released_count + 1;
    END LOOP;

    SELECT snapshot.id, snapshot.resolved_json INTO latest_snapshot
    FROM tenancy.entitlement_snapshots snapshot
    WHERE snapshot.tenant_id = expired.tenant_id
      AND snapshot.subscription_id = expired.subscription_id
      AND snapshot.product_key = expired.product_key
      AND snapshot.access_mode = 'active'
    ORDER BY snapshot.created_at DESC, snapshot.id DESC LIMIT 1;
    IF latest_snapshot IS NULL THEN CONTINUE; END IF;

    new_period_end := ((expired.period_end AT TIME ZONE 'Asia/Bangkok')
      + interval '1 month') AT TIME ZONE 'Asia/Bangkok';
    new_included := NULLIF(
      latest_snapshot.resolved_json->'allowances'->>expired.customer_unit, '')::numeric;
    new_safety_cap := CASE
      WHEN expired.safety_cap_quantity IS NULL THEN NULL
      WHEN expired.included_quantity IS NOT NULL
        AND expired.safety_cap_quantity = expired.included_quantity THEN new_included
      ELSE expired.safety_cap_quantity
    END;

    INSERT INTO tenancy.quota_accounts (
      tenant_id, subscription_id, product_key, customer_unit,
      period_start, period_end, included_quantity, safety_cap_quantity,
      overage_consent_status, overage_consented_at, overage_consented_by_user_id
    ) VALUES (
      expired.tenant_id, expired.subscription_id, expired.product_key,
      expired.customer_unit, expired.period_end, new_period_end, new_included,
      new_safety_cap, expired.overage_consent_status,
      expired.overage_consented_at, expired.overage_consented_by_user_id
    ) ON CONFLICT (tenant_id, subscription_id, customer_unit, period_start) DO NOTHING;
    GET DIAGNOSTICS inserted_count = ROW_COUNT;
    IF inserted_count = 1 THEN
      created_count := created_count + 1;
      UPDATE tenancy.product_subscriptions
      SET period_start = expired.period_end, period_end = new_period_end, updated_at = target_now
      WHERE tenant_id = expired.tenant_id AND id = expired.subscription_id
        AND period_end <= expired.period_end;
      INSERT INTO tenancy.outbox (tenant_id, topic, payload, idempotency_key)
      VALUES (expired.tenant_id, 'usage.period.started', jsonb_build_object(
        'subscriptionId', expired.subscription_id,
        'customerUnit', expired.customer_unit,
        'periodStart', expired.period_end,
        'periodEnd', new_period_end,
        'entitlementSnapshotId', latest_snapshot.id
      ), 'usage:period:' || expired.subscription_id::text || ':' || expired.period_end::text)
      ON CONFLICT (tenant_id, topic, idempotency_key) DO NOTHING;
    END IF;
  END LOOP;
  RETURN QUERY SELECT created_count, released_count;
END
$$;

REVOKE ALL ON FUNCTION tenancy.roll_usage_periods(timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.roll_usage_periods(timestamptz, integer) TO djay_worker;
