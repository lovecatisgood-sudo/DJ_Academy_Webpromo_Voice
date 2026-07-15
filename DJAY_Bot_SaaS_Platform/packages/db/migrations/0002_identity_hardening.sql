ALTER TABLE identity.auth_sessions
  ADD COLUMN reauthenticated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE identity.one_time_tokens
  ADD COLUMN tenant_id uuid REFERENCES tenancy.tenants(id) ON DELETE CASCADE;

DO $$
DECLARE
  subject_constraint_name text;
BEGIN
  SELECT constraint_name
  INTO subject_constraint_name
  FROM information_schema.check_constraints
  WHERE constraint_schema = 'identity'
    AND check_clause LIKE '%user_id IS NOT NULL%signup_intent_id IS NOT NULL%'
  LIMIT 1;

  IF subject_constraint_name IS NULL THEN
    RAISE EXCEPTION 'identity.one_time_tokens subject constraint was not found';
  END IF;

  EXECUTE format(
    'ALTER TABLE identity.one_time_tokens DROP CONSTRAINT %I',
    subject_constraint_name
  );
END
$$;

ALTER TABLE identity.one_time_tokens
  ADD CONSTRAINT identity_one_time_token_has_subject CHECK (
    user_id IS NOT NULL
    OR signup_intent_id IS NOT NULL
    OR (purpose = 'accept_invitation' AND tenant_id IS NOT NULL)
  );

ALTER TABLE tenancy.ownership_transfers
  ADD COLUMN token_id uuid UNIQUE REFERENCES identity.one_time_tokens(id) ON DELETE RESTRICT;

CREATE INDEX identity_auth_sessions_user_recent
  ON identity.auth_sessions(user_id, last_seen_at DESC);

GRANT SELECT, INSERT, UPDATE ON identity.one_time_tokens, identity.auth_sessions TO djay_auth_runtime;
