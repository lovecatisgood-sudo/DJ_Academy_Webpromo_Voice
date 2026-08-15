# DPA Schedule 3 - Subprocessors and External Platforms

> **Status:** COUNSEL APPROVED BY OWNER ATTESTATION ON 15 AUGUST 2026 - EFFECTIVE ONLY WHEN RELEASE-GATED
>
> **Drafting date:** 15 August 2026
>
> **Operator:** DEEJAI LAB CO., LTD. (บริษัท ดีใจ แล็บ จำกัด), company registration number 0105569117953, operating DJAI Academy and DJBOT.
>
> **Release rule:** This document must not be published or relied upon as a production promise until the Launch Readiness Certificate confirms that every dependent control has been implemented, tested and approved. Current-state facts control over target policy until verification.

## 1. Current subprocessors

| Provider | Purpose | Data | Status/region |
|---|---|---|---|
| Neon | Primary managed database | Tenant operations, contacts, leads, messages, account metadata | Active; AWS `us-east-2`, Ohio |
| Amazon Web Services | Neon infrastructure | Same data as technically necessary | Active; USA |
| Stripe | Checkout and billing only after a package becomes sellable | Merchant identity, email, order and subscription status, payment token; full card data stays with Stripe | Intended; no production charge is currently authorised |

## 2. Not appointed for production

Google Cloud is the selected future infrastructure direction, Resend is the recommended transactional-email provider, and OpenAI, Google Gemini and xAI Grok are provider candidates for AI Text and/or AI Voice. Google Live and OpenAI Realtime adapters currently exist; xAI is not yet implemented. None is listed as a current production subprocessor until the contracting entity, services, data, regions, retention, training settings, transfer safeguards and live acceptance are verified.

LINE, Meta and all other social providers are excluded from the initial release. No telephony carrier, analytics, Sentry, Cloudflare, support-platform or marketing partner is approved for production processing.

## 3. Change control

Stripe may also act as an independent controller for its own payment and compliance purposes when activated. Material subprocessor changes receive reasonable prior notice and the DPA objection process. A provider candidate, adapter, environment variable or dormant interface does not appoint that provider or authorise data transfer.
