# P9 Validation: Billing, operations, and paid GA

- Result: Usage, reconciliation, restore, immutable SLO, release-readiness, public-status, replay, queue/pool resilience, reviewed email recovery, and dependency-outage engineering gates passed; paid-GA gate remains open
- Date: 2026-07-16
- Schema migrations: `0038_release_readiness.sql`, `0039_resilience_drills.sql`, `0040_dead_letter_recovery.sql`, `0041_dependency_outage_attestation.sql`
- Public charging: disabled
- Invoices and commercial mutations: unavailable

API, workers, and Voice gateway share a production admission check that rejects
copied example configuration without echoing the rejected value. The isolated
Voice artifact is exercised with an example authority token and must exit before
listening; the normal provider-neutral liveness/readiness smoke remains separate.

## Executed gates

```bash
git diff --check
scripts/use-node24.sh pnpm --filter @djay/db typecheck
scripts/use-node24.sh pnpm --filter @djay/api typecheck
scripts/use-node24.sh pnpm --filter @djay/tenant-web typecheck
scripts/use-node24.sh pnpm --filter @djay/platform-master typecheck
scripts/use-node24.sh pnpm --filter @djay/db test
scripts/use-node24.sh pnpm test:db
scripts/use-node24.sh pnpm run qa:p9-resilience
scripts/use-node24.sh pnpm run qa:p9-recovery
scripts/use-node24.sh pnpm run qa:p9-dependency-outage
scripts/use-node24.sh pnpm run verify
scripts/use-node24.sh pnpm --filter @djay/tenant-web build
scripts/use-node24.sh pnpm --filter @djay/platform-master build
scripts/use-node24.sh pnpm --filter @djay/public-site build
P9_TENANT_QA_URL=http://127.0.0.1:3111 scripts/use-node24.sh pnpm run qa:p9-usage
P9_PLATFORM_QA_URL=http://127.0.0.1:3112 scripts/use-node24.sh pnpm run qa:p9-operations
P9_PUBLIC_QA_URL=http://127.0.0.1:3110 scripts/use-node24.sh pnpm run qa:p9-status
scripts/use-node24.sh pnpm run qa:p9-restore
```

The PostgreSQL 16 rehearsal passed every migration and existing integration
suite. The P9 commerce assertion proves current quota reconciliation after a
real reservation and settlement: 100 included AI responses, a 120-response
safety cap, one settled response, zero reserved, 99 included remaining, and 119
cap remaining. Tenant B receives only its own Voice account. Neither tenant DTO
contains provider/model/adapter identity, native usage, or cost.

The production tenant build includes `/tenant/usage` and `/workspace/usage`.
Chromium exercised a Tenant Master Admin at 1365x900 and Tenant Analyst at
390x844. Both views passed page/console error, horizontal-overflow,
confidentiality, current-period reconciliation, pre-release billing disclosure,
and accessible progress checks. The owner sees future commercial authority
guidance; the analyst sees that only the owner can manage commercial actions.

Visual evidence:

- `/tmp/djay-p9-usage-owner-desktop.png`
- `/tmp/djay-p9-usage-analyst-mobile.png`

The real PostgreSQL integration suite also proves a healthy platform-wide
reconciliation after reservation/settlement, then deliberately introduces one
quota/event variance and proves that exactly one account and the aggregate gate
move to `attention`. The report is bounded, Finance/Owner-only, and its DTO has
no provider/model/adapter identity, native usage, cost, or margin.

The production Platform Master build was exercised as Platform Owner at
1365x900 and Platform Finance at 390x844. Both rendered actionable variance
evidence, correct role authority, explicit no-charging authority, no horizontal
overflow, no page/console errors, and no restricted cost/routing identity inside
the reconciliation surface.

Visual evidence:

- `/tmp/djay-p9-operations-owner-desktop.png`
- `/tmp/djay-p9-operations-finance-mobile.png`

The first restore attempt proved schema/data alone were insufficient because
`--no-acl` removed runtime grants. A second fresh-cluster attempt proved the
historical base role manifest omitted AI/Voice/FlowBot runtime roles. Both
defects were corrected. The final drill passed between separate PostgreSQL 16
clusters with archive validation, a backup SHA-256, identical critical
data/schema/policy fingerprints, complete least-privilege role bootstrap,
restored ACLs, immutable ledger/catalog triggers, forced commerce RLS, and the
runtime-role Tenant A/Tenant B substitution suite.

Migrations 0038/0039/0041 and their integration tests prove seven immutable technical
objectives, append-only staging/production observations, computed availability,
nine time-limited attestations, idempotent evidence replay, audit records, and a
narrow blocking-incident aggregate. An initial test correctly failed when the
store tried to read a restricted incident table directly; the implementation
was corrected to a least-privilege security-definer count/timestamp function.
A second test caught an internal service key in the draft public DTO; that key
was removed before acceptance. The final database suite passed all migrations,
RLS probes, repository tests, and legacy migration rehearsal.

Migration 0040 and ADR-012 add reviewed recovery only for system, FlowBot, and
AI Chat email queues. The focused PostgreSQL test proves the platform role has
no direct request-table or queue access; Support can inspect/request but cannot
review; a requester cannot self-approve; a second Owner can apply exactly one
due retry; an altered attempt count invalidates the approval; duplicate/repeated
actions fail closed; the normal worker claims the same opaque item, advances the
attempt history, preserves ciphertext, and completes it; and immutable safe
audit events are written. FlowBot webhooks and social queues
are deliberately excluded because their external side effects are not proven
safe to repeat.

The dependency-outage suite proves bounded and provider-neutral AI text 503 and
timeout handling, safe AI turn failure without committing assistant usage,
Realtime Voice setup timeout and pre-admission refusal, and retryable
post-admission media outage mapping. It also reruns email retry/dead-letter and
LINE, WhatsApp, and Messenger adapter failure contracts. The deployed runtime
has no Redis/cache or object-store dependency: PostgreSQL owns rate limits,
queues, leases, and encrypted privacy exports. Those outage classes are recorded
as `not_applicable_not_deployed`, not accepted as passing evidence.

The production public-site build includes `/status`. Chromium exercised an
operational desktop at 1365x900 and a degraded mobile view at 390x844. Both
rendered exactly seven customer-facing services with correct state, timestamps,
registration/sign-in paths, no horizontal overflow or page/console errors, and
no internal service key, evidence, tenant, provider/model, route, cost, or
credential leakage.

Visual evidence:

- `/tmp/djay-p9-status-operational-desktop.png`
- `/tmp/djay-p9-status-degraded-mobile.png`

The production Platform Master build exercised Owner desktop, Finance mobile,
Support desktop, and AI Operations mobile. Every role received the same
fail-closed 7-service/9-attestation/incident/usage decision plus live
registration authority with appropriate authority guidance. A current privacy
attestation cannot override a missing approved runtime bundle. Billing counts
remained limited to Owner/Finance. All views
passed overflow, console, confidentiality, commercial-boundary, and actionable
failure checks.

The Platform snapshot loader now starts every independent role-authorized read
concurrently after session authority resolves, then commits the result only if
it is still the newest refresh generation. The Owner browser fixture adds 80 ms
to each operations read and requires at least four requests in flight together;
the accepted production build exceeded that threshold while preserving every
role, error, recovery, confidentiality, and responsive-layout assertion. A
second delayed journey changes the resolved identity from Owner to Support
during refresh and proves usage, Voice runtime, and route-governance evidence
disappear before the Support snapshot requests finish.

Owner, Support, and AI Operations also received the reviewed recovery surface
with safe opaque item data, root-cause input, explicit independent review, and
the excluded-queue boundary. Finance received no recovery data or controls. The
four desktop/mobile views passed recovery authority, failure guidance,
confidentiality, console, and horizontal-overflow checks.

Visual evidence:

- `/tmp/djay-p9-operations-owner-desktop.png`
- `/tmp/djay-p9-operations-finance-mobile.png`
- `/tmp/djay-p9-operations-support-desktop.png`
- `/tmp/djay-p9-operations-ai-operations-mobile.png`
- `/tmp/djay-p9-operations-support-recovery-error-mobile.png`

The focused resilience drill used a fresh PostgreSQL 16 cluster. It deliberately
applied an email effect and then returned an ambiguous failure, retried with the
same durable outbox UUID, and proved the provider-effect set remained one. The
sent item was not claimable again. A second item was abandoned in processing
with a ten-minute-old lock and was reclaimed through the normal five-minute
lease path, finishing with exactly two attempts.

The drill then reserved both connections in a constrained pool. The shared
database readiness probe returned unavailable within the 100ms test deadline,
created no second outstanding probe, and recovered after one reservation was
released. A following SQL probe succeeded. `/api/health/ready` returns only the
safe ready/unavailable state and 503 when the database cannot be confirmed.

The first resilience run exposed a fixture-clock race: the database-created due
time was milliseconds later than the injected worker time, so the worker
correctly claimed nothing. The fixture now records its due time explicitly; the
full database suite and focused `qa:p9-resilience` command pass.

## Pending P9 gates

- Accepted ADR-008 with payment provider, immutable prices/rates/allowances,
  Thai VAT/tax invoice policy, billing intervals, proration, refund, trial,
  grace, dunning, cancellation, retention, and legal/accounting approval.
- Production checkout, signed webhook application, subscription lifecycle,
  immutable invoices/credit notes, and customer billing portal.
- Overage forecast/alerts, approved safety-cap management, and exact customer
  unit rounding under the accepted rate card.
- Managed-environment backup/PITR, event replay, queue/pool drills, regional
  disaster recovery, capacity, real monitoring observations, staffed support/on-call, security,
  privacy, and legal launch exercises. The local separate-cluster restore and
  status/SLO engineering gates are complete but are not substitutes for
  production infrastructure and human-response exercises.
- Managed-environment exercise of the reviewed two-person email recovery;
  direct SQL remains prohibited and a dead letter keeps the release gate blocked
  until normal delivery succeeds and fresh zero-dead-letter evidence is accepted.
- Managed-environment refusal, timeout, and post-acceptance-loss exercise for
  every enabled AI text, Realtime Voice, email, and social endpoint. Local
  fault-injection proves the application contract but is not production
  dependency evidence.
- End-to-end unfamiliar-SME register/pay/configure/test/launch acceptance.

This evidence does not authorize payment collection, public prices, invoices,
overage charging, or paid self-service.
