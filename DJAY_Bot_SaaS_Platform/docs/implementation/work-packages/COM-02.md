# COM-02: Entitlements and Resource Boundaries

- Local foundation status: Complete
- Paid acceptance status: Blocked by BILL-01/02 and feature-specific package acceptance
- Migrations: `0045_entitlement_resource_boundaries`, `0046_scheduled_entitlement_changes`

## Delivered

- Added atomic limits for Flow bots, AI Text agents, Voice deployments, social
  connections and administrator seats. Concurrent create/invite attempts use
  transaction advisory locks.
- Added active add-on capacity for administrator seats and social channels.
- Added a tenant resource-boundary read model and dashboard gauges without
  exposing providers, models or internal costs.
- Added immutable downgrade preflight evidence, current-resource counts,
  destination limits, feature blockers and exact retained-resource selection.
- Added recent-MFA and billing-plan-change authorization to downgrade preflight
  and scheduling routes.
- Scheduled downgrades take effect at the subscription period end. A worker-only
  `SKIP LOCKED` command applies each change once, creates a new immutable
  entitlement snapshot and records immutable audit evidence.
- Excess resources are preserved as `read_only_excess` or `disabled_excess`;
  they are not deleted or silently archived. Upgrade application restores prior
  excess states to active.
- Flow, AI Text and Voice authoring commands reject writes to read-only excess
  resources. Web runtime admission rejects excess Flow bots, AI agents and
  Voice deployments.
- Preserved coexistence of Flow, AI Text and Voice subscriptions while keeping
  one non-cancelled base subscription per product family and workspace.

## Safety State

- All package and add-on catalogue records remain non-sellable.
- A downgrade cannot be scheduled with stale evidence, changed resources,
  unresolved feature blockers, invalid retained-resource selection or an
  unavailable billing period.
- The worker fails a scheduled change if subscription authority changed after
  scheduling.
- Additional workspace sale and Starter branding removal remain unavailable
  until BILL-02 and their UI/runtime owners implement provisioning and removal.

## Evidence

- `packages/db/migrations/0045_entitlement_resource_boundaries.sql`
- `packages/db/migrations/0046_scheduled_entitlement_changes.sql`
- `packages/db/src/resource-boundary-store.integration.test.ts`
- `packages/db/src/auth-store.integration.test.ts`
- `packages/db/src/flowbot-store.integration.test.ts`
- `packages/db/src/ai-chat-runtime-store.integration.test.ts`
- `packages/db/src/voice-deployment-store.integration.test.ts`
- `scripts/test-db-integration.sh`

## Deferred Feature Consumption

- FLOW-01 applies the shared boundary contract to the final topic model and
  unlimited-step technical safety limits.
- KNOW-01/02 applies collection, document and storage boundaries to the final
  ingestion model.
- CHAN-01 applies the same excess-state contract to every final social adapter.
- OPS-05 applies analytics/export depth to final cross-product exports.
- BILL-02 activates/removes paid add-ons and invokes upgrade/downgrade lifecycle
  commands after Stripe confirms the provider-side change.
