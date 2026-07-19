ALTER TABLE tenancy.memberships
  DROP CONSTRAINT memberships_role_check,
  ADD CONSTRAINT memberships_role_check CHECK (role IN (
    'tenant_master_admin', 'tenant_admin', 'tenant_operator',
    'tenant_conversation_manager', 'tenant_human_agent', 'tenant_analyst',
    'tenant_billing_manager', 'tenant_readonly_support'
  ));

ALTER TABLE tenancy.membership_invitations
  DROP CONSTRAINT membership_invitations_role_check,
  ADD CONSTRAINT membership_invitations_role_check CHECK (role IN (
    'tenant_admin', 'tenant_operator', 'tenant_conversation_manager',
    'tenant_human_agent', 'tenant_analyst', 'tenant_billing_manager'
  ));

CREATE OR REPLACE FUNCTION tenancy.current_tenant_team()
RETURNS TABLE (
  membership_id uuid,
  user_id uuid,
  display_name text,
  email_normalized text,
  membership_role text,
  membership_status text,
  accepted_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, identity, tenancy
AS $$
  SELECT membership.id, membership.user_id, app_user.display_name,
         email.email_normalized, membership.role, membership.status,
         membership.accepted_at
  FROM tenancy.memberships membership
  JOIN identity.users app_user ON app_user.id = membership.user_id
  JOIN identity.email_addresses email
    ON email.user_id = app_user.id AND email.is_primary = true
  WHERE membership.tenant_id = tenancy.current_tenant_id()
    AND membership.status = 'active'
  ORDER BY
    CASE membership.role WHEN 'tenant_master_admin' THEN 0 ELSE 1 END,
    app_user.display_name,
    membership.id
$$;

CREATE TABLE tenancy.security_policies (
  tenant_id uuid PRIMARY KEY REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  sensitive_actions_require_mfa boolean NOT NULL DEFAULT true
    CHECK (sensitive_actions_require_mfa = true),
  tenant_admin_mfa_required boolean NOT NULL DEFAULT false,
  assurance_max_age_seconds integer NOT NULL DEFAULT 600
    CHECK (assurance_max_age_seconds BETWEEN 60 AND 1800),
  approved_policy_ref text,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO tenancy.security_policies (tenant_id)
SELECT id FROM tenancy.tenants ON CONFLICT (tenant_id) DO NOTHING;

CREATE OR REPLACE FUNCTION tenancy.create_default_security_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
BEGIN
  INSERT INTO tenancy.security_policies (tenant_id) VALUES (NEW.id)
  ON CONFLICT (tenant_id) DO NOTHING;
  RETURN NEW;
END
$$;

CREATE TRIGGER tenancy_default_security_policy
AFTER INSERT ON tenancy.tenants
FOR EACH ROW EXECUTE FUNCTION tenancy.create_default_security_policy();

CREATE OR REPLACE FUNCTION tenancy.reject_audit_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, tenancy
AS $$
BEGIN
  RAISE EXCEPTION 'audit events are immutable';
END
$$;

CREATE OR REPLACE FUNCTION platform.reject_audit_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, platform
AS $$
BEGIN
  RAISE EXCEPTION 'audit events are immutable';
END
$$;

CREATE OR REPLACE FUNCTION operations.reject_audit_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, operations
AS $$
BEGIN
  RAISE EXCEPTION 'audit events are immutable';
END
$$;

CREATE TRIGGER tenancy_audit_logs_immutable
BEFORE UPDATE OR DELETE ON tenancy.audit_logs
FOR EACH ROW EXECUTE FUNCTION tenancy.reject_audit_change();
CREATE TRIGGER platform_audit_logs_immutable
BEFORE UPDATE OR DELETE ON platform.audit_logs
FOR EACH ROW EXECUTE FUNCTION platform.reject_audit_change();
CREATE TRIGGER operations_audit_logs_immutable
BEFORE UPDATE OR DELETE ON operations.audit_logs
FOR EACH ROW EXECUTE FUNCTION operations.reject_audit_change();

CREATE OR REPLACE FUNCTION tenancy.manage_membership(
  target_membership_id uuid,
  replacement_role text,
  revoke_access boolean,
  request_id_value text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
DECLARE
  tenant_id_value uuid;
  actor_membership_id uuid;
  actor_user_id uuid;
  actor_role text;
  target tenancy.memberships%ROWTYPE;
BEGIN
  IF session_user <> 'djay_runtime' THEN RAISE EXCEPTION 'tenant_runtime_required'; END IF;
  tenant_id_value := NULLIF(current_setting('app.tenant_id', true), '')::uuid;
  actor_membership_id := NULLIF(current_setting('app.membership_id', true), '')::uuid;
  actor_user_id := NULLIF(current_setting('app.user_id', true), '')::uuid;
  SELECT role INTO actor_role FROM tenancy.memberships
    WHERE tenant_id = tenant_id_value AND id = actor_membership_id
      AND user_id = actor_user_id AND status = 'active';
  IF actor_role <> 'tenant_master_admin' THEN RETURN 'not_authorized'; END IF;

  SELECT * INTO target FROM tenancy.memberships
    WHERE tenant_id = tenant_id_value AND id = target_membership_id FOR UPDATE;
  IF target.id IS NULL OR target.status <> 'active' THEN RETURN 'not_found'; END IF;
  IF target.role = 'tenant_master_admin' THEN RETURN 'owner_protected'; END IF;
  IF revoke_access THEN
    UPDATE tenancy.memberships SET status = 'revoked', revoked_at = now(), updated_at = now()
      WHERE tenant_id = tenant_id_value AND id = target.id;
  ELSE
    IF replacement_role IS NULL OR replacement_role NOT IN (
      'tenant_admin', 'tenant_operator', 'tenant_conversation_manager',
      'tenant_human_agent', 'tenant_analyst', 'tenant_billing_manager'
    ) THEN RETURN 'invalid_role'; END IF;
    UPDATE tenancy.memberships SET role = replacement_role, updated_at = now()
      WHERE tenant_id = tenant_id_value AND id = target.id;
  END IF;

  INSERT INTO tenancy.audit_logs (
    tenant_id, actor_user_id, actor_membership_id, action, target_type,
    target_id, request_id, result, metadata
  ) VALUES (
    tenant_id_value, actor_user_id, actor_membership_id,
    CASE WHEN revoke_access THEN 'team.membership_revoked' ELSE 'team.membership_role_changed' END,
    'membership', target.id::text, request_id_value, 'succeeded',
    jsonb_build_object('beforeRole', target.role, 'afterRole',
      CASE WHEN revoke_access THEN NULL ELSE replacement_role END,
      'beforeStatus', target.status, 'afterStatus',
      CASE WHEN revoke_access THEN 'revoked' ELSE target.status END)
  );
  RETURN CASE WHEN revoke_access THEN 'revoked' ELSE 'role_changed' END;
END
$$;

ALTER TABLE tenancy.security_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.security_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_security_policy_isolation ON tenancy.security_policies
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON tenancy.security_policies FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.create_default_security_policy() FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.reject_audit_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.reject_audit_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION operations.reject_audit_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.manage_membership(uuid, text, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.current_tenant_team() FROM PUBLIC;

GRANT SELECT ON tenancy.security_policies TO djay_runtime, djay_readonly_ops;
GRANT UPDATE (tenant_admin_mfa_required, assurance_max_age_seconds,
  approved_policy_ref, updated_by_user_id, updated_at)
  ON tenancy.security_policies TO djay_runtime;
GRANT EXECUTE ON FUNCTION tenancy.manage_membership(uuid, text, boolean, text) TO djay_runtime;
GRANT EXECUTE ON FUNCTION tenancy.current_tenant_team() TO djay_runtime;
