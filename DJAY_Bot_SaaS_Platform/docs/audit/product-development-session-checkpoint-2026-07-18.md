# Product development session checkpoint - 2026-07-18

This is the durable restart reference for the current DJay Bots market-release session. It records decisions, planning artifacts, repository state and next actions. It contains no credential or secret value.

## 1. Product-owner instruction

The commercial offer supplied by the product owner is authoritative. Do not reduce, rename away, defer as optional, or remove an advertised feature merely because the current implementation is incomplete. Development must make the product fulfill the offer.

The offer defines six annual packages:

- Flow Bot Starter and Advanced.
- AI Text Bot Starter and Advanced.
- AI Voice Bot Starter and Advanced.

All advertised package features, exact first-year prices, regular renewals, allowances, overages, packs, add-ons, professional services, support differences and third-party exclusions are committed requirements. Packages may remain non-sellable until complete, but their scope is not removed.

## 2. Governing documents completed in this session

These documents now form the implementation authority chain:

1. Product: `docs/product/djay-bots-v1-market-release-prd.md`
2. Experience: `docs/design/djay-bots-v1-ui-ux-and-user-flows.md`
3. Architecture: `docs/architecture/djay-bots-v1-market-release-architecture.md`
4. Execution: `docs/implementation/djay-bots-v1-detailed-implementation-plan.md`
5. Requirement gate: `docs/validation/market-release-requirements.md`

Supporting audits/checkpoints:

- `docs/audit/commercial-package-feature-gap-2026-07-18.md`
- `docs/audit/deployment-session-checkpoint-2026-07-18.md`
- `docs/audit/accepted-behavior-matrix.md`

Document state at checkpoint:

- PRD: 291 unique normative requirements in 36 requirement families.
- UI/UX plan: public acquisition, unsubscribed/subscribed merchant lifecycle, onboarding and operations for every product, website/social/telephone customer experience, DJAI Platform Master and professional services.
- Architecture: domain/data/runtime/provider/GCP/security/operations design updated to implement the UX and PRD.
- Implementation plan: 50 unique work packages, dependency graph, migrations, API/events, test/evidence, rollout/rollback, package gates and first execution backlog.
- Requirement validation: deliberately blocked until the executable registry and CI gate are implemented. The document must not be treated as passing evidence.

All internal document references, code-fence parity and trailing-whitespace checks passed. No application tests were rerun for the documentation-only planning edits.

## 3. Commercial decisions preserved

### Package prices

| Package | First year | Regular annual renewal |
| --- | ---: | ---: |
| Flow Starter | THB 2,499 | THB 4,999 |
| Flow Advanced | THB 4,450 | THB 8,900 |
| AI Text Starter | THB 5,950 | THB 11,900 |
| AI Text Advanced | THB 12,450 | THB 24,900 |
| AI Voice Starter | THB 14,950 | THB 29,900 |
| AI Voice Advanced | THB 29,950 | THB 59,900 |

- Annual payment for 12 months; displayed monthly figures are comparisons, not monthly payment plans.
- First-term offer has no fixed campaign end date and may be changed prospectively only.
- Flow Starter must use the exact THB 2,500 first-term reduction so the charged total is THB 2,499.
- Existing subscriptions retain their accepted contract snapshot.
- A tenant may hold compatible Flow, AI Text and Voice contracts together; readiness and meters remain independent by family.

### Commercial operations

- The product owner has created a Stripe account. Stripe live/test product, Price, coupon, webhook, tax and Portal configuration is not yet complete.
- Do not use a static Stripe Payment Link as the subscription authority. Use authenticated server-created Checkout Sessions tied to the versioned local catalogue and signed webhook reconciliation.
- Immutable invoices/credit notes and FlowAccount synchronization remain required before paid GA.
- Overage consent, packs, forecasts, alerts and hard safety caps remain required.
- Third-party social, telephone, number and carrier charges remain separate from DJay Bots allowances.

## 4. Experience decisions preserved

- An unsubscribed verified owner receives a functional workspace and product chooser, not empty analytics or broken Studios.
- Checkout supports preserved server-side purchase intent, interrupted/expired sessions and authoritative processing/active/failure return states.
- After activation, each product has evidence-based, resumable onboarding. The browser cannot mark steps complete.
- Flow, AI Text and Voice have independent lifecycle/readiness. One can be live while another is incomplete or paused.
- Post-onboarding tenant operation includes Overview, Inbox, leads, contacts, appointments/callbacks, knowledge, channels, integrations, analytics, usage/costs, billing, team, privacy and security.
- One website should not render three competing launchers. Use one launcher with product modes/escalation or explicit inline secondary entry points.
- Flow social execution remains deterministic and consumes no normal AI reply credits.
- Social Inbox must respect provider reply windows before an operator submits a reply.
- Voice web and telephone interactions require AI/transcription disclosure, safe action confirmation, transfer/callback fallback, connected-time metering and provider-confidential errors.
- Platform Master is a separate route-based operations control plane with Tenant 360, commerce/finance/provider/recovery/support/release queues and audited sensitive access.

## 5. Architecture decisions preserved

- Continue the modular monolith plus workers and independently deployable AI/Voice gateways; do not split into unnecessary microservices.
- PostgreSQL 16 with forced RLS and least-privilege roles is the system of record.
- Use private Cloud SQL for staging/initial production, not Neon. Neon is only a possible legacy migration source.
- Providers are adapters. Local domain truth governs tenant, contracts, entitlements, usage, published revisions, finance and audit.
- OpenAI Responses must use strict Structured Outputs generated from the Sales Core schema, with refusal/incomplete/invalid-output handling.
- OpenAI Realtime remains behind the DJAI Voice gateway; browser and carrier never receive provider credentials.
- Stripe webhooks are verified against raw bytes, durably accepted, processed idempotently and reconciled.
- Usage, finance, catalogue, published configuration and audit facts are immutable/append-only or superseded explicitly.
- External actions, webhooks, Sheets, CRM, scheduling and FlowAccount use idempotency, outbox/inbox, retry/dead-letter and reconciliation.
- Website widgets use a public-safe manifest, exact origin verification and immutable CDN bundles.

## 6. Cloud/deployment state

The complete deployment state and exact resume commands are in `docs/audit/deployment-session-checkpoint-2026-07-18.md`. Critical facts:

- Correct GCP project: `master-deck-476811-a8`.
- Correct isolated gcloud configuration: `djay-master-deck`.
- Expected operator account: `cafe@siamesecat.cafe`.
- Primary region: Bangkok `asia-southeast3`.
- Recovery region: Singapore `asia-southeast1`.
- Monthly gross-usage alert: THB 670, approximately USD 20; it is not a hard cap.
- Product domain: `djbot.djai.academy`.
- Do not repoint the existing `voice.djai.academy` site.
- Hostinger remains authoritative DNS; staging uses the seven `*.staging.djbot.djai.academy` hostnames recorded in the deployment checkpoint.
- Bootstrap state, Artifact Registry, Secret Manager containers and GitHub Workload Identity foundation exist.
- Cloud SQL, platform network/KMS/widget bucket, Cloud Run services/images, load balancer, certificate and DNS records have not been created.
- No load balancer should be created manually before its Terraform/service/image/database dependencies are ready.

Before any GCP mutation, run the project guard and pass project/configuration flags explicitly. A previous read accidentally fell back to `eri.rehcm@gmail.com`; IAM denied it and no mutation occurred. Never rely on default gcloud account/configuration.

## 7. Current repository state

- Repository: `DJAY_Bot_SaaS_Platform`.
- Branch: `agent/recovery-p6-start`.
- Git HEAD at checkpoint: `1a39418` (`1a3941843476fdfce7ee7b0fa28c72602bc2a986`).
- The worktree has broad intentional uncommitted changes and new files. Do not reset, revert, checkout over, clean, or overwrite them.
- The Git HEAD does not represent the current planned/deployment content and must not be used as the image tag for this worktree.
- The legacy `../FlowBot_V1_App/` remains a protected reference and must not receive SaaS implementation changes.

Existing uncommitted implementation/deployment areas include:

- OpenAI Responses and Realtime provider work.
- AI gateway and Stripe webhook route foundations.
- Usage/billing and worker/API/Voice gateway changes.
- Docker/release-artifact changes.
- Terraform GCP bootstrap/platform foundations and GitHub workflow files.
- The new audit, PRD, UX, architecture, implementation and validation documents.

Read `git status` and affected files before editing. Work with these changes; do not assume they were generated by the next session.

## 8. Current implementation assessment

Reusable foundations exist for identity/tenancy/RLS, Flow deterministic execution, AI/Voice gateways, web widgets, social ingress, shared conversations/leads, usage ledger, Stripe adapter/webhook inbox, Platform release/recovery operations, Docker and Terraform.

Implementation has now completed the CTRL-01, CTRL-02, COM-01 and COM-02
foundations. COM-03 is locally complete and BILL-01 is in progress through schema version
`0063_customer_billing_notifications`, including exact immutable meters, forecasts,
threshold alerts, prepaid pack lots and append-only allocations, explicit
overage consent state, safety caps, a shared reservation/finalization authority,
provider-usage separation, idempotent Bangkok-anniversary period rollover and
shared included/pack/overage funding across restricted Flow, AI web/social and
Voice runtime admission and settlement, encrypted alert delivery with anomaly
cooldown, exact provider-usage correlation with two-person remediation, contract-bound
server-created Stripe Checkout, ordered signed-webhook subscription transitions,
immutable invoice/payment/refund/credit-note evidence, tenant-authorized Customer Portal sessions,
sanitized tenant financial-document presentation, independent encrypted Stripe invoice snapshots,
exact financial mismatch detection and two-person Platform Finance remediation review.
FIN-02 now also has a provider-neutral/FlowAccount transport, transactional accounting outbox,
immutable encrypted sync evidence and external references, daily missing/reference/currency/amount
reconciliation, and two-person Platform Finance remediation. Live FlowAccount dispatch remains
blocked by official credentials and accountant/legal-approved mapping.
Stripe payment, refund and credit-note evidence now also uses restricted independent retrieval,
encrypted immutable snapshots, exact reconciliation, Platform Finance attention queues and
two-person remediation review.
Stripe subscription lifecycle now also synchronizes provider billing periods and cancellation flags,
supports recent-auth tenant cancellation scheduling/revocation, retains access until actual provider
cancellation, and applies grace/restriction only through an independently approved versioned dunning
policy. No dunning policy is seeded or active by default.
Ignored Stripe lifecycle events caused by missing local authority, unsupported provider state or
an invalid transition now enter a durable restricted recovery queue. The worker retrieves the exact
provider event and stores encrypted immutable evidence; Platform Owner/Finance remediation requires
a different reviewer, and an approved retry only requeues the original signed event through the
normal ordered lifecycle authority.
Customer billing notifications now cover subscription status, payment, cancellation, refund and
credit-note events. Every event creates an immutable tenant-visible notice; owners and billing managers
can configure an encrypted recipient, Thai/English fixed templates and event categories. Restricted
delivery revalidates the active preference, retries safely and appends immutable attempt evidence.
All six plans remain non-sellable.

The product is not market-release complete. Major missing or partial areas include:

- Exact sellable catalogue/contracts/entitlements/add-ons/packs and complete enforcement.
- Upgrade proration, add-on cadence,
  disputes/resubscription, Thai tax/legal completion and live catalogue/provider configuration.
- Live FlowAccount mapping/sandbox acceptance and provider worker activation; the local outbox,
  immutable references, daily reconciliation and reviewed attention workflow are implemented.
- Flow rich content/editor/social/integrations/advanced reports.
- Real file/crawl knowledge pipeline, catalogues, strict structured AI actions, advanced customer intelligence and reports.
- Production telephony/numbers/transfers/scheduling/languages/carrier reconciliation.
- Lifecycle/onboarding/merchant/Platform UI restructuring described by the UX plan.
- Complete GCP staging/production topology, secrets, images, providers, tests and recovery evidence.

Earlier full Node verification and deployment foundation checks passed before this documentation phase, as recorded in the deployment checkpoint. That does not prove the market-release scope exists.

## 9. Exact next implementation task

Continue finance implementation in this order:

1. Add Stripe dispute evidence, restricted provider reconciliation and reviewed operations handling.
2. Complete upgrade/proration, add-on cadence and resubscription after policy approval.
3. Activate the FlowAccount sync/reconciliation workers only after sandbox credentials and the
   accountant/legal-approved versioned mapping are supplied and accepted.
4. Keep live Checkout and every plan non-sellable until Stripe live mappings,
   Thai tax/legal decisions and acceptance evidence pass.

Do not resume by creating the load balancer or Stripe products in isolation. The current development priority is the executable requirement control unless the product owner explicitly redirects it.

## 10. Open external inputs and blockers

- Stripe test/live catalogue, tax, coupon, Portal and webhook configuration.
- Thai telephony carrier selection and contract.
- First CRM provider selection.
- FlowAccount official API/sandbox and accountant-approved mapping.
- Additional Text/Voice language launch list and quality acceptance.
- Thai tax, VAT invoice, credit-note, refund, withholding and promotion/legal approval.
- Overage/pack/cap/proration/dunning/refund policy approval.
- Data retention/audio/support/MFA policy approval.
- GCP billable staging foundation approval and later production-project decision.
- Provider production accounts, reviews, quotas and credentials for OpenAI, LINE, Meta, email, telephony, CRM/Google and FlowAccount.

An unresolved external input blocks only the affected package/capability from sellability; it does not authorize removing the requirement.

## 11. Restart checklist

1. Read this checkpoint, the deployment checkpoint and `AGENTS.md`.
2. Run `git status`; do not discard existing changes.
3. Confirm the latest user instruction has not changed product priority.
4. If touching GCP, run the exact project/account guard first.
5. Open the implementation plan and begin/resume the named work package.
6. Update the 291-requirement registry and validation evidence incrementally.
7. Run focused tests during the slice and full `pnpm run verify` before claiming completion. The complete
   PostgreSQL 16 integration suite, FlowAccount and Stripe adapter tests, 98 migration invariants and full
   32-package `pnpm run verify` pass through migration `0063_customer_billing_notifications`. The full-suite
   Stripe branch includes the Platform database URL so it cannot silently skip lifecycle coverage.
8. Do not mark a package sellable or a validation gate passed without executed evidence.

## 12. Flow-to-Shared-Operations completion update

This section supersedes the older implementation assessment and next-task order above for the
product work explicitly reprioritized by the product owner. Billing activation and cloud deployment
remain deferred; the implementation sequence from Flow Bot through Shared SaaS Operations has now
been completed locally through database schema version `0076_workspace_add_on_provisioning`.

### Completed product slices

- Flow Bot rich media, cards, carousels, typed actions, LINE/Messenger deterministic transport,
  tags and attributes, connectors, advanced reports and governed plan limits.
- AI Text crawling and refresh jobs, scanned PDF/DOCX/TXT ingestion, object-storage authority,
  knowledge collections and catalogues, structured actions, confidence escalation, customer
  intelligence, routing, connectors, reports and governed limits.
- AI Voice web Realtime transport, telephony/scheduling/recording/consent data authority,
  concurrency admission, runtime failover controls, connected-minute settlement foundations and
  production-like local capacity/load validation.
- Shared SaaS Operations for administrator/workspace/bot/channel/concurrency capacity, requested
  and provisioned add-ons, subscription-aware product onboarding, tutorial progress, professional
  setup and Enterprise requests, Platform fulfillment, and tenant/Platform UX restructuring.
- Additional-workspace fulfillment creates the new tenant, owner membership, onboarding state and
  immutable provision link atomically. Requesting an add-on alone never changes entitlement.
- Branding removal is derived server-side from an Advanced entitlement or an active provisioned
  branding add-on. Public Flow, AI Text and Voice configuration cannot trust a widget-supplied flag.
- Tenant add-on and professional-service forms are hidden from read-only roles, while their status
  and setup progress remain visible. Platform fulfillment mutations remain permission- and
  recent-auth-gated and are audited.

### Shared-operations implementation authority

- Migrations: `0074_shared_saas_operations.sql`, `0075_branding_add_on_runtime.sql`,
  `0076_workspace_add_on_provisioning.sql`.
- Store and integration proof: `packages/db/src/shared-saas-operations-store.ts` and
  `shared-saas-operations-store.integration.test.ts`.
- APIs: `/tenant/operations`, `/platform/shared-operations`, `/public/voice/config`.
- Tenant UI: `/workspace/operations`, product-specific overview onboarding and team capacity.
- Platform UI: role-governed Fulfillment navigation and audited add-on/service queues.

### Executed validation

- Both `SHARED_OPS_ONLY=true TEST_DB_PORT=55433 scripts/test-db-integration.sh` and the complete
  `TEST_DB_PORT=55433 scripts/test-db-integration.sh` suite passed against PostgreSQL 16 through
  migration `0076`. They prove request/provision separation, tenant isolation, service engagement,
  branding authority and atomic additional-workspace ownership/onboarding. The full-suite run also
  proves that after an ownership transfer the provisioned workspace belongs to the source tenant's
  current active master administrator, not a stale requesting session.
- `scripts/use-node24.sh pnpm test` passed: 53/53 tasks and 11/11 market-release registry tests.
- `scripts/use-node24.sh pnpm build` passed: 32/32 packages, including the tenant operations page
  and both shared-operations API routes.
- `scripts/use-node24.sh pnpm qa:ui-foundation` passed against production-mode Next servers on
  ports 3110-3113. Coverage includes WCAG 2.2 A/AA automation, desktop/mobile overflow, keyboard
  focus, tenant role behavior, Platform fulfillment navigation, dependency failures and mutation
  recovery. An empty billing-list ARIA defect and read-only add-on form exposure were found and
  fixed during this run.
- Voice capacity drill passed 120 attempts at capacity 40: 40 admitted, 80 safely rejected, all
  admitted sessions recovered, media failures settled, shutdown drained and final active sessions 0.

### External production gates still open

- AI Text: production OpenAI credentials, live evaluation corpus acceptance and controlled
  activation. The adapter and fail-closed routing are implemented, but no live-provider claim is made.
- AI Voice: contracted Thai carrier, number provisioning, live inbound/transfer tests, carrier
  charge reconciliation, approved additional-language launch list, production OpenAI latency and
  quality evidence, and a real pilot with the approved recording/consent policy.
- Commerce: Stripe product/price/coupon/tax/Portal/webhook configuration and activation remain
  deferred by the product owner. All plans remain non-sellable.
- Deployment: GCP staging/production resources, secrets, images, DNS/load balancer and recovery
  evidence remain deferred. Local completion is not a production deployment claim.

The next implementation priority is therefore the first non-deferred external activation gate for
AI Text/Voice, or commerce/deployment when the product owner resumes either stream. Do not rebuild
the completed shared operations foundations or weaken their request/provision and RLS controls.
