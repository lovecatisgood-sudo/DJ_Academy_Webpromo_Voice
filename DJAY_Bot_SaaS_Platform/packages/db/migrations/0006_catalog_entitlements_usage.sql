CREATE SCHEMA IF NOT EXISTS catalog;
CREATE SCHEMA IF NOT EXISTS billing;

REVOKE ALL ON SCHEMA catalog, billing FROM PUBLIC;

CREATE TABLE catalog.products (
  product_key text PRIMARY KEY CHECK (product_key IN ('flowbot', 'ai_chat', 'voice')),
  public_name text NOT NULL,
  display_order smallint NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('active', 'retired')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE catalog.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_key text NOT NULL REFERENCES catalog.products(product_key) ON DELETE RESTRICT,
  plan_key text NOT NULL UNIQUE CHECK (plan_key IN (
    'flowbot_basic', 'flowbot_premium', 'ai_chat_basic', 'ai_chat_premium',
    'voice_basic_gen1', 'voice_advanced_gen2'
  )),
  public_name text NOT NULL,
  tier_name text NOT NULL,
  tier_rank smallint NOT NULL CHECK (tier_rank IN (1, 2)),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_key, tier_rank),
  UNIQUE (product_key, id)
);

CREATE TABLE catalog.plan_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES catalog.plans(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'retired')),
  currency text NOT NULL DEFAULT 'THB' CHECK (currency = 'THB'),
  recurring_amount_minor bigint CHECK (recurring_amount_minor >= 0),
  billing_interval text CHECK (billing_interval IN ('month', 'year')),
  sellable boolean NOT NULL DEFAULT false,
  trial_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  entitlements jsonb NOT NULL,
  allowances jsonb NOT NULL,
  overage_rates_minor jsonb NOT NULL,
  limits jsonb NOT NULL,
  public_copy jsonb NOT NULL,
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  created_by_platform_user_id uuid REFERENCES platform.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (plan_id, version),
  UNIQUE (plan_id, id),
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  CHECK ((recurring_amount_minor IS NULL) = (billing_interval IS NULL)),
  CHECK (NOT sellable OR (status = 'published' AND recurring_amount_minor IS NOT NULL)),
  CHECK ((status = 'published' AND published_at IS NOT NULL) OR status <> 'published')
);

CREATE OR REPLACE FUNCTION catalog.protect_published_plan_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, catalog
AS $$
BEGIN
  IF OLD.status = 'published' THEN
    RAISE EXCEPTION 'published plan versions are immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;

CREATE TRIGGER catalog_plan_version_immutable
BEFORE UPDATE OR DELETE ON catalog.plan_versions
FOR EACH ROW EXECUTE FUNCTION catalog.protect_published_plan_version();

CREATE TABLE tenancy.product_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  product_key text NOT NULL REFERENCES catalog.products(product_key) ON DELETE RESTRICT,
  plan_version_id uuid NOT NULL REFERENCES catalog.plan_versions(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'trialing', 'active', 'past_due', 'grace_period', 'restricted',
    'paused', 'scheduled_change', 'incomplete', 'cancelled'
  )),
  period_start timestamptz,
  period_end timestamptz,
  cancel_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CHECK (period_end IS NULL OR (period_start IS NOT NULL AND period_end > period_start)),
  CHECK ((status = 'cancelled' AND cancelled_at IS NOT NULL) OR status <> 'cancelled')
);

CREATE UNIQUE INDEX tenancy_one_live_subscription_per_product
  ON tenancy.product_subscriptions(tenant_id, product_key)
  WHERE status <> 'cancelled';

CREATE OR REPLACE FUNCTION tenancy.validate_subscription_plan_product()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy, catalog
AS $$
DECLARE
  plan_product text;
BEGIN
  SELECT plan.product_key INTO plan_product
  FROM catalog.plan_versions version
  JOIN catalog.plans plan ON plan.id = version.plan_id
  WHERE version.id = NEW.plan_version_id AND version.status = 'published';
  IF plan_product IS NULL OR plan_product <> NEW.product_key THEN
    RAISE EXCEPTION 'subscription plan version does not match product';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER tenancy_subscription_product_check
BEFORE INSERT OR UPDATE OF plan_version_id, product_key ON tenancy.product_subscriptions
FOR EACH ROW EXECUTE FUNCTION tenancy.validate_subscription_plan_product();

CREATE OR REPLACE FUNCTION tenancy.validate_subscription_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, tenancy
AS $$
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NOT (CASE OLD.status
    WHEN 'pending' THEN NEW.status IN ('trialing', 'active', 'incomplete', 'cancelled')
    WHEN 'trialing' THEN NEW.status IN ('active', 'past_due', 'cancelled')
    WHEN 'active' THEN NEW.status IN ('past_due', 'paused', 'scheduled_change', 'cancelled')
    WHEN 'past_due' THEN NEW.status IN ('active', 'grace_period', 'restricted', 'cancelled')
    WHEN 'grace_period' THEN NEW.status IN ('active', 'restricted', 'cancelled')
    WHEN 'restricted' THEN NEW.status IN ('active', 'cancelled')
    WHEN 'paused' THEN NEW.status IN ('active', 'cancelled')
    WHEN 'scheduled_change' THEN NEW.status IN ('active', 'cancelled')
    WHEN 'incomplete' THEN NEW.status IN ('pending', 'active', 'cancelled')
    ELSE false
  END) THEN
    RAISE EXCEPTION 'invalid subscription transition from % to %', OLD.status, NEW.status;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

CREATE TRIGGER tenancy_subscription_state_machine
BEFORE UPDATE OF status ON tenancy.product_subscriptions
FOR EACH ROW EXECUTE FUNCTION tenancy.validate_subscription_transition();

CREATE TABLE tenancy.entitlement_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  product_key text NOT NULL REFERENCES catalog.products(product_key) ON DELETE RESTRICT,
  entitlement_key text NOT NULL,
  value_json jsonb NOT NULL,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 8 AND 500),
  approved_by_platform_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  effective_from timestamptz NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CHECK (expires_at IS NULL OR expires_at > effective_from)
);

CREATE TABLE tenancy.entitlement_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL,
  product_key text NOT NULL REFERENCES catalog.products(product_key) ON DELETE RESTRICT,
  plan_version_id uuid NOT NULL REFERENCES catalog.plan_versions(id) ON DELETE RESTRICT,
  subscription_status text NOT NULL,
  access_mode text NOT NULL CHECK (access_mode IN ('none', 'read_only', 'active')),
  resolved_json jsonb NOT NULL,
  resolution_hash bytea NOT NULL CHECK (octet_length(resolution_hash) = 32),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, subscription_id)
    REFERENCES tenancy.product_subscriptions(tenant_id, id) ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION tenancy.reject_immutable_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, tenancy
AS $$
BEGIN
  RAISE EXCEPTION '% is immutable', TG_TABLE_NAME;
END
$$;

CREATE TRIGGER tenancy_entitlement_snapshot_immutable
BEFORE UPDATE OR DELETE ON tenancy.entitlement_snapshots
FOR EACH ROW EXECUTE FUNCTION tenancy.reject_immutable_change();

CREATE TABLE tenancy.quota_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL,
  product_key text NOT NULL REFERENCES catalog.products(product_key) ON DELETE RESTRICT,
  customer_unit text NOT NULL CHECK (customer_unit IN ('flow_execution', 'ai_response', 'voice_minute')),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  included_quantity numeric(20,6),
  safety_cap_quantity numeric(20,6),
  reserved_quantity numeric(20,6) NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  settled_quantity numeric(20,6) NOT NULL DEFAULT 0 CHECK (settled_quantity >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, subscription_id, customer_unit, period_start),
  FOREIGN KEY (tenant_id, subscription_id)
    REFERENCES tenancy.product_subscriptions(tenant_id, id) ON DELETE RESTRICT,
  CHECK (period_end > period_start),
  CHECK (included_quantity IS NULL OR included_quantity >= 0),
  CHECK (safety_cap_quantity IS NULL OR safety_cap_quantity >= 0)
);

CREATE TABLE tenancy.usage_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  quota_account_id uuid NOT NULL,
  entitlement_snapshot_id uuid NOT NULL,
  operation_id text NOT NULL,
  idempotency_key text NOT NULL,
  requested_quantity numeric(20,6) NOT NULL CHECK (requested_quantity > 0),
  reserved_quantity numeric(20,6) NOT NULL CHECK (reserved_quantity >= 0),
  settled_quantity numeric(20,6) CHECK (settled_quantity >= 0),
  status text NOT NULL CHECK (status IN ('reserved', 'settled', 'released', 'rejected')),
  reason_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, quota_account_id)
    REFERENCES tenancy.quota_accounts(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, entitlement_snapshot_id)
    REFERENCES tenancy.entitlement_snapshots(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL,
  entitlement_snapshot_id uuid NOT NULL,
  reservation_id uuid,
  product_key text NOT NULL REFERENCES catalog.products(product_key) ON DELETE RESTRICT,
  operation_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('reserved', 'settled', 'released', 'credited', 'waived')),
  customer_unit text NOT NULL CHECK (customer_unit IN ('flow_execution', 'ai_response', 'voice_minute')),
  customer_quantity numeric(20,6) NOT NULL CHECK (customer_quantity >= 0),
  rate_minor numeric(20,6),
  billable_amount_minor bigint CHECK (billable_amount_minor >= 0),
  idempotency_key text NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, subscription_id)
    REFERENCES tenancy.product_subscriptions(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, entitlement_snapshot_id)
    REFERENCES tenancy.entitlement_snapshots(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, reservation_id)
    REFERENCES tenancy.usage_reservations(tenant_id, id) ON DELETE RESTRICT
);

CREATE TRIGGER tenancy_usage_event_immutable
BEFORE UPDATE OR DELETE ON tenancy.usage_events
FOR EACH ROW EXECUTE FUNCTION tenancy.reject_immutable_change();

CREATE TABLE billing.payment_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  provider_key text NOT NULL,
  external_customer_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_key, external_customer_ref)
);

CREATE TABLE billing.subscription_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  subscription_id uuid NOT NULL,
  provider_key text NOT NULL,
  external_subscription_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_key, external_subscription_ref),
  UNIQUE (tenant_id, subscription_id),
  FOREIGN KEY (tenant_id, subscription_id)
    REFERENCES tenancy.product_subscriptions(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE billing.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key text NOT NULL,
  external_event_id text NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload_hash bytea NOT NULL CHECK (octet_length(payload_hash) = 32),
  payload_ciphertext text NOT NULL,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processing', 'applied', 'ignored', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error_code text,
  applied_at timestamptz,
  UNIQUE (provider_key, external_event_id)
);

INSERT INTO catalog.products (product_key, public_name, display_order, status) VALUES
  ('flowbot', 'FlowBot', 1, 'active'),
  ('ai_chat', 'AI Chatbot', 2, 'active'),
  ('voice', 'Voice Agent', 3, 'active');

INSERT INTO catalog.plans (id, product_key, plan_key, public_name, tier_name, tier_rank) VALUES
  ('61000000-0000-4000-8000-000000000001', 'flowbot', 'flowbot_basic', 'FlowBot Basic', 'Basic', 1),
  ('61000000-0000-4000-8000-000000000002', 'flowbot', 'flowbot_premium', 'FlowBot Premium', 'Premium', 2),
  ('61000000-0000-4000-8000-000000000003', 'ai_chat', 'ai_chat_basic', 'AI Chatbot Basic', 'Basic', 1),
  ('61000000-0000-4000-8000-000000000004', 'ai_chat', 'ai_chat_premium', 'AI Chatbot Premium', 'Premium', 2),
  ('61000000-0000-4000-8000-000000000005', 'voice', 'voice_basic_gen1', 'Voice Agent Basic', 'Basic', 1),
  ('61000000-0000-4000-8000-000000000006', 'voice', 'voice_advanced_gen2', 'Voice Agent Advanced', 'Advanced', 2);

INSERT INTO catalog.plan_versions (
  id, plan_id, version, status, entitlements, allowances, overage_rates_minor,
  limits, public_copy, effective_from, published_at
) VALUES
  ('62000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', 1, 'published',
   '{"channel.web":true,"ai.enabled":false,"flow.nodes.core":true,"flow.nodes.advanced":false,"flow.forms":true,"flow.versioning":true,"flow.lead_capture":true,"flow.email_notification":true,"flow.team_routing":"limited","flow.webhook":false,"branding.remove":false,"analytics.level":"core"}',
   '{"flow_execution":null}', '{"flow_execution":null}', '{"active_bots":null,"seats":null,"storage_mb":null}',
   '{"summary":"Predictable website automation with structured flows, forms, and lead capture.","highlights":["Website flow widget","Forms and lead capture","Versioned flow publishing"]}',
   '2026-07-14T00:00:00Z', '2026-07-14T00:00:00Z'),
  ('62000000-0000-4000-8000-000000000002', '61000000-0000-4000-8000-000000000002', 1, 'published',
   '{"channel.web":true,"ai.enabled":false,"flow.nodes.core":true,"flow.nodes.advanced":true,"flow.forms":true,"flow.versioning":true,"flow.lead_capture":true,"flow.email_notification":true,"flow.variables":true,"flow.delays":true,"flow.subflows":true,"flow.business_hours":true,"flow.team_routing":true,"flow.webhook":"approved","branding.remove":true,"analytics.level":"advanced"}',
   '{"flow_execution":null}', '{"flow_execution":null}', '{"active_bots":null,"seats":null,"storage_mb":null}',
   '{"summary":"Advanced website automation with variables, subflows, routing, and approved integrations.","highlights":["Advanced flow logic","Team routing","Approved webhook integrations","Advanced analytics"]}',
   '2026-07-14T00:00:00Z', '2026-07-14T00:00:00Z'),
  ('62000000-0000-4000-8000-000000000003', '61000000-0000-4000-8000-000000000003', 1, 'published',
   '{"ai.enabled":true,"sales_core.enabled":true,"knowledge.enabled":true,"lead_capture.enabled":true,"appointment_request.enabled":true,"sales_email_action.enabled":true,"human_handover.enabled":true,"ai.text":true,"channel.web":true,"channel.line":false,"channel.whatsapp":false,"channel.messenger":false,"routing.level":"core","analytics.level":"core","branding.remove":false}',
   '{"ai_response":null}', '{"ai_response":null}', '{"deployments":null,"seats":null,"knowledge_documents":null,"storage_mb":null}',
   '{"summary":"A website AI sales assistant grounded in your approved business knowledge.","highlights":["Website AI sales assistant","Business knowledge","Lead and appointment capture","Human handover"]}',
   '2026-07-14T00:00:00Z', '2026-07-14T00:00:00Z'),
  ('62000000-0000-4000-8000-000000000004', '61000000-0000-4000-8000-000000000004', 1, 'published',
   '{"ai.enabled":true,"sales_core.enabled":true,"knowledge.enabled":true,"lead_capture.enabled":true,"appointment_request.enabled":true,"sales_email_action.enabled":true,"human_handover.enabled":true,"ai.text":true,"channel.web":true,"channel.line":true,"channel.whatsapp":true,"channel.messenger":true,"routing.level":"advanced","analytics.level":"omnichannel","branding.remove":true}',
   '{"ai_response":null}', '{"ai_response":null}', '{"deployments":null,"seats":null,"knowledge_documents":null,"storage_mb":null}',
   '{"summary":"Omnichannel AI sales conversations with advanced routing, controls, and analytics.","highlights":["Web and social channels","Cross-channel continuity","Advanced team routing","Omnichannel analytics"]}',
   '2026-07-14T00:00:00Z', '2026-07-14T00:00:00Z'),
  ('62000000-0000-4000-8000-000000000005', '61000000-0000-4000-8000-000000000005', 1, 'published',
   '{"ai.enabled":true,"sales_core.enabled":true,"knowledge.enabled":true,"lead_capture.enabled":true,"appointment_request.enabled":true,"sales_email_action.enabled":true,"human_handover.enabled":true,"voice.enabled":true,"voice.capability_profile":"voice_gen1","voice.public_label":"First-Generation Voice Engine","analytics.level":"core"}',
   '{"voice_minute":null}', '{"voice_minute":null}', '{"concurrent_calls":null,"phone_numbers":null,"storage_mb":null,"retention_days":null}',
   '{"summary":"A cost-effective realtime voice sales agent for standard customer conversations.","highlights":["Realtime voice conversations","First-Generation Voice Engine","Sales knowledge and lead capture","Core quality analytics"]}',
   '2026-07-14T00:00:00Z', '2026-07-14T00:00:00Z'),
  ('62000000-0000-4000-8000-000000000006', '61000000-0000-4000-8000-000000000006', 1, 'published',
   '{"ai.enabled":true,"sales_core.enabled":true,"knowledge.enabled":true,"lead_capture.enabled":true,"appointment_request.enabled":true,"sales_email_action.enabled":true,"human_handover.enabled":true,"voice.enabled":true,"voice.capability_profile":"voice_gen2","voice.public_label":"Second-Generation Voice Engine","analytics.level":"advanced","voice.advanced_quality":true,"voice.gen1_fallback":false}',
   '{"voice_minute":null}', '{"voice_minute":null}', '{"concurrent_calls":null,"phone_numbers":null,"storage_mb":null,"retention_days":null}',
   '{"summary":"Our smartest realtime voice experience for demanding sales conversations.","highlights":["Realtime voice conversations","Second-Generation Voice Engine","Advanced conversation quality","Advanced quality analytics"]}',
   '2026-07-14T00:00:00Z', '2026-07-14T00:00:00Z');

ALTER TABLE identity.signup_intents ADD COLUMN selected_plan_key text
  CHECK (selected_plan_key IS NULL OR selected_plan_key IN (
    'flowbot_basic', 'flowbot_premium', 'ai_chat_basic', 'ai_chat_premium',
    'voice_basic_gen1', 'voice_advanced_gen2'
  ));

ALTER TABLE tenancy.product_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.product_subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.product_subscriptions
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY platform_commerce_access ON tenancy.product_subscriptions TO djay_platform
  USING (true) WITH CHECK (true);
CREATE POLICY worker_commerce_access ON tenancy.product_subscriptions TO djay_worker
  USING (true) WITH CHECK (true);

ALTER TABLE tenancy.entitlement_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.entitlement_overrides FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.entitlement_overrides
  FOR SELECT USING (tenant_id = tenancy.current_tenant_id());
CREATE POLICY platform_commerce_access ON tenancy.entitlement_overrides TO djay_platform
  USING (true) WITH CHECK (true);

ALTER TABLE tenancy.entitlement_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.entitlement_snapshots FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.entitlement_snapshots
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY platform_commerce_access ON tenancy.entitlement_snapshots TO djay_platform
  USING (true) WITH CHECK (true);
CREATE POLICY worker_commerce_access ON tenancy.entitlement_snapshots TO djay_worker
  USING (true) WITH CHECK (true);

ALTER TABLE tenancy.quota_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.quota_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.quota_accounts
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY platform_commerce_access ON tenancy.quota_accounts TO djay_platform
  USING (true) WITH CHECK (true);
CREATE POLICY worker_commerce_access ON tenancy.quota_accounts TO djay_worker
  USING (true) WITH CHECK (true);

ALTER TABLE tenancy.usage_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.usage_reservations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.usage_reservations
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY platform_commerce_access ON tenancy.usage_reservations TO djay_platform
  USING (true) WITH CHECK (true);
CREATE POLICY worker_commerce_access ON tenancy.usage_reservations TO djay_worker
  USING (true) WITH CHECK (true);

ALTER TABLE tenancy.usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.usage_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.usage_events
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY platform_commerce_access ON tenancy.usage_events TO djay_platform
  USING (true) WITH CHECK (true);
CREATE POLICY worker_commerce_access ON tenancy.usage_events TO djay_worker
  USING (true) WITH CHECK (true);

CREATE POLICY platform_tenant_read ON tenancy.tenants
  FOR SELECT TO djay_platform USING (true);

REVOKE ALL ON ALL TABLES IN SCHEMA catalog, billing FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA catalog, billing FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA catalog, billing FROM PUBLIC;

GRANT USAGE ON SCHEMA catalog TO djay_auth_runtime, djay_runtime, djay_platform, djay_worker, djay_readonly_ops;
GRANT USAGE ON SCHEMA tenancy TO djay_platform;
GRANT SELECT ON ALL TABLES IN SCHEMA catalog TO djay_auth_runtime, djay_runtime, djay_platform, djay_worker, djay_readonly_ops;

GRANT SELECT, INSERT, UPDATE ON tenancy.product_subscriptions,
  tenancy.entitlement_snapshots, tenancy.quota_accounts TO djay_auth_runtime;

GRANT SELECT ON tenancy.product_subscriptions, tenancy.entitlement_overrides,
  tenancy.entitlement_snapshots, tenancy.quota_accounts, tenancy.usage_reservations,
  tenancy.usage_events TO djay_runtime;
GRANT INSERT, UPDATE ON tenancy.product_subscriptions, tenancy.entitlement_snapshots,
  tenancy.quota_accounts, tenancy.usage_reservations, tenancy.usage_events TO djay_runtime;

GRANT SELECT, INSERT, UPDATE ON tenancy.product_subscriptions,
  tenancy.entitlement_overrides, tenancy.entitlement_snapshots,
  tenancy.quota_accounts, tenancy.usage_reservations, tenancy.usage_events TO djay_platform;
GRANT SELECT ON tenancy.tenants TO djay_platform;
GRANT SELECT, INSERT, UPDATE ON catalog.plan_versions TO djay_platform;

GRANT USAGE ON SCHEMA billing TO djay_worker;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA billing TO djay_worker;
GRANT SELECT, INSERT, UPDATE ON tenancy.product_subscriptions,
  tenancy.entitlement_snapshots, tenancy.quota_accounts,
  tenancy.usage_reservations, tenancy.usage_events TO djay_worker;

GRANT SELECT ON tenancy.product_subscriptions, tenancy.entitlement_snapshots,
  tenancy.quota_accounts, tenancy.usage_events TO djay_readonly_ops;

GRANT EXECUTE ON FUNCTION catalog.protect_published_plan_version() TO djay_platform;
GRANT EXECUTE ON FUNCTION tenancy.validate_subscription_plan_product() TO djay_auth_runtime, djay_runtime, djay_platform, djay_worker;
GRANT EXECUTE ON FUNCTION tenancy.validate_subscription_transition() TO djay_auth_runtime, djay_runtime, djay_platform, djay_worker;
GRANT EXECUTE ON FUNCTION tenancy.reject_immutable_change() TO djay_auth_runtime, djay_runtime, djay_platform, djay_worker;
