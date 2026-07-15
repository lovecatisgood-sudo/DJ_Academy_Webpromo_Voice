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
  ORDER BY
    CASE membership.role WHEN 'tenant_master_admin' THEN 0 ELSE 1 END,
    app_user.display_name,
    membership.id
$$;

REVOKE ALL ON FUNCTION tenancy.current_tenant_team() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.current_tenant_team() TO djay_runtime;
