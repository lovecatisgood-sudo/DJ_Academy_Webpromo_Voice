# Legal basis matrix — SKU1 (`flowbot_basic`)

Draft for counsel review. Last updated: 2026-07-23.

| Processing | Data | Primary basis | Notes / product wire |
|------------|------|---------------|----------------------|
| Merchant registration & auth | staff name, email, password verifier | Contract | Terms/privacy version acceptance required |
| Billing & subscriptions | billing email, Stripe customer | Contract / legal obligation | Stripe subprocessor |
| Lead + conversation handling for merchant customers | contact identities, messages | Contract (merchant is typically controller; DJAY processor) | Merchant configures bot; contact `consent_status` recorded |
| Marketing / outbound promos by merchant | contact identities | Consent or merchant LI | Contact `consent_status`; withdrawn blocks marketing use in product where enforced |
| Transcript retention | messages, voice turns | Contract / LI (support & abuse) | Tenant retention policy; automatic tombstones |
| Voice outcome summaries | summary_text | Contract / LI | Erased with contact unless legal hold |
| Security logs / rate limits | IP, request ids | LI (security) | No transcript bodies |
| Legal hold | conversation transcripts | Legal obligation / LI | Explicit admin reason; erasure skips content |
| Product improvement analytics | aggregated usage | LI | Prefer aggregates; no raw PII in analytics exports |

## Contact consent field

`tenancy.contacts.consent_status` is the product hook for consent/withdrawal. Erasure sets `withdrawn`. Enforcement of outbound messaging against withdrawn contacts is a product rule for channel senders — verify before sellable SKUs that send marketing.

## Counsel actions

1. Confirm processor vs controller wording for SKU1 merchants.
2. Approve Privacy Notice bump including this matrix summary.
3. Sign residual list for knowledge/object refs.
