# Retention and Deletion Standard

> **Status:** COUNSEL DRAFT - NOT EFFECTIVE UNTIL APPROVED AND RELEASE-GATED
>
> **Drafting date:** 27 July 2026
>
> **Operator:** DEEJAI LAB CO., LTD. (บริษัท ดีใจ แล็บ จำกัด), company registration number 0105569117953, operating DJAI Academy and DJBOT.
>
> **Release rule:** This document must not be published or relied upon as a production promise until the Launch Readiness Certificate confirms that every dependent control has been implemented, tested and approved. Current-state facts control over target policy until verification.

## 1. Current enforceable position

| Data | Current position |
|---|---|
| Chat content | Default 365 days; Merchant configurable 30-3,650; then tombstone |
| Voice recording | Disabled; zero |
| Privacy download | Seven days; encrypted-row purge pending |
| Contacts/leads | Until erasure or closure; no time-based purge |
| Closure | No approved automated schedule; support-managed |
| Planned GCP backups | 30 retained backups; seven days transaction logs; deployment unverified |
| Current DB | Neon/AWS US; provider backup/deletion details require due diligence |

## 2. Target after implementation

| Data | Target |
|---|---|
| Contacts/leads | 24 months after last activity |
| Voluntary cancellation | Access until paid term ends |
| Read-only/reactivation | 30 days after paid term |
| Production tenant data | Purge after 30-day window |
| Backups | Within 30 days after production purge |
| Application logs | 30 days |
| Security/audit | 24 months except legal/immutable records |
| Privacy export object | Seven days then physical purge |
| Billing/tax | Seven years |
| Consent evidence | Five years after withdrawal/last reliance |
| Deejai marketing contact | Withdrawal or 24 months last engagement |
| Suppression | Five years |
| Model quarantine | 30 days |
| Training dataset | 24 months |
| Model provenance | Seven years |
| Voice transcript | Configured message period |
| Voice recording | 1-365 days only if approved; otherwise zero |
| Legal hold | Until written release then deletion resumes |

## 3. Methods

Physical removal, cryptographic destruction, tombstone replacement or removal of identifiers with non-identifying shell. Public text must describe actual method and never promise immediate deletion of everything.

## 4. Gate

Target periods are not production promises until jobs, monitoring, backup alignment and ownership are verified.
