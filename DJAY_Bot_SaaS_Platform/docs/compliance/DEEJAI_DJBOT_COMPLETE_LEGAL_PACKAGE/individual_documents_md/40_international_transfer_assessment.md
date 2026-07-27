# International Transfer Assessment

> **Status:** COUNSEL DRAFT - NOT EFFECTIVE UNTIL APPROVED AND RELEASE-GATED
>
> **Drafting date:** 27 July 2026
>
> **Operator:** DEEJAI LAB CO., LTD. (บริษัท ดีใจ แล็บ จำกัด), company registration number 0105569117953, operating DJAI Academy and DJBOT.
>
> **Release rule:** This document must not be published or relied upon as a production promise until the Launch Readiness Certificate confirms that every dependent control has been implemented, tested and approved. Current-state facts control over target policy until verification.

## 1. Current architecture

Primary database: Neon/AWS `us-east-2`, Ohio, USA. This is a current cross-border transfer. GCP Asia is planned, not applied/verified.

## 2. Inventory

| Recipient | Region | Data | Status/action |
|---|---|---|---|
| Neon/AWS | USA | Operational Merchant/end-customer data | Active; review DPA, subprocessors, security, government access, deletion |
| Stripe | Multiple | Merchant billing/payment metadata | Active; review transfer terms |
| Google Cloud | Planned Asia/global support | Logs/objects/future DB | Verify services, entity, support access, region |
| Email provider | Unknown | Merchant email/name | Blocked; select/assess |
| LINE | Platform regions | IDs/messages | Optional; assess |
| AI provider | Unknown | Prompts/training data | Blocked |
| Voice providers | Unknown | Phone/audio/transcripts | Blocked |
| Partner | None | Contact details | Disabled |

## 3. Controls and decision

Minimisation, encryption, access restriction, contractual terms, subprocessor transparency, deletion, incident duties and government-access assessment. Publish honest US disclosure now. Claim Asian residency only after independent verification of storage, logs, backups and support access.
