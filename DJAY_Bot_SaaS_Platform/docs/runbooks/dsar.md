# DSAR runbook (Support) — SKU1

SLA: **acknowledge within 2 business days; fulfill within 30 calendar days** (or sooner if local law requires).  
Owner: Support + Privacy  
Last updated: 2026-07-23

## Who can request

1. **Merchant workspace admin** (Tenant Master Admin) — self-serve export/erasure in **Data controls**.
2. **End customer** contacting DJAY Support about data processed in a merchant workspace — Support verifies identity, then works with the merchant admin (controller) unless DJAY is acting as controller for platform-account data.

## Merchant self-serve (preferred)

1. Confirm actor is Tenant Master Admin with recent reauth/MFA as required by API.
2. Guide to **Workspace → Data controls**.
3. **Export:** select contact (or whole workspace) → Submit → wait for `completed` → Download (7-day encrypted artifact).
4. **Erasure:** select **one** contact → confirm → wait for `completed`. Contact becomes `[erased contact]`; transcripts anonymized unless conversation is on **legal hold**.
5. Record ticket ID, job ID, and completion time.

## Legal hold

- Before erasure, check **Data controls → Legal hold** list.
- To place/clear a hold (admin API): `POST /tenant/conversations/{id}/legal-hold` with `{ "legalHold": true, "reason": "…" }` (reason ≥ 8 chars) or `{ "legalHold": false }`.
- Held conversation transcripts are **not** wiped on contact erasure; lineage records `retained_legal` with hold reason. Contact identifiers are still anonymized.

## Support-assisted path

1. Authenticate requester; never accept raw contact CSV dumps over chat.
2. If merchant cannot use UI: open time-limited support grant (existing two-person approval), execute privacy job as merchant would, attach job ID to ticket.
3. Do not paste export contents into tickets; share download link only to verified admin email.

## Denials / delays

| Situation | Response |
|-----------|----------|
| Legal hold active | Partial fulfill; explain retained transcripts; counsel if contested |
| Ambiguous identity | Request verification; pause clock with note |
| Residual knowledge objects | Follow residual list; counsel template |
| Platform-account only (no tenant contact) | Use account deletion / identity flows, not contact erasure |

## Evidence

Attach job IDs to the ticket. Gate evidence lives in `docs/validation/phase10-privacy-g6c.md`.
