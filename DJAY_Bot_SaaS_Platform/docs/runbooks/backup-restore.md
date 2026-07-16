# PostgreSQL Backup and Restore

Use platform-approved encrypted storage and credentials with enough read access
for backup but no application-runtime bypass. Never publish dumps or restore
them into shared developer databases.

Before a release:

```bash
pg_dump --format=custom --no-owner "$SOURCE_DATABASE_URL" \
  --file=djay-saas-YYYYMMDD.dump
```

Restore into a newly created isolated database:

```bash
createdb "$RESTORE_DATABASE_NAME"
psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f packages/db/migrations/0000_roles.sql
pg_restore --exit-on-error --no-owner \
  --dbname="$RESTORE_DATABASE_URL" djay-saas-YYYYMMDD.dump
```

The platform roles must exist in the recovery cluster before restore. Preserve
the database ACL entries in the dump: forced RLS is not sufficient when runtime
roles have lost schema/table/function grants. Do not add `--no-acl` unless a
separately versioned and tested privilege manifest is reapplied before traffic.

Validate migration level, schema/constraint presence, tenant and membership
counts, exactly one active owner per tenant, active session counts, outbox state,
and platform bootstrap state. Connect with each runtime role and rerun the RLS
negative probes. Destroy the restore database after approval according to data
retention policy.

A P1 restore drill completed successfully on 2026-07-14. The fresh restore
retained one fixture tenant, one platform user, and one active tenant session.
The P9 drill uses separate PostgreSQL 16 source and recovery clusters, compares
a critical-data/schema/policy fingerprint, verifies the dump SHA-256 and archive
catalog, asserts immutable usage/catalog triggers and forced commerce RLS, and
reruns the cross-tenant runtime-role probes.
