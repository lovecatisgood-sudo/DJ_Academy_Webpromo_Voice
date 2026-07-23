# Implementation scoreboard

Last updated: 2026-07-23  
Program: Full Implementation Plan (phases 0–17)  
First SKU: `flowbot_basic` (paid-first)  
Calendar: P50 16–18w · P80 22w  
Evidence board: `docs/validation/score-evidence-9.5.md`

## Locked decisions

| Decision | Value |
|----------|--------|
| First SKU | `flowbot_basic` |
| Commercial model | paid-first (no open trial) |
| Other packages | remain `sellable: false` until separate programs |
| Platform `activatePilot` | comps / named pilots only |
| UI chrome | `en` + `th` for first-SKU surfaces (from Phase 6) |

## Owners (RACI)

| Area | Owner role |
|------|------------|
| Commerce / Stripe | Commerce |
| Onboarding wizard | Onboarding |
| Inbox / staff UX | Inbox |
| Security / abuse | Security |
| Privacy / DSAR | Privacy |
| SRE / probes / SLOs | SRE |
| RevOps / tax decision | RevOps |
| Support playbooks | Support |
| SQA / E2E | SQA |
| Root Voice hotfixes | Root Voice |

## Phase progress

| Phase | Gate | Status |
|-------|------|--------|
| 0 Program lock | G0 | **complete** |
| 1 Root Voice safety | RV-G1 | **complete** (2026-07-22) |
| 2 Abuse floor | G1b | **complete** (2026-07-22) |
| 3 Purchase intent | — | **complete** (2026-07-22) |
| 4 Paid path | G2 | **wiring complete** (Stripe dry-run evidence open until test mapping) |
| 5–8 Product UX + harden | G3–G5 | Phase 5–8 **complete** (G3–G5) |
| 9 E2E + pen-test | G6+G6b | **scaffolds complete** (staging green + Crit/High disposition open) |
| 10 Privacy | G6c | **engineering complete** (counsel notice/residual sign-off open) |
| 11 Commercial | G6e | **decisions + EXP-008 copy complete** (Stripe `live_ready` evidence open) |
| 12 Reliability | G6d | **scaffolds complete** (staging apply + kill-switch drill evidence open) |
| 13 Sellable | G7 | **ready-to-flip package** (flip BLOCKED until G6/G6b/G6c/G6e PASS markers) |
| 14 Certify ≥9.5 | G8 | **evidence scaffold** (certification BLOCKED until Must-Pass Pass + G7) |
| 15 Post-GA | — | **backlog published** (`docs/plans/phase15-post-ga-backlog.md`) |
| 16 Soak ~9.9 | G9 | **checklist scaffold** (blocked on G7/G8) |
| 17 True 10 | G10 | **SLO shell** (blocked on G9) |

## Role rubric summary (2026-07-23)

| Cast | Status |
|------|--------|
| Cast A | Mixed Pass/Partial/Open — see `score-evidence-9.5.md` |
| Cast B | Privacy/RevOps/Support mostly Partial; SRE/a11y staging open |
| Claim “everyone ≥9.5” | **forbidden until G8 signatures** |

## Notes

- Engineering phase complete ≠ sellable ≠ certified ≥9.5.
- Do not flip `sellable: true` without Phases 9–11.
- Do not publish GA announcement until G7 + G8 sign-off.
- **Evidence track:** `docs/validation/sku1-evidence-execution.md` (Wave 0 OK; Wave 1 **BLOCKED** on Stripe/API paste-back; Wave 1.5 unit/static pen-test Pass — G6b still open).
