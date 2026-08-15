# International Transfer Assessment

> **Status:** COUNSEL APPROVED BY OWNER ATTESTATION ON 15 AUGUST 2026 - EFFECTIVE ONLY WHEN RELEASE-GATED
>
> **Drafting date:** 15 August 2026
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
| Stripe | Provider regions | Merchant billing/payment metadata | Not active for authorised charges; verify Thailand contract, DPA and payment-controller role |
| Google Cloud | Planned Asia/global support | Logs/objects/future DB | Not active; verify services, entity, support access and region before transfer |
| Resend | Provider regions | Proposed Merchant email/name and transactional message | Not active; verify entity, region, retention and transfer terms |
| OpenAI | Provider regions | Proposed AI prompts, context and output | Not active; verify entity, region, retention, training controls and transfer safeguards |
| xAI | Provider regions, currently documented as US for Voice | Proposed AI prompts, context, output, audio and transcripts | Not active; verify entity, exact region, retention, training controls and transfer safeguards |
| Google Live or OpenAI Realtime | Provider regions | Proposed Voice audio, transcripts and session instructions | Not active; select one approved route and verify the same controls before transfer |
| Partner | None | Contact details | Disabled |

Social providers are excluded from the initial release and are not transfer recipients.

## 3. Controls and decision

Minimisation, encryption, access restriction, contractual terms, subprocessor transparency, deletion, incident duties and government-access assessment. Publish honest US disclosure now. Claim Asian residency only after independent verification of storage, logs, backups and support access.
