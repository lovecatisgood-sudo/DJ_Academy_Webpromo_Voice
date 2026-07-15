SET ROLE djay_auth_runtime;
BEGIN;
SELECT set_config('app.tenant_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10', true);

SELECT id FROM tenancy.memberships
WHERE tenant_id = tenancy.current_tenant_id()
ORDER BY id
FOR UPDATE;

UPDATE tenancy.memberships
SET role = 'tenant_admin', updated_at = now()
WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11';

UPDATE tenancy.memberships
SET role = 'tenant_master_admin', updated_at = now()
WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12';

COMMIT;

BEGIN;
SELECT set_config('app.tenant_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10', true);
DO $$
BEGIN
  IF (
    SELECT count(*) FROM tenancy.memberships
    WHERE role = 'tenant_master_admin' AND status = 'active'
  ) <> 1 THEN
    RAISE EXCEPTION 'owner transfer did not preserve exactly one owner';
  END IF;
  IF (
    SELECT role FROM tenancy.memberships
    WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12'
  ) <> 'tenant_master_admin' THEN
    RAISE EXCEPTION 'target membership did not become owner';
  END IF;
END
$$;
ROLLBACK;

RESET ROLE;

