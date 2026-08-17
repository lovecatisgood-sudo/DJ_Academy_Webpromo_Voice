-- 0102-0106 are reserved by the approved Platform Owner analytics sequence.
-- This independent pre-account Builder foundation therefore begins at 0107.

CREATE SCHEMA IF NOT EXISTS builder;
REVOKE ALL ON SCHEMA builder FROM PUBLIC;

CREATE TABLE builder.anonymous_sessions (
  id uuid PRIMARY KEY,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'claimed', 'expired')),
  claimed_registration_id uuid REFERENCES identity.signup_intents(id) ON DELETE RESTRICT,
  claimed_tenant_id uuid REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > issued_at),
  CHECK (
    (status = 'claimed' AND claimed_registration_id IS NOT NULL AND claimed_tenant_id IS NOT NULL AND claimed_at IS NOT NULL)
    OR (status <> 'claimed' AND claimed_registration_id IS NULL AND claimed_tenant_id IS NULL AND claimed_at IS NULL)
  )
);

CREATE INDEX builder_anonymous_sessions_expiry_idx
  ON builder.anonymous_sessions (expires_at)
  WHERE status = 'active';

CREATE TABLE builder.drafts (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL UNIQUE REFERENCES builder.anonymous_sessions(id) ON DELETE RESTRICT,
  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version >= 1),
  product_family text CHECK (product_family IN ('flow', 'text', 'voice')),
  plan_key text CHECK (plan_key IN (
    'flowbot_basic', 'flowbot_premium', 'ai_chat_basic', 'ai_chat_premium',
    'voice_basic_gen1', 'voice_advanced_gen2'
  )),
  state_json jsonb NOT NULL DEFAULT '{"schemaVersion":1,"locale":"th"}'::jsonb
    CHECK (jsonb_typeof(state_json) = 'object'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'claimed', 'expired')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX builder_drafts_expiry_idx ON builder.drafts (expires_at) WHERE status = 'active';

CREATE TABLE builder.draft_revisions (
  draft_id uuid NOT NULL REFERENCES builder.drafts(id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision >= 1),
  schema_version integer NOT NULL CHECK (schema_version >= 1),
  state_json jsonb NOT NULL CHECK (jsonb_typeof(state_json) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (draft_id, revision)
);

ALTER TABLE builder.anonymous_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE builder.anonymous_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE builder.drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE builder.drafts FORCE ROW LEVEL SECURITY;
ALTER TABLE builder.draft_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE builder.draft_revisions FORCE ROW LEVEL SECURITY;

-- Anonymous authority is established by the API's verified, expiring HMAC cookie. The auth
-- runtime owns the pre-tenant store; public and tenant roles receive no direct access.
CREATE POLICY builder_auth_sessions ON builder.anonymous_sessions
  TO djay_auth_runtime USING (true) WITH CHECK (true);
CREATE POLICY builder_auth_drafts ON builder.drafts
  TO djay_auth_runtime USING (true) WITH CHECK (true);
CREATE POLICY builder_auth_draft_revisions ON builder.draft_revisions
  TO djay_auth_runtime USING (true) WITH CHECK (true);

CREATE POLICY builder_platform_sessions ON builder.anonymous_sessions
  FOR SELECT TO djay_platform USING (true);
CREATE POLICY builder_platform_drafts ON builder.drafts
  FOR SELECT TO djay_platform USING (true);
CREATE POLICY builder_platform_draft_revisions ON builder.draft_revisions
  FOR SELECT TO djay_platform USING (true);

REVOKE ALL ON ALL TABLES IN SCHEMA builder FROM PUBLIC;
GRANT USAGE ON SCHEMA builder TO djay_auth_runtime, djay_platform, djay_readonly_ops;
GRANT SELECT, INSERT, UPDATE ON builder.anonymous_sessions, builder.drafts, builder.draft_revisions
  TO djay_auth_runtime;
GRANT SELECT ON builder.anonymous_sessions, builder.drafts, builder.draft_revisions
  TO djay_platform, djay_readonly_ops;
