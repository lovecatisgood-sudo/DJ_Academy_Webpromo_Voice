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

## Recommended stack awaiting owner and acceptance approval

| Capability | Recommended provider or service | Current decision state |
|---|---|---|
| Primary cloud | AWS | Recommended; account, region, quota, cost, and privacy review pending |
| Compute | ECS Fargate plus Application Load Balancer | Recommended for the separate web/API/worker/Voice artifacts and WSS |
| Database | Amazon RDS for PostgreSQL 16 Multi-AZ | Recommended; managed PITR and restore exercise required |
| Static widget CDN | Amazon S3 plus CloudFront | Recommended; immutable artifact and origin-access validation required |
| DNS and certificates | Route 53 plus ACM | Recommended; existing registrar may remain |
| Secrets and encryption | AWS Secrets Manager plus KMS | Recommended; independent environment/purpose secrets required |
| Monitoring | CloudWatch plus CloudWatch Synthetics | Recommended; real observations and on-call alerts required |
| Transactional email | Resend | Recommended; its Bearer HTTP and idempotency-key contract fits the existing adapter |
| AI text | OpenAI Responses API through the restricted internal gateway | Recommended; exact pinned route requires Thai/English evaluation |
| Primary production Voice candidate | OpenAI Realtime API | Recommended; a new restricted adapter and full live acceptance are required |
| Existing Voice candidate | Google Gemini Live | Implemented adapter; restricted pilot/equivalent-route evaluation pending |
| Thai accounting/tax documents | FlowAccount Open API | Recommended; Thai accountant and legal approval remain authoritative |
| LINE | LINE Messaging API directly | Implemented locally; merchant/channel acceptance pending |
| WhatsApp and Messenger | Meta Cloud APIs directly | Implemented locally; business verification, policy, and merchant acceptance pending |
| Build and deployment | GitHub Actions plus Amazon ECR | Recommended; immutable target-environment deployment workflow pending |

AWS Asia Pacific (Thailand), `ap-southeast-7`, is the preferred primary-region
candidate only if the selected account exposes every required service and quota
and the privacy review accepts the topology. Singapore is the fallback and
recovery-region candidate. Cross-region RDS/backup availability must be proven
for the exact configuration rather than assumed.

## Implementation state and gaps

- The current Voice provider adapter implements the Gemini Live WebSocket
  contract. An OpenAI Realtime adapter is not yet implemented in this SaaS
  workspace.
- AI Chat calls a provider-neutral internal HTTP gateway. A production OpenAI
  Responses adapter/routing service is not yet configured or accepted.
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

1. Approve or revise the recommended non-payment providers.
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
