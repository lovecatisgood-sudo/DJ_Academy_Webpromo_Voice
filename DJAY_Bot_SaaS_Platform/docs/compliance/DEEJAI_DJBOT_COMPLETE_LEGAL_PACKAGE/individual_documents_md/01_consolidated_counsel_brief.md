# Consolidated Counsel Brief - DJBOT Platform

> **Status:** COUNSEL DRAFT - NOT EFFECTIVE UNTIL APPROVED AND RELEASE-GATED
>
> **Drafting date:** 27 July 2026
>
> **Operator:** DEEJAI LAB CO., LTD. (บริษัท ดีใจ แล็บ จำกัด), company registration number 0105569117953, operating DJAI Academy and DJBOT.
>
> **Release rule:** This document must not be published or relied upon as a production promise until the Launch Readiness Certificate confirms that every dependent control has been implemented, tested and approved. Current-state facts control over target policy until verification.

## 1. Instruction and scope

This brief requests legal approval for a modular Thai SaaS framework. It supersedes the SKU1-only brief for `flowbot_basic` but preserves the rule that each product or channel requires its own documented approval before activation.

Covered products and uses:

- FlowBot Basic: rule-based website chat and lead capture.
- FlowBot Premium: enhanced plan with no Deejai use of end-customer contact details for Deejai or partner marketing.
- AI Text Bot: dormant until an approved AI provider and release are recorded.
- Voice Bot: dormant until telephony, speech, recording and calling controls are approved.
- LINE Channel Add-on: optional and separately approved.
- Deejai marketing, partner marketing and model development, each separated from merchant-service processing.

## 2. Legal entity

The contracting entity is DEEJAI LAB CO., LTD., registration number 0105569117953, with registered office at 48/187 Soi Sukhumvit 64, Bang Chak, Phra Khanong, Bangkok, Thailand. DJAI Academy and DJBOT are brands. Company registry materials state that one director may sign and bind the company. Registered objectives include digital platforms, SaaS, AI/technology training, consulting, software, cloud systems and IT outsourcing.

## 3. FlowBot Basic commercial facts

FlowBot Basic includes one active bot, one workspace, one included administrator seat and 50,000 flow executions per annual billing period. First-year price is THB 2,499 tax-inclusive; renewal is THB 4,999 tax-inclusive per year. Excess executions are refused rather than automatically billed. Additional administrators are THB 99/month each; an additional workspace is from THB 299/month; an additional supported social channel is THB 299/month; optional starter setup is from THB 3,900.

A target maximum of three authorised website domains per bot is adopted, but the platform must enforce it before the Product Schedule becomes effective.

## 4. Role model

For a merchant enquiry, lead, merchant workspace and merchant-directed marketing, the Merchant is controller and Deejai is processor under the DPA.

For merchant accounts, billing, security, fraud prevention, Deejai marketing, partner marketing and model development, Deejai determines its own purpose and acts as controller. Basic-plan independent uses are governed by a controller-to-controller addendum and separate end-customer choices.

The following must be separate, unticked and optional:

1. Deejai marketing.
2. Marketing-partner disclosure.
3. Model development.

Partner sharing remains disabled until a named partner is approved and contracted.

## 5. Model-development rule

The package does not call conversation data anonymous. It uses **Training Conversation Data** or **Model Development Data**. Direct identifiers must be removed before dataset admission; free-text screening, child/sensitive-data exclusion, provenance, access control and consent verification are mandatory. The data remains treated as personal data unless identification is no longer reasonably possible.

## 6. Current infrastructure

The primary database is currently Neon on AWS `us-east-2` (Ohio, United States). The proposed GCP deployment declares `asia-southeast3` primary and `asia-southeast1` recovery, but it has not been applied or independently verified. Public documents must disclose US processing now and change only after verified migration.

Current/planned vendors include Neon, AWS, Google Cloud and Stripe. No production transactional-email provider is approved. No AI, telephony, Meta, analytics, Sentry, Cloudflare or marketing-partner processing is approved. LINE applies only when separately activated.

## 7. Current retention facts

- Chat content defaults to 365 days and is then replaced by a non-content tombstone.
- Merchants can configure transcripts from 30 to 3,650 days.
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

Counsel is asked to approve roles, legal bases, consent architecture, children/sensitive-data restrictions, transfers, target retention, liability, indemnity, model-development safeguards, voice rules, DPO threshold assessment and version-specific signed approval.

FlowBot Basic may be approved separately. AI, Voice, LINE and partner sharing remain dormant until their specific gates pass.
