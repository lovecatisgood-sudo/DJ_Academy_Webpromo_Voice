SET ROLE djay_auth_runtime;
BEGIN;
SELECT set_config('app.tenant_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10', true);
UPDATE tenancy.memberships
SET status = 'revoked', revoked_at = now()
WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11';
COMMIT;

