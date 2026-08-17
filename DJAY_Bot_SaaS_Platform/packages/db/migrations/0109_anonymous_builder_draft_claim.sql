ALTER TABLE builder.anonymous_sessions
  ADD COLUMN pending_registration_id uuid REFERENCES identity.signup_intents(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX builder_sessions_pending_registration_uidx
  ON builder.anonymous_sessions (pending_registration_id)
  WHERE pending_registration_id IS NOT NULL;

ALTER TABLE builder.anonymous_sessions
  DROP CONSTRAINT anonymous_sessions_check;

ALTER TABLE builder.anonymous_sessions
  ADD CONSTRAINT builder_anonymous_sessions_claim_state_check CHECK (
    (status = 'claimed'
      AND pending_registration_id IS NULL
      AND claimed_registration_id IS NOT NULL
      AND claimed_tenant_id IS NOT NULL
      AND claimed_at IS NOT NULL)
    OR (status = 'active'
      AND claimed_registration_id IS NULL
      AND claimed_tenant_id IS NULL
      AND claimed_at IS NULL)
    OR (status = 'expired'
      AND pending_registration_id IS NULL
      AND claimed_registration_id IS NULL
      AND claimed_tenant_id IS NULL
      AND claimed_at IS NULL)
  );

CREATE UNIQUE INDEX tenancy_memberships_id_tenant_uidx
  ON tenancy.memberships (id, tenant_id);

CREATE TABLE tenancy.builder_draft_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  claimed_by_user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  claimed_by_membership_id uuid NOT NULL REFERENCES tenancy.memberships(id) ON DELETE RESTRICT,
  source_session_id uuid NOT NULL UNIQUE REFERENCES builder.anonymous_sessions(id) ON DELETE RESTRICT,
  source_draft_id uuid NOT NULL UNIQUE REFERENCES builder.drafts(id) ON DELETE RESTRICT,
  source_revision integer NOT NULL CHECK (source_revision >= 1),
  schema_version integer NOT NULL CHECK (schema_version >= 1),
  product_family text NOT NULL CHECK (product_family IN ('flow', 'text', 'voice')),
  plan_key text NOT NULL CHECK (plan_key IN (
    'flowbot_basic', 'flowbot_premium', 'ai_chat_basic', 'ai_chat_premium',
    'voice_basic_gen1', 'voice_advanced_gen2'
  )),
  state_json jsonb NOT NULL CHECK (jsonb_typeof(state_json) = 'object'),
  claimed_at timestamptz NOT NULL,
  FOREIGN KEY (claimed_by_membership_id, tenant_id)
    REFERENCES tenancy.memberships(id, tenant_id) ON DELETE RESTRICT
);

CREATE INDEX builder_draft_claims_tenant_claimed_idx
  ON tenancy.builder_draft_claims (tenant_id, claimed_at DESC);

ALTER TABLE tenancy.builder_draft_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.builder_draft_claims FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tenancy.builder_draft_claims
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

GRANT SELECT, INSERT ON tenancy.builder_draft_claims TO djay_auth_runtime;
GRANT SELECT ON tenancy.builder_draft_claims TO djay_runtime;
