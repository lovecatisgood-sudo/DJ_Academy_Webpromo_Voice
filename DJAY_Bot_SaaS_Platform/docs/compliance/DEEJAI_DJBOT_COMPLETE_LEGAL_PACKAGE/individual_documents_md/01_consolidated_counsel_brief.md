# Consolidated Counsel Brief - DJBOT Platform

> **Status:** COUNSEL APPROVED BY OWNER ATTESTATION ON 15 AUGUST 2026 - EFFECTIVE ONLY WHEN RELEASE-GATED
>
> **Drafting date:** 15 August 2026
>
> **Operator:** DEEJAI LAB CO., LTD. (บริษัท ดีใจ แล็บ จำกัด), company registration number 0105569117953, operating DJAI Academy and DJBOT.
>
> **Release rule:** This document must not be published or relied upon as a production promise until the Launch Readiness Certificate confirms that every dependent control has been implemented, tested and approved. Current-state facts control over target policy until verification.

## 1. Instruction and scope

This brief requests legal approval for a B2B Thai SaaS framework. It supersedes the earlier Basic/Premium legal structure and preserves the rule that each product family requires documented approval before activation.

Covered products and uses:

- Flow Bot Starter and Advanced: deterministic website journeys, forms, lead capture and handover.
- AI Text Bot Starter and Advanced: dormant until an approved live AI provider route and release evidence are recorded.
- AI Voice Bot Starter and Advanced: dormant until an approved live Voice route, disclosure and recording controls are recorded.
- Flow Bot Starter and AI Text Bot Starter trials under the fixed approved terms; AI Voice Bot has no trial.
- Social and messaging channels: excluded from the initial release.
- Deejai marketing, partner marketing and model development, each separated from merchant-service processing.

## 2. Legal entity

The contracting entity is DEEJAI LAB CO., LTD., registration number 0105569117953, with registered office at 48/187 Soi Sukhumvit 64, Sukhumvit Road, Phra Khanong, Bangkok 10260, Thailand. DJAI Academy and DJBOT are brands. Company registry materials state that one director may sign and bind the company. Registered objectives include digital platforms, SaaS, AI/technology training, consulting, software, cloud systems and IT outsourcing.

## 3. Commercial facts

The six annual first-term/renewal prices are Flow Bot Starter THB 2,499/4,999; Flow Bot Advanced THB 4,450/8,900; AI Text Bot Starter THB 5,950/11,900; AI Text Bot Advanced THB 12,450/24,900; AI Voice Bot Starter THB 14,950/29,900; and AI Voice Bot Advanced THB 29,950/59,900. DEEJAI LAB CO., LTD. is not VAT registered, so no VAT is charged and each amount is the total contract price while that status continues. Deejai issues a lawful non-VAT receipt or payment record, not a VAT tax invoice. No unresolved overage or add-on is charged automatically.

A target maximum of three authorised website domains per bot is adopted, but the platform must enforce it before the Product Schedule becomes effective.

## 4. Role model

For a merchant enquiry, lead, merchant workspace and merchant-directed marketing, the Merchant is controller and Deejai is processor under the DPA.

For merchant accounts, billing, security, fraud prevention, Deejai marketing, partner marketing and model development, Deejai determines its own purpose and acts as controller. Independent Deejai uses are governed by the Customer Data Use Addendum and separate end-customer choices, regardless of service tier.

The following must be separate, unticked and optional:

1. Deejai marketing.
2. Marketing-partner disclosure.
3. Model development.

Partner sharing remains disabled until a named partner is approved and contracted.

## 5. Model-development rule

The package does not call conversation data anonymous. It uses **Training Conversation Data** or **Model Development Data**. Direct identifiers must be removed before dataset admission; free-text screening, child/sensitive-data exclusion, provenance, access control and consent verification are mandatory. The data remains treated as personal data unless identification is no longer reasonably possible.

## 6. Current infrastructure

The primary database is currently Neon on AWS `us-east-2` (Ohio, United States). The proposed GCP deployment declares `asia-southeast3` primary and `asia-southeast1` recovery, but it has not been applied or independently verified. Public documents must disclose US processing now and change only after verified migration.

Current hosting uses Neon and its AWS infrastructure. Stripe, Google Cloud, Resend, OpenAI Responses, Google Live and OpenAI Realtime remain intended or candidate routes until their exact production services and transfers are approved. No AI, Voice, telephony, social, analytics, Sentry, Cloudflare or marketing-partner production processing is approved.

## 7. Current retention facts

- Chat content defaults to 365 days and is then replaced by a non-content tombstone.
- Merchants can configure transcripts from 30 to 730 days.
- Voice recording is disabled and forced to zero retention.
- Privacy export access expires after seven days; the expired encrypted row is not yet physically purged.
- Contacts and leads persist until erasure or closure handling; no time-based purge is active.
- Closure, read-only export, production purge, reactivation, application-log retention and tax-record retention are not implemented as an approved automated schedule.
- Planned GCP Cloud SQL specifies 30 retained backups and seven days of transaction logs.

## 8. Target policy, subject to implementation

- Contacts/leads: 24 months after last activity.
- Voluntary cancellation: access through paid term.
- Read-only export/reactivation: 30 days after paid term.
- Production purge after that window.
- Backups expire within 30 additional days.
- Application logs: 30 days.
- Security/audit metadata: 24 months except legal/immutable evidence.
- Billing/tax: seven years.
- Legal holds: until released, then deletion resumes.

## 9. Decisions requested

The business owner attests that external Thai counsel approved the exact 15 August 2026 package, covering roles, legal bases, consent architecture, children/sensitive-data restrictions, transfers, target retention, liability, indemnity, model-development safeguards, Voice rules, DPO threshold assessment, B2B scope and non-VAT clarification. The lawyer communication is retained outside Git under internal reference `OWNER-ATTESTED-COUNSEL-APPROVAL-2026-08-15-DJBOT-LEGAL-PACKAGE`.

Each package may be approved separately. AI Text and AI Voice remain dormant until their specific gates pass. Social channels and partner sharing remain excluded from the initial release.
