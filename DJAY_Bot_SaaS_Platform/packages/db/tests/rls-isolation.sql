SET ROLE djay_runtime;

SELECT set_config('app.tenant_id', '', false);
DO $$
BEGIN
  IF (SELECT count(*) FROM tenancy.tenants) <> 0 THEN
    RAISE EXCEPTION 'missing tenant context exposed tenant rows';
  END IF;
  IF (SELECT count(*) FROM tenancy.memberships) <> 0 THEN
    RAISE EXCEPTION 'missing tenant context exposed membership rows';
  END IF;
END
$$;

BEGIN;
SELECT set_config('app.tenant_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10', true);

DO $$
BEGIN
  IF (SELECT count(*) FROM tenancy.tenants) <> 1 THEN
    RAISE EXCEPTION 'tenant A did not see exactly one tenant';
  END IF;
  IF (SELECT business_name FROM tenancy.tenants) <> 'Tenant A' THEN
    RAISE EXCEPTION 'tenant A saw the wrong tenant';
  END IF;
  IF (SELECT count(*) FROM tenancy.memberships) <> 2 THEN
    RAISE EXCEPTION 'tenant A membership scope mismatch';
  END IF;
  IF (SELECT count(*) FROM tenancy.tenant_onboarding) <> 1 THEN
    RAISE EXCEPTION 'tenant A onboarding scope mismatch';
  END IF;
END
$$;

UPDATE tenancy.tenant_onboarding
SET stage = 'ready'
WHERE tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10';

DO $$
BEGIN
  IF FOUND THEN
    RAISE EXCEPTION 'tenant A updated tenant B onboarding';
  END IF;
END
$$;

ROLLBACK;

BEGIN;
SELECT set_config('app.tenant_id', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM tenancy.tenants) <> 1 THEN
    RAISE EXCEPTION 'tenant B did not see exactly one tenant';
  END IF;
  IF (SELECT business_name FROM tenancy.tenants) <> 'Tenant B' THEN
    RAISE EXCEPTION 'tenant B saw the wrong tenant';
  END IF;
  IF (SELECT count(*) FROM tenancy.memberships) <> 1 THEN
    RAISE EXCEPTION 'tenant B membership scope mismatch';
  END IF;
END
$$;
ROLLBACK;

RESET ROLE;

