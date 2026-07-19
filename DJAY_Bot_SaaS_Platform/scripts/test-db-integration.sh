#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="djay-saas-pg-test-$$"
TEST_DB_PORT="${TEST_DB_PORT:-55432}"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run --rm --detach \
  --name "$CONTAINER" \
  --env POSTGRES_PASSWORD=djay_test \
  --publish 127.0.0.1:${TEST_DB_PORT}:5432 \
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
run_sql /workspace/packages/db/migrations/0035_voice_advanced_deployments.sql
run_sql /workspace/packages/db/migrations/0036_voice_advanced_runtime.sql
run_sql /workspace/packages/db/migrations/0037_voice_analytics_indexes.sql
run_sql /workspace/packages/db/migrations/0038_release_readiness.sql
run_sql /workspace/packages/db/migrations/0039_resilience_drills.sql
run_sql /workspace/packages/db/migrations/0040_dead_letter_recovery.sql
run_sql /workspace/packages/db/migrations/0041_dependency_outage_attestation.sql
run_sql /workspace/packages/db/migrations/0042_privacy_job_scope.sql
run_sql /workspace/packages/db/migrations/0043_market_release_catalog.sql
run_sql /workspace/packages/db/migrations/0044_tenant_roles_security_policy.sql
run_sql /workspace/packages/db/migrations/0045_entitlement_resource_boundaries.sql
run_sql /workspace/packages/db/migrations/0046_scheduled_entitlement_changes.sql
run_sql /workspace/packages/db/migrations/0047_usage_funding_forecasts_alerts.sql
run_sql /workspace/packages/db/migrations/0048_usage_funding_authority.sql
run_sql /workspace/packages/db/migrations/0049_usage_period_rollover.sql
run_sql /workspace/packages/db/migrations/0050_runtime_usage_funding_bridge.sql
run_sql /workspace/packages/db/migrations/0051_usage_alert_delivery_anomalies.sql
run_sql /workspace/packages/db/migrations/0052_provider_usage_reconciliation.sql
run_sql /workspace/packages/db/migrations/0053_stripe_billing_foundation.sql
run_sql /workspace/packages/db/migrations/0054_stripe_webhook_lifecycle.sql
run_sql /workspace/packages/db/migrations/0055_stripe_customer_portal.sql
run_sql /workspace/packages/db/migrations/0056_tenant_financial_documents.sql
run_sql /workspace/packages/db/migrations/0057_stripe_financial_reconciliation.sql
run_sql /workspace/packages/db/migrations/0058_accounting_sync_outbox.sql
run_sql /workspace/packages/db/migrations/0059_accounting_daily_reconciliation.sql
run_sql /workspace/packages/db/migrations/0060_stripe_financial_event_reconciliation.sql
run_sql /workspace/packages/db/migrations/0061_subscription_lifecycle_controls.sql
run_sql /workspace/packages/db/migrations/0062_stripe_webhook_recovery.sql
run_sql /workspace/packages/db/migrations/0063_customer_billing_notifications.sql
run_sql /workspace/packages/db/migrations/0064_flowbot_rich_message_sync.sql
run_sql /workspace/packages/db/migrations/0065_customer_tags_attributes.sql
run_sql /workspace/packages/db/migrations/0066_flowbot_connector_kinds.sql
run_sql /workspace/packages/db/migrations/0067_flowbot_social_transport.sql
run_sql /workspace/packages/db/migrations/0068_flowbot_social_workers.sql
run_sql /workspace/packages/db/migrations/0069_flowbot_social_delivery.sql
run_sql /workspace/packages/db/migrations/0070_flowbot_social_usage_funding.sql
run_sql /workspace/packages/db/migrations/0071_ai_knowledge_ingestion.sql
run_sql /workspace/packages/db/migrations/0072_ai_customer_intelligence.sql
run_sql /workspace/packages/db/migrations/0073_voice_telephony_operations.sql
run_sql /workspace/packages/db/migrations/0074_shared_saas_operations.sql
run_sql /workspace/packages/db/migrations/0075_branding_add_on_runtime.sql
run_sql /workspace/packages/db/migrations/0076_workspace_add_on_provisioning.sql
run_sql /workspace/packages/db/migrations/0077_shared_operations_commercial_authority.sql
run_sql /workspace/packages/db/migrations/0078_service_engagement_lifecycle.sql
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

run_sql /workspace/packages/db/tests/seed.sql
run_sql /workspace/packages/db/tests/rls-isolation.sql
expect_failure /workspace/packages/db/tests/cross-tenant-insert-must-fail.sql
expect_failure /workspace/packages/db/tests/cross-tenant-reference-must-fail.sql
expect_failure /workspace/packages/db/tests/last-owner-must-fail.sql
run_sql /workspace/packages/db/tests/owner-transfer.sql

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
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/platform-support-store.integration.test.ts

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

echo "Running tenant Voice Basic deployment operations integration test."
VOICE_DATABASE_URL="postgresql://djay_voice_runtime:djay_voice_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
TENANT_DATABASE_URL="postgresql://djay_runtime:djay_tenant_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
ADMIN_DATABASE_URL="postgresql://postgres:djay_test@127.0.0.1:${TEST_DB_PORT}/postgres" \
  "$ROOT_DIR/scripts/use-node24.sh" pnpm --filter @djay/db exec vitest run src/voice-deployment-store.integration.test.ts

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
