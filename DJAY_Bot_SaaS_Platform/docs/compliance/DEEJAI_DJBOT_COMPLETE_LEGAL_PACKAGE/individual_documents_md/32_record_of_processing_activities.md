# Record of Processing Activities

> **Status:** COUNSEL APPROVED BY OWNER ATTESTATION ON 15 AUGUST 2026 - EFFECTIVE ONLY WHEN RELEASE-GATED
>
> **Drafting date:** 27 July 2026
>
> **Operator:** DEEJAI LAB CO., LTD. (บริษัท ดีใจ แล็บ จำกัด), company registration number 0105569117953, operating DJAI Academy and DJBOT.
>
> **Release rule:** This document must not be published or relied upon as a production promise until the Launch Readiness Certificate confirms that every dependent control has been implemented, tested and approved. Current-state facts control over target policy until verification.

## Controller activities

| Activity | Subjects/data | Purpose/basis | Recipients | Retention |
|---|---|---|---|---|
| Merchant accounts | Owners/staff; name, email, auth, roles | Contract; security | Neon/AWS; email provider once approved | Account life + closure/legal |
| Billing | Billing contacts; invoices/subscription/token | Contract/legal obligation | Stripe, advisers as needed | Seven years |
| Trial eligibility | Account owner; normalized verified email or keyed hash of Stripe card fingerprint | Contract; legitimate interest in enforcing the published one-trial limit | Stripe for Text card setup; Neon/AWS for the claim | While the trial programme operates, then approved erasure, subject to legal hold |
| Security | Users/visitors; IP, request/device/audit | Legitimate interests/legal duties | Neon/AWS; GCP once deployed | Target audit 24 months; app logs 30 days |
| Deejai marketing | Separately opted-in customers; contact/interest/consent | Consent | Approved campaign systems | Withdrawal or 24 months last engagement; suppression five years |
| Partner marketing | No active subjects | No initial-release purpose | None | Disabled |
| Model development | Opted-in conversations after direct-identifier removal | Consent | No external AI provider | Quarantine 30 days; dataset 24 months; provenance seven years |
| Rights | Request/evidence/fulfilment | Legal obligation | Authorised staff | Seven years after closure/hold |

## Processor activities

| Service | Subjects | Processing/location | Current retention |
|---|---|---|---|
| Flow Bot | Merchant customers/prospects | Collect, host, display, export, erase; Neon/AWS US | Transcript 30-730; contacts until erasure/closure |
| Social channels | No active subjects | Excluded from initial release | Not active |
| AI Text | Future users | Runtime/gateway code exists; production provider route inactive | Not active |
| AI Voice | Future speakers | Gateway/adapters exist; production media route inactive | Recording zero; transcript policy applies only after activation |

## Review

Privacy Lead reviews quarterly and before new provider, purpose, sensitive-data use, country, channel or model dataset.
