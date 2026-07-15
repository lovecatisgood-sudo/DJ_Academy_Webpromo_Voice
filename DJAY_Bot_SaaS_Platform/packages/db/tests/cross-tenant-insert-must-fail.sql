SET ROLE djay_runtime;
BEGIN;
SELECT set_config('app.tenant_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10', true);
INSERT INTO tenancy.tenant_onboarding (tenant_id, stage)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10', 'ready')
ON CONFLICT (tenant_id) DO UPDATE SET stage = EXCLUDED.stage;
COMMIT;

