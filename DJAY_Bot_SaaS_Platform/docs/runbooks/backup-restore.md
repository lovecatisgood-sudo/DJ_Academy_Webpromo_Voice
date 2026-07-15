# PostgreSQL Backup and Restore

Use platform-approved encrypted storage and credentials with enough read access
for backup but no application-runtime bypass. Never publish dumps or restore
them into shared developer databases.

Before a release:

```bash
pg_dump --format=custom --no-owner --no-acl "$SOURCE_DATABASE_URL" \
  --file=djay-saas-YYYYMMDD.dump
```

Restore into a newly created isolated database:

```bash
createdb "$RESTORE_DATABASE_NAME"
pg_restore --exit-on-error --no-owner --no-acl \
  --dbname="$RESTORE_DATABASE_URL" djay-saas-YYYYMMDD.dump
```

Validate migration level, schema/constraint presence, tenant and membership
counts, exactly one active owner per tenant, active session counts, outbox state,
and platform bootstrap state. Connect with each runtime role and rerun the RLS
negative probes. Destroy the restore database after approval according to data
retention policy.

A P1 restore drill completed successfully on 2026-07-14. The fresh restore
retained one fixture tenant, one platform user, and one active tenant session.
