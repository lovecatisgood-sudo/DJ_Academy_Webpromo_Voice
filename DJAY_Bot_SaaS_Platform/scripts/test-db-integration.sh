#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="djay-saas-pg-test-$$"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run --rm --detach \
  --name "$CONTAINER" \
  --env POSTGRES_PASSWORD=djay_test \
  --publish 127.0.0.1:55432:5432 \
  --volume "$ROOT_DIR:/workspace:ro" \
  postgres:16-alpine >/dev/null

echo "Started PostgreSQL 16 test container."

for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

docker exec "$CONTAINER" pg_isready -U postgres >/dev/null
echo "PostgreSQL is ready."

run_sql() {
  echo "Applying $1"
  docker exec "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -f "$1"
}

expect_failure() {
  echo "Asserting failure for $1"
  if docker exec "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -f "$1" >/tmp/djay-db-expected-failure.log 2>&1; then
    echo "Expected failure but SQL succeeded: $1" >&2
    return 1
  fi
  tail -n 2 /tmp/djay-db-expected-failure.log
}

run_sql /workspace/packages/db/migrations/0000_roles.sql
run_sql /workspace/packages/db/migrations/0001_identity_tenancy.sql
run_sql /workspace/packages/db/migrations/0002_identity_hardening.sql
run_sql /workspace/packages/db/migrations/0003_tenant_team_queries.sql
run_sql /workspace/packages/db/migrations/0004_platform_identity.sql
run_sql /workspace/packages/db/migrations/0005_tenant_mfa.sql
run_sql /workspace/packages/db/migrations/0006_catalog_entitlements_usage.sql
run_sql /workspace/packages/db/migrations/0007_shared_domain.sql
run_sql /workspace/packages/db/migrations/0008_privacy_support_hardening.sql
run_sql /workspace/packages/db/migrations/0009_flowbot_saas.sql
run_sql /workspace/packages/db/migrations/0010_flowbot_public_runtime.sql
run_sql /workspace/packages/db/migrations/0011_flowbot_premium_workers.sql
run_sql /workspace/packages/db/migrations/0012_flowbot_integration_dispatch.sql
run_sql /workspace/packages/db/migrations/0013_flowbot_session_sync.sql
run_sql /workspace/packages/db/migrations/0014_flowbot_operations.sql
run_sql /workspace/packages/db/migrations/0015_flowbot_release_operations.sql
run_sql /workspace/packages/db/migrations/0016_flowbot_lead_notifications.sql
run_sql /workspace/packages/db/migrations/0017_ai_chat_saas.sql
run_sql /workspace/packages/db/migrations/0018_ai_chat_public_runtime.sql
run_sql /workspace/packages/db/migrations/0019_ai_chat_notifications.sql
run_sql /workspace/packages/db/migrations/0020_ai_chat_social_line.sql
run_sql /workspace/packages/db/migrations/0021_ai_chat_social_workers.sql
run_sql /workspace/packages/db/migrations/0022_ai_chat_social_sessions.sql
run_sql /workspace/packages/db/migrations/0023_ai_chat_social_commit.sql
run_sql /workspace/packages/db/migrations/0024_ai_chat_social_delivery.sql
run_sql /workspace/packages/db/migrations/0025_contact_identity_review_candidates.sql
run_sql /workspace/packages/db/migrations/0026_ai_chat_social_service_window.sql
run_sql /workspace/packages/db/migrations/0027_ai_chat_social_delivery_progress.sql
run_sql /workspace/packages/db/migrations/0028_ai_chat_social_operations.sql
run_sql /workspace/packages/db/migrations/0029_voice_basic_authority.sql
run_sql /workspace/packages/db/migrations/0030_voice_runtime_recovery.sql
run_sql /workspace/packages/db/migrations/0031_voice_sales_core.sql
run_sql /workspace/packages/db/migrations/0032_voice_outcomes_retention.sql
run_sql /workspace/packages/db/migrations/0033_voice_text_legacy_migration.sql
run_sql /workspace/packages/db/migrations/0034_voice_advanced_routing.sql
docker exec "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "ALTER ROLE djay_auth_runtime LOGIN PASSWORD 'djay_auth_test'" >/dev/null
docker exec "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "ALTER ROLE djay_runtime LOGIN PASSWORD 'djay_tenant_test'" >/dev/null
docker exec "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "ALTER ROLE djay_worker LOGIN PASSWORD 'djay_worker_test'" >/dev/null
docker exec "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "ALTER ROLE djay_platform LOGIN PASSWORD 'djay_platform_test'" >/dev/null
docker exec "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "ALTER ROLE djay_flowbot_runtime LOGIN PASSWORD 'djay_flowbot_test'" >/dev/null
docker exec "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "ALTER ROLE djay_ai_runtime LOGIN PASSWORD 'djay_ai_test'" >/dev/null
docker exec "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "ALTER ROLE djay_voice_runtime LOGIN PASSWORD 'djay_voice_test'" >/dev/null
docker exec "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "ALTER ROLE djay_migrator LOGIN PASSWORD 'djay_migrator_test'" >/dev/null
run_sql /workspace/packages/db/tests/seed.sql
run_sql /workspace/packages/db/tests/rls-isolation.sql
expect_failure /workspace/packages/db/tests/cross-tenant-insert-must-fail.sql
expect_failure /workspace/packages/db/tests/cross-tenant-reference-must-fail.sql
expect_failure /workspace/packages/db/tests/last-owner-must-fail.sql
run_sql /workspace/packages/db/tests/owner-transfer.sql

echo "Running platform identity integration test."
PLATFORM_DATABASE_URL="postgresql://djay_platform:djay_platform_test@127.0.0.1:55432/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:55432/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/platform-auth-store.integration.test.ts

echo "Running email outbox worker integration test."
WORKER_DATABASE_URL="postgresql://djay_worker:djay_worker_test@127.0.0.1:55432/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:55432/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/email-outbox-store.integration.test.ts

echo "Running auth repository integration test."
DATABASE_URL="postgresql://djay_auth_runtime:djay_auth_test@127.0.0.1:55432/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:55432/postgres" \
WORKER_DATABASE_URL="postgresql://djay_worker:djay_worker_test@127.0.0.1:55432/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/auth-store.integration.test.ts

echo "Running tenant repository integration test."
TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:55432/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/tenant-workspace-store.integration.test.ts

echo "Running catalog, subscription, entitlement, usage, and webhook integration test."
TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:55432/postgres" \
PLATFORM_DATABASE_URL="postgresql://djay_platform:djay_platform_test@127.0.0.1:55432/postgres" \
WORKER_DATABASE_URL="postgresql://djay_worker:djay_worker_test@127.0.0.1:55432/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:55432/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/commerce-store.integration.test.ts

echo "Running shared contacts, conversations, knowledge, actions, and privacy integration test."
TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:55432/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:55432/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/shared-domain-store.integration.test.ts

echo "Running encrypted privacy export and erasure integration test."
TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:55432/postgres" \
WORKER_DATABASE_URL="postgresql://djay_worker:djay_worker_test@127.0.0.1:55432/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:55432/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/privacy-store.integration.test.ts

echo "Running two-person platform support access integration test."
PLATFORM_DATABASE_URL="postgresql://djay_platform:djay_platform_test@127.0.0.1:55432/postgres" \
TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:55432/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:55432/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/platform-support-store.integration.test.ts

echo "Running FlowBot Basic and Premium authoring integration test."
TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:55432/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:55432/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/flowbot-store.integration.test.ts

echo "Running restricted FlowBot public runtime integration test."
FLOWBOT_DATABASE_URL="postgresql://djay_flowbot_runtime:djay_flowbot_test@127.0.0.1:55432/postgres" \
WORKER_DATABASE_URL="postgresql://djay_worker:djay_worker_test@127.0.0.1:55432/postgres" \
TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:55432/postgres" \
PLATFORM_DATABASE_URL="postgresql://djay_platform:djay_platform_test@127.0.0.1:55432/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:55432/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/flowbot-runtime-store.integration.test.ts

echo "Running restricted AI Chat Basic authoring and public runtime integration test."
AI_DATABASE_URL="postgresql://djay_ai_runtime:djay_ai_test@127.0.0.1:55432/postgres" \
TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:55432/postgres" \
WORKER_DATABASE_URL="postgresql://djay_worker:djay_worker_test@127.0.0.1:55432/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:55432/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/ai-chat-runtime-store.integration.test.ts

echo "Running AI Chat Premium LINE connection and webhook receipt integration test."
AI_DATABASE_URL="postgresql://djay_ai_runtime:djay_ai_test@127.0.0.1:55432/postgres" \
TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:55432/postgres" \
WORKER_DATABASE_URL="postgresql://djay_worker:djay_worker_test@127.0.0.1:55432/postgres" \
PLATFORM_DATABASE_URL="postgresql://djay_platform:djay_platform_test@127.0.0.1:55432/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:55432/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/ai-social-store.integration.test.ts

echo "Running Voice platform runtime-control integration test."
PLATFORM_DATABASE_URL="postgresql://djay_platform:djay_platform_test@127.0.0.1:55432/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:55432/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/voice-operations-store.integration.test.ts

echo "Running restricted Voice Basic grant, concurrency, reconnect, and minute settlement integration test."
VOICE_DATABASE_URL="postgresql://djay_voice_runtime:djay_voice_test@127.0.0.1:55432/postgres" \
TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:55432/postgres" \
WORKER_DATABASE_URL="postgresql://djay_worker:djay_worker_test@127.0.0.1:55432/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:55432/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/voice-runtime-store.integration.test.ts

echo "Running tenant Voice Basic deployment operations integration test."
VOICE_DATABASE_URL="postgresql://djay_voice_runtime:djay_voice_test@127.0.0.1:55432/postgres" \
TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:55432/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:55432/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/voice-deployment-store.integration.test.ts

echo "Rehearsing restartable Voice/Text legacy migration and guarded rollback."
docker exec "$CONTAINER" createdb -U postgres legacy_voice_text
docker exec "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d legacy_voice_text \
  -f /workspace/packages/db/tests/voice-text-legacy-source.sql
"$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/workers run build >/dev/null
LEGACY_VOICE_TEXT_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:55432/legacy_voice_text" \
DATABASE_MIGRATION_URL="postgresql://djay_migrator:djay_migrator_test@127.0.0.1:55432/postgres" \
DJAY_TARGET_TENANT_ID="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10" \
MIGRATION_OPERATOR_REFERENCE="integration-test" \
MIGRATION_MODE="dry_run" \
  "$ROOT_DIR/scripts/use-node24.sh" node "$ROOT_DIR/apps/workers/dist/migrate-voice-text-v2.js"
if docker exec "$CONTAINER" psql -X -At -U postgres -d postgres \
  -c "SELECT count(*) FROM migration.runs WHERE source_system = 'voice_text_v2'" | grep -qv '^0$'; then
  echo "Voice/Text dry-run wrote migration state." >&2
  exit 1
fi
for _ in 1 2; do
  LEGACY_VOICE_TEXT_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:55432/legacy_voice_text" \
  DATABASE_MIGRATION_URL="postgresql://djay_migrator:djay_migrator_test@127.0.0.1:55432/postgres" \
  DJAY_TARGET_TENANT_ID="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10" \
  MIGRATION_OPERATOR_REFERENCE="integration-test" \
  MIGRATION_APPROVAL_REFERENCE="approved-test-change" \
  MIGRATION_MODE="import" \
    "$ROOT_DIR/scripts/use-node24.sh" node "$ROOT_DIR/apps/workers/dist/migrate-voice-text-v2.js"
done
run_sql /workspace/packages/db/tests/voice-text-migration-assert.sql
LEGACY_VOICE_TEXT_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:55432/legacy_voice_text" \
DATABASE_MIGRATION_URL="postgresql://djay_migrator:djay_migrator_test@127.0.0.1:55432/postgres" \
DJAY_TARGET_TENANT_ID="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10" \
MIGRATION_OPERATOR_REFERENCE="integration-test" \
MIGRATION_MODE="rollback" \
  "$ROOT_DIR/scripts/use-node24.sh" node "$ROOT_DIR/apps/workers/dist/migrate-voice-text-v2.js"
run_sql /workspace/packages/db/tests/voice-text-rollback-assert.sql

echo "PostgreSQL 16 migration, RLS, scoped repositories, same-tenant references, and owner invariants passed."
