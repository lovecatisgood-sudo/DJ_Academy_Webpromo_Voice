SET ROLE djay_auth_runtime;
BEGIN;
SELECT set_config('app.tenant_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10', true);
INSERT INTO tenancy.ownership_transfers (
  id, tenant_id, from_membership_id, to_membership_id, status, expires_at
) VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa19',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb11',
  'pending',
  now() + interval '1 hour'
);
COMMIT;

