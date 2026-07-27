# DPA Schedule 2 - Technical and Organisational Measures

> **Status:** COUNSEL DRAFT - NOT EFFECTIVE UNTIL APPROVED AND RELEASE-GATED
>
> **Drafting date:** 27 July 2026
>
> **Operator:** DEEJAI LAB CO., LTD. (บริษัท ดีใจ แล็บ จำกัด), company registration number 0105569117953, operating DJAI Academy and DJBOT.
>
> **Release rule:** This document must not be published or relied upon as a production promise until the Launch Readiness Certificate confirms that every dependent control has been implemented, tested and approved. Current-state facts control over target policy until verification.

## Governance/access

Assigned security/privacy responsibilities, change control, access approval, incident escalation, vendor review and legal release gates. Role-based least privilege, re-authentication for privacy jobs, access removal, tenant/workspace separation and admin logging.

## Data/application protection

Transport encryption; at-rest encryption where provided by approved host; credential/identifier protection; Stripe-hosted full-card data; logical separation of processor data from Deejai marketing/model datasets; input validation, origin allowlisting, rate limiting, secure configuration/secrets, dependency review and minimised logs.

## Availability/recovery

Backups and restoration follow verified architecture. Planned GCP Cloud SQL has 30 retained backups and seven days transaction logs, subject to deployment verification. No customer SLA without signed enterprise terms.

## Erasure/retention

Transcript tombstoning; seven-day export link; erasure of contact attributes with non-identifying shells; documented legal holds. Contact auto-retention and export-object purge are launch-gated.

## Model controls

Separate consent, direct-identifier removal, free-text screening/quarantine, child/sensitive exclusion, dataset registry/provenance/access and no use of processor data without separate controller workflow.

## Personnel/incidents/review

Confidentiality and training; incident containment/investigation/notification; review after material architecture, incidents, products or law changes.
