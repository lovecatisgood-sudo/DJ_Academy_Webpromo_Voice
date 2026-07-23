# Phase 16 — Production soak (~9.9) — G9

Date: 2026-07-23  
**Depends on:** G7 sellable in prod + G8 certification signatures  
**Do not start the clock until those gates Pass.**

## Soak window

| Field | Value |
|-------|-------|
| Start UTC | |
| End UTC (≥14 days) | |
| Environment | production |
| SKU | `flowbot_basic` only |
| Sev-1 count | must remain **0** |

## Weekly review (copy per week)

### Week 1

| Topic | Count / notes | Playbook update? |
|-------|---------------|------------------|
| Pay → access delay | | ☐ |
| Checkout expired / Portal | | ☐ |
| Wrong origin / widget | | ☐ |
| MFA / invite | | ☐ |
| DSAR / privacy | | ☐ |
| Other | | ☐ |

Operator: _____________  Date: _____________

### Week 2

| Topic | Count / notes | Playbook update? |
|-------|---------------|------------------|
| Pay → access delay | | ☐ |
| Checkout expired / Portal | | ☐ |
| Wrong origin / widget | | ☐ |
| MFA / invite | | ☐ |
| DSAR / privacy | | ☐ |
| Other | | ☐ |

Operator: _____________  Date: _____________

## Hard rules during soak

1. No second package `sellable: true` unless a new program decision is accepted.
2. Kill switch armed (`docs/runbooks/sellable-kill-switch.md`).
3. Any Sev-1 → soak fails; restart after fix + 14 clean days (PO decision).

## G9 PASS markers

```
G9_SOAK_START_UTC:
G9_SOAK_END_UTC:
G9_SEV1_COUNT: 0
G9_SECOND_SKU_STILL_FALSE: true
G9_SUPPORT_REVIEW_COMPLETE: true
G9_PO_SIGN: false
```

## Gate posture now

| Gate | Status |
|------|--------|
| G9 ~9.9 | **checklist scaffold; soak NOT started** (blocked on G7/G8) |
