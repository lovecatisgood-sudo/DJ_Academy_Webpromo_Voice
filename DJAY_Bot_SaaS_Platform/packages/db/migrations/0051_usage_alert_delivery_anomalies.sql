ALTER TABLE tenancy.usage_alert_preferences
  ADD COLUMN notification_profile_id uuid,
  ADD CONSTRAINT usage_alert_preferences_notification_profile_fk
    FOREIGN KEY (tenant_id, notification_profile_id)
    REFERENCES tenancy.notification_profiles(tenant_id, id) ON DELETE RESTRICT;

CREATE TABLE tenancy.usage_alert_delivery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  alert_delivery_id uuid NOT NULL,
  tenant_outbox_id uuid NOT NULL,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  outcome text NOT NULL CHECK (outcome IN ('sent', 'failed', 'dead_letter', 'suppressed')),
  safe_error_code text,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, tenant_outbox_id, attempt_number),
  FOREIGN KEY (tenant_id, alert_delivery_id)
    REFERENCES tenancy.usage_alert_deliveries(tenant_id, id) ON DELETE RESTRICT
);

CREATE TRIGGER tenancy_usage_alert_attempt_immutable
BEFORE UPDATE OR DELETE ON tenancy.usage_alert_delivery_attempts
FOR EACH ROW EXECUTE FUNCTION tenancy.reject_immutable_change();

ALTER TABLE tenancy.usage_alert_delivery_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.usage_alert_delivery_attempts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_usage_alert_attempt_isolation ON tenancy.usage_alert_delivery_attempts
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY worker_usage_alert_attempt_access ON tenancy.usage_alert_delivery_attempts TO djay_worker
  USING (session_user = 'djay_worker') WITH CHECK (session_user = 'djay_worker');

REVOKE ALL ON tenancy.usage_alert_delivery_attempts FROM PUBLIC;
GRANT SELECT ON tenancy.usage_alert_delivery_attempts TO djay_runtime;

CREATE OR REPLACE FUNCTION tenancy.queue_usage_alert_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
DECLARE
  profile_id uuid;
BEGIN
  SELECT preference.notification_profile_id
  INTO profile_id
  FROM tenancy.usage_alert_preferences preference
  JOIN tenancy.notification_profiles profile
    ON profile.tenant_id = preference.tenant_id
   AND profile.id = preference.notification_profile_id
   AND profile.status = 'active'
   AND 'usage.allowance_alert' = ANY(profile.allowed_template_keys)
  WHERE preference.tenant_id = NEW.tenant_id
    AND preference.quota_account_id = NEW.quota_account_id;

  IF profile_id IS NOT NULL THEN
    INSERT INTO tenancy.outbox (tenant_id, topic, payload, idempotency_key)
    VALUES (
      NEW.tenant_id,
      'usage.alert.email.requested',
      jsonb_build_object(
        'alertId', NEW.id,
        'notificationProfileId', profile_id,
        'templateKey', 'usage.allowance_alert',
        'alertKey', NEW.alert_key,
        'forecast', NEW.forecast_json
      ),
      'usage-alert-email:' || NEW.id::text
    )
    ON CONFLICT (tenant_id, topic, idempotency_key) DO NOTHING;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER tenancy_queue_usage_alert_email
AFTER INSERT ON tenancy.usage_alert_deliveries
FOR EACH ROW EXECUTE FUNCTION tenancy.queue_usage_alert_email();

CREATE OR REPLACE FUNCTION tenancy.generate_usage_anomaly_alerts(
  evaluated_at_value timestamptz DEFAULT now(),
  account_limit integer DEFAULT 500
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
DECLARE
  account record;
  alert_id uuid;
  generated integer := 0;
  recent_quantity numeric;
  baseline_quantity numeric;
  baseline_hourly numeric;
  anomaly_multiplier numeric;
  hour_bucket timestamptz;
BEGIN
  IF session_user <> 'djay_worker' THEN RAISE EXCEPTION 'worker_role_required'; END IF;
  IF account_limit < 1 OR account_limit > 5000 THEN RAISE EXCEPTION 'account_limit_invalid'; END IF;
  hour_bucket := date_trunc('hour', evaluated_at_value);

  FOR account IN
    SELECT quota.*, COALESCE(preference.anomaly_alert, true) AS anomaly_alert,
      COALESCE(preference.cooldown_hours, 24) AS cooldown_hours
    FROM tenancy.quota_accounts quota
    LEFT JOIN tenancy.usage_alert_preferences preference
      ON preference.tenant_id = quota.tenant_id AND preference.quota_account_id = quota.id
    WHERE evaluated_at_value >= quota.period_start AND evaluated_at_value < quota.period_end
      AND quota.period_start <= evaluated_at_value - interval '25 hours'
    ORDER BY quota.period_end, quota.id
    LIMIT account_limit
  LOOP
    IF NOT account.anomaly_alert OR EXISTS (
      SELECT 1 FROM tenancy.usage_alert_deliveries prior
      WHERE prior.tenant_id = account.tenant_id
        AND prior.quota_account_id = account.id
        AND prior.alert_key = 'usage_anomaly'
        AND prior.created_at > evaluated_at_value - make_interval(hours => account.cooldown_hours)
    ) THEN
      CONTINUE;
    END IF;

    SELECT
      COALESCE(sum(event.customer_quantity) FILTER (
        WHERE event.occurred_at > evaluated_at_value - interval '1 hour'
      ), 0),
      COALESCE(sum(event.customer_quantity) FILTER (
        WHERE event.occurred_at > evaluated_at_value - interval '25 hours'
          AND event.occurred_at <= evaluated_at_value - interval '1 hour'
      ), 0)
    INTO recent_quantity, baseline_quantity
    FROM tenancy.usage_events event
    WHERE event.tenant_id = account.tenant_id
      AND event.subscription_id = account.subscription_id
      AND event.product_key = account.product_key
      AND event.customer_unit = account.customer_unit
      AND event.event_type = 'settled'
      AND event.occurred_at > evaluated_at_value - interval '25 hours'
      AND event.occurred_at <= evaluated_at_value;

    baseline_hourly := baseline_quantity / 24;
    anomaly_multiplier := CASE WHEN baseline_hourly > 0
      THEN recent_quantity / baseline_hourly ELSE NULL END;

    IF recent_quantity >= 5
       AND ((baseline_hourly = 0 AND recent_quantity >= 10)
         OR (baseline_hourly > 0 AND recent_quantity >= baseline_hourly * 3)) THEN
      alert_id := gen_random_uuid();
      INSERT INTO tenancy.usage_alert_deliveries (
        id, tenant_id, quota_account_id, alert_key, period_start, forecast_json,
        delivery_status, idempotency_key
      ) VALUES (
        alert_id, account.tenant_id, account.id, 'usage_anomaly', account.period_start,
        jsonb_build_object(
          'evaluatedAt', evaluated_at_value,
          'detectionMethod', 'customer_usage_1h_vs_prior_24h_v1',
          'recentCustomerQuantity', recent_quantity,
          'baselineHourlyCustomerQuantity', baseline_hourly,
          'anomalyMultiplier', anomaly_multiplier,
          'customerUnit', account.customer_unit
        ),
        'pending', account.id::text || ':' || extract(epoch FROM hour_bucket)::text || ':usage_anomaly'
      ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING RETURNING id INTO alert_id;
      IF alert_id IS NOT NULL THEN
        INSERT INTO tenancy.outbox (tenant_id, topic, payload, idempotency_key)
        VALUES (
          account.tenant_id, 'usage.alert.created',
          jsonb_build_object('alertId', alert_id, 'quotaAccountId', account.id, 'alertKey', 'usage_anomaly'),
          'usage-alert:' || alert_id::text
        );
        generated := generated + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN generated;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.claim_usage_alert_email(
  claim_time timestamptz,
  stale_before timestamptz
)
RETURNS TABLE (
  outbox_id uuid,
  recipient_ciphertext text,
  payload jsonb,
  attempt_count integer,
  delivery_allowed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'usage_alert_notification_worker' THEN
    RAISE EXCEPTION 'usage alert notification worker context required';
  END IF;
  RETURN QUERY
  WITH candidate AS (
    SELECT candidate_outbox.id
    FROM tenancy.outbox candidate_outbox
    WHERE candidate_outbox.topic = 'usage.alert.email.requested'
      AND candidate_outbox.available_at <= claim_time
      AND (
        candidate_outbox.status IN ('pending', 'failed')
        OR (candidate_outbox.status = 'processing' AND candidate_outbox.locked_at < stale_before)
      )
    ORDER BY candidate_outbox.available_at, candidate_outbox.created_at, candidate_outbox.id
    FOR UPDATE SKIP LOCKED LIMIT 1
  ), claimed AS (
    UPDATE tenancy.outbox claimed_outbox
    SET status = 'processing', locked_at = claim_time,
      attempt_count = claimed_outbox.attempt_count + 1, last_error_code = NULL
    FROM candidate WHERE claimed_outbox.id = candidate.id
    RETURNING claimed_outbox.*
  )
  SELECT claimed.id,
    CASE WHEN profile.status = 'active'
      AND claimed.payload->>'templateKey' = ANY(profile.allowed_template_keys)
      THEN profile.recipient_ciphertext ELSE NULL END,
    claimed.payload,
    claimed.attempt_count,
    COALESCE(profile.status = 'active'
      AND claimed.payload->>'templateKey' = 'usage.allowance_alert'
      AND claimed.payload->>'templateKey' = ANY(profile.allowed_template_keys), false)
  FROM claimed
  LEFT JOIN tenancy.notification_profiles profile
    ON profile.tenant_id = claimed.tenant_id
   AND profile.id = NULLIF(claimed.payload->>'notificationProfileId', '')::uuid;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.finish_usage_alert_email(
  target_outbox_id uuid,
  delivered boolean,
  safe_error_code text DEFAULT NULL,
  dead_letter boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
DECLARE
  target tenancy.outbox%ROWTYPE;
  outcome_value text;
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'usage_alert_notification_worker' THEN
    RAISE EXCEPTION 'usage alert notification worker context required';
  END IF;

  UPDATE tenancy.outbox outbox
  SET status = CASE WHEN delivered THEN 'sent'
      WHEN dead_letter OR outbox.attempt_count >= 8 THEN 'dead_letter' ELSE 'failed' END,
    available_at = CASE WHEN delivered OR dead_letter OR outbox.attempt_count >= 8
      THEN outbox.available_at
      ELSE now() + make_interval(secs => LEAST(3600, 30 * (2 ^ LEAST(outbox.attempt_count, 7)))) END,
    locked_at = NULL,
    processed_at = CASE WHEN delivered OR dead_letter OR outbox.attempt_count >= 8 THEN now() ELSE NULL END,
    last_error_code = CASE WHEN delivered THEN NULL ELSE left(COALESCE(safe_error_code, 'delivery_failed'), 100) END
  WHERE outbox.id = target_outbox_id
    AND outbox.topic = 'usage.alert.email.requested'
    AND outbox.status = 'processing'
  RETURNING outbox.* INTO target;

  IF target.id IS NULL THEN RETURN false; END IF;
  outcome_value := CASE WHEN delivered THEN 'sent'
    WHEN target.status = 'dead_letter' THEN 'dead_letter' ELSE 'failed' END;
  INSERT INTO tenancy.usage_alert_delivery_attempts (
    tenant_id, alert_delivery_id, tenant_outbox_id, attempt_number,
    outcome, safe_error_code, attempted_at
  ) VALUES (
    target.tenant_id, (target.payload->>'alertId')::uuid, target.id, target.attempt_count,
    outcome_value, CASE WHEN delivered THEN NULL ELSE left(COALESCE(safe_error_code, 'delivery_failed'), 100) END,
    now()
  );
  RETURN true;
END
$$;

REVOKE ALL ON FUNCTION tenancy.queue_usage_alert_email() FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.generate_usage_anomaly_alerts(timestamptz, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.claim_usage_alert_email(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.finish_usage_alert_email(uuid, boolean, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.generate_usage_anomaly_alerts(timestamptz, integer) TO djay_worker;
GRANT EXECUTE ON FUNCTION tenancy.claim_usage_alert_email(timestamptz, timestamptz) TO djay_worker;
GRANT EXECUTE ON FUNCTION tenancy.finish_usage_alert_email(uuid, boolean, text, boolean) TO djay_worker;
