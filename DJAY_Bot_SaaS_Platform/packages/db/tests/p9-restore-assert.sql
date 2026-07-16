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
  IF (SELECT count(*) FROM platform.service_objectives) <> 7 THEN
    RAISE EXCEPTION 'restored service objective registry mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgname = 'platform_service_observations_immutable' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'restored SLO evidence immutability trigger missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname = 'operational_attestations_attestation_kind_check'
      AND pg_get_constraintdef(oid) LIKE '%event_replay%'
      AND pg_get_constraintdef(oid) LIKE '%queue_recovery%'
      AND pg_get_constraintdef(oid) LIKE '%pool_exhaustion%'
      AND pg_get_constraintdef(oid) LIKE '%dependency_outage%'
  ) THEN
    RAISE EXCEPTION 'restored resilience attestation policy missing';
  END IF;
  IF to_regclass('platform.dead_letter_replay_requests') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_proc procedure
       JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
       WHERE namespace.nspname = 'platform'
         AND procedure.proname = 'review_dead_letter_replay'
     ) THEN
    RAISE EXCEPTION 'restored reviewed dead-letter recovery contract missing';
  END IF;
  IF has_table_privilege('djay_platform', 'platform.dead_letter_replay_requests', 'SELECT')
     OR NOT has_function_privilege(
       'djay_platform', 'platform.dead_letter_recovery_overview()', 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'restored dead-letter recovery least-privilege ACL mismatch';
  END IF;
END
$$;
