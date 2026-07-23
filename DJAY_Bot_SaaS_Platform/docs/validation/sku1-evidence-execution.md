# SKU1 evidence execution track

Date opened: 2026-07-23  
Purpose: Close G6→G10 with real evidence (not more scaffolds).  
Owner rotation: SQA → Commerce → Privacy counsel → SRE → PO

## Wave 0 — Local verification (can run offline)

Run from `DJAY_Bot_SaaS_Platform/`:

```bash
pnpm gate:sellable-flip
pnpm lint:market-release-decisions
DRY_RUN=true STRIPE_MAPPING_MODE=test \
  STRIPE_PRODUCT_REF=prod_example STRIPE_PRICE_REF=price_example \
  STRIPE_VERIFIED_AMOUNT_MINOR=249900 \
  PLATFORM_VERIFIER_USER_ID=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa \
  pnpm ops:stripe-mapping
pnpm qa:merchant-first-sku
pnpm --filter @djay/tenant-web exec vitest run lib/checkout-return-state.test.ts
# Optional with Docker: TEST_DB_PORT=55433 pnpm test:db  (privacy/commerce integration)
```

### Wave 0 results — 2026-07-23

| Check | Result |
|-------|--------|
| `gate:sellable-flip` | OK (`sellable=false`; phases 9–12 still OPEN) |
| Decision register lint | OK (13 decisions, 10 blockers) |
| Stripe mapping dry-run | OK |
| Merchant first-SKU plan mode | OK |
| EXP-008 unit tests | OK (5/5) |
| Local API `:3103/:3001/:8080/:3000` | **down** — smoke/abuse not runnable |
| DB integration (`TEST_DB_PORT=55434 ./scripts/test-db-integration.sh`) | **OK** — migrations through `0081`; privacy export/erasure Pass |
| Fix during Wave 0 | `0080` now `GRANT SELECT` on social subject tables to `djay_worker` (export was denied) |

## Wave 1 — Staging commerce (blocks G6e / G6)

Escalation packet: `docs/validation/wave1-commerce-escalation.md`  
Prereq gate: `pnpm gate:evidence-wave1`

### Wave 1 attempt — 2026-07-23

| Probe | Result |
|-------|--------|
| `.env` / staging URLs in env | **absent** (only `.env.example`) |
| Stripe CLI / test Price refs | **absent** |
| Docker daemon (local API+DB) | **unavailable** in this session |
| `pnpm gate:evidence-wave1` | **BLOCKED** (expected until Commerce paste-back) |

| # | Action | Owner | Done? |
|---|--------|-------|-------|
| 1 | Create Stripe **test** Product/Price for Flow Bot Starter (THB minor = catalogue) | Commerce | ☐ |
| 2 | `pnpm ops:stripe-mapping` with real refs (`STRIPE_MAPPING_MODE=test`) | Commerce | ☐ |
| 3 | Confirm `stripeMappingState=test_ready` for `flowbot_basic` | Commerce | ☐ |
| 4 | `API_APP_URL=… pnpm qa:smoke-negatives` | SQA | ☐ |
| 5 | `API_APP_URL=… pnpm qa:abuse-floor` | SQA | ☐ |
| 6 | `STRIPE_TEST_READY=true pnpm qa:merchant-first-sku live` + fill `p-first-sku-e2e.md` | SQA | ☐ |
| 7 | Pen-test lite Crit/High disposition | Security | ☐ |

## Wave 1.5 — Local security unit evidence (no staging)

Date: 2026-07-23  
Purpose: Advance G6b **without claiming close** while Wave 1 Commerce paste-back is missing.

| Check | Result |
|-------|--------|
| `tenant-mutation` + `g1b-abuse-floor` + `tenant-assurance` | **10+1 Pass** |
| `usage-billing` webhook verify suite | **8 Pass** |
| HTTP smoke/abuse against `:3103` | still **blocked** (API down) |
| Crit/High product findings from static review | **none opened** |
| G6b gate | remains **OPEN** (see `pen-test-lite-first-sku.md`) |

## Wave 1.6 — Chrome label polish (local UX Must-Pass)

Date: 2026-07-23

| Check | Result |
|-------|--------|
| Plan/access/role chrome no longer shows raw snake_case | **Pass** — `humanizePlanKey` / `humanizeAccessMode` / role labels on FlowBot, AI Chat, Team, Usage, Operations |
| `workspace-labels` unit tests | **Pass** |
| Wave 1 Commerce | still **BLOCKED** on paste-back |

## Wave 2 — Privacy counsel (blocks G6c)

| # | Action | Owner | Done? |
|---|--------|-------|-------|
| 1 | Mount Privacy Notice bump (subprocessors + DPA) via `LEGAL_DOCUMENTS_FILE` | Counsel | ☐ |
| 2 | Sign `docs/compliance/dsar-residual-list.md` | Counsel | ☐ |
| 3 | Accept legal-basis matrix wording | Counsel | ☐ |
| 4 | Staging log spot-check (no transcripts) | Privacy/SRE | ☐ |

## Wave 3 — SRE (blocks G6d / preferred before G7)

| # | Action | Owner | Done? |
|---|--------|-------|-------|
| 1 | `terraform apply` gcp-platform probes + `alarm_email` | SRE | ☐ |
| 2 | Curl `/health/ready` on api + workers; attach to phase12 | SRE | ☐ |
| 3 | Kill-switch dry-run table complete; `KILL_SWITCH_DRILL_UTC` | SRE | ☐ |

## Wave 4 — Flip + certify (G7 / G8)

| # | Action | Owner | Done? |
|---|--------|-------|-------|
| 1 | Live Stripe mapping `ready` | Commerce | ☐ |
| 2 | Write Phase 13 PASS markers | PO | ☐ |
| 3 | Staging soak ≥48h if required by PO | SQA | ☐ |
| 4 | `AUTHORIZE_SELLABLE_FLIP=true pnpm gate:sellable-flip` after sellable=true | Commerce | ☐ |
| 5 | Named merchant worksheet signed | Success | ☐ |
| 6 | Close `score-evidence-9.5.md` Must-Pass → PM/CTO sign | PM/CTO | ☐ |

## Wave 5 — Soak / 10 (G9 / G10)

Start clocks only after Wave 4:
- `docs/validation/phase16-soak-g9.md`
- `docs/validation/phase17-true-10-g10.md`

## Stop condition

If Wave 1 steps 1–2 are blocked on Stripe account access, escalate to Finance Owner — engineering cannot invent Price IDs.
