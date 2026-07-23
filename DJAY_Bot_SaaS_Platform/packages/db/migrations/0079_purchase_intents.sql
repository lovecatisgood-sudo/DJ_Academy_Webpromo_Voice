-- Purchase intents: server-side plan preference before / during checkout (EXP-004).
-- registration_id references identity.signup_intents (pre-tenant registration).
-- tenant_id is null until email verify attaches the intent to the new tenant.

CREATE TABLE billing.purchase_intents (
  id uuid PRIMARY KEY,
  registration_id uuid REFERENCES identity.signup_intents(id) ON DELETE SET NULL,
  tenant_id uuid REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  plan_key text NOT NULL CHECK (plan_key IN (
    'flowbot_basic', 'flowbot_premium', 'ai_chat_basic', 'ai_chat_premium',
    'voice_basic_gen1', 'voice_advanced_gen2'
  )),
  plan_version_id uuid REFERENCES catalog.plan_versions(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('open', 'consumed', 'expired', 'canceled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  consumed_checkout_intent_id uuid,
  CHECK (expires_at > created_at),
  CHECK (
    (status = 'consumed' AND consumed_at IS NOT NULL AND consumed_checkout_intent_id IS NOT NULL)
    OR status <> 'consumed'
  ),
  CHECK (
    (status IN ('open', 'expired', 'canceled') AND consumed_at IS NULL AND consumed_checkout_intent_id IS NULL)
    OR status = 'consumed'
  )
);

CREATE UNIQUE INDEX purchase_intents_open_registration_uidx
  ON billing.purchase_intents (registration_id)
  WHERE registration_id IS NOT NULL AND status = 'open';

CREATE INDEX purchase_intents_tenant_status_idx
  ON billing.purchase_intents (tenant_id, status)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX purchase_intents_open_expires_idx
  ON billing.purchase_intents (expires_at)
  WHERE status = 'open';

ALTER TABLE billing.purchase_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.purchase_intents FORCE ROW LEVEL SECURITY;

-- Pre-tenant create/attach path (auth runtime owns signup).
CREATE POLICY billing_auth_purchase_intents ON billing.purchase_intents
  TO djay_auth_runtime USING (true) WITH CHECK (true);

-- Tenant-scoped resolve/consume after attach.
CREATE POLICY billing_tenant_purchase_intents ON billing.purchase_intents
  TO djay_runtime
  USING (tenant_id IS NOT NULL AND tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id IS NOT NULL AND tenant_id = tenancy.current_tenant_id());

CREATE POLICY billing_platform_purchase_intents ON billing.purchase_intents
  FOR SELECT TO djay_platform USING (true);

CREATE POLICY billing_worker_purchase_intents ON billing.purchase_intents
  TO djay_worker USING (true) WITH CHECK (true);

REVOKE ALL ON billing.purchase_intents FROM PUBLIC;

GRANT USAGE ON SCHEMA billing TO djay_auth_runtime;
GRANT SELECT, INSERT, UPDATE ON billing.purchase_intents TO djay_auth_runtime;
GRANT SELECT, INSERT, UPDATE ON billing.purchase_intents TO djay_runtime;
GRANT SELECT ON billing.purchase_intents TO djay_platform, djay_readonly_ops;
GRANT SELECT, INSERT, UPDATE ON billing.purchase_intents TO djay_worker;
