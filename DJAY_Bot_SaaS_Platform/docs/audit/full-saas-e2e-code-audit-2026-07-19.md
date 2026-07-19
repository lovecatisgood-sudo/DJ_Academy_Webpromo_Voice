# DJAY Bots Full Code and End-to-End Audit

Date: 2026-07-19

## Executive verdict

The repository contains substantial, security-conscious local foundations for identity, tenant isolation, Flow Bot, AI Text, Voice, commerce, usage controls, and Platform operations. The full PostgreSQL integration suite, unit tests, all package builds, and mocked production-browser accessibility suite pass.

The product is **not production deployable or market-release complete**. The packaged worker cannot start, the canonical release gates do not pass, all six packages remain non-sellable, no requirement is accepted, the new GCP runtime contract is incomplete, and several Shared SaaS Operations workflows do not preserve the commercial catalogue or complete their lifecycle.

No audited result should be described as production end-to-end acceptance. Current evidence establishes local component and database behavior, not a paid customer journey through live cloud, Stripe, OpenAI, social providers, or a telephone carrier.

## Remediation update: 2026-07-19

The following audit findings were repaired after the baseline audit:

- Packaged worker startup now supports bundled CommonJS dependencies and includes the required Argon2 and Canvas native runtimes. All eight release artifacts pass runtime smoke acceptance.
- The canonical onboarding gate again exposes server-derived `Technical launch readiness`; `pnpm verify` passes.
- Shared Operations uses the catalogue key `starter_branding_removal`, validates product/tier eligibility, enforces exact unit quantities, adds quantities instead of replacing them, scopes branding removal to the subscribed product, and uses tenant idempotency keys.
- Professional-service requests and engagement messages are idempotent. Tenant and Platform users can read immutable updates, Platform operators can advance only allowed lifecycle transitions, customer updates safely return the next action to DJAI, and engaged requests are no longer duplicated in the tenant UI.
- Worker readiness now probes PostgreSQL.
- GCP Terraform now includes a private KMS-encrypted knowledge bucket, API/worker object IAM, signed-upload authority, all required product secret containers/bindings, and an explicit `commerce_enabled` capability boundary.
- The deployment workflow now updates and executes a checksum-enforced Cloud Run migration job before runtime rollout. The job applies all ordered migrations, configures the seven purpose-scoped runtime roles from their secret database URLs, and fails on modified migration history.
- Schema versions `0077_shared_operations_commercial_authority` and `0078_service_engagement_lifecycle` are included in the authoritative PostgreSQL harness and current schema registry.

Post-remediation verification:

| Check | Result |
| --- | --- |
| `pnpm verify` | Passed: all lint gates, 32 package type checks/tests/builds |
| Focused Shared Operations PostgreSQL 16 suite through migration `0078` | Passed |
| Migration runner on blank PostgreSQL 16 | Applied 79 migrations; immediate second run applied zero |
| Terraform `fmt` and provider-backed `validate` | Passed for `gcp-bootstrap` and `gcp-platform` with Terraform 1.14.6 / Google provider 7.40.0 |
| `pnpm qa:release-artifacts` | Passed all eight production artifacts |
| `pnpm qa:ui-foundation` against isolated current production builds | Passed responsive, role, failure-state, and WCAG 2.2 AA automation |

This remediation does not change the market-release verdict. All packages remain deliberately non-sellable until live GCP deployment, provider credentials, real OpenAI/social/carrier qualification, security and recovery evidence, pilot acceptance, and requirement-registry approval are completed. Commerce remains intentionally disabled by default.

## Severity-ranked findings

### Critical: packaged worker cannot start

The worker is bundled as ESM (`apps/workers/package.json:7`). The bundled Google authentication dependency performs a dynamic CommonJS require, so the production artifact exits immediately with:

```text
Error: Dynamic require of "child_process" is not supported
```

This occurs before environment validation or the health server starts. It breaks knowledge ingestion, Flow and AI connector delivery, social delivery, notification delivery, privacy processing, usage jobs, and any enabled billing jobs. It also causes the release-artifact assertion at `scripts/qa-release-artifacts.mjs:349-363` to fail before it can observe the expected missing `WORKER_DATABASE_URL` error.

Required remediation: change the bundle strategy to a runtime-compatible format or externalize/copy the Google libraries and their transitive runtime dependencies; then add a packaged-container startup test that reaches `/health/ready`.

### High: GCP runtime cannot satisfy the application production contract

The GCP module provisions only a public widget bucket (`infra/terraform/gcp-platform/main.tf:194-220`). There is no private knowledge-object bucket and no object read/write IAM for API or worker service accounts, although API and worker production code require knowledge storage.

The bootstrap secret set at `infra/terraform/gcp-bootstrap/main.tf:21-34` and service bindings at `infra/terraform/gcp-platform/main.tf:23-82` omit required authorities, including:

- `AI_INTEGRATION_ENVELOPE_KEY`
- `VOICE_TELEPHONY_ENVELOPE_KEY`
- `MALWARE_SCANNER_TOKEN`
- Flow social credential and subject-hash secrets
- malware-scanner endpoint/service deployment authority

The API makes several of these mandatory in production (`apps/api/lib/container.ts:126-147`), and the worker requires knowledge storage and scanner configuration when knowledge processing is enabled (`apps/workers/src/index.ts:101-112`). A deploy can therefore create infrastructure but cannot start the intended product services with secure configuration.

The module creates a Cloud SQL instance but no application database, least-privilege roles, schema migration job, or seed/activation job. The deploy workflow builds images and applies Terraform but contains no database migration stage. Production runtime URLs therefore have no reproducible database authority.

### High: commerce deferral currently prevents an independent production worker rollout

The product owner explicitly deferred commerce, but the single worker process requires all billing, subscription lifecycle, webhook recovery, and financial reconciliation workers in every production environment (`apps/workers/src/index.ts:82-97`). Financial reconciliation then requires Stripe secrets (`apps/workers/src/index.ts:120-125`).

The GCP API binding also always injects `BILLING_DATABASE_URL` (`infra/terraform/gcp-platform/main.tf:28-30`), which causes API startup to require the complete Stripe configuration (`apps/api/lib/container.ts:149-151`). Flow, AI, Voice, and Shared Operations therefore cannot be deployed with `NODE_ENV=production` while commerce is intentionally disabled.

Required remediation: split workers by capability or introduce an explicit, fail-closed deployment profile whose required authorities are derived from enabled capabilities. Omitted commerce must return unavailable at commerce routes without preventing unrelated services from starting.

### High: Shared Operations branding add-on is disconnected from the commercial catalogue

The authoritative catalogue key is `starter_branding_removal` (`packages/catalog/src/index.ts:176-181` and `packages/db/migrations/0043_market_release_catalog.sql:347-354`). Shared Operations accepts and provisions `branding_removal` (`packages/db/src/shared-saas-operations-store.ts:6`, `packages/db/migrations/0074_shared_saas_operations.sql:19-23`), and public runtime checks only that non-catalogue key (`packages/db/migrations/0075_branding_add_on_runtime.sql:31-38`).

The catalogue item can never activate runtime branding removal through this workflow, while Platform can provision a key that has no catalogue price/version authority. This silently breaks commercial-to-runtime reconciliation.

### High: add-on fulfillment does not preserve requested quantity or commercial compatibility

Tenant API and UI accept quantities from 1 to 100 for every add-on (`apps/api/app/tenant/operations/route.ts:7-10`, `apps/tenant-web/app/workspace/operations/page.tsx:77-81`). Additional-workspace fulfillment creates exactly one workspace and marks the entire request provisioned (`packages/db/src/shared-saas-operations-store.ts:90-114`). A quantity of 5 therefore delivers 1.

For other add-ons, a later request replaces the active quantity instead of adding to it or applying an explicitly reviewed target quantity (`packages/db/src/shared-saas-operations-store.ts:117-125`). A second request for 1 can reduce a provisioned quantity of 2 to 1.

Requests validate only that a subscription is active; they do not validate that the add-on is offered for that product/tier. The UI offers every add-on against every subscription. There is no catalogue-version, quote, price, or provider-item binding in the request/provision decision.

### High: professional-service fulfillment stops after intake

The schema anticipates engagement status changes and immutable engagement updates (`packages/db/migrations/0074_shared_saas_operations.sql:40-55`), but the store and APIs only create an engagement (`packages/db/src/shared-saas-operations-store.ts:128-140`). Neither tenant nor Platform can:

- post or read engagement updates
- change next-action owner or target date
- schedule, start, review, complete, or cancel delivery
- accept a quote or scope revision
- attach deliverables or record customer approval

This is an intake-to-engagement foundation, not a complete merchant support, professional setup, or Enterprise fulfillment workflow.

### High: completion claims are not reflected in release authority

The executable registry contains 291 requirements, but its current status is:

- 271 `planned`
- 11 `in_progress`
- 8 `implemented`
- 1 `blocked`
- 0 `staging_verified`
- 0 `accepted`

All six packages remain `sellable: false` (`requirements/market-release-v1.yaml:8-32`). This conflicts with the broad local completion statement in `docs/audit/product-development-session-checkpoint-2026-07-18.md:231-287`.

The registry validator correctly prevents sellability without acceptance, but it does not prove that recently claimed Flow, AI, Voice, and Shared Operations requirements have been mapped to implementation and tests. Until those records are reviewed and advanced, the repository's own release authority says the work remains overwhelmingly planned.

### High: canonical verification and release-artifact gates fail

`pnpm verify` fails in `scripts/check-onboarding-readiness.mjs:24-30` because the gate requires a `Technical launch readiness` checklist item that the current tenant overview no longer contains (`apps/tenant-web/app/workspace/page.tsx:156-161`). The page has product lifecycle rows, so this may be contract drift rather than missing behavior, but the protected release gate is red either way.

`pnpm qa:release-artifacts` fails because the packaged worker crashes on the dynamic require before the expected authority validation. CI runs both gates, so the current branch cannot pass CI or qualify a release artifact.

### High: new external-processing code lacks direct tests

`apps/workers` deliberately passes with no test files (`apps/workers/package.json:14`). Consequently, the following claimed production paths have no direct unit or dependency-contract tests:

- crawl DNS/SSRF enforcement and HTTP behavior
- malware scanner request/response behavior
- GCS upload/download and object metadata validation
- PDF/DOCX/TXT extraction
- scheduled refresh processing
- AI Google Sheets, webhook, and CRM delivery
- packaged worker startup and readiness

There is also no focused test for `packages/provider-gateway/src/openai-realtime.ts`, `packages/db/src/knowledge-ingestion-store.ts`, `packages/db/src/ai-operations-store.ts`, or `packages/db/src/voice-telephony-store.ts`. Migration invariant tests prove schema text patterns, not those runtime workflows.

### Medium: tenant service requests remain duplicated after engagement

The tenant overview does not return `serviceRequestId` with engagements (`packages/db/src/shared-saas-operations-store.ts:22-24`). The UI tries to suppress an engaged request by comparing engagement ID to service-request ID (`apps/tenant-web/app/workspace/operations/page.tsx:88`). Those UUIDs differ, so the customer sees both the active engagement and the original engaged request.

### Medium: add-on and service request creation is not idempotent

Tenant requests contain no idempotency key and have no uniqueness constraint for an open equivalent request (`packages/db/src/shared-saas-operations-store.ts:31-51`). A timeout/retry or double submission can create duplicate requests. Provisioning protects a single request with row locking, but does not prevent two duplicate request rows from being fulfilled.

### Medium: worker readiness does not represent readiness

The worker returns ready whenever it is not shutting down (`apps/workers/src/index.ts:187-197`). It does not probe its database, knowledge bucket, malware scanner, AI gateway, email provider, or enabled delivery authorities. An orchestrator can keep an instance in service while every job dependency is unavailable.

The AI gateway readiness endpoint is also unconditional (`apps/ai-gateway/src/server.ts:34-38`). Provider credentials are syntactically checked at startup, but readiness does not distinguish an unreachable or rejected upstream.

### Medium: browser QA is UI-contract testing, not a real end-to-end system test

`scripts/qa-ui-foundation.mjs` intercepts and mocks tenant and Platform APIs, including subscriptions, onboarding, operations, product runtimes, and roles. It provides useful accessibility, responsive-layout, navigation, and failure-state evidence, but it does not exercise browser -> proxy -> API -> PostgreSQL -> worker/provider.

The full database suite separately proves many RLS/store invariants. There is no single Playwright suite running real identity, API, PostgreSQL, workers, widgets, and provider simulators through the complete user journeys.

### Medium: audit and deployment documentation is internally stale

The older feature-gap audit still calls features missing that the session checkpoint later calls locally complete. The Docker README still describes ECS, S3, and AWS Secrets Manager even though the current deployment target is GCP. Operators cannot reliably determine which document is authoritative without reconstructing session chronology.

## End-to-end user audit

### Prospect and unsubscribed business

Working locally: registration, approved legal version binding, email verification, workspace creation, single master-admin ownership, sign-in, recovery, and optional pending plan selection.

Not complete: all plans are non-sellable; there is no live quote -> accepted contract -> Stripe Checkout -> signed webhook -> active subscription journey. The dashboard accurately leaves plan access pending, but the public text saying a plan is “confirmed after email verification” can be read as stronger than the resulting `pending` subscription with `accessMode: none`.

Verdict: account acquisition works locally; subscriber acquisition does not.

### Tenant Master Admin

Working locally: workspace selection, server-derived onboarding evidence, team/ownership controls, product authoring, publish/deploy foundations, data/privacy controls, usage controls, add-on/service requests, and product operation screens. Recent assurance is required for sensitive tenant actions.

Not complete: no self-serve paid activation; add-on semantics are defective; service delivery cannot progress; live integrations and deployment are absent. Product onboarding cannot receive real production acceptance evidence yet.

Verdict: strong local administration foundation, not a production customer lifecycle.

### Tenant Admin and specialist roles

The authorization matrix separates administrators, operators, conversation managers, human agents, analysts, billing managers, and read-only support. UI checks and API checks generally align, and browser QA confirms key read-only controls are hidden. The full database suite found no cross-tenant access failure in its covered repositories.

Residual risk: this was not a route-by-route dynamic authorization test with every role, and no penetration test has been performed. Tutorial progress is writable by any authenticated tenant member, but it is member-specific guidance state rather than launch authority.

Verdict: locally coherent, pending exhaustive authorization matrix and security testing.

### Platform Owner

Working locally: controlled Platform authentication, recent-auth checks, support grant review, release/readiness records, subscription activation foundations, add-on provisioning, and engagement creation. Provisioning is audited.

Not complete: GCP runtime cannot be deployed reproducibly; service engagements cannot be managed after creation; add-ons lack commercial binding and lifecycle; live provider and reconciliation operations remain closed.

Verdict: operational console foundation only.

### Platform Support

Can inspect allowed operational data, request controlled tenant access, and create service engagements. Cannot provision paid add-ons because that additionally requires billing management.

Not complete: no engagement update/delivery workflow, customer communication thread, deliverable handoff, or closeout.

Verdict: intake and controlled access work locally; support fulfillment does not.

### Platform Finance

Has read-only finance/catalog/fulfillment visibility. Billing, immutable financial documents, reconciliation, and FlowAccount foundations have database coverage.

Not complete: Stripe and FlowAccount credentials/configuration, accountant-approved mapping, live reconciliation, tax/legal approval, and immutable customer-document acceptance are external or deferred.

Verdict: local control-plane foundation, no live finance operation.

### Website visitor using Flow Bot

Working locally: public deployment-key authority, origin checks, deterministic engine, rich message contracts, typed actions, sync, usage funding, and widget rendering/build evidence.

Not complete: no real cloud/CDN acceptance, merchant-site installation acceptance, real media/object delivery test, or complete provider connector acceptance.

Verdict: locally testable runtime, not production accepted.

### Website visitor using AI Text Bot

Working locally: restricted gateway, structured sales output, public runtime/session authority, knowledge schema, action contracts, and UI foundations.

Not complete: worker is non-starting; knowledge bucket/scanner infrastructure is absent; ingestion/connectors are untested; OpenAI live evaluation and activation are pending.

Verdict: cannot operate end to end in production.

### Website visitor using AI Voice Bot

Working locally: browser widget, WebSocket session authority, concurrency, heartbeat/reconnect, consent/recording policy data, connected-minute settlement, and provider adapter foundations.

Not complete: OpenAI Realtime adapter lacks focused tests/live qualification; no carrier/number provisioning, inbound telephone acceptance, live transfer, carrier reconciliation, approved multilingual launch list, or production latency/call-quality evidence.

Verdict: web voice foundation only; advertised telephone operation is not delivered.

### LINE, Messenger, and other social customers

Working locally: signed webhook/opaque binding foundations, receipt replay protection, deterministic Flow processing, AI social queue/delivery records, channel fee classification, and local database integration coverage for LINE.

Not complete: live LINE/Meta credentials, real webhook registration, provider rate/format acceptance, named-merchant tests, and operational reconciliation. Flow Messenger does not have equivalent focused integration evidence to the LINE path.

Verdict: adapter and persistence foundations, not live social automation acceptance.

## Verification executed in this audit

| Check | Result |
| --- | --- |
| `pnpm test` | Passed: 53 tasks; worker had zero tests; DB integration tests skipped in this command |
| `pnpm build` | Passed: 32 packages |
| `pnpm verify` | Failed: onboarding readiness contract drift |
| `pnpm qa:ui-foundation` against packaged production artifacts | Passed |
| Full `scripts/test-db-integration.sh` on PostgreSQL 16 through migration 0076 | Passed |
| `pnpm qa:release-artifacts` | Failed: packaged worker startup crash |
| Direct packaged worker startup | Failed: dynamic require of `child_process` |
| Terraform format/validate | Not run: Terraform CLI is unavailable in this environment |
| Live GCP/Stripe/OpenAI/social/carrier acceptance | Not run; credentials/infrastructure/activation are absent or deferred |

## Positive controls confirmed

- Forced RLS and tenant-scoped store behavior pass the complete PostgreSQL integration suite.
- Server-derived tenant/platform contexts and permission checks are consistently used in the audited Shared Operations routes.
- Sensitive tenant actions have recent assurance controls; Platform fulfillment mutations require recent authentication.
- Public bot configuration derives entitlement and branding state server-side.
- Provider identities and credentials are kept out of public DTOs in the audited gateways/widgets.
- Stripe/financial database foundations use signed-event, immutable-evidence, and reconciliation controls in local integration tests.
- Unit/build/browser suites cover failure states, responsive layout, keyboard focus, and WCAG automation well for a pre-production system.

## Remediation order

1. Repair the worker artifact and add packaged startup/readiness tests.
2. Restore both canonical release gates to green and make them mandatory in CI.
3. Decouple production capability profiles so deferred commerce cannot prevent Flow/AI/Voice deployment.
4. Align GCP infrastructure with every mandatory environment variable, private knowledge storage, IAM, scanner service, database roles, and migrations.
5. Replace Shared Operations add-on strings with catalogue authority; enforce product/tier applicability, quantity semantics, idempotency, quote/approval, and lifecycle.
6. Complete engagement updates, status transitions, communication, deliverables, and closeout.
7. Add worker, knowledge, AI integration, Voice telephony, and OpenAI Realtime tests, followed by a real browser/API/DB/worker provider-simulator suite.
8. Reconcile every claimed completed feature into the 291-requirement registry with implementation paths and test IDs; do not advance to accepted without staging evidence and named approval.
9. Run Terraform validation, container smoke tests, staged migrations, backup/restore, provider acceptance, load/latency tests, security testing, and pilot merchant acceptance.
10. Only then activate the relevant plan's Stripe mapping and `sellable` flag. Package activation should remain independent so one accepted package can launch without falsely accepting the others.
