CREATE TABLE tenancy.flow_bots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'disabled', 'archived')),
  current_published_version_id uuid,
  branding_removed boolean NOT NULL DEFAULT false,
  default_language text NOT NULL DEFAULT 'th' CHECK (default_language IN ('th', 'en')),
  created_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, created_by_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.flow_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  bot_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  status text NOT NULL CHECK (status IN ('published', 'retired')),
  snapshot_json jsonb NOT NULL,
  snapshot_sha256 bytea NOT NULL CHECK (octet_length(snapshot_sha256) = 32),
  source_version_id uuid,
  published_by_membership_id uuid NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, bot_id, id),
  UNIQUE (tenant_id, bot_id, version),
  FOREIGN KEY (tenant_id, bot_id) REFERENCES tenancy.flow_bots(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, bot_id, source_version_id) REFERENCES tenancy.flow_versions(tenant_id, bot_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, published_by_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT,
  CHECK (snapshot_json->>'flowVersionId' = id::text),
  CHECK ((snapshot_json->>'schemaVersion')::integer = schema_version)
);

ALTER TABLE tenancy.flow_bots ADD CONSTRAINT tenancy_flow_bot_published_version_fk
  FOREIGN KEY (tenant_id, id, current_published_version_id)
  REFERENCES tenancy.flow_versions(tenant_id, bot_id, id) ON DELETE RESTRICT;

CREATE TABLE tenancy.flow_drafts (
  tenant_id uuid NOT NULL,
  bot_id uuid NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  based_on_version_id uuid,
  definition_json jsonb NOT NULL,
  updated_by_membership_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, bot_id),
  FOREIGN KEY (tenant_id, bot_id) REFERENCES tenancy.flow_bots(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, bot_id, based_on_version_id) REFERENCES tenancy.flow_versions(tenant_id, bot_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, updated_by_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.flow_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  bot_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
  deployment_key_hash bytea NOT NULL UNIQUE CHECK (octet_length(deployment_key_hash) = 32),
  key_prefix text NOT NULL CHECK (char_length(key_prefix) BETWEEN 6 AND 24),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'revoked')),
  allowed_origins text[] NOT NULL DEFAULT '{}',
  created_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz,
  revoked_at timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, id, bot_id),
  FOREIGN KEY (tenant_id, bot_id) REFERENCES tenancy.flow_bots(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.flow_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  deployment_id uuid NOT NULL,
  bot_id uuid NOT NULL,
  flow_version_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  entitlement_snapshot_id uuid NOT NULL,
  usage_reservation_id uuid,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'waiting', 'handover', 'completed', 'failed', 'expired')),
  state_json jsonb NOT NULL,
  next_input_sequence integer NOT NULL DEFAULT 1 CHECK (next_input_sequence > 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  expires_at timestamptz NOT NULL,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, conversation_id),
  UNIQUE (tenant_id, id, flow_version_id),
  UNIQUE (tenant_id, id, bot_id, flow_version_id),
  FOREIGN KEY (tenant_id, deployment_id, bot_id) REFERENCES tenancy.flow_deployments(tenant_id, id, bot_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, bot_id) REFERENCES tenancy.flow_bots(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, bot_id, flow_version_id) REFERENCES tenancy.flow_versions(tenant_id, bot_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, conversation_id) REFERENCES tenancy.conversations(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, entitlement_snapshot_id) REFERENCES tenancy.entitlement_snapshots(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, usage_reservation_id) REFERENCES tenancy.usage_reservations(tenant_id, id) ON DELETE RESTRICT,
  CHECK (expires_at > started_at),
  CHECK ((status = 'completed' AND completed_at IS NOT NULL) OR status <> 'completed')
);

CREATE TABLE tenancy.flow_processed_inputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  execution_id uuid NOT NULL,
  input_id uuid NOT NULL,
  input_sequence integer NOT NULL CHECK (input_sequence > 0),
  response_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, execution_id, input_id),
  UNIQUE (tenant_id, execution_id, input_sequence),
  FOREIGN KEY (tenant_id, execution_id) REFERENCES tenancy.flow_executions(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.flow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  bot_id uuid NOT NULL,
  execution_id uuid,
  flow_version_id uuid NOT NULL,
  event_type text NOT NULL CHECK (char_length(event_type) BETWEEN 2 AND 100),
  node_id uuid,
  detail_json jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, bot_id) REFERENCES tenancy.flow_bots(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, execution_id, bot_id, flow_version_id)
    REFERENCES tenancy.flow_executions(tenant_id, id, bot_id, flow_version_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, bot_id, flow_version_id)
    REFERENCES tenancy.flow_versions(tenant_id, bot_id, id) ON DELETE RESTRICT
);
CREATE INDEX tenancy_flow_events_analytics ON tenancy.flow_events(tenant_id, bot_id, event_type, occurred_at DESC);

CREATE TABLE tenancy.flow_timers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  execution_id uuid NOT NULL,
  flow_version_id uuid NOT NULL,
  node_id uuid NOT NULL,
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'processing', 'fired', 'cancelled', 'failed')),
  idempotency_key text NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  locked_at timestamptz,
  fired_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, execution_id, flow_version_id)
    REFERENCES tenancy.flow_executions(tenant_id, id, flow_version_id) ON DELETE RESTRICT
);
CREATE INDEX tenancy_flow_timers_due ON tenancy.flow_timers(status, due_at) WHERE status IN ('scheduled', 'failed');

CREATE TABLE tenancy.flow_integration_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
  endpoint_ciphertext text NOT NULL,
  allowed_template_keys text[] NOT NULL,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'disabled', 'revoked')),
  requested_by_membership_id uuid NOT NULL,
  approved_by_platform_user_id uuid REFERENCES platform.users(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, requested_by_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT,
  CHECK (
    (status = 'requested' AND approved_by_platform_user_id IS NULL AND approved_at IS NULL)
    OR (status <> 'requested' AND approved_by_platform_user_id IS NOT NULL AND approved_at IS NOT NULL)
  )
);

CREATE TABLE tenancy.flow_integration_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  execution_id uuid NOT NULL,
  node_id uuid NOT NULL,
  integration_profile_id uuid NOT NULL,
  template_key text NOT NULL,
  payload_ciphertext text NOT NULL,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'processing', 'succeeded', 'failed', 'dead_letter')),
  idempotency_key text NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  safe_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, execution_id) REFERENCES tenancy.flow_executions(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, integration_profile_id) REFERENCES tenancy.flow_integration_profiles(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.flow_install_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  deployment_id uuid NOT NULL,
  requested_by_membership_id uuid NOT NULL,
  target_origin text NOT NULL,
  status text NOT NULL CHECK (status IN ('requested', 'verified', 'failed')),
  safe_result_code text,
  checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, deployment_id) REFERENCES tenancy.flow_deployments(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, requested_by_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.flow_legacy_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  source_system text NOT NULL,
  source_entity_type text NOT NULL,
  source_id text NOT NULL,
  target_entity_type text NOT NULL,
  target_id uuid NOT NULL,
  source_checksum bytea NOT NULL,
  migrated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, source_system, source_entity_type, source_id)
);

CREATE TABLE tenancy.flow_migration_quarantine (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  source_system text NOT NULL,
  source_entity_type text NOT NULL,
  source_id text NOT NULL,
  reason_code text NOT NULL,
  detail_json jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, source_system, source_entity_type, source_id)
);

CREATE OR REPLACE FUNCTION tenancy.reject_flow_immutable_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, tenancy AS $$
BEGIN RAISE EXCEPTION '% is immutable', TG_TABLE_NAME; END
$$;
CREATE TRIGGER tenancy_flow_version_immutable BEFORE UPDATE OR DELETE ON tenancy.flow_versions
  FOR EACH ROW EXECUTE FUNCTION tenancy.reject_flow_immutable_change();
CREATE TRIGGER tenancy_flow_processed_input_immutable BEFORE UPDATE OR DELETE ON tenancy.flow_processed_inputs
  FOR EACH ROW EXECUTE FUNCTION tenancy.reject_flow_immutable_change();
CREATE TRIGGER tenancy_flow_event_immutable BEFORE UPDATE OR DELETE ON tenancy.flow_events
  FOR EACH ROW EXECUTE FUNCTION tenancy.reject_flow_immutable_change();
CREATE TRIGGER tenancy_flow_legacy_mapping_immutable BEFORE UPDATE OR DELETE ON tenancy.flow_legacy_mappings
  FOR EACH ROW EXECUTE FUNCTION tenancy.reject_flow_immutable_change();

CREATE OR REPLACE FUNCTION tenancy.resolve_flowbot_deployment(target_key_hash bytea)
RETURNS TABLE (
  tenant_id uuid, deployment_id uuid, bot_id uuid, flow_version_id uuid,
  entitlement_snapshot_id uuid, allowed_origins text[], branding_removed boolean,
  bot_name text, default_language text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, tenancy, catalog AS $$
  SELECT deployment.tenant_id, deployment.id, bot.id, version.id, snapshot.id,
         deployment.allowed_origins, bot.branding_removed, bot.name, bot.default_language
  FROM tenancy.flow_deployments deployment
  JOIN tenancy.flow_bots bot ON bot.tenant_id = deployment.tenant_id AND bot.id = deployment.bot_id
  JOIN tenancy.flow_versions version ON version.tenant_id = bot.tenant_id AND version.id = bot.current_published_version_id
  JOIN tenancy.entitlement_snapshots snapshot ON snapshot.tenant_id = bot.tenant_id
    AND snapshot.product_key = 'flowbot' AND snapshot.access_mode = 'active'
  JOIN tenancy.product_subscriptions subscription ON subscription.tenant_id = snapshot.tenant_id
    AND subscription.id = snapshot.subscription_id AND subscription.status IN ('active', 'trialing', 'scheduled_change')
  WHERE deployment.deployment_key_hash = target_key_hash AND deployment.status = 'active'
    AND bot.status = 'active' AND version.status = 'published'
  ORDER BY snapshot.created_at DESC LIMIT 1
$$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'flow_bots', 'flow_versions', 'flow_drafts', 'flow_deployments', 'flow_executions',
    'flow_processed_inputs', 'flow_events', 'flow_timers', 'flow_integration_profiles',
    'flow_integration_dispatches', 'flow_install_checks', 'flow_legacy_mappings',
    'flow_migration_quarantine'
  ] LOOP
    EXECUTE format('ALTER TABLE tenancy.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE tenancy.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON tenancy.%I USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id())', table_name);
  END LOOP;
END
$$;

CREATE POLICY platform_flow_integration_approval ON tenancy.flow_integration_profiles TO djay_platform
  USING (true) WITH CHECK (true);
CREATE POLICY worker_flow_timer_access ON tenancy.flow_timers TO djay_worker
  USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY worker_flow_dispatch_access ON tenancy.flow_integration_dispatches TO djay_worker
  USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY worker_flow_profile_access ON tenancy.flow_integration_profiles TO djay_worker
  USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());

GRANT SELECT, INSERT, UPDATE ON tenancy.flow_bots, tenancy.flow_drafts,
  tenancy.flow_deployments, tenancy.flow_executions, tenancy.flow_timers,
  tenancy.flow_integration_profiles, tenancy.flow_integration_dispatches,
  tenancy.flow_install_checks, tenancy.flow_migration_quarantine TO djay_runtime;
GRANT SELECT, INSERT ON tenancy.flow_versions, tenancy.flow_processed_inputs,
  tenancy.flow_events, tenancy.flow_legacy_mappings TO djay_runtime;
GRANT SELECT, UPDATE ON tenancy.flow_timers, tenancy.flow_integration_dispatches TO djay_worker;
GRANT SELECT ON tenancy.flow_integration_profiles, tenancy.flow_executions,
  tenancy.flow_versions TO djay_worker;
GRANT SELECT, UPDATE ON tenancy.flow_integration_profiles TO djay_platform;
REVOKE ALL ON FUNCTION tenancy.resolve_flowbot_deployment(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.resolve_flowbot_deployment(bytea) TO djay_runtime;
GRANT EXECUTE ON FUNCTION tenancy.reject_flow_immutable_change() TO djay_runtime, djay_worker;
