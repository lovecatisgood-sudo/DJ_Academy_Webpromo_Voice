CREATE TABLE platform.bootstrap_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton = true),
  completed_at timestamptz,
  completed_by_user_id uuid REFERENCES platform.users(id) ON DELETE RESTRICT
);

INSERT INTO platform.bootstrap_state (singleton) VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE platform.login_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  password_verified_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);

CREATE INDEX platform_login_challenges_active
  ON platform.login_challenges(platform_user_id, expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE platform.mfa_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE CASCADE,
  code_hash bytea NOT NULL UNIQUE CHECK (octet_length(code_hash) = 32),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE platform.sessions ADD COLUMN revoke_reason text;

REVOKE ALL ON platform.bootstrap_state, platform.login_challenges,
  platform.mfa_recovery_codes FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON platform.bootstrap_state, platform.login_challenges,
  platform.mfa_recovery_codes TO djay_platform;
