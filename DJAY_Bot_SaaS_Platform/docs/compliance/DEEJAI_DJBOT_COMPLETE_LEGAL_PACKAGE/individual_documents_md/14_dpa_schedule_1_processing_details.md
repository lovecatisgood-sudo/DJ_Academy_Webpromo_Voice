# DPA Schedule 1 - Processing Details

> **Status:** COUNSEL DRAFT - NOT EFFECTIVE UNTIL APPROVED AND RELEASE-GATED
>
> **Drafting date:** 27 July 2026
>
> **Operator:** DEEJAI LAB CO., LTD. (บริษัท ดีใจ แล็บ จำกัด), company registration number 0105569117953, operating DJAI Academy and DJBOT.
>
> **Release rule:** This document must not be published or relied upon as a production promise until the Launch Readiness Certificate confirms that every dependent control has been implemented, tested and approved. Current-state facts control over target policy until verification.

## Subject matter and duration

Provision of DJBOT during subscription and applicable export, closure, backup and legal-retention periods.

## Nature/purpose

Collection, validation, transmission, organisation, storage, retrieval, display, lead management, messaging, export, erasure, security monitoring, support, backup and channel delivery as instructed.

## Data subjects

Merchant customers/prospects, website/channel visitors, Merchant staff administered for Merchant, and callers when Voice is active.

## Data categories

Name/display name; email/telephone; contact preference; messages, answers and lead notes; opaque session/channel/deployment identifiers; appointment/general request data; voice audio/transcripts only if approved; knowledge sources only where an approved AI plan permits.

## Special categories

Standard plans are not designed for sensitive data. Passwords, OTPs, full card data and authentication secrets are prohibited. Planned sensitive processing requires separate approval and impact assessment.

## Current retention

- Transcripts: default 365 days, configurable 30-3,650, then tombstone.
- Contacts/leads: until erasure or closure; no time-based purge.
- Privacy download: seven days; encrypted-row physical purge pending.
- Voice recordings: disabled/zero.
- Billing/tax controller data: seven years.

## Target after verification

Contacts/leads 24 months inactivity; read-only/reactivation 30 days; production purge; backups within 30 days; app logs 30 days; security/audit 24 months except legal/immutable evidence.

## Location

Current primary database: Neon on AWS `us-east-2`, Ohio, USA. Planned GCP Asia is not active until verified.
