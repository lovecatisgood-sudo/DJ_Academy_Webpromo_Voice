-- Short-lived, encrypted staging for Facebook Login for Business Page grants.
-- A row is written by the OAuth callback (holding the encrypted granted-Page list)
-- and consumed exactly once when the merchant picks a Page in the connect step.
-- bot_id / membership_id are validated at the route layer and carried through here;
-- only tenant_id carries a foreign key (RLS anchor).

CREATE TABLE tenancy.meta_oauth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  membership_id uuid NOT NULL,
  bot_id uuid NOT NULL,
  nonce_hash bytea NOT NULL CHECK (octet_length(nonce_hash) = 32),
  pages_ciphertext text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (tenant_id, nonce_hash),
  CHECK (expires_at > created_at)
);

CREATE INDEX meta_oauth_sessions_expires_idx ON tenancy.meta_oauth_sessions (expires_at);

ALTER TABLE tenancy.meta_oauth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.meta_oauth_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY tenancy_meta_oauth_sessions_tenant ON tenancy.meta_oauth_sessions
  TO djay_runtime
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON tenancy.meta_oauth_sessions FROM PUBLIC;
GRANT SELECT, INSERT, DELETE ON tenancy.meta_oauth_sessions TO djay_runtime;
