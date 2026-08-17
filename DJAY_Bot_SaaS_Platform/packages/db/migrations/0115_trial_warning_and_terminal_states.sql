ALTER TABLE tenancy.usage_alert_preferences
  DROP CONSTRAINT usage_alert_preferences_thresholds_check;
ALTER TABLE tenancy.usage_alert_preferences
  ADD CONSTRAINT usage_alert_preferences_thresholds_check
  CHECK (thresholds <@ ARRAY[50,75,80,90,100]::smallint[]);

CREATE OR REPLACE FUNCTION billing.capture_trial_usage_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, billing, tenancy
AS $$
DECLARE
  trial record;
  alert_id uuid;
  committed numeric := NEW.reserved_quantity + NEW.settled_quantity;
BEGIN
  SELECT grant_row.id, grant_row.product_key, grant_row.allowance_quantity,
    grant_row.starts_at, grant_row.expires_at
  INTO trial
  FROM billing.trial_grants grant_row
  WHERE grant_row.tenant_id = NEW.tenant_id
    AND grant_row.subscription_id = NEW.subscription_id
    AND grant_row.status = 'active'
  LIMIT 1 FOR UPDATE;
  IF trial IS NULL THEN RETURN NEW; END IF;

  IF trial.product_key = 'ai_chat'
     AND OLD.settled_quantity < 400 AND NEW.settled_quantity >= 400 THEN
    alert_id := gen_random_uuid();
    INSERT INTO tenancy.usage_alert_deliveries (
      id, tenant_id, quota_account_id, alert_key, period_start,
      forecast_json, delivery_status, idempotency_key
    ) VALUES (
      alert_id, NEW.tenant_id, NEW.id, 'trial_100_remaining', NEW.period_start,
      jsonb_build_object('committedQuantity', NEW.settled_quantity,
        'includedQuantity', 500, 'remainingQuantity', GREATEST(500 - NEW.settled_quantity, 0),
        'trialGrantId', trial.id),
      'pending', 'text-trial-100-remaining:' || trial.id::text
    ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
  END IF;

  IF committed >= trial.allowance_quantity THEN
    UPDATE billing.trial_grants SET status = 'exhausted'
    WHERE id = trial.id AND status = 'active';
    UPDATE tenancy.product_subscriptions
    SET status = 'cancelled', cancelled_at = COALESCE(cancelled_at, now()), updated_at = now()
    WHERE tenant_id = NEW.tenant_id AND id = NEW.subscription_id AND status = 'trialing';
    alert_id := gen_random_uuid();
    INSERT INTO tenancy.usage_alert_deliveries (
      id, tenant_id, quota_account_id, alert_key, period_start,
      forecast_json, delivery_status, idempotency_key
    ) VALUES (
      alert_id, NEW.tenant_id, NEW.id, 'trial_exhausted', NEW.period_start,
      jsonb_build_object('committedQuantity', committed,
        'includedQuantity', trial.allowance_quantity, 'remainingQuantity', 0,
        'trialGrantId', trial.id, 'merchantAction', 'view_paid_plans'),
      'pending', 'trial-exhausted:' || trial.id::text
    ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
    INSERT INTO tenancy.outbox (tenant_id, topic, payload, idempotency_key)
    VALUES (NEW.tenant_id, 'trial.exhausted',
      jsonb_build_object('trialGrantId', trial.id, 'subscriptionId', NEW.subscription_id,
        'productKey', trial.product_key, 'merchantAction', 'view_paid_plans'),
      'trial-exhausted:' || trial.id::text)
    ON CONFLICT (tenant_id, topic, idempotency_key) DO NOTHING;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER tenancy_capture_trial_usage_state
AFTER UPDATE OF reserved_quantity, settled_quantity ON tenancy.quota_accounts
FOR EACH ROW
WHEN (OLD.reserved_quantity IS DISTINCT FROM NEW.reserved_quantity
  OR OLD.settled_quantity IS DISTINCT FROM NEW.settled_quantity)
EXECUTE FUNCTION billing.capture_trial_usage_state();

CREATE OR REPLACE FUNCTION billing.reconcile_expired_trials(
  evaluated_at_value timestamptz DEFAULT now(), trial_limit integer DEFAULT 500
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, billing, tenancy
AS $$
DECLARE
  trial record;
  reconciled integer := 0;
  alert_id uuid;
BEGIN
  IF session_user <> 'djay_worker' THEN RAISE EXCEPTION 'worker_role_required'; END IF;
  IF trial_limit < 1 OR trial_limit > 5000 THEN RAISE EXCEPTION 'trial_limit_invalid'; END IF;
  FOR trial IN
    SELECT grant_row.id, grant_row.tenant_id, grant_row.subscription_id,
      grant_row.product_key, grant_row.allowance_quantity, grant_row.starts_at,
      quota.id AS quota_account_id, quota.settled_quantity
    FROM billing.trial_grants grant_row
    JOIN tenancy.quota_accounts quota ON quota.tenant_id = grant_row.tenant_id
      AND quota.subscription_id = grant_row.subscription_id
    WHERE grant_row.status = 'active' AND grant_row.expires_at <= evaluated_at_value
    ORDER BY grant_row.expires_at, grant_row.id LIMIT trial_limit
    FOR UPDATE OF grant_row, quota SKIP LOCKED
  LOOP
    UPDATE billing.trial_grants SET status = 'expired'
    WHERE id = trial.id AND status = 'active';
    IF NOT FOUND THEN CONTINUE; END IF;
    UPDATE tenancy.product_subscriptions
    SET status = 'cancelled', cancelled_at = COALESCE(cancelled_at, evaluated_at_value),
      updated_at = evaluated_at_value
    WHERE tenant_id = trial.tenant_id AND id = trial.subscription_id AND status = 'trialing';
    alert_id := gen_random_uuid();
    INSERT INTO tenancy.usage_alert_deliveries (
      id, tenant_id, quota_account_id, alert_key, period_start,
      forecast_json, delivery_status, idempotency_key
    ) VALUES (
      alert_id, trial.tenant_id, trial.quota_account_id, 'trial_expired', trial.starts_at,
      jsonb_build_object('committedQuantity', trial.settled_quantity,
        'includedQuantity', trial.allowance_quantity,
        'remainingQuantity', GREATEST(trial.allowance_quantity - trial.settled_quantity, 0),
        'trialGrantId', trial.id, 'merchantAction', 'view_paid_plans'),
      'pending', 'trial-expired:' || trial.id::text
    ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
    INSERT INTO tenancy.outbox (tenant_id, topic, payload, idempotency_key)
    VALUES (trial.tenant_id, 'trial.expired',
      jsonb_build_object('trialGrantId', trial.id, 'subscriptionId', trial.subscription_id,
        'productKey', trial.product_key, 'merchantAction', 'view_paid_plans'),
      'trial-expired:' || trial.id::text)
    ON CONFLICT (tenant_id, topic, idempotency_key) DO NOTHING;
    reconciled := reconciled + 1;
  END LOOP;
  RETURN reconciled;
END
$$;

REVOKE ALL ON FUNCTION billing.capture_trial_usage_state() FROM PUBLIC;
REVOKE ALL ON FUNCTION billing.reconcile_expired_trials(timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION billing.reconcile_expired_trials(timestamptz, integer) TO djay_worker;
