# Phase 10 — Privacy compliance (G6c)

Date: 2026-07-23

## Delivered (engineering)

| Item | Artifact |
|------|----------|
| PII registry | `docs/compliance/pii-registry.md` |
| Legal basis matrix (draft) | `docs/compliance/legal-basis-matrix.md` |
| Subprocessors draft for notice bump | `docs/compliance/subprocessors-draft.md` |
| Residual list for counsel | `docs/compliance/dsar-residual-list.md` |
| DSAR runbook + 30-day SLA | `docs/runbooks/dsar.md` |
| Legal hold runbook | `docs/runbooks/legal-hold.md` |
| Erasure/export extensions + legal hold | migration `0080_privacy_g6c_erasure_hold.sql`, privacy-store export fields, Data controls / Inbox signals |
| APIs | `POST .../legal-hold`, `GET /tenant/legal-holds` |

## Still open (counsel / ops)

- Privacy Notice version bump mounted via `LEGAL_DOCUMENTS_FILE` with subprocessors + DPA/transfers
- Signed residual list
- Signed legal-basis / controller-processor wording
- Spot-check of staging Cloud Logging for PII (operator evidence)
- Integration test green on DB with migration 0080 applied

## Gate posture

| Gate | Status |
|------|--------|
| G6c Privacy | **engineering package complete; counsel sign-off open** — not sufficient alone for `sellable: true` |
