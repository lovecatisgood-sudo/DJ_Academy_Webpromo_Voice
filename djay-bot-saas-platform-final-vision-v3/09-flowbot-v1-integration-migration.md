# 09 · FlowBot V1 Integration & Migration Plan — v3.0

## 1. Objective

Transform the existing single-tenant FlowBot V1 into the deterministic foundation for FlowBot Basic and FlowBot Premium without discarding proven work or contaminating it with AI/POS/Creative Club domains.

## 2. Mandatory repository audit

Before code changes, inventory:

### Product behavior

- builder pages and node types;
- draft/publish/version behavior;
- preview/test mode;
- widget/customer journey;
- form/lead capture;
- conversation storage;
- admin/inbox/analytics;
- integrations and notification paths;
- authentication and current tenancy assumptions.

### Technical implementation

- repository packages/apps;
- framework/runtime/dependencies;
- database/schema/migrations;
- flow definition/execution state;
- APIs/websockets/webhooks;
- background jobs/timers;
- auth/secrets/logging;
- tests/build/deploy/CI;
- external providers.

### Data

- current bots/flows/nodes/edges;
- published/draft state;
- visitors/conversations/messages/forms/leads;
- media/files;
- users/settings;
- identifiers and uniqueness;
- backup/export capability.

## 3. Audit outputs

```text
docs/audit/
  flowbot-v1-inventory.md
  current-architecture.md
  accepted-behavior-matrix.md
  reuse-refactor-replace.md
  security-data-map.md
docs/migrations/
  flowbot-v1-to-djay-bot-saas-platform.md
```

Every claim cites actual repository files/routes/tables/tests.

## 4. Feature classification into plans

The audit maps every current feature to:

- FlowBot Basic core;
- FlowBot Premium;
- shared platform service;
- deprecated/unsafe;
- unrelated scope to exclude;
- future/non-blocking.

### Basic target

- web widget;
- core deterministic nodes/forms;
- immutable publish/version pinning;
- lead capture/email notification;
- conversation history/basic analytics;
- configured lower limits and platform branding.

### Premium target

- advanced conditions/variables;
- delays/timers;
- reusable subflows/blocks;
- multiple bots/deployments;
- team handover/routing;
- approved webhook/API integrations;
- branding and advanced analytics/export;
- higher configured limits.

If a current feature does not fit these product definitions, Codex must not silently include it.

## 5. Target Flow Engine contracts

### Input

```ts
type FlowInput = {
  tenantId: string;
  deploymentId: string;
  executionId: string;
  flowVersionId: string;
  sequence: number;
  event: NormalizedConversationEvent;
  entitlementSnapshot: FlowEntitlementSnapshot;
  controlledEnvironment: ControlledEnvironment;
};
```

### Output

```ts
type FlowTransition = {
  nextState: FlowExecutionState;
  commands: FlowCommand[];
  events: DomainEvent[];
};
```

Flow commands are executed by adapters/gateways and return result events. The engine does not call databases, providers, email or webhooks directly.

## 6. Version and schema model

- canonical flow schema version;
- immutable published version;
- mutable draft derived from published version;
- active execution stores `flow_version_id`;
- new publish affects new executions only;
- explicit compatible migration if merchant chooses;
- rollback creates a new published version or safely reactivates immutable content under audited policy;
- node type entitlement validated in editor, API and publish service.

## 7. Migration sequence

### M0 Baseline

- freeze/backup representative data;
- run existing tests/build;
- capture production behavior;
- identify security/data-loss risks.

### M1 Contracts around legacy

- introduce typed domain/flow contracts;
- wrap current storage, widget and command effects;
- add correlation/idempotency.

### M2 Versioned deterministic runtime

- normalize schema;
- add graph validator;
- pin executions;
- durable timers;
- publish/rollback and parity tests.

### M3 Basic/Premium entitlements

- classify nodes/features;
- plan-aware builder/API/publish/runtime;
- usage events and limits;
- upgrade/downgrade tests;
- branding/team/integration boundaries.

### M4 Shared SaaS domain

- memberships/tenant IDs;
- contacts/leads/conversations;
- tenant isolation;
- entitlement snapshots;
- migrate existing tenant as initial workspace.

### M5 Hybrid integration

- explicit FlowBot→AI/human command/event;
- destination entitlement check;
- transfer structured context;
- FlowBot remains no-AI.

### M6 Decommission legacy paths

- stop dual writes after reconciliation;
- remove unsafe/deprecated schemas/APIs;
- preserve export/rollback window;
- document final ownership.

## 8. Data migration rules

- stable mapping table from legacy IDs to canonical IDs;
- repeatable/idempotent migrations;
- counts and checksums before/after;
- no guessed contact merge;
- preserve original timestamps/content where lawful;
- quarantine malformed definitions;
- provide dry-run/report;
- backup and tested rollback;
- tenant scope assigned explicitly.

## 9. Compatibility tests

- representative old flows render/run equivalently;
- active sessions survive migration or follow documented restart;
- forms/leads remain linked;
- widget embed remains compatible or has a migration shim;
- flow version pinning works during publish;
- Basic/Premium feature gates cannot be bypassed;
- FlowBot makes zero AI/provider calls;
- no unrelated POS/Creative Club schema/routes enter migration.

## 10. Acceptance

Migration is accepted when:

- founder-approved existing behavior is preserved or intentionally changed;
- all active flows have canonical immutable versions;
- execution state is durable/idempotent;
- Basic/Premium packaging works;
- existing customer data is reconciled;
- shared SaaS migration path is proven;
- rollback and observability are tested;
- Codex documents reused/refactored/replaced components.
