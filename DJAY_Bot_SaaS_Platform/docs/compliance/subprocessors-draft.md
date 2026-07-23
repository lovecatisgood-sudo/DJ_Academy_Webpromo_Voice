# Subprocessors draft (counsel)

Engineering inventory for Privacy Notice bump. **Not live legal text** — mount via signed `LEGAL_DOCUMENTS_FILE` after counsel approval.

| Processor | Purpose | Data categories | Transfer / region posture (draft) |
|-----------|---------|-----------------|-----------------------------------|
| Google Cloud Platform | Hosting, DB, logging, object storage | Tenant operational + personal data at rest | Configure region; DPA with GCP |
| Stripe | Checkout, invoices, portal | Merchant billing identity, payment method (Stripe-hosted) | Stripe DPA / SCCs as applicable |
| Transactional email provider (configured) | Verification, invites, notices | Email, name | Provider DPA |
| OpenAI (or routed AI vendor) | AI Chat / Voice when entitled | Prompts/transcripts minimized | Provider DPA; no tenant model IDs in public DTOs |
| Messaging channels (LINE / others when enabled) | Social delivery | Channel subject ids, message text | Channel terms + DPA as applicable |

## DPA posture (draft)

- Merchants: DJAY offers a DPA on request / as linked from Privacy Notice.
- Subprocessors list URL or notice section versioned with privacy document version (e.g. `privacy-2026-07` → next bump).

## Transfers

Document SCCs / adequacy for each processor in the signed bundle. Engineering must not invent transfer language in UI copy.

## Related

- `docs/runbooks/legal-documents.md`
- `docs/validation/legal-registration.md`
