#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="djay-saas-pg-test-$$"
TEST_DB_PORT="${TEST_DB_PORT:-55432}"
E2E_WORKSPACE=""

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  if [[ -n "$E2E_WORKSPACE" && "$E2E_WORKSPACE" == /tmp/djay-signup-e2e.* ]]; then
    rm -rf "$E2E_WORKSPACE"
  fi
}
trap cleanup EXIT

docker run --rm --detach \
  --name "$CONTAINER" \
  --env POSTGRES_PASSWORD=djay_test \
  --publish 127.0.0.1:${TEST_DB_PORT}:5432 \
  --volume "$ROOT_DIR:/workspace:ro" \
  postgres:16-alpine >/dev/null

echo "Started PostgreSQL 16 test container."

POSTGRES_READY=false
READY_STREAK=0
for _ in $(seq 1 240); do
  if docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then
    READY_STREAK=$((READY_STREAK + 1))
    if (( READY_STREAK >= 3 )); then
      POSTGRES_READY=true
      break
    fi
  else
    READY_STREAK=0
  fi
  sleep 0.25
done

if [[ "$POSTGRES_READY" != "true" ]]; then
  echo "PostgreSQL did not become ready within 60 seconds. Container diagnostics:" >&2
  docker logs --tail 80 "$CONTAINER" >&2 || true
  exit 1
fi
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

# Completeness guard: every integration suite on disk must be invoked by this script.
#
# The suite list below is explicit because suites need different role URLs, and that is fine
# -- but it is exactly the same staleness hazard the migration list had. A newly added
# `*.integration.test.ts` was simply never run, and nothing reported that: the harness
# printed a wall of passes and exit 0 while the new suite sat unexecuted. A gate that
# silently omits the thing you just wrote is worse than no gate.
#
# This compares the files on disk against the filenames referenced anywhere in this script,
# before spending time on containers. Adding a suite without wiring it up now fails here.
UNREFERENCED=""
for suite_path in "$ROOT_DIR"/packages/db/src/*.integration.test.ts; do
  suite_name="$(basename "$suite_path")"
  if ! grep -q "$suite_name" "$0"; then
    UNREFERENCED="$UNREFERENCED $suite_name"
  fi
done
if [[ -n "$UNREFERENCED" ]]; then
  echo "Integration suites exist on disk but are never run by this script:$UNREFERENCED" >&2
  echo "Add an invocation with the role URLs the suite needs, or delete the file." >&2
  exit 1
fi

# Every migration, in numeric order, discovered from disk.
#
# This was previously a hardcoded list that silently stopped at 0081, so 0082, 0083 and
# 0084 were never integration-tested -- and 0084 in fact did not apply at all. A glob
# cannot go stale: adding a migration file is enough to have it exercised here.
MIGRATION_DIR="$ROOT_DIR/packages/db/migrations"
MIGRATION_COUNT=0
while IFS= read -r migration_path; do
  migration_name="$(basename "$migration_path")"
  # Zero-padded NNNN_ prefixes make a lexicographic sort a numeric sort. Refuse anything
  # that would break that assumption rather than apply migrations out of order.
  if [[ ! "$migration_name" =~ ^[0-9]{4}_[a-z0-9_]+\.sql$ ]]; then
    echo "Migration filename does not match NNNN_name.sql, ordering is unsafe: $migration_name" >&2
    exit 1
  fi
  run_sql "/workspace/packages/db/migrations/$migration_name"
  MIGRATION_COUNT=$((MIGRATION_COUNT + 1))
done < <(find "$MIGRATION_DIR" -maxdepth 1 -type f -name '*.sql' | sort)

# An empty or truncated glob must fail loudly rather than pass vacuously.
if (( MIGRATION_COUNT < 80 )); then
  echo "Only applied $MIGRATION_COUNT migrations; the migration glob looks broken." >&2
  exit 1
fi
echo "Applied $MIGRATION_COUNT migrations in numeric order."

MIGRATION_RUNNER_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
MIGRATION_RUNNER_ROLE_URL="postgresql://djay_migrator:djay_migrator_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/migration-runner.integration.test.ts
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

if [[ "${SIGNUP_ONBOARDING_E2E_ONLY:-false}" == "true" ]]; then
  echo "Running isolated signup and one-time onboarding browser journey."
  E2E_WORKSPACE="$(mktemp -d /tmp/djay-signup-e2e.XXXXXX)"
  mkdir -p "$E2E_WORKSPACE/apps"
  cp "$ROOT_DIR/package.json" "$ROOT_DIR/pnpm-lock.yaml" "$ROOT_DIR/pnpm-workspace.yaml" "$ROOT_DIR/turbo.json" "$ROOT_DIR/tsconfig.base.json" "$E2E_WORKSPACE/"
  cp -a "$ROOT_DIR/config" "$ROOT_DIR/packages" "$ROOT_DIR/scripts" "$E2E_WORKSPACE/"
  rsync -a --exclude=.next "$ROOT_DIR/apps/public-site/" "$E2E_WORKSPACE/apps/public-site/"
  rsync -a --exclude=.next "$ROOT_DIR/apps/tenant-web/" "$E2E_WORKSPACE/apps/tenant-web/"
  rsync -a --exclude=.next "$ROOT_DIR/apps/api/" "$E2E_WORKSPACE/apps/api/"
  ln -s "$ROOT_DIR/node_modules" "$E2E_WORKSPACE/node_modules"
  E2E_SECRET="MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="
  AUTH_DATABASE_URL="postgresql://djay_auth_runtime:djay_auth_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  PLATFORM_DATABASE_URL="postgresql://djay_platform:djay_platform_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  PUBLIC_APP_URL="http://localhost:3110" TENANT_APP_URL="http://localhost:3111" \
  PLATFORM_APP_URL="http://localhost:3112" API_APP_URL="http://localhost:3113" \
  NEXT_PUBLIC_PUBLIC_APP_URL="http://localhost:3110" NEXT_PUBLIC_API_APP_URL="http://localhost:3113" \
  AUTH_REQUEST_HASH_KEY="$E2E_SECRET" AUTH_EMAIL_ENVELOPE_KEY="$E2E_SECRET" \
  AUTH_RATE_LIMIT_KEY="$E2E_SECRET" AUTH_MFA_ENCRYPTION_KEY="$E2E_SECRET" \
  AUTH_MFA_RECOVERY_HASH_KEY="$E2E_SECRET" PLATFORM_MFA_ENCRYPTION_KEY="$E2E_SECRET" \
  PLATFORM_RECOVERY_HASH_KEY="$E2E_SECRET" SOCIAL_CHANNELS_RELEASE_ENABLED=false \
  E2E_APP_WORKSPACE="$E2E_WORKSPACE" \
  LEGAL_DOCUMENTS_FILE="$ROOT_DIR/docs/compliance/djay-legal-documents.user-approved.th.json" \
    "$ROOT_DIR/scripts/use-node24.sh" node "$ROOT_DIR/scripts/qa-signup-onboarding-e2e.mjs"
  echo "Isolated signup and one-time onboarding browser journey passed."
  exit 0
fi

if [[ "${BILLING_ONLY:-false}" == "true" ]]; then
  echo "Running focused Stripe billing lifecycle integration test."
  TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  WORKER_DATABASE_URL="postgresql://djay_worker:djay_worker_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  PLATFORM_DATABASE_URL="postgresql://djay_platform:djay_platform_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
    "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/stripe-billing.integration.test.ts
  echo "Focused Stripe billing lifecycle passed."
  exit 0
fi

if [[ "${PURCHASE_INTENT_ONLY:-false}" == "true" ]]; then
  echo "Preparing seed for purchase intent focused test."
  run_sql /workspace/packages/db/tests/seed.sql
  echo "Running focused purchase intent integration test."
  TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  AUTH_DATABASE_URL="postgresql://djay_auth_runtime:djay_auth_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
    "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/purchase-intent-store.integration.test.ts
  echo "Focused purchase intent passed."
  echo "Running auth registration purchase-intent attach integration test."
  DATABASE_URL="postgresql://djay_auth_runtime:djay_auth_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  WORKER_DATABASE_URL="postgresql://djay_worker:djay_worker_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
    "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/auth-store.integration.test.ts
  echo "Focused auth + purchase intent passed."
  exit 0
fi

if [[ "${P9_RECOVERY_ONLY:-false}" == "true" ]]; then
  echo "Running focused reviewed dead-letter recovery integration test."
  PLATFORM_DATABASE_URL="postgresql://djay_platform:djay_platform_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  WORKER_DATABASE_URL="postgresql://djay_worker:djay_worker_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
    "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/platform-recovery-store.integration.test.ts
  echo "P9 focused reviewed dead-letter recovery passed."
  exit 0
fi

if [[ "${P9_RESILIENCE_ONLY:-false}" == "true" ]]; then
  echo "Running focused event replay, stale-queue recovery, and pool-exhaustion drill."
  WORKER_DATABASE_URL="postgresql://djay_worker:djay_worker_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  PLATFORM_DATABASE_URL="postgresql://djay_platform:djay_platform_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
    "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/platform-resilience.integration.test.ts
  echo "P9 focused resilience drill passed."
  exit 0
fi

if [[ "${APPOINTMENT_SYNC_ONLY:-false}" == "true" ]]; then
  echo "Running focused provider-confirmed appointment calendar reconciliation test."
  TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  WORKER_DATABASE_URL="postgresql://djay_worker:djay_worker_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
    "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/appointment-sync-store.integration.test.ts
  echo "Focused appointment calendar reconciliation passed."
  exit 0
fi

run_sql /workspace/packages/db/tests/seed.sql
run_sql /workspace/packages/db/tests/rls-isolation.sql
expect_failure /workspace/packages/db/tests/cross-tenant-insert-must-fail.sql
expect_failure /workspace/packages/db/tests/cross-tenant-reference-must-fail.sql
expect_failure /workspace/packages/db/tests/last-owner-must-fail.sql
run_sql /workspace/packages/db/tests/owner-transfer.sql

if [[ "${PLATFORM_SUPPORT_ONLY:-false}" == "true" ]]; then
  echo "Preparing platform identity for focused Tenant 360 and incident operations tests."
  PLATFORM_DATABASE_URL="postgresql://djay_platform:djay_platform_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
    "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/platform-auth-store.integration.test.ts
  echo "Running focused Tenant 360, incident operations, and support-access integration tests."
  PLATFORM_DATABASE_URL="postgresql://djay_platform:djay_platform_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
    "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/platform-support-store.integration.test.ts
  echo "Focused platform support and tenant incident operations passed."
  exit 0
fi

if [[ "${SUPPORT_ONLY:-false}" == "true" ]]; then
  echo "Preparing platform owner for focused support attachment test."
  PLATFORM_DATABASE_URL="postgresql://djay_platform:djay_platform_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
    "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/platform-auth-store.integration.test.ts
  echo "Running focused tenant-isolated support attachment test."
  PLATFORM_DATABASE_URL="postgresql://djay_platform:djay_platform_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  WORKER_DATABASE_URL="postgresql://djay_worker:djay_worker_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
    "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/support-ticket-store.integration.test.ts
  echo "Focused support attachment lifecycle passed."
  exit 0
fi

if [[ "${SHARED_OPS_ONLY:-false}" == "true" ]]; then
  echo "Preparing focused shared SaaS platform owner."
  PLATFORM_DATABASE_URL="postgresql://djay_platform:djay_platform_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
    "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/platform-auth-store.integration.test.ts
  echo "Preparing focused shared SaaS operations subscriptions."
  TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  PLATFORM_DATABASE_URL="postgresql://djay_platform:djay_platform_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  WORKER_DATABASE_URL="postgresql://djay_worker:djay_worker_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
    "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/commerce-store.integration.test.ts
  echo "Running focused shared SaaS request and fulfillment integration test."
  TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  PLATFORM_DATABASE_URL="postgresql://djay_platform:djay_platform_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
    "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/shared-saas-operations-store.integration.test.ts
  echo "Focused shared SaaS operations passed."
  exit 0
fi

echo "Running platform identity integration test."
PLATFORM_DATABASE_URL="postgresql://djay_platform:djay_platform_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/platform-auth-store.integration.test.ts

echo "Running email outbox worker integration test."
WORKER_DATABASE_URL="postgresql://djay_worker:djay_worker_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/email-outbox-store.integration.test.ts

echo "Running auth repository integration test."
DATABASE_URL="postgresql://djay_auth_runtime:djay_auth_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
WORKER_DATABASE_URL="postgresql://djay_worker:djay_worker_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/auth-store.integration.test.ts

echo "Running tenant repository integration test."
TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/tenant-workspace-store.integration.test.ts

echo "Running catalog, subscription, entitlement, usage, and webhook integration test."
TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
PLATFORM_DATABASE_URL="postgresql://djay_platform:djay_platform_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
WORKER_DATABASE_URL="postgresql://djay_worker:djay_worker_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/commerce-store.integration.test.ts

echo "Running purchase intent create/attach/resolve/consume integration test."
TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
AUTH_DATABASE_URL="postgresql://djay_auth_runtime:djay_auth_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/purchase-intent-store.integration.test.ts

echo "Running usage anomaly, cooldown, and alert-delivery integration test."
WORKER_DATABASE_URL="postgresql://djay_worker:djay_worker_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/usage-alert-store.integration.test.ts

echo "Running provider usage correlation and remediation integration test."
WORKER_DATABASE_URL="postgresql://djay_worker:djay_worker_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
PLATFORM_DATABASE_URL="postgresql://djay_platform:djay_platform_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/provider-usage-reconciliation.integration.test.ts

echo "Running Stripe Checkout, subscription lifecycle, and immutable financial evidence integration test."
TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
WORKER_DATABASE_URL="postgresql://djay_worker:djay_worker_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
PLATFORM_DATABASE_URL="postgresql://djay_platform:djay_platform_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/stripe-billing.integration.test.ts

echo "Running tenant resource-boundary and seat-capacity integration test."
TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
WORKER_DATABASE_URL="postgresql://djay_worker:djay_worker_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/resource-boundary-store.integration.test.ts

echo "Running shared SaaS request, fulfillment, and tenant-isolation integration test."
TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
PLATFORM_DATABASE_URL="postgresql://djay_platform:djay_platform_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/shared-saas-operations-store.integration.test.ts

echo "Running immutable SLO, attestation, release-readiness, and public-status integration test."
PLATFORM_DATABASE_URL="postgresql://djay_platform:djay_platform_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/platform-operations-store.integration.test.ts

echo "Running event replay, stale-queue recovery, and pool-exhaustion integration drill."
WORKER_DATABASE_URL="postgresql://djay_worker:djay_worker_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
PLATFORM_DATABASE_URL="postgresql://djay_platform:djay_platform_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/platform-resilience.integration.test.ts

echo "Running shared contacts, conversations, knowledge, actions, and privacy integration test."
TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/shared-domain-store.integration.test.ts

echo "Running encrypted privacy export and erasure integration test."
TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
WORKER_DATABASE_URL="postgresql://djay_worker:djay_worker_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/privacy-store.integration.test.ts

echo "Running two-person platform support access integration test."
PLATFORM_DATABASE_URL="postgresql://djay_platform:djay_platform_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
WORKER_DATABASE_URL="postgresql://djay_worker:djay_worker_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/platform-support-store.integration.test.ts

echo "Running tenant-isolated merchant support ticket lifecycle integration test."
PLATFORM_DATABASE_URL="postgresql://djay_platform:djay_platform_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
WORKER_DATABASE_URL="postgresql://djay_worker:djay_worker_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/support-ticket-store.integration.test.ts

echo "Running reviewed dead-letter recovery integration test."
PLATFORM_DATABASE_URL="postgresql://djay_platform:djay_platform_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
WORKER_DATABASE_URL="postgresql://djay_worker:djay_worker_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/platform-recovery-store.integration.test.ts

echo "Running FlowBot Basic and Premium authoring integration test."
TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/flowbot-store.integration.test.ts

echo "Running restricted FlowBot public runtime integration test."
FLOWBOT_DATABASE_URL="postgresql://djay_flowbot_runtime:djay_flowbot_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
WORKER_DATABASE_URL="postgresql://djay_worker:djay_worker_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
PLATFORM_DATABASE_URL="postgresql://djay_platform:djay_platform_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/flowbot-runtime-store.integration.test.ts

echo "Running restricted AI Chat Basic authoring and public runtime integration test."
AI_DATABASE_URL="postgresql://djay_ai_runtime:djay_ai_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
WORKER_DATABASE_URL="postgresql://djay_worker:djay_worker_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/ai-chat-runtime-store.integration.test.ts

echo "Running deterministic FlowBot LINE social runtime integration test."
FLOWBOT_DATABASE_URL="postgresql://djay_flowbot_runtime:djay_flowbot_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
WORKER_DATABASE_URL="postgresql://djay_worker:djay_worker_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/flowbot-social-store.integration.test.ts

echo "Running CHN-004 included-social-channel entitlement integration test."
TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
FLOWBOT_DATABASE_URL="postgresql://djay_flowbot_runtime:djay_flowbot_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
WORKER_DATABASE_URL="postgresql://djay_worker:djay_worker_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/social-channel-admission.integration.test.ts

echo "Running 0085 unlimited included-allowance funding integration test."
FLOWBOT_DATABASE_URL="postgresql://djay_flowbot_runtime:djay_flowbot_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/unlimited-allowance.integration.test.ts

echo "Running 0086 AI Chat social gate parity integration test."
TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/ai-social-gate-parity.integration.test.ts

echo "Running AI Chat Premium LINE connection and webhook receipt integration test."
AI_DATABASE_URL="postgresql://djay_ai_runtime:djay_ai_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
WORKER_DATABASE_URL="postgresql://djay_worker:djay_worker_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
PLATFORM_DATABASE_URL="postgresql://djay_platform:djay_platform_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/ai-social-store.integration.test.ts

echo "Running Voice platform runtime-control integration test."
PLATFORM_DATABASE_URL="postgresql://djay_platform:djay_platform_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/voice-operations-store.integration.test.ts

echo "Running restricted Voice Basic grant, concurrency, reconnect, and minute settlement integration test."
VOICE_DATABASE_URL="postgresql://djay_voice_runtime:djay_voice_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
WORKER_DATABASE_URL="postgresql://djay_worker:djay_worker_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/voice-runtime-store.integration.test.ts

echo "Running unified customer callback queue and immutable history integration test."
TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/customer-callback-operations.integration.test.ts

echo "Running tenant Voice Basic deployment operations integration test."
VOICE_DATABASE_URL="postgresql://djay_voice_runtime:djay_voice_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/voice-deployment-store.integration.test.ts

echo "Running immutable current-version bot regression evidence integration test."
TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/bot-regression-store.integration.test.ts

echo "Running unified tenant notification center integration test."
TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/tenant-notification-center.integration.test.ts

echo "Running provider-confirmed appointment calendar reconciliation integration test."
TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
WORKER_DATABASE_URL="postgresql://djay_worker:djay_worker_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/appointment-sync-store.integration.test.ts

echo "Rehearsing restartable Voice/Text legacy migration and guarded rollback."
docker exec "$CONTAINER" createdb -U postgres legacy_voice_text
docker exec "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d legacy_voice_text \
  -f /workspace/packages/db/tests/voice-text-legacy-source.sql
"$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/workers run build >/dev/null
LEGACY_VOICE_TEXT_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/legacy_voice_text" \
DATABASE_MIGRATION_URL="postgresql://djay_migrator:djay_migrator_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
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
  LEGACY_VOICE_TEXT_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/legacy_voice_text" \
  DATABASE_MIGRATION_URL="postgresql://djay_migrator:djay_migrator_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  DJAY_TARGET_TENANT_ID="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10" \
  MIGRATION_OPERATOR_REFERENCE="integration-test" \
  MIGRATION_APPROVAL_REFERENCE="approved-test-change" \
  MIGRATION_MODE="import" \
    "$ROOT_DIR/scripts/use-node24.sh" node "$ROOT_DIR/apps/workers/dist/migrate-voice-text-v2.js"
done
run_sql /workspace/packages/db/tests/voice-text-migration-assert.sql
LEGACY_VOICE_TEXT_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/legacy_voice_text" \
DATABASE_MIGRATION_URL="postgresql://djay_migrator:djay_migrator_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
DJAY_TARGET_TENANT_ID="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10" \
MIGRATION_OPERATOR_REFERENCE="integration-test" \
MIGRATION_MODE="rollback" \
  "$ROOT_DIR/scripts/use-node24.sh" node "$ROOT_DIR/apps/workers/dist/migrate-voice-text-v2.js"
run_sql /workspace/packages/db/tests/voice-text-rollback-assert.sql

echo "PostgreSQL 16 migration, RLS, scoped repositories, same-tenant references, and owner invariants passed."
