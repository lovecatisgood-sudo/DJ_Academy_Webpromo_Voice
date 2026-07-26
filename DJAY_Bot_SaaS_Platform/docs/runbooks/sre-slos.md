# SRE SLOs & probes — SKU1

Last updated: 2026-07-26
Gate: G6d

## Service level objectives

> Added 2026-07-26. This file previously defined probes and metrics but **no objectives**. The product promise is speed — *"leads die because nobody replied fast enough"* — so response latency is a product requirement, not an infrastructure detail.

Measurement window: rolling 28 days. Breach of any **hard** objective blocks a release gate.

### Conversation latency

| Objective | Target | Hard? | Why |
|---|---|---:|---|
| FlowBot first response (deterministic) | p95 ≤ **1.5 s** | hard | No model call; slowness here is our own doing |
| AI Chat first response | p95 ≤ **6 s**, p99 ≤ **12 s** | hard | Beyond ~10 s buyers abandon the chat |
| AI Chat streaming first token | p95 ≤ **2.5 s** | soft | Perceived responsiveness while the full answer generates |
| Voice turn round-trip | p95 ≤ **1.2 s** | hard | Above this, spoken conversation feels broken |

### Channel ingress and delivery

| Objective | Target | Hard? | Why |
|---|---|---:|---|
| Webhook ACK to provider | p95 ≤ **1 s**, p99 ≤ **3 s** | hard | LINE and Meta retry on slow ACK, causing duplicate storms |
| **LINE reply-window hit rate** | ≥ **99 %** within the `replyToken` window (~60 s) | hard | Missing it converts a *free* reply into a *metered push* — direct unit-economics damage |
| Outbound delivery success | ≥ **99.5 %** excluding provider outages | hard | |
| Dead-letter rate | ≤ **0.1 %** of inbound events | soft | |

### Availability

| Objective | Target | Hard? |
|---|---|---:|
| Public webhook endpoints | ≥ **99.9 %** | hard |
| Tenant workspace | ≥ **99.5 %** | soft |
| Checkout success (non-user-error) | ≥ **99 %** | hard |

### Onboarding (product SLO)

| Objective | Target | Why |
|---|---|---|
| LINE connect completion | ≥ **90 %** of started connections reach a green check | PRD §7 bar: "under 15 minutes, guided" |
| Time-to-live, website + LINE | p75 ≤ **15 min** | The stated onboarding promise, measured rather than assumed |

**Error budget:** a hard-objective breach freezes non-fix feature work on the affected surface until the budget recovers. Rationale, not bureaucracy: the value proposition *is* responsiveness.

### Instrumentation

Shipped in Phase D as `commerce_metric` structured logs (`packages/shared/src/channel-metrics.ts`). Emission never throws into a request or turn, and no payload carries PII, credentials, message content, identifiers, or provider names — `errorClass` is drawn from our own vocabulary, never a provider string.

| Metric | Labels | Emitted at | Live? |
|---|---|---|---|
| `webhook_ack_ms` | product, channel, httpStatus | `apps/api/lib/webhook-ack.ts` around every FlowBot and AI Chat social webhook | ✅ |
| `channel_delivery_result` | product, channel, outcome, errorClass, deadLetter, attemptCount | worker delivery loops, on both success and failure | ✅ |
| `onboarding_step` | product, channel, step, outcome, reason | guided LINE connect route, one event per step reached | ✅ |
| `conversation_first_response_ms` | product, channel | worker, on delivery | ⛔ needs migration `0084` |
| `line_reply_window_hit` | product, channel, hit, elapsedMs, usedReplyToken | worker, per outbound LINE reply | ⛔ needs migration `0084` |

**Why the last two are not yet live.** Both require the *inbound* event timestamp — for the reply window, the moment LINE issued the `replyToken`. The delivery-claim functions (`tenancy.claim_flow_social_delivery`, `tenancy.claim_ai_social_delivery`) do not return it, so the worker has no correct value at the send site. The worker already reads `inbound_occurred_at` as optional and **emits nothing until it is present** — it never substitutes a proxy such as claim time, which would silently misreport a hard SLO. Both metrics activate with no further application code change once the column is surfaced.

> **The enabling migration is deliberately NOT in the repo.** A first attempt (`0084`) was written and then removed during review because it was derived from the wrong base: `tenancy.claim_ai_social_delivery` is redefined in `0026` and `0027`, not just `0024`. Recreating it from `0024` would have silently dropped `delivered_part_count` **and the 24-hour Meta service-window guard** — a policy violation, not merely a lost feature. Neither typecheck, the unit suite, nor `migration-invariants` detects this class of regression.
>
> **Requirements for whoever writes it.** Add `inbound_occurred_at timestamptz` (`receipt.occurred_at`) to the `RETURNS TABLE` and `SELECT` of both claim functions. A return signature cannot be altered by `CREATE OR REPLACE`, so each must be dropped, recreated, and re-granted. Derive each body from its **latest** definition — `0069` for the FlowBot function, **`0027`** for the AI Chat function — and diff the result against that latest definition before applying. Do not author it until a non-production database exists to execute it against; all three systems currently share one live Neon instance.

Note that `line_reply_window_hit` is a *hit* only when a reply token was used **and** the reply left within the window; a push is a miss by construction, because it is metered.

## Probes (Cloud Run)

| Service | Startup | Liveness |
|---------|---------|----------|
| api, public-site, tenant-web, platform-master | `/api/health/live` | `/api/health/ready` |
| ai-gateway, voice-gateway, widget-cdn, workers | `/health/live` | `/health/ready` |

Terraform: `infra/terraform/gcp-platform/main.tf` (Phase 12).  
**Staging evidence:** after `terraform apply` with `deploy_services=true`, curl each service ready path and attach HTTP 200 bodies to `docs/validation/phase12-reliability-g6d.md`.

## Worker readiness

`GET /health/ready` requires:

1. Database probe OK
2. When `BILLING_WEBHOOK_WORKER_ENABLED=true`, webhook backlog (`received` + stale `processing`) ≤ `WORKER_WEBHOOK_BACKLOG_READY_LIMIT` (default 200)

Backlog SQL: `billing.webhook_backlog_stats` (migration `0081`).

## Metrics (structured logs)

Emit `console.info("commerce_metric", { metric, ... })`:

| metric | Meaning |
|--------|---------|
| `checkout_attempt` | Checkout start |
| `checkout_result` | outcome + httpStatus |
| `webhook_result` | applied / failed |
| `api_error` | route 5xx |
| `webhook_ack_ms` | provider webhook ACK latency |
| `channel_delivery_result` | outbound delivery success / failure + error class |
| `onboarding_step` | guided connect step outcome |
| `conversation_first_response_ms` | inbound event to reply sent |
| `line_reply_window_hit` | free reply window hit / missed |

GCP log-based metrics + alerts: `infra/terraform/gcp-platform/monitoring-commerce.tf`.  
Named owner: Terraform `var.alarm_email`.

## Checkout success %

In Logs Explorer / Monitoring:

```
success ≈ count(checkout_result outcome=ready)
/ count(checkout_result)
```

over a rolling 1h window. Target for staging soak: document observed rate in phase12 validation.

## Root Voice rate limits

Durable distributed RL is **not** required for G6d. Signed ops constraint: single-instance only — see repo root `DEPLOYMENT.md` § “Ops constraint: rate limits”. SaaS Voice uses platform emergency_stop separately.

## Kill switch

See `docs/runbooks/sellable-kill-switch.md`. Rehearse once in staging before G7.
