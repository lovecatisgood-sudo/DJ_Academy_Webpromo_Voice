# P8 Validation: Voice Agent Advanced

- Result: Local restricted runtime and admission foundation passed; P8 live release gate remains open
- Date: 2026-07-16
- Database migrations: `0034_voice_advanced_routing`, `0035_voice_advanced_deployments`, `0036_voice_advanced_runtime`, `0037_voice_analytics_indexes`
- Production activation: Disabled; Gen2 profile is paused

## Executed foundation gates

```bash
git diff --check
scripts/use-node24.sh pnpm --filter @djay/db typecheck
scripts/use-node24.sh pnpm --filter @djay/api typecheck
scripts/use-node24.sh pnpm --filter @djay/platform-master typecheck
scripts/use-node24.sh pnpm --filter @djay/ai-evals test
scripts/use-node24.sh pnpm --filter @djay/voice-gateway test
scripts/use-node24.sh pnpm run qa:p8-voice-load
scripts/use-node24.sh pnpm test:db
scripts/use-node24.sh pnpm run verify
scripts/use-node24.sh pnpm run qa:p3-ui
P7_TENANT_QA_URL=http://127.0.0.1:3111 scripts/use-node24.sh pnpm run qa:p7-voice
```

All listed gates passed across 31 packages/apps. The PostgreSQL 16 rehearsal proves direct table access
is denied, Platform Support and Finance cannot read routing identity, a proposer
cannot self-qualify, a requester cannot self-approve, direct promotion cannot
skip canary, an approved canary can be promoted and rolled back, a major
incident pauses Gen2, a different Finance reviewer can approve the credit-review
recommendation without provider/model access, and all ten successful transitions
are audited. The production builds include both restricted Platform routes, and
desktop/mobile browser acceptance proves the Platform workflow is responsive
while tenant UI remains free of provider/model identity.

Migration `0035` additionally proves that Advanced deployment generation comes
only from the active immutable entitlement, the tenant DTO exposes only the
Second-Generation public label, Gen2 admission defaults unavailable, and a
generation-matching composite foreign key prevents an Advanced deployment from
issuing a Gen1 session after downgrade. Desktop Basic and mobile Advanced Studio
acceptance pass with no overflow or provider/model leakage; Advanced displays the
explicit pending-activation and no-First-Generation-fallback notice.

Migration `0036` proves latest-snapshot entitlement authority, independently
reviewed admission, automatic fail-closed admission on non-running profile
states, exact immutable Gen2 session-route assignment after quota/concurrency
reservation, drain-safe reconnect, incident heartbeat stop, and terminal usage
settlement. Gateway tests prove exact configured route matching, mismatch denial
without Gen1 fallback, strict internal authorization response parsing, and no
provider/model/region identity in any browser WebSocket message.

Migration `0037` and the tenant Voice analytics repository prove bounded
deployment/time queries, Advanced/core entitlement packaging, cross-tenant
denial, reconnect and settled-minute reconciliation, outcome/language/terminal
and safe turn-failure breakdowns, average and p95 turn latency, appointment and
lead conversion counts, and a gap-free daily UTC series. Downgrade returns only
core metrics immediately while retaining historical records. The CSV export
neutralizes formula-leading cells and contains no route, provider, model,
transcript, prompt, credential, native usage, price, cost, or margin identity.

The production-like local transport drill opened 120 real WebSocket attempts
against a 40-session limit. It admitted exactly 40, returned neutral
`capacity_unavailable` errors for 80, recovered all 40 slots after saturation,
settled 40 injected media-open failures, and drained 10 active sessions during
shutdown with zero sessions left. Observed p95 connection time was 53 ms and
the heap delta was 5,466,816 bytes in this run. These values are diagnostic
evidence from the local fixture, not approved production service thresholds.

The Voice evaluation contract passes eight tests together with the existing P5
suite. P8 requires both English and Thai observations for disclosure, Sales Core
turns, interruption, silence, background noise, reconnect, timeout cleanup, and
upstream outage. The evaluator permits repeated samples, but fails missing
coverage, duplicate case IDs, inexact speech,
provider disclosure, duplicate actions, unsafe outage/cleanup, and metrics that
miss the externally approved threshold artifact. Its strict input rejects raw
audio/transcript and provider/model/route fields; its CLI emits only a safe
aggregate report plus the input artifact's lowercase SHA-256 digest. This proves
the gate behavior, not the still-pending equivalent or live profile.

## Pending P8 gates

- Equivalent Gen2 profile qualification and controlled degradation tests.
- Live-provider/equivalent-profile capacity and approved cost/margin thresholds.
- Controlled live-media degradation and named release rollback rehearsal.
- Live English/Thai audio quality and named-merchant acceptance.

This evidence does not authorize Advanced Voice production traffic.
