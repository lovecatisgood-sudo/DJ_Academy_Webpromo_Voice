CREATE TABLE tenancy.workspace_add_on_provisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_tenant_id uuid NOT NULL, add_on_request_id uuid NOT NULL,
  provisioned_tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  owner_membership_id uuid NOT NULL, provisioned_by_platform_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (source_tenant_id, add_on_request_id), UNIQUE (provisioned_tenant_id),
  FOREIGN KEY (source_tenant_id, add_on_request_id) REFERENCES tenancy.add_on_requests(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (provisioned_tenant_id, owner_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE TRIGGER tenancy_workspace_add_on_provision_immutable BEFORE UPDATE OR DELETE ON tenancy.workspace_add_on_provisions
  FOR EACH ROW EXECUTE FUNCTION tenancy.reject_immutable_change();

ALTER TABLE tenancy.workspace_add_on_provisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.workspace_add_on_provisions FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_workspace_add_on_provisions ON tenancy.workspace_add_on_provisions TO djay_platform USING (true) WITH CHECK (true);
CREATE POLICY platform_membership_provisioning ON tenancy.memberships TO djay_platform USING (true) WITH CHECK (true);
CREATE POLICY platform_onboarding_provisioning ON tenancy.tenant_onboarding TO djay_platform USING (true) WITH CHECK (true);
CREATE POLICY platform_tenant_provisioning ON tenancy.tenants FOR INSERT TO djay_platform WITH CHECK (true);

CREATE OR REPLACE FUNCTION tenancy.workspace_add_on_owner_context(target_request_id uuid)
RETURNS TABLE (user_id uuid, locale text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
BEGIN
  IF session_user <> 'djay_platform' THEN RAISE EXCEPTION 'platform_role_required'; END IF;
  RETURN QUERY
    SELECT membership.user_id, tenant.locale
    FROM tenancy.add_on_requests request
    JOIN tenancy.memberships membership ON membership.tenant_id = request.tenant_id
      AND membership.role = 'tenant_master_admin' AND membership.status = 'active'
    JOIN tenancy.tenants tenant ON tenant.id = request.tenant_id
    WHERE request.id = target_request_id AND request.add_on_key = 'additional_workspace'
      AND request.status IN ('requested','quoted','approved')
    LIMIT 1;
END
$$;

REVOKE ALL ON tenancy.workspace_add_on_provisions FROM PUBLIC;
GRANT SELECT, INSERT ON tenancy.workspace_add_on_provisions TO djay_platform;
GRANT SELECT, INSERT ON tenancy.memberships, tenancy.tenant_onboarding TO djay_platform;
GRANT INSERT ON tenancy.tenants TO djay_platform;
REVOKE ALL ON FUNCTION tenancy.workspace_add_on_owner_context(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.workspace_add_on_owner_context(uuid) TO djay_platform;
