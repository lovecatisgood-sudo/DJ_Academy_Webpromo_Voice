# Retention schedule — SKU1 (`flowbot_basic`)

> **Partially superseded 2026-07-27** by `DEEJAI_DJBOT_COMPLETE_LEGAL_PACKAGE`. Backups are **30
> days** after production purge, not 35. The 730-day merchant maximum below is **in dispute** —
> five package documents, two of them end-customer facing, state 30–3,650. See
> `legal-package-product-impact.md` §0 before publishing any retention text.

Decision: `SKU1-DEC-004` (accepted 2026-07-27, on external counsel's advice)
Supersedes the placeholder terms "policy days" and "operational" used in `counsel-brief-sku1.md`.

This is the single source of truth for retention. The Privacy Notice must match it verbatim, and
no period may be published here until the **Enforced** column says yes.

---

## Schedule

| Data category | Period | Enforced today | Where |
|---|---|---|---|
| Message content (chat transcripts) | **365 days** default | **Yes** | `message_days` default 365; sweep `tenancy.apply_retention_policies` (`0032_voice_outcomes_retention.sql:288-303`). Content is replaced with a `retained_tombstone` marker |
| Merchant-configurable range | **30–730 days** | **Yes** | `apps/api/app/tenant/retention-policy/route.ts` |
| Retention beyond 730 days | Enterprise only, separately reviewed | **Yes, by absence** — the self-serve API refuses it; the column still permits up to 3650 for an operator-applied arrangement | as above |
| Voice recordings | Disabled by default (`recording_days: 0`); 1–365 days if ever enabled, with consent + Thai/English disclosure + legal approval reference | **Yes** | `0073_voice_telephony_operations.sql:41-48`. Not applicable to SKU1 |
| Contacts and leads | **24 months from last activity** | **No — no sweep exists** | Gap 1 below |
| Export files (privacy job results) | **7 days** | **No — no expiry exists** | Gap 2 below |
| Application logs | **30 days** | **No — Cloud Logging not yet applied** | Gap 3 below |
| Post-cancellation export window | **30 days** read-only, then production delete | **No — no restricted read-only mode** | Gap 4 below |
| Backups | **Expire within 35 days** of production deletion | **No — no configured policy** | Gap 5 below |
| Security / audit log metadata | Retained; no message bodies | Yes, by design | `dsar-residual-list.md` |
| Erasure audit records (`privacy_lineage`, completed jobs) | Retained permanently to prove DSAR fulfilment | Yes | `dsar-residual-list.md` |
| Legal-hold data | Until the hold is cleared, then re-erased | Yes | `0080_privacy_g6c_erasure_hold.sql:4-22` |
| Billing and tax records | **Still open — counsel to specify** (expect ~5 years under the Thai Revenue Code) | n/a | |
| Support tickets | n/a — no support system in use | n/a | |

## The 65-day disclosure

Production deletion (30 days after cancellation) plus backup expiry (35 days) means personal data
can persist for up to **65 days** after a merchant closes their account. The Privacy Notice and the
erasure response must both say so. Describing deletion as immediate would be false.

## Deletion is anonymisation, not row removal

Erasure wipes message content to a tombstone and clears contact attributes, but conversation shell
rows survive for referential integrity and audit. Describe it as *irreversible erasure of content
with retention of non-identifying records*, never as "we delete everything."

---

## Implementation gaps

These are the code tasks the schedule creates. **Gaps 1, 2 and 5 are launch-blocking**: publishing
their periods before the code exists would put a false statement in the Privacy Notice.

1. **Contacts and leads sweep.** `tenancy.contacts` has no retention column and
   `apply_retention_policies` does not touch it. Needs a `contact_days` policy column, a
   last-activity timestamp to measure from, and a sweep branch — plus an integration test proving
   a contact past the period is anonymised and one inside it is not.
2. **Export-file expiry.** `privacy_jobs.result_object_ref_ciphertext` has no TTL. Needs a purge at
   7 days and deletion of the underlying object, not just the reference.
3. **Application log retention.** Set the Cloud Logging bucket to 30 days in
   `infra/terraform/gcp-platform` at apply time.
4. **Restricted read-only access mode** for the 30-day post-cancellation window. The subscription
   status machine already has `restricted`; the workspace does not yet honour it as read-only.
5. **Backup expiry policy.** `docs/runbooks/backup-restore.md` says only "according to data
   retention policy" — it must state 35 days and the automation must enforce it.
6. **Dead column.** `conversation_days` (`0007_shared_domain.sql:357`) is read by nothing. Either
   implement it or drop it, so no future reader mistakes it for enforced policy. `knowledge_days`
   is enforced as the maximum source-cleanup deadline by `0130_knowledge_source_cleanup.sql`.

Gaps 3 and 4 are not launch-blocking only because nothing is published about them until the
post-cancellation flow ships; if the Privacy Notice describes the export window, gap 4 joins the
blocking set.

---

## References

- `counsel-answers-round2.md` — the fuller answer set this schedule resolves part of
- `dsar-residual-list.md` — what erasure deliberately does not remove
- `requirements/market-release-decisions.yaml` — `SKU1-DEC-004`
