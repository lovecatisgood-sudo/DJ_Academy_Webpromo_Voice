# ADR-013: Production Provider Selection

- Status: Proposed; business direction recorded, production acceptance pending
- Date: 2026-07-17
- Phase: P9 production deployment and paid GA

## Context

Local application engineering and seven-artifact packaging are complete, but a
public deployment needs named infrastructure, payment, email, AI, Voice,
accounting, monitoring, and channel providers. Provider identity remains
restricted Platform information and must not enter tenant or public contracts.

This ADR records the 17 July 2026 owner discussion so a restart does not turn a
recommendation into an accepted production decision.

## Owner-selected direction

The business owner selected **Stripe** as the payment-provider direction.
Formal paid-GA acceptance still requires a verified Thailand business account,
provider contract and test credentials plus every unresolved commercial, VAT,
tax-invoice, price, allowance, trial, refund, dunning, retention, and
reconciliation value in ADR-008.

The intended Stripe surface is Checkout, Billing, signed webhooks, and Customer
Portal. Cards are the automatic recurring-payment baseline. PromptPay may be
offered only under its supported collection contract: Stripe documents
subscriptions and invoices as `send_invoice` collection, not automatic
subscription-mode Checkout. No production charge is authorized by this ADR.

## Owner-selected cloud direction and remaining acceptance

| Capability | Recommended provider or service | Current decision state |
|---|---|---|
| Primary cloud | Google Cloud | Owner selected; staging project is `master-deck-476811-a8`; separate production and recovery approval pending |
| Compute | Cloud Run plus external HTTPS Load Balancer | Selected topology for separate web/API/worker/Voice artifacts and WSS; staging acceptance pending |
| Database | Cloud SQL for PostgreSQL 16 | Selected instead of Neon; HA/PITR and restore exercise required |
| Static widget CDN | Cloud Storage plus Cloud CDN | Selected; immutable artifact and origin-access validation required |
| DNS and certificates | Existing Hostinger DNS plus Google-managed certificate | Selected; `djbot.djai.academy` is the target hostname and DNS remains externally owned |
| Secrets and encryption | Secret Manager plus Cloud KMS | Selected; independent environment/purpose secrets required |
| Monitoring | Cloud Monitoring, Logging and uptime checks | Selected; real observations, budget alerts and on-call alerts required |
| Transactional email | Resend | Recommended; its Bearer HTTP and idempotency-key contract fits the existing adapter |
| AI text | Owner-selected OpenAI Responses, xAI Grok, or Google Gemini through the restricted internal gateway | Multi-provider adapters implemented; the owner selects one provider and pinned model in server configuration; exact route requires Thai/English evaluation |
| Primary production Voice candidate | OpenAI Realtime API | Recommended; a new restricted adapter and full live acceptance are required |
| Existing Voice candidate | Google Gemini Live | Implemented adapter; restricted pilot/equivalent-route evaluation pending |
| Thai accounting/tax documents | FlowAccount Open API | Recommended; Thai accountant and legal approval remain authoritative |
| LINE | LINE Messaging API directly | Implemented locally; merchant/channel acceptance pending |
| WhatsApp and Messenger | Meta Cloud APIs directly | Implemented locally; business verification, policy, and merchant acceptance pending |
| Build and deployment | GitHub Actions plus Artifact Registry | Selected direction; immutable target-environment deployment workflow pending |

The GCP primary and recovery regions remain an explicit release decision. The
exact Cloud Run, Cloud SQL, load-balancing, CDN, KMS and backup capabilities,
quotas, latency, data residency and cost must be validated for the chosen
regions rather than inferred. The current project is admitted only through the
isolated `djay-master-deck` gcloud configuration and account guard.

## Implementation state and gaps

- The current Voice provider adapter implements the Gemini Live WebSocket
  contract. An OpenAI Realtime adapter is not yet implemented in this SaaS
  workspace.
- AI Chat calls a provider-neutral internal HTTP gateway. OpenAI Responses,
  xAI Grok Chat Completions, and Gemini OpenAI-compatible Chat Completions
  adapters are implemented. `AI_TEXT_PROVIDER` and the corresponding model and
  secret are restricted SaaS-owner configuration; tenant and public responses
  cannot select or reveal them. No provider/model route is production-accepted
  until its Thai/English live evaluation and privacy evidence pass.
- The generic HTTP email adapter matches Resend's request shape, Bearer
  authentication, and `Idempotency-Key` behavior; a verified sender domain and
  live delivery exercise remain required.
- Provider-neutral payment primitives and a signed webhook inbox exist. Stripe
  Checkout, Billing lifecycle mapping, customer portal, invoice/credit-note
  authority, FlowAccount synchronization, and paid reconciliation remain P9
  implementation work after ADR-008 is accepted.
- No production account, key, domain, provider contract, pricing value, tax
  policy, or production activation was supplied or authorized in this
  checkpoint.

## Required next owner actions

1. Approve the separate GCP production project, primary region and recovery topology.
2. Create organization-owned provider accounts with MFA and at least two
   administrators; never use a developer's personal ownership.
3. Decide the six-plan commercial values and complete Thai legal/accounting
   review so ADR-008 can be superseded by an Accepted commercial ADR.
4. Approve the primary and recovery regions after service, quota, cost, data
   transfer, and privacy review.
5. Put credentials only in the deployment secret manager; never in Git, chat,
   screenshots, or tickets.
6. Name primary/secondary on-call, Support, Finance, AI Operations, Security,
   Privacy, and Platform Owner personnel.
7. Select three named pilot merchants and complete the restricted acceptance
   worksheets before broad self-service.

## Source revalidation requirement

Provider availability, models, payment-method limitations, regional services,
and API policies can change. Revalidate official provider documentation and
contract terms at implementation and again at production admission. The
research snapshot used for this recommendation included official Stripe
Thailand/PromptPay, AWS region/ECS/ALB/RDS, Resend idempotency, OpenAI
Responses/Realtime, Google Gemini Live, FlowAccount Open API, LINE Messaging,
and Meta Cloud API documentation.

## Consequences

This proposed ADR preserves one-vendor infrastructure where practical, avoids
an unnecessary social-channel intermediary, and keeps provider selection behind
the existing Platform boundary. It narrows the expected P9 adapters without
authorizing spend, external account creation, deployment, payments, invoices,
or customer traffic.
