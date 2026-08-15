# Data Flow Map and Processing Narrative

> **Status:** COUNSEL APPROVED BY OWNER ATTESTATION ON 15 AUGUST 2026 - EFFECTIVE ONLY WHEN RELEASE-GATED
>
> **Drafting date:** 27 July 2026
>
> **Operator:** DEEJAI LAB CO., LTD. (บริษัท ดีใจ แล็บ จำกัด), company registration number 0105569117953, operating DJAI Academy and DJBOT.
>
> **Release rule:** This document must not be published or relied upon as a production promise until the Launch Readiness Certificate confirms that every dependent control has been implemented, tested and approved. Current-state facts control over target policy until verification.

## 1. Merchant service flow

1. Customer opens Merchant site.
2. Widget reads/creates opaque localStorage session token.
3. Customer submits message and optional contact details.
4. Data passes to Deejai services.
5. Operational data is stored in Neon on AWS `us-east-2`.
6. Merchant views lead/conversation.
7. Transcript content is tombstoned after configured 30-730 days.
8. Contact data remains until erasure or closure handling under current implementation.

Role: Merchant controller; Deejai processor.

## 2. Billing after commerce approval

When a package becomes sellable, the Merchant uses Stripe-hosted checkout. Stripe receives full card information. Deejai receives billing identity, subscription status and payment tokens. Deejai is controller for its billing records; Stripe may independently control its payment/compliance processing. No production charge is currently authorised.

## 3. Deejai marketing

On separate opt-in, necessary contact data and consent evidence are copied to a separate Deejai marketing dataset. Central suppression applies. Deejai controller.

## 4. Partner marketing

Disabled. When approved, only named fields and consent evidence transfer. Chat content does not. Deejai and partner are independent controllers.

## 5. Model development

On separate opt-in and Merchant-enabled setting, an eligibility event is created. Direct identifiers are removed, free text screened, prohibited records quarantined and approved dataset registered. Operational Merchant data remains separate. Deejai controller.

## 6. Social channels

Excluded from the initial release. No production customer data is sent to LINE, Meta or another social provider.

## 7. AI Text and AI Voice

The Text runtime, internal OpenAI Responses gateway, Voice WebSocket gateway and Google Live/OpenAI Realtime adapters exist in code. The current launch configuration does not provide complete live provider routes. No production data may go to an AI, Voice, telephony or speech provider until the relevant route, subprocessor and transfer controls are approved.

## 8. Export/erasure

Authorised Merchant user submits a privacy job after recent re-authentication. Export link expires after seven days. Erasure removes identifying content and retains non-identifying shells, audit and legal-hold items. Physical purge of expired export encrypted row is pending.
