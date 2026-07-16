DO $$
DECLARE
  forced_rls_count integer;
BEGIN
  IF (SELECT count(*) FROM catalog.plans) <> 6 THEN
    RAISE EXCEPTION 'restored catalog does not contain exactly six plans';
  END IF;
  IF (SELECT count(*) FROM tenancy.tenants) <> 2
     OR (SELECT count(*) FROM tenancy.memberships) <> 3 THEN
    RAISE EXCEPTION 'restored tenant or membership fixture count mismatch';
  END IF;

  SELECT count(*) INTO forced_rls_count
  FROM pg_catalog.pg_class relation
  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'tenancy'
    AND relation.relname IN (
      'product_subscriptions', 'entitlement_snapshots', 'quota_accounts',
      'usage_reservations', 'usage_events'
    )
    AND relation.relrowsecurity
    AND relation.relforcerowsecurity;
  IF forced_rls_count <> 5 THEN
    RAISE EXCEPTION 'restored commerce tables lost forced RLS';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgname = 'tenancy_usage_event_immutable' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'restored usage-event immutability trigger missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgname = 'catalog_plan_version_immutable' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'restored plan-version immutability trigger missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc procedure
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'tenancy'
      AND procedure.proname = 'current_tenant_id'
  ) THEN
    RAISE EXCEPTION 'restored tenant context authority missing';
  END IF;
END
$$;
