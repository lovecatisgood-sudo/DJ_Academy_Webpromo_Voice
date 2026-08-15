# Model Development Governance Policy

> **Status:** COUNSEL APPROVED BY OWNER ATTESTATION ON 15 AUGUST 2026 - EFFECTIVE ONLY WHEN RELEASE-GATED
>
> **Drafting date:** 27 July 2026
>
> **Operator:** DEEJAI LAB CO., LTD. (บริษัท ดีใจ แล็บ จำกัด), company registration number 0105569117953, operating DJAI Academy and DJBOT.
>
> **Release rule:** This document must not be published or relied upon as a production promise until the Launch Readiness Certificate confirms that every dependent control has been implemented, tested and approved. Current-state facts control over target policy until verification.

## 1. Principles

Lawful, purpose-limited, minimised, secure, traceable and separated from Merchant processor data. Do not label anonymous absent documented non-identifiability.

## 2. Admission

Active consent; Merchant not disabled; direct identifiers removed; free text passes screening; no child/sensitive flag; approved purpose/retention; provenance and versions recorded.

## 3. Removal

Remove names, emails, phones, channel/account IDs, session tokens, addresses, order/reference numbers and other direct identifiers. Generalise exact time/location if unnecessary.

## 4. Screening/quarantine

Automated screening for identifiers, sensitive data, credentials, medical/financial account data, child indicators and unusual context. Failed records are restricted for max 30 days, then deleted or remediated.

## 5. Human review

Authorised, trained, confidential, logged and prohibited from re-identification. Review tools hide operational links.

## 6. Dataset approval

Every dataset has owner, purpose, source period, consent rule, screening version, retention, region, approved users and model list. Privacy Lead and technical owner approve before training.

## 7. Providers

No external provider until due diligence, DPA, region, retention, provider-training setting and transfer assessment are approved/disclosed.

## 8. Withdrawal/deletion

Remove active dataset records where reasonably possible. Snapshots/backups expire. Completed model influence may be irreversible and is disclosed.

## 9. Evaluation/release

Test leakage, memorisation, unsafe output, bias, injection and extraction. Material failures block release.

## 10. Incidents

Leakage/memorisation is a security incident; quarantine model/dataset and assess notifications.
