ALTER TABLE identity.auth_sessions ADD COLUMN mfa_verified_at timestamptz;

CREATE TABLE identity.auth_login_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  password_verified_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);

CREATE INDEX identity_auth_login_challenges_active
  ON identity.auth_login_challenges(user_id, expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE identity.mfa_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  code_hash bytea NOT NULL UNIQUE CHECK (octet_length(code_hash) = 32),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON identity.auth_login_challenges, identity.mfa_recovery_codes FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON identity.auth_login_challenges,
  identity.mfa_recovery_codes TO djay_auth_runtime;
GRANT DELETE ON identity.mfa_factors, identity.mfa_recovery_codes TO djay_auth_runtime;
