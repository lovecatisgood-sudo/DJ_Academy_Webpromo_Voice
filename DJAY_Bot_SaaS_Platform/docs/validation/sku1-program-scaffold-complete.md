# SKU1 program status — end of scaffold track

Date: 2026-07-23

## What “proceed” delivered (Phases 6–17 scaffolding)

Engineering Phases 5–8 were completed earlier. This track added:

| Phase | Gate | Delivered | Still open |
|-------|------|-----------|------------|
| 9 | G6/G6b | E2E + pen-test scripts/docs | Staging green + Crit/High |
| 10 | G6c | PII/DSAR/hold/erasure eng | Counsel Notice + residual |
| 11 | G6e | Tax/dunning + EXP-008 + mapping ops | Stripe live_ready seed |
| 12 | G6d | Ready probes, metrics, kill-switch runbook | Staging apply + drill |
| 13 | G7 | Ready-to-flip + `gate:sellable-flip` | PASS markers / sellable flip |
| 14 | G8 | `score-evidence-9.5.md` | Must-Pass Pass + signatures |
| 15 | — | Post-GA backlog | Workstreams not started |
| 16 | G9 | Soak checklist | Clock not started |
| 17 | G10 | SLO shell | Not started |

**`flowbot_basic.sellable` remains `false`.**

## Evidence track

Follow **`docs/validation/sku1-evidence-execution.md`** (Waves 0–5).

Wave 0 (2026-07-23): local gates + full DB integration through `0081` **Pass**. Staging API/Stripe still required for Wave 1.

## Commands

```bash
pnpm gate:sellable-flip
pnpm qa:merchant-first-sku
pnpm qa:smoke-negatives
pnpm qa:abuse-floor
pnpm ops:stripe-mapping   # with env from docs/runbooks/stripe-price-mapping.md
```
