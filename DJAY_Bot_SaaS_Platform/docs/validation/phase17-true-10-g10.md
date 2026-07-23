# Phase 17 — True 10 (G10)

Date: 2026-07-23  
**Depends on:** G9 soak Pass  
**Horizon:** 30–90 days after soak start (PO sets window)

## Target SLOs (fill measured values)

| Signal | Target (draft) | Measured | Window |
|--------|----------------|----------|--------|
| Checkout success % (ready / attempts) | ≥ 99% excluding merchant abandons | | 30d |
| API availability (ready probe / synthetic) | ≥ 99.9% | | 30d |
| Stripe webhook apply lag p95 | ≤ 5 min | | 30d |
| MTTR Sev-1 / Sev-2 | ≤ 4h / ≤ 1d | | 90d |
| Support load (tickets / active paid tenant / week) | within PO budget | | 30d |
| Churn / cancel rate | within Finance budget | | 90d |

## External letters

| Letter | Required? | Status | Link |
|--------|-----------|--------|------|
| Security assessment / pen-test letter | as required by counsel | ☐ | |
| Privacy / DPA posture letter | as required by counsel | ☐ | |

## G10 PASS markers

```
G10_WINDOW_START_UTC:
G10_WINDOW_END_UTC:
G10_SLO_TABLE_COMPLETE: false
G10_SECURITY_LETTER: false
G10_PRIVACY_LETTER: false
G10_PO_SIGN: false
G10_CTO_SIGN: false
```

## Gate posture now

| Gate | Status |
|------|--------|
| G10 True 10 | **SLO shell only; NOT started** (blocked on G9) |

Claim “everyone ~10” only after these markers and letters are complete (`path-to-10-all-roles.md`).
