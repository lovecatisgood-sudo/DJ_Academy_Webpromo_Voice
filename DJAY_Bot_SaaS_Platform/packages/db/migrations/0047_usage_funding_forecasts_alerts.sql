CREATE TABLE catalog.meter_versions (
  meter_key text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  customer_unit text NOT NULL CHECK (customer_unit IN ('flow_execution', 'ai_response', 'voice_minute')),
  definition_json jsonb NOT NULL,
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (meter_key, version),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);

INSERT INTO catalog.meter_versions (meter_key, version, customer_unit, definition_json, effective_from) VALUES
  ('flow_conversation_session', 1, 'flow_execution',
    '{"trigger":"customer_initiated_session","inactivityHours":24,"exclude":["retry","duplicate_delivery","preview","staff_message","system_message"]}', now()),
  ('ai_customer_facing_reply', 1, 'ai_response',
    '{"trigger":"committed_customer_facing_response","exclude":["provider_retry","tool_call","validation_retry","non_facing_refusal","preview","duplicate_delivery"]}', now()),
  ('voice_connected_minute', 1, 'voice_minute',
    '{"trigger":"connected_media_session","retainRawSeconds":true,"rounding":"ceil_per_completed_session","exclude":["pre_connection","provider_downtime"]}', now());

CREATE TRIGGER catalog_meter_versions_immutable
BEFORE UPDATE OR DELETE ON catalog.meter_versions
FOR EACH ROW EXECUTE FUNCTION tenancy.reject_immutable_change();

ALTER TABLE tenancy.quota_accounts
  ADD COLUMN overage_consent_status text NOT NULL DEFAULT 'none'
    CHECK (overage_consent_status IN ('none', 'consented', 'revoked')),
  ADD COLUMN overage_consented_at timestamptz,
  ADD COLUMN overage_consented_by_user_id uuid REFERENCES identity.users(id) ON DELETE RESTRICT,
  ADD CHECK ((overage_consent_status = 'consented') = (overage_consented_at IS NOT NULL));

CREATE OR REPLACE FUNCTION tenancy.default_quota_safety_cap()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, tenancy AS $$
BEGIN
  IF NEW.safety_cap_quantity IS NULL AND NEW.included_quantity IS NOT NULL THEN
    NEW.safety_cap_quantity := NEW.included_quantity;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER tenancy_quota_default_safety_cap
BEFORE INSERT ON tenancy.quota_accounts
FOR EACH ROW EXECUTE FUNCTION tenancy.default_quota_safety_cap();

ALTER TABLE tenancy.usage_reservations
  ADD COLUMN funding_json jsonb NOT NULL DEFAULT '{"included":0,"packs":0,"overage":0}'::jsonb;

CREATE TABLE tenancy.usage_pack_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL,
  customer_unit text NOT NULL CHECK (customer_unit IN ('ai_response', 'voice_minute')),
  pack_key text NOT NULL,
  purchased_quantity numeric(20,6) NOT NULL CHECK (purchased_quantity > 0),
  effective_from timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  provider_line_item_ref text,
  status text NOT NULL CHECK (status IN ('pending', 'active', 'expired', 'refunded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, subscription_id)
    REFERENCES tenancy.product_subscriptions(tenant_id, id) ON DELETE RESTRICT,
  CHECK (expires_at > effective_from)
);

CREATE TABLE tenancy.usage_pack_consumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  pack_lot_id uuid NOT NULL,
  reservation_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('allocated', 'released')),
  quantity numeric(20,6) NOT NULL CHECK (quantity > 0),
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, pack_lot_id)
    REFERENCES tenancy.usage_pack_lots(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, reservation_id)
    REFERENCES tenancy.usage_reservations(tenant_id, id) ON DELETE RESTRICT
);

CREATE TRIGGER tenancy_usage_pack_consumption_immutable
BEFORE UPDATE OR DELETE ON tenancy.usage_pack_consumptions
FOR EACH ROW EXECUTE FUNCTION tenancy.reject_immutable_change();

CREATE TABLE tenancy.usage_alert_preferences (
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  quota_account_id uuid NOT NULL,
  thresholds smallint[] NOT NULL DEFAULT ARRAY[50,75,90,100]::smallint[],
  exhaustion_alert boolean NOT NULL DEFAULT true,
  anomaly_alert boolean NOT NULL DEFAULT true,
  cooldown_hours integer NOT NULL DEFAULT 24 CHECK (cooldown_hours BETWEEN 1 AND 168),
  updated_by_user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, quota_account_id),
  FOREIGN KEY (tenant_id, quota_account_id)
    REFERENCES tenancy.quota_accounts(tenant_id, id) ON DELETE RESTRICT,
  CHECK (thresholds <@ ARRAY[50,75,90,100]::smallint[])
);

CREATE TABLE tenancy.usage_alert_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  quota_account_id uuid NOT NULL,
  alert_key text NOT NULL,
  period_start timestamptz NOT NULL,
  forecast_json jsonb NOT NULL,
  delivery_status text NOT NULL CHECK (delivery_status IN ('pending', 'sent', 'failed', 'suppressed')),
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, quota_account_id)
    REFERENCES tenancy.quota_accounts(tenant_id, id) ON DELETE RESTRICT
);

CREATE TRIGGER tenancy_usage_alert_delivery_immutable
BEFORE UPDATE OR DELETE ON tenancy.usage_alert_deliveries
FOR EACH ROW EXECUTE FUNCTION tenancy.reject_immutable_change();

CREATE TABLE tenancy.provider_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL,
  provider_key text NOT NULL,
  provider_meter_key text NOT NULL,
  source_event_id text NOT NULL,
  native_quantity numeric(20,6) NOT NULL CHECK (native_quantity >= 0),
  native_unit text NOT NULL,
  estimated_cost_minor numeric(20,6),
  occurred_at timestamptz NOT NULL,
  reconciliation_status text NOT NULL DEFAULT 'pending'
    CHECK (reconciliation_status IN ('pending', 'matched', 'variance', 'ignored')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, provider_key, source_event_id),
  FOREIGN KEY (tenant_id, subscription_id)
    REFERENCES tenancy.product_subscriptions(tenant_id, id) ON DELETE RESTRICT
);

CREATE TRIGGER tenancy_provider_usage_event_immutable
BEFORE UPDATE OR DELETE ON tenancy.provider_usage_events
FOR EACH ROW EXECUTE FUNCTION tenancy.reject_immutable_change();

ALTER TABLE tenancy.usage_pack_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.usage_pack_lots FORCE ROW LEVEL SECURITY;
ALTER TABLE tenancy.usage_pack_consumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.usage_pack_consumptions FORCE ROW LEVEL SECURITY;
ALTER TABLE tenancy.usage_alert_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.usage_alert_preferences FORCE ROW LEVEL SECURITY;
ALTER TABLE tenancy.usage_alert_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.usage_alert_deliveries FORCE ROW LEVEL SECURITY;
ALTER TABLE tenancy.provider_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.provider_usage_events FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_usage_pack_lots_isolation ON tenancy.usage_pack_lots
  USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_usage_pack_consumptions_isolation ON tenancy.usage_pack_consumptions
  USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_usage_alert_preferences_isolation ON tenancy.usage_alert_preferences
  USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_usage_alert_deliveries_isolation ON tenancy.usage_alert_deliveries
  USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY worker_usage_alert_deliveries ON tenancy.usage_alert_deliveries TO djay_worker
  USING (session_user = 'djay_worker') WITH CHECK (session_user = 'djay_worker');
CREATE POLICY worker_provider_usage_events ON tenancy.provider_usage_events TO djay_worker
  USING (session_user = 'djay_worker') WITH CHECK (session_user = 'djay_worker');

REVOKE ALL ON catalog.meter_versions, tenancy.usage_pack_lots,
  tenancy.usage_pack_consumptions, tenancy.usage_alert_preferences,
  tenancy.usage_alert_deliveries, tenancy.provider_usage_events FROM PUBLIC;
GRANT SELECT ON catalog.meter_versions TO djay_runtime, djay_worker, djay_platform, djay_readonly_ops;
GRANT SELECT ON tenancy.usage_pack_lots, tenancy.usage_pack_consumptions,
  tenancy.usage_alert_preferences, tenancy.usage_alert_deliveries TO djay_runtime;
GRANT INSERT ON tenancy.usage_pack_consumptions TO djay_runtime;
GRANT INSERT, UPDATE ON tenancy.usage_alert_preferences TO djay_runtime;
GRANT SELECT, INSERT ON tenancy.usage_pack_lots, tenancy.usage_pack_consumptions,
  tenancy.usage_alert_deliveries, tenancy.provider_usage_events TO djay_worker;
GRANT SELECT ON tenancy.provider_usage_events TO djay_platform, djay_readonly_ops;

CREATE OR REPLACE FUNCTION tenancy.generate_usage_alerts(
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
  threshold_value integer;
  alert_id uuid;
  alert_key_value text;
  generated integer := 0;
  elapsed_fraction numeric;
  projected_quantity numeric;
  usage_percent numeric;
BEGIN
  IF session_user <> 'djay_worker' THEN RAISE EXCEPTION 'worker_role_required'; END IF;
  IF account_limit < 1 OR account_limit > 5000 THEN RAISE EXCEPTION 'account_limit_invalid'; END IF;
  FOR account IN
    SELECT quota.*, COALESCE(preference.thresholds, ARRAY[50,75,90,100]::smallint[]) AS thresholds,
      COALESCE(preference.exhaustion_alert, true) AS exhaustion_alert
    FROM tenancy.quota_accounts quota
    LEFT JOIN tenancy.usage_alert_preferences preference
      ON preference.tenant_id = quota.tenant_id AND preference.quota_account_id = quota.id
    WHERE evaluated_at_value >= quota.period_start AND evaluated_at_value < quota.period_end
      AND quota.included_quantity IS NOT NULL AND quota.included_quantity > 0
    ORDER BY quota.period_end, quota.id LIMIT account_limit
  LOOP
    usage_percent := ((account.reserved_quantity + account.settled_quantity) / account.included_quantity) * 100;
    elapsed_fraction := GREATEST(0.000001, LEAST(1,
      EXTRACT(epoch FROM (evaluated_at_value - account.period_start))
        / EXTRACT(epoch FROM (account.period_end - account.period_start))));
    projected_quantity := GREATEST(account.reserved_quantity + account.settled_quantity,
      (account.reserved_quantity + account.settled_quantity) / elapsed_fraction);
    FOREACH threshold_value IN ARRAY account.thresholds LOOP
      IF usage_percent >= threshold_value THEN
        alert_key_value := 'allowance_' || threshold_value::text;
        alert_id := gen_random_uuid();
        INSERT INTO tenancy.usage_alert_deliveries (
          id, tenant_id, quota_account_id, alert_key, period_start, forecast_json,
          delivery_status, idempotency_key
        ) VALUES (
          alert_id, account.tenant_id, account.id, alert_key_value, account.period_start,
          jsonb_build_object('evaluatedAt', evaluated_at_value, 'committedQuantity',
            account.reserved_quantity + account.settled_quantity, 'projectedQuantity', projected_quantity,
            'includedQuantity', account.included_quantity, 'usagePercent', usage_percent),
          'pending', account.id::text || ':' || extract(epoch FROM account.period_start)::text || ':' || alert_key_value
        ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING RETURNING id INTO alert_id;
        IF alert_id IS NOT NULL THEN
          INSERT INTO tenancy.outbox (tenant_id, topic, payload, idempotency_key)
          VALUES (account.tenant_id, 'usage.alert.created',
            jsonb_build_object('alertId', alert_id, 'quotaAccountId', account.id, 'alertKey', alert_key_value),
            'usage-alert:' || alert_id::text);
          generated := generated + 1;
        END IF;
      END IF;
    END LOOP;
    IF account.exhaustion_alert AND projected_quantity >= account.included_quantity AND usage_percent < 100 THEN
      alert_key_value := 'projected_exhaustion';
      alert_id := gen_random_uuid();
      INSERT INTO tenancy.usage_alert_deliveries (
        id, tenant_id, quota_account_id, alert_key, period_start, forecast_json,
        delivery_status, idempotency_key
      ) VALUES (
        alert_id, account.tenant_id, account.id, alert_key_value, account.period_start,
        jsonb_build_object('evaluatedAt', evaluated_at_value, 'committedQuantity',
          account.reserved_quantity + account.settled_quantity, 'projectedQuantity', projected_quantity,
          'includedQuantity', account.included_quantity, 'usagePercent', usage_percent),
        'pending', account.id::text || ':' || extract(epoch FROM account.period_start)::text || ':' || alert_key_value
      ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING RETURNING id INTO alert_id;
      IF alert_id IS NOT NULL THEN
        INSERT INTO tenancy.outbox (tenant_id, topic, payload, idempotency_key)
        VALUES (account.tenant_id, 'usage.alert.created',
          jsonb_build_object('alertId', alert_id, 'quotaAccountId', account.id, 'alertKey', alert_key_value),
          'usage-alert:' || alert_id::text);
        generated := generated + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN generated;
END
$$;

REVOKE ALL ON FUNCTION tenancy.generate_usage_alerts(timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.generate_usage_alerts(timestamptz, integer) TO djay_worker;
