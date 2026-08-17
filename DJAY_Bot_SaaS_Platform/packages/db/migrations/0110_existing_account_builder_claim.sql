CREATE TABLE builder.claim_continuations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  session_id uuid NOT NULL REFERENCES builder.anonymous_sessions(id) ON DELETE RESTRICT,
  draft_id uuid NOT NULL REFERENCES builder.drafts(id) ON DELETE RESTRICT,
  draft_revision integer NOT NULL CHECK (draft_revision >= 1),
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'consumed', 'superseded')),
  consumed_at timestamptz,
  claimed_tenant_id uuid REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  CHECK (
    (status = 'issued' AND consumed_at IS NULL AND claimed_tenant_id IS NULL)
    OR (status = 'consumed' AND consumed_at IS NOT NULL AND claimed_tenant_id IS NOT NULL)
    OR (status = 'superseded' AND consumed_at IS NOT NULL AND claimed_tenant_id IS NULL)
  )
);

CREATE UNIQUE INDEX builder_claim_continuations_one_active_session_uidx
  ON builder.claim_continuations (session_id)
  WHERE status = 'issued';

CREATE INDEX builder_claim_continuations_expiry_idx
  ON builder.claim_continuations (expires_at)
  WHERE status = 'issued';

ALTER TABLE builder.anonymous_sessions
  DROP CONSTRAINT anonymous_sessions_check1;

ALTER TABLE builder.anonymous_sessions
  DROP CONSTRAINT builder_anonymous_sessions_claim_state_check;

ALTER TABLE builder.anonymous_sessions
  ADD CONSTRAINT builder_anonymous_sessions_claim_state_check CHECK (
    (status = 'claimed'
      AND pending_registration_id IS NULL
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

ALTER TABLE builder.claim_continuations ENABLE ROW LEVEL SECURITY;
ALTER TABLE builder.claim_continuations FORCE ROW LEVEL SECURITY;

CREATE POLICY builder_auth_claim_continuations ON builder.claim_continuations
  TO djay_auth_runtime USING (true) WITH CHECK (true);
CREATE POLICY builder_platform_claim_continuations ON builder.claim_continuations
  FOR SELECT TO djay_platform USING (true);

GRANT SELECT, INSERT, UPDATE ON builder.claim_continuations TO djay_auth_runtime;
GRANT SELECT ON builder.claim_continuations TO djay_platform, djay_readonly_ops;
