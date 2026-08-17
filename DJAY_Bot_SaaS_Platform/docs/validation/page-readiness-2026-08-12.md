# DJAY Bot page readiness — 2026-08-12

This ledger covers all 41 user-facing Next.js pages in the public, tenant, and
Platform realms. “Local done” means the route is implemented, type-checked,
unit-tested where applicable, and included in a passing production build. It
does **not** mean production-sellable. Browser accessibility/responsive
acceptance and the external evidence named below remain separate gates.

Local review bases:

- Public: `http://localhost:3100`
- Tenant: `http://localhost:3101`
- Platform: `http://localhost:3102`
- API health: `http://localhost:3103/api/health/live`

## Public realm — 10 pages

| Route | Local status | Production acceptance still open |
| --- | --- | --- |
| `/` | Done | Desktop/mobile visual and axe acceptance |
| `/help` | Done | Desktop/mobile visual and support-link acceptance |
| `/templates` | Done | Desktop/mobile visual and approved offer copy |
| `/pricing` | Done | Stripe mapping, Thai tax/legal approval, sellability gate |
| `/status` | Done | Real production SLO and incident evidence |
| `/login` | Done | Unmocked identity, email, MFA, and cross-realm journey |
| `/verify-email` | Done | Unmocked email delivery and expiry/retry journey |
| `/invitations/accept` | Done | Unmocked invitation-email journey |
| `/terms` | Done | Counsel approval of the mounted versioned document |
| `/privacy` | Done | Counsel/DPA/retention approval of the mounted versioned document |

## Tenant realm — 27 pages

| Route | Local status | Production acceptance still open |
| --- | --- | --- |
| `/` | Done | Unmocked login/MFA and role redirect |
| `/invitations/accept` | Done | Unmocked email invitation journey |
| `/ownership/accept` | Done | Two-account ownership-transfer acceptance |
| `/recovery` | Done | Unmocked recovery email delivery |
| `/recovery/complete` | Done | Expired/used-token staging acceptance |
| `/workspace` | Done | Browser acceptance for every tenant role |
| `/workspace/setup` | Done | Named Thai merchant usability and live website installation |
| `/workspace/flowbot` | Done | Live widget installation and named merchant acceptance |
| `/workspace/flowbot/canvas` | Done | Desktop/mobile keyboard and visual acceptance |
| `/workspace/flowbot/connect/line` | Deferred / gated | Separate social release train; route is 404 while `SOCIAL_CHANNELS_RELEASE_ENABLED=false` |
| `/workspace/ai-chat` | Done | Approved live Thai/English AI evaluation and provider journey |
| `/workspace/voice` | Done | Live Voice provider, microphone/network, carrier, and legal evidence |
| `/workspace/test-center` | Done | Human approval references and provider-backed evidence |
| `/workspace/knowledge` | Done | Unmocked object storage, malware scan, crawl, and ingestion |
| `/workspace/inbox` | Done | Unmocked widget-to-Inbox journey and operator usability |
| `/workspace/contacts` | Done | Named merchant workflow acceptance |
| `/workspace/leads` | Done | Named merchant workflow acceptance |
| `/workspace/appointments` | Done | Unmocked Google Calendar create/update/cancel/recovery |
| `/workspace/notifications` | Done | Product/legal approval of delivery policy and unmocked email |
| `/workspace/reports` | Done | Production-volume export and Thai merchant acceptance |
| `/workspace/operations` | Done | Staff fulfillment workflow and commercial approval |
| `/workspace/settings` | Done | Browser/merchant acceptance |
| `/workspace/team` | Done | Multi-account role and invitation acceptance |
| `/workspace/usage` | Done | Stripe test Checkout/webhooks/portal, tax, invoice, and dunning |
| `/workspace/data` | Done | Counsel approval, object storage, export/erasure exercise |
| `/workspace/security` | Done | Penetration test and live MFA/session exercise |
| `/workspace/support` | Done | Unmocked email, storage/scanning, and operator SLA exercise |

## Platform realm — 4 pages

| Route | Local status | Production acceptance still open |
| --- | --- | --- |
| `/` | Done | Browser acceptance for all four Platform roles and real operational evidence |
| `/operations/[area]` | Done | Role-filtered deep-link browser acceptance and on-call exercise |
| `/operations/incidents` | Done | Incident drill, ownership handoff, and staging soak |
| `/tenants/[tenantId]` | Done | Audited Tenant 360/support-access staging exercise |

## Current aggregate state

- 40 of 41 pages are locally implemented and production-buildable.
- 1 of 41 pages is intentionally deferred and fail-closed with the social
  release train.
- 0 of 322 market-release requirements are formally accepted.
- All 6 sellable packages remain `sellable: false`.
- The current non-social release is a strong local engineering checkpoint, not
  a production-ready or sellable SaaS release.

## Remaining blockers that cannot be completed honestly from source alone

1. Authorized project-managed headless Chromium accessibility, keyboard,
   responsive, overflow, and visual acceptance at desktop/mobile breakpoints.
2. Unmocked staging journeys for email, Stripe, object storage/malware scanning,
   Google Calendar, AI, and Voice providers.
3. Counsel/privacy/DPA/retention/Voice disclosure and Thai tax approval.
4. External penetration test with critical/high findings closed.
5. Named Thai merchant usability acceptance.
6. A 48-hour staging soak and kill-switch/incident exercise.
7. Voice carrier/number/SIP/media/CDR/transfer/failover/pricing evidence.
