# Legal Version and Deployment Manifest

> **Status:** COUNSEL APPROVED BY OWNER ATTESTATION ON 15 AUGUST 2026 - EFFECTIVE ONLY WHEN RELEASE-GATED
>
> **Drafting date:** 15 August 2026
>
> **Operator:** DEEJAI LAB CO., LTD. (บริษัท ดีใจ แล็บ จำกัด), company registration number 0105569117953, operating DJAI Academy and DJBOT.
>
> **Release rule:** This document must not be published or relied upon as a production promise until the Launch Readiness Certificate confirms that every dependent control has been implemented, tested and approved. Current-state facts control over target policy until verification.

## 1. Approved, release-gated versions

| Component | Version | Status |
|---|---|---|
| Master Terms | `terms-2026-08-approved1` | Approved; release-gated |
| Main Privacy Notice | `privacy-2026-08-approved1` | Approved; release-gated |
| Merchant DPA | `dpa-2026-08-approved1` | Approved; release-gated |
| Flow Bot Schedule | `flow-2026-08-approved1` | Approved; release-gated |
| AI Text Schedule | `ai-text-2026-08-approved1` | Approved terms; provider dormant |
| AI Voice Schedule | `ai-voice-2026-08-approved1` | Approved terms; provider dormant |
| Trial Terms Schedule | `trials-2026-08-approved1` | Approved terms; provisioning gate open |
| Social Exclusion Schedule | `social-exclusion-2026-08-approved1` | Approved exclusion |
| AUP | `aup-2026-08-approved1` | Approved; release-gated |
| Deejai Marketing Consent | `consent-deejai-marketing-2026-08-approved1` | Approved; release-gated |
| Partner Consent | `consent-partner-2026-08-approved1` | Approved text; feature disabled |
| Model Consent | `consent-model-2026-08-approved1` | Approved text; feature disabled until governance gate |

## 2. Production requirements

The bundle must contain approval status, owner-attested counsel reference, effective date, version, title and immutable content hash. Registration must fail closed if the bundle is missing, not effective for the selected package or hash-mismatched. Acceptance records must store the exact version/text or hash presented.

A new version is required for material changes to purpose, provider, region, retention, price, renewal, product function, consent or rights process.
