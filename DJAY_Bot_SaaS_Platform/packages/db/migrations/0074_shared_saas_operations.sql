CREATE TABLE tenancy.product_onboarding_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, product_key text NOT NULL REFERENCES catalog.products(product_key) ON DELETE RESTRICT,
  step_key text NOT NULL CHECK (step_key ~ '^[a-z][a-z0-9_.-]{1,99}$'), subject_id uuid,
  evidence_kind text NOT NULL CHECK (evidence_kind IN ('configured','published','tested','installed','channel_verified','telephone_verified','integration_verified','policy_verified')),
  evidence_sha256 bytea NOT NULL CHECK (octet_length(evidence_sha256) = 32), status text NOT NULL CHECK (status IN ('valid','superseded','failed')),
  observed_at timestamptz NOT NULL, expires_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, product_key, step_key, evidence_sha256),
  CHECK (expires_at IS NULL OR expires_at > observed_at)
);

CREATE TABLE tenancy.tutorial_progress (
  tenant_id uuid NOT NULL, membership_id uuid NOT NULL, tutorial_key text NOT NULL CHECK (tutorial_key ~ '^[a-z][a-z0-9_.-]{1,99}$'),
  status text NOT NULL CHECK (status IN ('started','completed','dismissed')), last_step_key text, started_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
  PRIMARY KEY (tenant_id, membership_id, tutorial_key),
  FOREIGN KEY (tenant_id, membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE CASCADE,
  CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);

CREATE TABLE tenancy.add_on_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  subscription_id uuid, add_on_key text NOT NULL CHECK (add_on_key IN ('additional_administrator','additional_workspace','additional_social_channel','branding_removal')),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 100), requested_scope jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(requested_scope) = 'object'),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','quoted','approved','provisioned','declined','cancelled')),
  requested_by_membership_id uuid NOT NULL, assigned_platform_user_id uuid REFERENCES platform.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
  UNIQUE (tenant_id, id), FOREIGN KEY (tenant_id, subscription_id) REFERENCES tenancy.product_subscriptions(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, requested_by_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  service_kind text NOT NULL CHECK (service_kind IN ('flow_starter_setup','flow_advanced_design','flow_complex_automation','knowledge_base_setup','ai_sales_configuration','ai_advanced_sales_system','voice_agent_setup','telephone_integration','custom_voice_automation','enterprise')),
  product_key text REFERENCES catalog.products(product_key) ON DELETE RESTRICT, brief text NOT NULL CHECK (char_length(brief) BETWEEN 20 AND 10000),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','qualifying','quoted','accepted','declined','cancelled','engaged')),
  requested_by_membership_id uuid NOT NULL, assigned_platform_user_id uuid REFERENCES platform.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id), FOREIGN KEY (tenant_id, requested_by_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.service_engagements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, service_request_id uuid NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200), scope_text text NOT NULL CHECK (char_length(scope_text) BETWEEN 20 AND 20000),
  status text NOT NULL DEFAULT 'awaiting_customer' CHECK (status IN ('awaiting_customer','scheduled','in_progress','review','completed','cancelled')),
  next_action_owner text NOT NULL CHECK (next_action_owner IN ('customer','djai','shared')), target_at timestamptz,
  platform_owner_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, service_request_id),
  FOREIGN KEY (tenant_id, service_request_id) REFERENCES tenancy.service_requests(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.service_engagement_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, engagement_id uuid NOT NULL,
  author_kind text NOT NULL CHECK (author_kind IN ('customer','djai')), body text NOT NULL CHECK (char_length(body) BETWEEN 2 AND 5000),
  next_action_owner text CHECK (next_action_owner IN ('customer','djai','shared')), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id), FOREIGN KEY (tenant_id, engagement_id) REFERENCES tenancy.service_engagements(tenant_id, id) ON DELETE CASCADE
);

CREATE TRIGGER tenancy_product_onboarding_evidence_immutable BEFORE UPDATE OR DELETE ON tenancy.product_onboarding_evidence
  FOR EACH ROW EXECUTE FUNCTION tenancy.reject_immutable_change();
CREATE TRIGGER tenancy_service_engagement_update_immutable BEFORE UPDATE OR DELETE ON tenancy.service_engagement_updates
  FOR EACH ROW EXECUTE FUNCTION tenancy.reject_immutable_change();

DO $$ DECLARE table_name text; BEGIN FOREACH table_name IN ARRAY ARRAY['product_onboarding_evidence','tutorial_progress','add_on_requests','service_requests','service_engagements','service_engagement_updates']
LOOP EXECUTE format('ALTER TABLE tenancy.%I ENABLE ROW LEVEL SECURITY', table_name); EXECUTE format('ALTER TABLE tenancy.%I FORCE ROW LEVEL SECURITY', table_name);
  EXECUTE format('CREATE POLICY tenant_isolation ON tenancy.%I USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id())', table_name); END LOOP; END $$;
CREATE POLICY platform_add_on_requests ON tenancy.add_on_requests TO djay_platform USING (true) WITH CHECK (true);
CREATE POLICY platform_service_requests ON tenancy.service_requests TO djay_platform USING (true) WITH CHECK (true);
CREATE POLICY platform_service_engagements ON tenancy.service_engagements TO djay_platform USING (true) WITH CHECK (true);
CREATE POLICY platform_service_updates ON tenancy.service_engagement_updates TO djay_platform USING (true) WITH CHECK (true);
CREATE POLICY platform_subscription_add_ons ON tenancy.subscription_add_ons TO djay_platform USING (true) WITH CHECK (true);

REVOKE ALL ON tenancy.product_onboarding_evidence, tenancy.tutorial_progress, tenancy.add_on_requests, tenancy.service_requests,
  tenancy.service_engagements, tenancy.service_engagement_updates FROM PUBLIC;
GRANT SELECT ON tenancy.product_onboarding_evidence, tenancy.tutorial_progress, tenancy.add_on_requests, tenancy.service_requests,
  tenancy.service_engagements, tenancy.service_engagement_updates TO djay_runtime;
GRANT INSERT, UPDATE ON tenancy.tutorial_progress, tenancy.add_on_requests, tenancy.service_requests TO djay_runtime;
GRANT INSERT ON tenancy.service_engagement_updates TO djay_runtime;
GRANT SELECT, UPDATE ON tenancy.add_on_requests, tenancy.service_requests, tenancy.service_engagements TO djay_platform;
GRANT INSERT, UPDATE ON tenancy.service_engagements TO djay_platform;
GRANT SELECT, INSERT ON tenancy.service_engagement_updates TO djay_platform;
GRANT SELECT, INSERT, UPDATE ON tenancy.subscription_add_ons TO djay_platform;
