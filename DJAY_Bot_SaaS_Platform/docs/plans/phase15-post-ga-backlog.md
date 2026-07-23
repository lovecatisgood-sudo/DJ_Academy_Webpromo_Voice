# Phase 15 — Post-GA hardening backlog

Status: **backlog only** (does not block G8)  
Date: 2026-07-23  
Rule: No second catalogue `sellable: true` from this backlog. Each product line starts its own Phases 3–14 program.

## Priority queue

| Pri | Workstream | Exit | Depends on | Status |
|-----|------------|------|------------|--------|
| P0 | Leads pipeline + staff contacts editor | Staff CRM Must-Pass beyond interim Inbox | G8 preferred | **not started** |
| P1 | AI Chat Basic as separate sellable program | Own G0–G14 evidence; own Stripe map | SKU1 stable in soak | **not started** |
| P1 | Voice Basic as separate sellable program | Own quality gates + TEL/provider worksheets | SKU1 stable | **not started** |
| P2 | Social channel live activation | Provider worksheets + channel review | AI/Flow social eng exists | **not started** |
| P3 | Studio polish / knowledge pinning UX | Design + a11y Pass on touched surfaces | G8 | **not started** |

## Explicit non-goals for Phase 15

- Flipping `flowbot_premium`, `ai_chat_*`, or `voice_*` sellable in the SKU1 program
- Waiving privacy/pen-test for a second SKU
- Expanding Root Voice multi-instance without durable rate limits

## How to open a second SKU program

1. New decision entry (like `SKU1-DEC-001`) for that plan key.
2. Clone FULL plan phases 3–14 with that SKU’s evidence folders.
3. Keep release dashboard row `sellable: false` until that program’s G7.

## Tracking

When work starts, add a row to `docs/plans/release-dashboard.md` and a `docs/validation/phase15-*.md` evidence note per workstream.
