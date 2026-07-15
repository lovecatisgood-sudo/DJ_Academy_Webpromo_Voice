DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'djay_ai_runtime') THEN
    CREATE ROLE djay_ai_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;

CREATE TABLE tenancy.ai_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'disabled', 'archived')),
  default_language text NOT NULL DEFAULT 'th' CHECK (default_language IN ('th', 'en')),
  current_published_playbook_version_id uuid,
  branding_removed boolean NOT NULL DEFAULT false,
  created_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, created_by_membership_id)
    REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.ai_playbook_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  status text NOT NULL CHECK (status IN ('published', 'retired')),
  playbook_json jsonb NOT NULL,
  playbook_sha256 bytea NOT NULL CHECK (octet_length(playbook_sha256) = 32),
  source_version_id uuid,
  published_by_membership_id uuid NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, agent_id, id),
  UNIQUE (tenant_id, agent_id, version),
  FOREIGN KEY (tenant_id, agent_id) REFERENCES tenancy.ai_agents(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, agent_id, source_version_id)
    REFERENCES tenancy.ai_playbook_versions(tenant_id, agent_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, published_by_membership_id)
    REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT,
  CHECK (playbook_json->>'playbookVersionId' = id::text),
  CHECK ((playbook_json->>'schemaVersion')::integer = schema_version)
);

ALTER TABLE tenancy.ai_agents ADD CONSTRAINT tenancy_ai_agent_published_playbook_fk
  FOREIGN KEY (tenant_id, id, current_published_playbook_version_id)
  REFERENCES tenancy.ai_playbook_versions(tenant_id, agent_id, id) ON DELETE RESTRICT;

CREATE TABLE tenancy.ai_playbook_knowledge (
  tenant_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  playbook_version_id uuid NOT NULL,
  source_revision_id uuid NOT NULL,
  attached_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, playbook_version_id, source_revision_id),
  FOREIGN KEY (tenant_id, agent_id, playbook_version_id)
    REFERENCES tenancy.ai_playbook_versions(tenant_id, agent_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, source_revision_id)
    REFERENCES tenancy.knowledge_source_revisions(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.ai_playbook_drafts (
  tenant_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  based_on_version_id uuid,
  definition_json jsonb NOT NULL,
  knowledge_revision_ids uuid[] NOT NULL DEFAULT '{}',
  updated_by_membership_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, agent_id),
  FOREIGN KEY (tenant_id, agent_id) REFERENCES tenancy.ai_agents(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, agent_id, based_on_version_id)
    REFERENCES tenancy.ai_playbook_versions(tenant_id, agent_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, updated_by_membership_id)
    REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.ai_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
  channel text NOT NULL CHECK (channel IN ('web', 'line', 'whatsapp', 'messenger')),
  deployment_key_hash bytea UNIQUE CHECK (deployment_key_hash IS NULL OR octet_length(deployment_key_hash) = 32),
  key_prefix text CHECK (key_prefix IS NULL OR char_length(key_prefix) BETWEEN 6 AND 24),
  allowed_origins text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'revoked')),
  created_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz,
  revoked_at timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, id, agent_id),
  FOREIGN KEY (tenant_id, agent_id) REFERENCES tenancy.ai_agents(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_membership_id)
    REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT,
  CHECK (
    (channel = 'web' AND deployment_key_hash IS NOT NULL AND key_prefix IS NOT NULL AND cardinality(allowed_origins) > 0)
    OR (channel <> 'web' AND deployment_key_hash IS NULL AND key_prefix IS NULL AND cardinality(allowed_origins) = 0)
  )
);

CREATE TABLE tenancy.ai_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  deployment_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  playbook_version_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  entitlement_snapshot_id uuid NOT NULL,
  session_token_hash bytea NOT NULL UNIQUE CHECK (octet_length(session_token_hash) = 32),
  language text NOT NULL CHECK (language IN ('th', 'en')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'processing', 'handover', 'completed', 'failed', 'expired')),
  next_turn_sequence integer NOT NULL DEFAULT 1 CHECK (next_turn_sequence > 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  expires_at timestamptz NOT NULL,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, conversation_id),
  UNIQUE (tenant_id, id, playbook_version_id),
  FOREIGN KEY (tenant_id, deployment_id, agent_id)
    REFERENCES tenancy.ai_deployments(tenant_id, id, agent_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, agent_id, playbook_version_id)
    REFERENCES tenancy.ai_playbook_versions(tenant_id, agent_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, conversation_id)
    REFERENCES tenancy.conversations(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, contact_id)
    REFERENCES tenancy.contacts(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, entitlement_snapshot_id)
    REFERENCES tenancy.entitlement_snapshots(tenant_id, id) ON DELETE RESTRICT,
  CHECK (expires_at > started_at)
);

CREATE TABLE tenancy.ai_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  session_id uuid NOT NULL,
  turn_sequence integer NOT NULL CHECK (turn_sequence > 0),
  input_id uuid NOT NULL,
  usage_reservation_id uuid,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  customer_message_sha256 bytea NOT NULL CHECK (octet_length(customer_message_sha256) = 32),
  structured_output_json jsonb,
  public_response_json jsonb,
  safe_error_code text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, session_id, input_id),
  UNIQUE (tenant_id, session_id, turn_sequence),
  FOREIGN KEY (tenant_id, session_id)
    REFERENCES tenancy.ai_sessions(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, usage_reservation_id)
    REFERENCES tenancy.usage_reservations(tenant_id, id) ON DELETE RESTRICT,
  CHECK ((status = 'completed' AND structured_output_json IS NOT NULL AND public_response_json IS NOT NULL AND completed_at IS NOT NULL) OR status <> 'completed')
);

CREATE TABLE operations.ai_native_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  turn_id uuid NOT NULL,
  input_units bigint NOT NULL CHECK (input_units >= 0),
  output_units bigint NOT NULL CHECK (output_units >= 0),
  cached_units bigint NOT NULL DEFAULT 0 CHECK (cached_units >= 0),
  observed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, turn_id),
  FOREIGN KEY (tenant_id, turn_id) REFERENCES tenancy.ai_turns(tenant_id, id) ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION tenancy.reject_ai_immutable_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, tenancy AS $$
BEGIN
  RAISE EXCEPTION '% is immutable', TG_TABLE_NAME;
END
$$;

CREATE TRIGGER tenancy_ai_playbook_version_immutable
  BEFORE UPDATE OR DELETE ON tenancy.ai_playbook_versions
  FOR EACH ROW EXECUTE FUNCTION tenancy.reject_ai_immutable_change();
CREATE TRIGGER tenancy_ai_playbook_knowledge_immutable
  BEFORE UPDATE OR DELETE ON tenancy.ai_playbook_knowledge
  FOR EACH ROW EXECUTE FUNCTION tenancy.reject_ai_immutable_change();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'ai_agents', 'ai_playbook_versions', 'ai_playbook_knowledge', 'ai_playbook_drafts',
    'ai_deployments', 'ai_sessions', 'ai_turns'
  ] LOOP
    EXECUTE format('ALTER TABLE tenancy.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE tenancy.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON tenancy.%I USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id())',
      table_name
    );
  END LOOP;
END
$$;

REVOKE ALL ON tenancy.ai_agents, tenancy.ai_playbook_versions, tenancy.ai_playbook_knowledge,
  tenancy.ai_playbook_drafts, tenancy.ai_deployments, tenancy.ai_sessions, tenancy.ai_turns FROM PUBLIC;
REVOKE ALL ON operations.ai_native_usage FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE ON tenancy.ai_agents, tenancy.ai_playbook_drafts,
  tenancy.ai_deployments TO djay_runtime;
GRANT SELECT, INSERT ON tenancy.ai_playbook_versions, tenancy.ai_playbook_knowledge TO djay_runtime;
GRANT SELECT ON tenancy.ai_sessions, tenancy.ai_turns TO djay_runtime;
GRANT EXECUTE ON FUNCTION tenancy.reject_ai_immutable_change() TO djay_runtime;

GRANT USAGE ON SCHEMA tenancy, catalog, operations TO djay_ai_runtime;
