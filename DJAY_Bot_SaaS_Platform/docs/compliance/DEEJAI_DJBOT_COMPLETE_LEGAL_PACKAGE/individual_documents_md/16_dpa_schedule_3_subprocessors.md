# DPA Schedule 3 - Subprocessors and External Platforms

> **Status:** COUNSEL DRAFT - NOT EFFECTIVE UNTIL APPROVED AND RELEASE-GATED
>
> **Drafting date:** 27 July 2026
>
> **Operator:** DEEJAI LAB CO., LTD. (บริษัท ดีใจ แล็บ จำกัด), company registration number 0105569117953, operating DJAI Academy and DJBOT.
>
> **Release rule:** This document must not be published or relied upon as a production promise until the Launch Readiness Certificate confirms that every dependent control has been implemented, tested and approved. Current-state facts control over target policy until verification.

## Current and planned list

| Provider | Purpose | Data | Status/region |
|---|---|---|---|
| Neon | Primary managed database | Tenant operations, contacts, leads, messages, account metadata | Active; AWS `us-east-2`, Ohio |
| Amazon Web Services | Neon infrastructure | Same data as technically necessary | Active; USA |
| Google Cloud | Planned app hosting, logging, objects, future DB/recovery | Requests, logs, exports, objects | Planned Asia regions; not applied/verified |
| Stripe | Checkout, billing, invoices, portal | Merchant identity, email, subscription/payment tokens; full cards stay with Stripe | Active when checkout used |
| Transactional email provider | Verification, recovery, invitation, notices | Merchant email/name | None approved; launch blocker |
| LINE | Optional channel | LINE identifiers and message content | Inactive unless add-on |

No AI, voice/telephony, Meta, analytics, Sentry, Cloudflare or support-platform provider is approved. Relevant features remain disabled.

Stripe and LINE may also act as independent controllers for their own purposes. Material provider changes receive reasonable notice and objection rights under the DPA.
