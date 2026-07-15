# 13 · Codex Implementation Guide — DJAY Bot SaaS Platform v3.0

## 1. Operating rule

The current FlowBot V1 repository is the source of truth for existing implementation. This bundle is the source of truth for target product behavior.

Do not rebuild the full SaaS in one pass. Audit first, propose a phase scope, then implement only the approved phase.

## 2. First task: repository audit only

Produce:

```text
docs/audit/flowbot-v1-inventory.md
docs/audit/current-architecture.md
docs/audit/accepted-behavior-matrix.md
docs/audit/reuse-refactor-replace.md
docs/audit/security-data-map.md
docs/migrations/flowbot-v1-to-djay-bot-saas-platform.md
```

Cite real files, routes, components, schemas, migrations, APIs, jobs, tests and deployments. Do not infer undocumented behavior as fact.

After audit, propose P1 scope, ADRs, migrations, tests, rollback and risks. Do not begin broad implementation until reviewed.

## 3. Immutable product constants

Public plan keys:

```ts
export const PUBLIC_PLAN_KEYS = [
  'flowbot_basic',
  'flowbot_premium',
  'ai_chat_basic',
  'ai_chat_premium',
  'voice_basic_gen1',
  'voice_advanced_gen2',
] as const;
```

Rules:

- one active plan per tenant/product;
- AI Basic is Web only;
- AI Premium is Web + LINE + WhatsApp + Messenger;
- FlowBot is non-AI and web-based in this catalog;
- Voice Basic resolves Gen1; Advanced resolves Gen2;
- provider/model names never enter tenant-facing schemas/copy;
- Tenant Master Admin is created through verified public SaaS registration, never platform-created credentials;
- no product plan is sellable before multi-tenant identity, isolation and entitlement gates pass;
- no seventh public plan.

Do not hardcode price/allowance/overage values in product logic. Load immutable plan versions.

## 4. Forbidden scope

Do not implement or preserve unrelated modules merely because they appear in an old planning file:

- POS/cashier/order/table/inventory;
- Creative Club, child/parent/class/attendance/package redemption;
- payroll/rostering;
- general CRM unrelated to platform conversations;
- merchant payment collection as POS;
- autonomous self-learning.

SaaS subscription billing and conversation-generated lead/appointment request are in scope.

## 5. Phase-scoped changes

Every PR/change set states:

- phase and package(s);
- requirements/decisions implemented;
- explicit non-goals;
- schema/API/event changes;
- migrations/rollback;
- tests/evaluation;
- security/entitlement impact;
- observability/runbook;
- public copy/provider-confidentiality impact.

Reject “implement the whole architecture” scopes.

## 6. Architecture rules

- modular boundaries with typed contracts;
- deterministic Flow Engine has no LLM/provider imports;
- Sales Core shared by text/voice;
- provider gateway owns vendor specifics;
- plan registry maps to capability/entitlement, not vendor;
- action effects execute through Action Gateway;
- transactional outbox/idempotency for durable effects;
- tenant context explicit in requests/jobs/events;
- public DTOs use allow-list serializers;
- internal provider fields require restricted types/modules.

## 7. Database rules

Every migration includes:

- forward and rollback/mitigation;
- tenant/isolation behavior;
- indexes/constraints;
- backfill strategy;
- production-lock/volume analysis;
- validation query/count/checksum;
- retention/privacy impact.

Use constraints for core invariants where practical, including one active plan per tenant/product and idempotency uniqueness.

No table names for excluded operational systems.

## 8. Entitlement implementation

Do not rely on UI hiding.

Enforce at:

- route/API;
- command/service;
- builder validation/publish;
- channel binding;
- runtime/provider session creation;
- action execution;
- usage reservation;
- export/analytics where relevant.

Generate test cases from the package matrix. Store an entitlement snapshot on each interaction.

## 9. FlowBot guidance

- start with parity tests;
- canonical versioned graph;
- pure transition logic;
- durable state/timers;
- version pinning;
- idempotent commands/results;
- Basic/Premium node/feature classification;
- no AI provider calls;
- explicit transfer command to AI/human only with entitlement.

## 10. AI Chatbot guidance

- one shared structured Sales Core;
- playbook/knowledge/offer versions pinned;
- structured per-turn output validated;
- sources/facts/actions traceable;
- Basic web-only binding;
- Premium social adapters normalized;
- channel renderer handles capability limits;
- human takeover lock;
- provider-neutral public outputs;
- raw tokens/cost internal only.

A simple first implementation may combine planning and response in one provider call, but must still produce validated structured output before action.

## 11. Voice guidance

Use public capability profiles:

```ts
type VoiceGeneration = 'voice_gen1' | 'voice_gen2';
```

The provider registry maps these internally. Never serialize provider/model to tenant DTOs.

Requirements:

- realtime lifecycle/reconnect;
- interruption/silence/noise;
- sales behavior/actions;
- disclosure/recording policy;
- minutes/concurrency/spend/fraud;
- generation-specific evaluation;
- no silent Gen2→Gen1 fallback;
- provider-neutral incident/error handling.

## 12. Action Gateway guidance

Approved V1 actions only. Each implementation has:

- typed schema;
- role/tenant/entitlement/consent validation;
- destination allow-list;
- idempotency key;
- rate/spend control;
- audit;
- safe result/error;
- retry/dead-letter policy.

The model never supplies arbitrary recipient or executable URL/code.

## 13. Provider-confidentiality implementation

- separate internal and public types;
- implement the Platform Master Dashboard as a separate platform authorization realm and route tree;
- expose provider registry/routing mutation commands only to Platform Owner or delegated Platform AI Operations permissions;
- apply an explicit server-side deny to Tenant Master Admin, Tenant Admin and every other tenant role;
- forbid provider fields in public OpenAPI/GraphQL/widget schemas;
- keep browser session contracts opaque and provider-neutral; do not return adapter or model identifiers required for direct provider connections;
- map SDK errors centrally;
- scan built client assets/source maps;
- sanitize emails/invoices/exports/logs;
- tenant analytics uses plan/generation labels;
- legal subprocessor page is a controlled exception.

Provider/model changes require reauthentication, schema and capability validation, evaluation evidence, effective dating, append-only before/after audit and tested rollback. Tenant role or subscription changes must never grant access to these commands.

Add CI tests that fail on forbidden identifiers in customer-facing resource directories and API snapshots.

## 14. Testing per change

Minimum:

- unit and type checks;
- entitlement contract tests;
- integration/idempotency tests;
- tenant isolation tests;
- migration tests;
- package end-to-end path;
- provider-leak scan;
- observability assertions;
- relevant AI/voice evaluation regression;
- billing/usage test when affected.

## 15. Definition of done

A change is done only when:

- requirements and acceptance criteria met;
- feature cannot be accessed by wrong plan;
- tests/evaluation pass;
- migration/rollback proven;
- public copy matches plan matrix;
- no provider leakage;
- no excluded scope introduced;
- documentation/runbook updated;
- staging evidence attached.

## 16. Recommended implementation sequence

1. repository audit;
2. public registration, verified Tenant Master Admin and tenant provisioning;
3. platform/tenant realm separation, RLS and isolation suite;
4. plan registry, subscriptions, entitlement snapshots and quota skeleton;
5. shared conversations/contacts/leads/inbox/action gateway;
6. FlowBot parity migration and Basic/Premium SaaS release;
7. Sales Core + knowledge/provider/action gateway;
8. AI Chatbot Basic Web;
9. LINE;
10. WhatsApp;
11. Messenger;
12. AI Chatbot Premium release gate;
13. opaque voice gateway and Gen1;
14. Voice Basic release gate;
15. Gen2 and Advanced quality gate;
16. billing/overage and paid GA hardening.

Document 15 is the detailed execution plan for this sequence.
