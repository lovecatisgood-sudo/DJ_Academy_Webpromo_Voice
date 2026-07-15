CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS tenancy;
CREATE SCHEMA IF NOT EXISTS platform;
CREATE SCHEMA IF NOT EXISTS operations;

REVOKE ALL ON SCHEMA identity, tenancy, platform, operations FROM PUBLIC;

CREATE OR REPLACE FUNCTION tenancy.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

CREATE TABLE identity.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 160),
  status text NOT NULL DEFAULT 'pending_verification'
    CHECK (status IN ('pending_verification', 'active', 'suspended', 'deleted')),
  locale text NOT NULL DEFAULT 'en' CHECK (char_length(locale) BETWEEN 2 AND 16),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE identity.user_credentials (
  user_id uuid PRIMARY KEY REFERENCES identity.users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  compromised_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE identity.email_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  email_normalized text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email_normalized),
  UNIQUE (user_id, id),
  CHECK (email_normalized = lower(btrim(email_normalized))),
  CHECK (char_length(email_normalized) BETWEEN 3 AND 320)
);

CREATE UNIQUE INDEX identity_one_primary_email_per_user
  ON identity.email_addresses(user_id)
  WHERE is_primary = true;

CREATE TABLE tenancy.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  business_name text NOT NULL CHECK (char_length(business_name) BETWEEN 2 AND 200),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('provisioning', 'active', 'suspended', 'closed')),
  locale text NOT NULL DEFAULT 'en' CHECK (char_length(locale) BETWEEN 2 AND 16),
  timezone text NOT NULL DEFAULT 'Asia/Bangkok' CHECK (char_length(timezone) BETWEEN 3 AND 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE TABLE tenancy.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN (
    'tenant_master_admin', 'tenant_admin', 'tenant_operator', 'tenant_analyst'
  )),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('invited', 'active', 'suspended', 'revoked')),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (tenant_id, user_id),
  UNIQUE (tenant_id, id)
);

CREATE UNIQUE INDEX tenancy_one_active_master_admin
  ON tenancy.memberships(tenant_id)
  WHERE role = 'tenant_master_admin' AND status = 'active';

CREATE INDEX tenancy_memberships_user_active
  ON tenancy.memberships(user_id, status, tenant_id);

CREATE TABLE tenancy.tenant_onboarding (
  tenant_id uuid PRIMARY KEY REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  stage text NOT NULL DEFAULT 'account_created'
    CHECK (stage IN ('account_created', 'business_profile', 'product_selection', 'ready')),
  profile_completed_at timestamptz,
  product_selected_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE identity.signup_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key uuid NOT NULL UNIQUE,
  request_hash bytea NOT NULL CHECK (octet_length(request_hash) = 32),
  email_normalized text NOT NULL,
  display_name text NOT NULL,
  business_name text NOT NULL,
  password_hash text,
  locale text NOT NULL DEFAULT 'en',
  timezone text NOT NULL DEFAULT 'Asia/Bangkok',
  terms_version text NOT NULL,
  privacy_version text NOT NULL,
  status text NOT NULL DEFAULT 'verification_pending'
    CHECK (status IN ('verification_pending', 'provisioning', 'provisioned', 'expired', 'cancelled')),
  provisioned_user_id uuid REFERENCES identity.users(id) ON DELETE RESTRICT,
  provisioned_tenant_id uuid REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  provisioned_at timestamptz,
  expires_at timestamptz NOT NULL,
  CHECK (email_normalized = lower(btrim(email_normalized))),
  CHECK (expires_at > requested_at),
  CHECK (status IN ('provisioned', 'expired', 'cancelled') OR password_hash IS NOT NULL),
  CHECK (
    (status = 'provisioned' AND provisioned_user_id IS NOT NULL AND provisioned_tenant_id IS NOT NULL)
    OR status <> 'provisioned'
  )
);

CREATE UNIQUE INDEX identity_one_open_signup_per_email
  ON identity.signup_intents(email_normalized)
  WHERE status IN ('verification_pending', 'provisioning');

CREATE TABLE identity.one_time_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  purpose text NOT NULL CHECK (purpose IN (
    'verify_email', 'recover_password', 'accept_invitation', 'change_email', 'ownership_transfer'
  )),
  user_id uuid REFERENCES identity.users(id) ON DELETE CASCADE,
  signup_intent_id uuid REFERENCES identity.signup_intents(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR signup_intent_id IS NOT NULL),
  CHECK (expires_at > created_at)
);

CREATE INDEX identity_one_time_tokens_active
  ON identity.one_time_tokens(purpose, expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE identity.legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  tenant_id uuid REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  document_type text NOT NULL CHECK (document_type IN ('terms', 'privacy', 'dpa')),
  document_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  request_id text NOT NULL,
  UNIQUE (user_id, tenant_id, document_type, document_version)
);

CREATE TABLE identity.auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  family_id uuid NOT NULL,
  selected_tenant_id uuid REFERENCES tenancy.tenants(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  rotated_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text,
  CHECK (idle_expires_at <= absolute_expires_at)
);

CREATE INDEX identity_auth_sessions_user_active
  ON identity.auth_sessions(user_id, absolute_expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE identity.mfa_factors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  factor_type text NOT NULL CHECK (factor_type IN ('webauthn', 'totp')),
  label text NOT NULL,
  secret_ciphertext bytea,
  credential_data jsonb,
  verified_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (secret_ciphertext IS NOT NULL OR credential_data IS NOT NULL)
);

CREATE TABLE tenancy.membership_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  email_normalized text NOT NULL,
  role text NOT NULL CHECK (role IN ('tenant_admin', 'tenant_operator', 'tenant_analyst')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  invited_by_membership_id uuid NOT NULL,
  token_id uuid NOT NULL UNIQUE REFERENCES identity.one_time_tokens(id) ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL,
  accepted_by_user_id uuid REFERENCES identity.users(id) ON DELETE RESTRICT,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, invited_by_membership_id)
    REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT,
  CHECK (email_normalized = lower(btrim(email_normalized)))
);

CREATE UNIQUE INDEX tenancy_one_pending_invitation_per_email
  ON tenancy.membership_invitations(tenant_id, email_normalized)
  WHERE status = 'pending';

CREATE TABLE tenancy.ownership_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  from_membership_id uuid NOT NULL,
  to_membership_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'cancelled', 'expired')),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, from_membership_id)
    REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, to_membership_id)
    REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT,
  CHECK (from_membership_id <> to_membership_id)
);

CREATE UNIQUE INDEX tenancy_one_pending_ownership_transfer
  ON tenancy.ownership_transfers(tenant_id)
  WHERE status = 'pending';

CREATE TABLE tenancy.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES identity.users(id) ON DELETE RESTRICT,
  actor_membership_id uuid,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  request_id text NOT NULL,
  reason text,
  result text NOT NULL CHECK (result IN ('succeeded', 'denied', 'failed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, actor_membership_id)
    REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX tenancy_audit_logs_recent
  ON tenancy.audit_logs(tenant_id, created_at DESC);

CREATE TABLE tenancy.outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  topic text NOT NULL,
  payload jsonb NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'dead_letter')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  processed_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, topic, idempotency_key)
);

CREATE INDEX tenancy_outbox_due
  ON tenancy.outbox(status, available_at, tenant_id)
  WHERE status IN ('pending', 'failed');

CREATE TABLE operations.outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  payload_ciphertext text NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'dead_letter')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  processed_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (topic, idempotency_key)
);

CREATE INDEX operations_outbox_due
  ON operations.outbox(status, available_at)
  WHERE status IN ('pending', 'failed');

CREATE TABLE operations.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES identity.users(id) ON DELETE RESTRICT,
  realm text NOT NULL CHECK (realm IN ('public', 'tenant', 'platform', 'system')),
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  request_id text NOT NULL,
  result text NOT NULL CHECK (result IN ('succeeded', 'denied', 'failed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX operations_audit_logs_recent
  ON operations.audit_logs(created_at DESC);

CREATE TABLE operations.rate_limits (
  scope text NOT NULL,
  key_hash bytea NOT NULL CHECK (octet_length(key_hash) = 32),
  window_started_at timestamptz NOT NULL,
  attempt_count integer NOT NULL CHECK (attempt_count >= 0),
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, key_hash)
);

CREATE OR REPLACE FUNCTION identity.active_memberships_for_user(target_user_id uuid)
RETURNS TABLE (
  tenant_id uuid,
  tenant_slug text,
  business_name text,
  membership_id uuid,
  membership_role text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, identity, tenancy
AS $$
  SELECT tenant.id, tenant.slug, tenant.business_name, membership.id, membership.role
  FROM tenancy.memberships membership
  JOIN tenancy.tenants tenant ON tenant.id = membership.tenant_id
  WHERE membership.user_id = target_user_id
    AND membership.status = 'active'
    AND tenant.status = 'active'
  ORDER BY tenant.created_at, tenant.id
$$;

CREATE TABLE platform.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalized text NOT NULL UNIQUE,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending_mfa'
    CHECK (status IN ('pending_mfa', 'active', 'suspended', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email_normalized = lower(btrim(email_normalized)))
);

CREATE TABLE platform.role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN (
    'platform_owner', 'platform_ai_operations', 'platform_support', 'platform_finance'
  )),
  granted_by_user_id uuid REFERENCES platform.users(id) ON DELETE RESTRICT,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (platform_user_id, role)
);

CREATE TABLE platform.mfa_factors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE CASCADE,
  factor_type text NOT NULL CHECK (factor_type IN ('webauthn', 'totp')),
  label text NOT NULL,
  secret_ciphertext bytea,
  credential_data jsonb,
  verified_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (secret_ciphertext IS NOT NULL OR credential_data IS NOT NULL)
);

CREATE TABLE platform.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  family_id uuid NOT NULL,
  mfa_verified_at timestamptz NOT NULL,
  reauthenticated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (idle_expires_at <= absolute_expires_at)
);

CREATE TABLE platform.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_platform_user_id uuid REFERENCES platform.users(id) ON DELETE RESTRICT,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  request_id text NOT NULL,
  reason text,
  result text NOT NULL CHECK (result IN ('succeeded', 'denied', 'failed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX platform_audit_logs_recent ON platform.audit_logs(created_at DESC);

CREATE OR REPLACE FUNCTION tenancy.assert_tenant_has_one_owner(target_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  active_owner_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tenancy.tenants
    WHERE id = target_tenant_id AND status IN ('provisioning', 'active', 'suspended')
  ) THEN
    RETURN;
  END IF;

  SELECT count(*)::integer
  INTO active_owner_count
  FROM tenancy.memberships
  WHERE tenant_id = target_tenant_id
    AND role = 'tenant_master_admin'
    AND status = 'active';

  IF active_owner_count <> 1 THEN
    RAISE EXCEPTION 'tenant % must have exactly one active Tenant Master Admin', target_tenant_id
      USING ERRCODE = '23514';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.check_owner_after_membership_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
BEGIN
  PERFORM tenancy.assert_tenant_has_one_owner(COALESCE(NEW.tenant_id, OLD.tenant_id));
  IF TG_OP = 'UPDATE' AND OLD.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    PERFORM tenancy.assert_tenant_has_one_owner(OLD.tenant_id);
  END IF;
  RETURN NULL;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.check_owner_after_tenant_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
BEGIN
  PERFORM tenancy.assert_tenant_has_one_owner(COALESCE(NEW.id, OLD.id));
  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER tenancy_membership_owner_invariant
AFTER INSERT OR UPDATE OR DELETE ON tenancy.memberships
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION tenancy.check_owner_after_membership_change();

CREATE CONSTRAINT TRIGGER tenancy_tenant_owner_invariant
AFTER INSERT OR UPDATE OF status ON tenancy.tenants
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION tenancy.check_owner_after_tenant_change();

ALTER TABLE tenancy.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.tenants
  USING (id = tenancy.current_tenant_id())
  WITH CHECK (id = tenancy.current_tenant_id());

ALTER TABLE tenancy.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.memberships
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

ALTER TABLE tenancy.tenant_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.tenant_onboarding FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.tenant_onboarding
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

ALTER TABLE tenancy.membership_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.membership_invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.membership_invitations
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

ALTER TABLE tenancy.ownership_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.ownership_transfers FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.ownership_transfers
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

ALTER TABLE tenancy.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.audit_logs
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

ALTER TABLE tenancy.outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.outbox FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.outbox
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON ALL TABLES IN SCHEMA identity, tenancy, platform, operations FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA identity, tenancy, platform, operations FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA identity, tenancy, platform, operations FROM PUBLIC;

GRANT USAGE ON SCHEMA identity, tenancy, operations TO djay_auth_runtime;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA identity TO djay_auth_runtime;
GRANT SELECT, INSERT, UPDATE ON tenancy.tenants, tenancy.memberships,
  tenancy.tenant_onboarding, tenancy.membership_invitations,
  tenancy.ownership_transfers, tenancy.audit_logs, tenancy.outbox TO djay_auth_runtime;
GRANT EXECUTE ON FUNCTION tenancy.current_tenant_id() TO djay_auth_runtime;
GRANT EXECUTE ON FUNCTION identity.active_memberships_for_user(uuid) TO djay_auth_runtime;
GRANT SELECT, INSERT, UPDATE ON operations.outbox TO djay_auth_runtime;
GRANT INSERT ON operations.audit_logs TO djay_auth_runtime;
GRANT SELECT, INSERT, UPDATE ON operations.rate_limits TO djay_auth_runtime;

GRANT USAGE ON SCHEMA tenancy TO djay_runtime;
GRANT SELECT ON tenancy.tenants, tenancy.memberships, tenancy.tenant_onboarding,
  tenancy.membership_invitations, tenancy.ownership_transfers, tenancy.audit_logs TO djay_runtime;
GRANT INSERT, UPDATE ON tenancy.tenant_onboarding, tenancy.membership_invitations,
  tenancy.ownership_transfers, tenancy.audit_logs, tenancy.outbox TO djay_runtime;
GRANT UPDATE ON tenancy.memberships TO djay_runtime;
GRANT EXECUTE ON FUNCTION tenancy.current_tenant_id() TO djay_runtime;

GRANT USAGE ON SCHEMA tenancy, operations TO djay_worker;
GRANT SELECT, UPDATE ON tenancy.outbox TO djay_worker;
GRANT INSERT ON tenancy.audit_logs TO djay_worker;
GRANT SELECT, UPDATE ON operations.outbox TO djay_worker;
GRANT INSERT ON operations.audit_logs TO djay_worker;
GRANT EXECUTE ON FUNCTION tenancy.current_tenant_id() TO djay_worker;

GRANT USAGE ON SCHEMA platform TO djay_platform;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA platform TO djay_platform;

GRANT USAGE ON SCHEMA tenancy, platform TO djay_readonly_ops;
GRANT SELECT ON tenancy.tenants TO djay_readonly_ops;
