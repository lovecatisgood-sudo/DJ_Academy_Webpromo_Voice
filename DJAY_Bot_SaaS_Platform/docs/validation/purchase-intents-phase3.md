# Purchase intents Phase 3 evidence

Last updated: 2026-07-22

## Delivered

- Migration `0079_purchase_intents.sql` with FORCE RLS
  - `djay_auth_runtime` pre-tenant create/attach
  - `djay_runtime` tenant resolve/consume (`tenant_id = tenancy.current_tenant_id()`)
- `PurchaseIntentStore` APIs: create → attach → resolve → consume (idempotent replay/conflict)
- `currentSchemaVersion` bumped to `0079_purchase_intents`
- Integration: `PURCHASE_INTENT_ONLY=true TEST_DB_PORT=55433 bash scripts/test-db-integration.sh` Pass
- Migration invariants include purchase-intent RLS assertions

## Non-conflicts with prior logic

- `identity.signup_intents.selected_plan_key` + pending subscription on verify remain unchanged in Phase 3
- Phase 4 will wire purchase intents alongside (not replace blindly) that preference path
- No `sellable: true` flip; checkout authority unchanged
