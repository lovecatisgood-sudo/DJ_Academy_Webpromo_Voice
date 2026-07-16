#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_CONTAINER="djay-saas-p9-source-$$"
RESTORE_CONTAINER="djay-saas-p9-restore-$$"
SOURCE_DATABASE="djay_p9_source"
RESTORE_DATABASE="djay_p9_restore"
CONTAINER_BACKUP="/tmp/djay-p9-restore.dump"
DRILL_DIR="$(mktemp -d /tmp/djay-p9-restore.XXXXXX)"
HOST_BACKUP="$DRILL_DIR/djay-p9-restore.dump"

cleanup() {
  docker rm -f "$SOURCE_CONTAINER" >/dev/null 2>&1 || true
  docker rm -f "$RESTORE_CONTAINER" >/dev/null 2>&1 || true
  rm -f "$HOST_BACKUP"
  rmdir "$DRILL_DIR" 2>/dev/null || true
}
trap cleanup EXIT

start_postgres() {
  local container="$1"
  docker run --rm --detach \
    --name "$container" \
    --env POSTGRES_PASSWORD=djay_restore_test \
    --volume "$ROOT_DIR:/workspace:ro" \
    postgres:16-alpine >/dev/null
  for _ in $(seq 1 60); do
    if docker exec "$container" pg_isready -U postgres >/dev/null 2>&1; then
      break
    fi
    sleep 0.25
  done
  docker exec "$container" pg_isready -U postgres >/dev/null
}

start_postgres "$SOURCE_CONTAINER"
echo "Started isolated PostgreSQL 16 source cluster."

docker exec "$SOURCE_CONTAINER" createdb -U postgres "$SOURCE_DATABASE"
for migration in "$ROOT_DIR"/packages/db/migrations/*.sql; do
  migration_name="$(basename "$migration")"
  echo "Applying $migration_name"
  docker exec "$SOURCE_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres \
    -d "$SOURCE_DATABASE" -f "/workspace/packages/db/migrations/$migration_name" >/dev/null
done
docker exec "$SOURCE_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres \
  -d "$SOURCE_DATABASE" -f /workspace/packages/db/tests/seed.sql >/dev/null

fingerprint_sql="SELECT md5(jsonb_build_object(
  'tenants', (SELECT jsonb_agg(jsonb_build_array(id, slug, business_name, status) ORDER BY id) FROM tenancy.tenants),
  'memberships', (SELECT jsonb_agg(jsonb_build_array(id, tenant_id, user_id, role, status) ORDER BY id) FROM tenancy.memberships),
  'plans', (SELECT jsonb_agg(jsonb_build_array(plan_key, product_key, public_name, tier_name) ORDER BY plan_key) FROM catalog.plans),
  'tables', (SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname IN ('identity','tenancy','catalog','billing','platform','flowbot','ai_chat','voice','migration')),
  'policies', (SELECT count(*) FROM pg_catalog.pg_policies WHERE schemaname IN ('identity','tenancy','catalog','billing','platform','flowbot','ai_chat','voice'))
)::text);"

source_fingerprint="$(docker exec "$SOURCE_CONTAINER" psql -X -At -v ON_ERROR_STOP=1 -U postgres -d "$SOURCE_DATABASE" -c "$fingerprint_sql")"
test -n "$source_fingerprint"

docker exec "$SOURCE_CONTAINER" pg_dump -U postgres -d "$SOURCE_DATABASE" \
  --format=custom --compress=6 --no-owner --file="$CONTAINER_BACKUP"
docker exec "$SOURCE_CONTAINER" pg_restore --list "$CONTAINER_BACKUP" >/dev/null
docker cp "$SOURCE_CONTAINER:$CONTAINER_BACKUP" "$HOST_BACKUP" >/dev/null
backup_sha256="$(sha256sum "$HOST_BACKUP" | awk '{print $1}')"

start_postgres "$RESTORE_CONTAINER"
echo "Started separate PostgreSQL 16 recovery cluster."
docker exec "$RESTORE_CONTAINER" createdb -U postgres "$RESTORE_DATABASE"
docker exec "$RESTORE_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres \
  -d "$RESTORE_DATABASE" -f /workspace/packages/db/migrations/0000_roles.sql >/dev/null
docker cp "$HOST_BACKUP" "$RESTORE_CONTAINER:$CONTAINER_BACKUP" >/dev/null
docker exec "$RESTORE_CONTAINER" pg_restore -U postgres -d "$RESTORE_DATABASE" \
  --exit-on-error --no-owner "$CONTAINER_BACKUP"

restore_fingerprint="$(docker exec "$RESTORE_CONTAINER" psql -X -At -v ON_ERROR_STOP=1 -U postgres -d "$RESTORE_DATABASE" -c "$fingerprint_sql")"
if [[ "$source_fingerprint" != "$restore_fingerprint" ]]; then
  echo "Restore fingerprint mismatch: source=$source_fingerprint restore=$restore_fingerprint" >&2
  exit 1
fi

docker exec "$RESTORE_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres \
  -d "$RESTORE_DATABASE" -f /workspace/packages/db/tests/p9-restore-assert.sql >/dev/null
docker exec "$RESTORE_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres \
  -d "$RESTORE_DATABASE" -f /workspace/packages/db/tests/rls-isolation.sql >/dev/null

echo "P9 backup/restore drill passed."
echo "Backup SHA-256: $backup_sha256"
echo "Source/restore fingerprint: $source_fingerprint"
echo "Separate-cluster roles, ACLs, schema, immutable-ledger triggers, forced RLS, tenant isolation, and critical fixture counts verified."
