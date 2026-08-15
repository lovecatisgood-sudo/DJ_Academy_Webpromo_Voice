# Consent Governance Specification

> **Status:** COUNSEL APPROVED BY OWNER ATTESTATION ON 15 AUGUST 2026 - EFFECTIVE ONLY WHEN RELEASE-GATED
>
> **Drafting date:** 27 July 2026
>
> **Operator:** DEEJAI LAB CO., LTD. (บริษัท ดีใจ แล็บ จำกัด), company registration number 0105569117953, operating DJAI Academy and DJBOT.
>
> **Release rule:** This document must not be published or relied upon as a production promise until the Launch Readiness Certificate confirms that every dependent control has been implemented, tested and approved. Current-state facts control over target policy until verification.

## 1. Purpose identifiers

- `merchant_marketing`
- `deejai_marketing`
- `partner_marketing:<partner_id>`
- `model_development`
- `voice_recording`
- `voice_marketing_call`

## 2. Evidence fields

Data-subject/pseudonymous identifier; Merchant tenant/deployment; purpose; status; exact text version; notice version; timestamp; source; locale; proportionate IP/device evidence; channels; partner ID; withdrawal time/source.

## 3. Interface rules

Unticked, separate, plain/specific, no dark patterns/bundling, refusal does not block core chat, detailed-notice link beside control.

## 4. Withdrawal

At least as easy as consent. Automated withdrawal immediately affects future campaigns/dataset eligibility. Partner withdrawals propagate without undue delay. Suppression prevents re-import.

## 5. Versioning

Material purpose, partner, channel, data-category or retention change requires new consent where prior wording is insufficient. Historical text/evidence is immutable.

## 6. Model eligibility

Requires active consent, Merchant setting enabled, no sensitive/child flag, successful identifier removal, free-text screening, dataset policy version and no withdrawal before dataset freeze.

## 7. Audit

Quarterly review of conversion, withdrawal latency, partner propagation, suppressed re-entry and dataset eligibility.
