# Counsel answers — round 2 (SKU1 `flowbot_basic`)

Date: 2026-07-27
Companion to `counsel-brief-sku1.md`. Answers counsel's follow-up on product scope, hosting,
retention, and account closure.

**How to read this.** Every row is marked:

- **CODE** — verified in the codebase; the cited file is authoritative and enforced.
- **DECLARED, NOT ENFORCED** — a value exists in schema or docs but no code acts on it. Must not
  appear in the Privacy Notice as a promise.
- **DECISION NEEDED** — no answer exists. Requires an operator/counsel decision before the
  Privacy Notice or Terms can be finalised. A recommendation is given.

Nothing in this document is approved legal text.

---

## 0. Two findings counsel must see before answering anything else

### 0.1 Personal data is currently hosted in the **United States**, not Thailand

The Terraform for Google Cloud declares `asia-southeast3` (primary) and `asia-southeast1`
(recovery) — `infra/terraform/gcp-platform/variables.tf:17-25`. **That infrastructure has not been
applied.** The platform database in use today is **Neon, on AWS, in `us-east-2` (Ohio, USA)**
(verified from the platform `.env` host; value not reproduced here).

Consequences for the brief:

- The subprocessor list must include **Neon** and **Amazon Web Services**, which the draft omits.
- The answer to "are database, logs, backups and object storage in the same region?" is currently
  **no** — the database is US/AWS while logging and object storage would be GCP/Asia.
- Any Privacy Notice statement about Thai or Southeast Asian data residency would be **untrue on
  the day of publication**.

**This is a decision, not a defect:** either (a) migrate the platform database into the GCP region
before launch and describe residency accurately, or (b) publish an honest cross-border transfer
disclosure naming Neon/AWS US with the appropriate transfer mechanism. Engineering can do either.
Option (a) is the cleaner story for Thai SME buyers; option (b) is faster.

Also verify that `asia-southeast3` is generally available and carries every service used
(Cloud Run, Cloud SQL, Cloud Storage, Artifact Registry, Cloud Logging) **before** apply. It is
declared as a default, not confirmed against Google's region list.

### 0.2 Two retention periods are declared but not enforced

`tenancy.retention_policies` (`packages/db/migrations/0007_shared_domain.sql:355-364`) defines
`conversation_days` (365) and `knowledge_days` (730). **Neither column is read by any code** — the
sweep `tenancy.apply_retention_policies` uses only `message_days`
(`0032_voice_outcomes_retention.sql:288-320`). `recording_days` is read but the write path forces
it to `0` (`packages/db/src/shared-domain-store.ts:752`).

Do not state a conversation-level or knowledge-level retention period in the Privacy Notice. Say
what is enforced (message content) or have engineering implement the rest first.

---

## 1. What FlowBot Basic includes

Source of truth: `packages/catalog/src/index.ts:78-92`. Price **2,499.00 THB** first year,
**4,999.00 THB** on renewal, THB, tax-inclusive, annual billing (`SKU1-DEC-002`).

| Question | Answer | Status |
|---|---|---|
| Max bots per merchant | **1** (`active_bots: 1`) | CODE |
| Max staff accounts | **1 seat** (`seats: 1`). Additional administrators are a paid add-on at **99 THB/month each** (`additional_administrator`) | CODE |
| Max business workspaces | **1**. Additional workspace **from 299 THB/month** | CODE |
| Max website domains | **No limit is encoded.** The widget authorises by origin allowlist (`allowed_origins text[]`, `0009_flowbot_saas.sql:65`) with no cardinality bound on the FlowBot deployment table | **DECISION NEEDED** — recommend a stated limit of 3 domains per bot, enforced in code, so "one licence, unlimited sites" cannot be assumed |
| Conversation limit | **50,000 flow executions per billing period** (`allowances: { flow_execution: 50_000 }`). The overage rate is `null`, meaning excess is **refused, not billed** — service stops at the cap rather than generating a surprise invoice | CODE |
| Lead limit | **None** | CODE |
| Storage limit | **Not applicable to SKU1** — no storage-consuming feature is entitled (see file uploads below). No `storage_mb` limit is set | CODE |
| Can merchants export leads? | **Partially.** Leads are listable via the workspace (`GET /tenant/leads`) and a full **subject-data export** can be requested as a privacy job (`job_type: 'export'`, `0007_shared_domain.sql:366-380`). There is **no one-click lead CSV export**; CSV exists only for analytics | CODE + **DECISION NEEDED** (recommend: build lead CSV export before launch — merchants expect it, and its absence reads as lock-in) |
| Can merchants delete contacts and conversations? | **Yes, by erasure request, not by a delete button.** A `privacy.manage` role holder submits an erasure privacy job; it requires recent re-authentication and is rate-limited to 20 per 15 minutes (`apps/api/app/tenant/privacy-jobs/route.ts:14-33`). Erasure wipes message content, contact attributes, action payloads and social subject identifiers; the conversation shell row is retained as `retained_legal` for referential integrity. There is **no direct `DELETE` endpoint** on contacts | CODE |
| Are file uploads available? | **No.** Knowledge ingestion is not entitled on `flowbot_basic` (`knowledge.enabled` appears only on the AI plans). SKU1 merchants cannot upload files | CODE |
| Does the bot collect telephone numbers and email addresses? | **Yes.** Lead capture and forms are entitled (`flow.lead_capture: true`, `flow.forms: true`) and the widget supports `tel:` call actions. Email address, telephone number, display name and free-text message are the expected categories — see `pii-registry.md` | CODE |
| Does the bot use cookies or local storage? | **localStorage only. The widget sets no cookies.** It writes exactly one first-party entry per deployment, keyed `flowbotSessionStorageKey(deploymentKey)`, containing an **opaque session token** and nothing else (`packages/flowbot-widget/src/index.ts:96, 121, 418`). Access is wrapped in try/catch, so a merchant visitor who blocks storage still gets a working chat | CODE |
| Does Deejai Lab provide installation assistance? | **Self-serve, with optional paid setup.** `flow_starter_setup` is a professional service **from 3,900 THB**. Included support does not cover building the merchant's flow | CODE + confirm commercially |
| Is any uptime or response-time commitment promised? | **No customer-facing commitment exists, and none should be made for SKU1.** Internal SLOs are defined in `docs/runbooks/sre-slos.md` (public webhooks ≥ 99.9%, workspace ≥ 99.5% soft, FlowBot first response p95 ≤ 1.5 s) but these are **engineering objectives with no production history behind them** | **DECISION NEEDED** — recommend Terms state commercially reasonable efforts and **no SLA**, with credits explicitly excluded. Publish an SLA only after a full measurement window on real traffic |
| Support channels | **Undefined.** The plan sets `support.level: "standard"` but no channel or response target is specified anywhere | **DECISION NEEDED** — recommend **email only**, Thai business hours, stated target response next business day, no telephone. Promising chat or phone with one operator is a commitment that cannot be kept |

### Note on channels in SKU1

`flowbot_basic` includes **zero social channels** (`channel.social: false`, `social_channels: 0`) —
it is a website widget. LINE is available to this tier only by purchasing
`additional_social_channel` at **299 THB/month**, which the runtime now authorises for Basic
tenants. Messenger, Instagram and WhatsApp are **not implemented** and must not appear in any
customer-facing document.

---

## 2. Hosting and external providers

| Question | Answer | Status |
|---|---|---|
| Exact Google Cloud region | Declared **`asia-southeast3`** primary, **`asia-southeast1`** recovery (`variables.tf:17-25`). Not yet applied; availability of the region for all required services unverified | CODE, unapplied — **verify before use** |
| Google Cloud contracting entity | Not recorded anywhere in the repository | **DECISION NEEDED** — determined by the Google Cloud account's billing setup, not by engineering. Read it from the account and record it here |
| Are database, logs, backups and object storage in the same region? | **No** as things stand — the live database is Neon/AWS `us-east-2`; logs and object storage would be GCP Asia. See §0.1 | CODE |
| Is Resend definitely the transactional email provider? | **No — Resend does not appear in the codebase at all.** Email delivery is **provider-agnostic**: `EMAIL_DELIVERY_MODE=http` with a generic `EMAIL_DELIVERY_ENDPOINT` + `EMAIL_DELIVERY_API_TOKEN` (`apps/workers/src/index.ts:35, 84, 104, 144`). Production refuses to start unless HTTP delivery is configured. Templates are limited to `verify-email`, `recover-password`, `tenant-invitation`, `ownership-transfer` (`packages/notifications/src/index.ts:42`) | CODE — **DECISION NEEDED**: name the provider, then list it |
| Is any analytics provider used? | **No.** No Google Analytics, Plausible, PostHog, Segment or equivalent anywhere in the codebase. Analytics are computed in our own database | CODE |
| Is Sentry or another error-monitoring provider used? | **No.** No error-monitoring SDK is present. Errors go to Cloud Logging | CODE |
| Is Cloudflare, a CDN, or a DNS/security provider used? | **No Cloudflare and no third-party CDN in code.** Terraform provisions Google Cloud Load Balancing with serverless network endpoint groups (`main.tf:444-464`). The DNS provider for `djai.academy` is outside the repository | CODE + **DECISION NEEDED** — name the registrar/DNS host; if any proxying service terminates TLS it processes personal data and must be listed |
| Is Stripe the final billing provider? | **Yes.** Structurally committed: the catalog schema refuses `sellable: true` without a live Stripe mapping (`packages/catalog/src/index.ts:43-45`), and there is a signed-webhook billing pipeline | CODE |
| Does customer-support software receive personal data? | **No such software is in use.** Support is manual, per `docs/runbooks/customer-support-sku1.md`. If a helpdesk tool is adopted it will receive merchant identity and conversation content and must be added to the list | CODE |

### Subprocessor list — corrected

The three-name draft is incomplete. The SKU1 list should be:

| Processor | Purpose | Personal data | Region |
|---|---|---|---|
| **Neon** (on AWS) | Primary database | All tenant operational and personal data | **US `us-east-2`** — see §0.1 |
| **Amazon Web Services** | Underlying infrastructure for Neon | As above | US |
| **Google Cloud Platform** | Application hosting, logging, object storage | Application logs, exported files | `asia-southeast3` (planned) |
| **Stripe** | Checkout, invoices, portal | Merchant billing identity; card data is Stripe-hosted and never reaches us | Per Stripe DPA |
| **Transactional email provider** *(to be named)* | Verification, invitations, notices | Email address, display name | Provider-dependent |
| **LINE** *(only if the social add-on is purchased)* | Message delivery | Channel subject ID, message content | Per LINE terms |

**Not applicable to SKU1:** OpenAI or any AI vendor (`ai.enabled: false` on this plan — no
customer content is sent to a model), Meta, and any voice/telephony provider. These enter the list
when the AI and Voice products are sold, not before.

---

## 3. Retention periods

### Enforced today

| Data | Period | Basis |
|---|---|---|
| Message content (chat transcripts) | **365 days**, then replaced with a `retained_tombstone` marker rather than deleted | `message_days` default 365; sweep at `0032:288-303` |
| Voice turn transcripts | **365 days** (same `message_days` value), redacted in place | `0032:305-320` |
| Voice call recordings | **Disabled by default** (`recording_days: 0`). If ever enabled: 1–365 days, and only with consent mode, Thai and English disclosure text, and a legal approval reference (`0073_voice_telephony_operations.sql:41-48`) | CODE |

Per-tenant configurable within 30–3650 days. A merchant can therefore lengthen retention; counsel
should decide whether a **maximum** should be imposed.

### Not decided — engineering cannot answer these

| Data | Status | Recommendation |
|---|---|---|
| Leads and customer contacts | **No retention mechanism exists.** `tenancy.contacts` has no retention column and the sweep does not touch it. Contacts persist until erasure | Pick a period **and** commission the code. Suggest 24 months from last activity |
| Deleted merchant accounts | Undecided | 30 days to a hard purge after closure |
| Expired subscriptions | Undecided; the status machine has `grace_period` and `restricted` states before `cancelled` (`0006:81, 134-135`) but **no duration is configured** | See §4 |
| Security / audit logs | Retained indefinitely by design (immutable metadata, no message bodies) — per `dsar-residual-list.md` | State a number; suggest 24 months |
| Application logs | Undecided; Cloud Logging default is 30 days | Adopt 30 days explicitly |
| Backups | **Undecided — the runbook says only "according to data retention policy"** (`backup-restore.md:33`) | Suggest 35 days, which must be disclosed as the outer bound on erasure |
| Support tickets | No support system in use | Set when one is adopted |
| Billing and tax records | Undecided — this is a **legal input, not an engineering one** (Thai Revenue Code retention) | Counsel to specify; expect ~5 years |
| Export files | `privacy_jobs.result_object_ref_ciphertext` has **no expiry** | Suggest 7 days, then automatic deletion — commission the code |
| Erasure audit records | Retained indefinitely to prove DSAR fulfilment (`privacy_lineage` + completed job rows) | Confirm as permanent |
| Legal-hold data | Retained until the hold is cleared, then re-erased. Hold requires a reason of 8–500 characters and a named setter (`0080_privacy_g6c_erasure_hold.sql:4-22`) | Confirm as stated |

**"Policy days" and "operational" in the earlier brief were placeholders, not values.** Counsel is
right to reject them.

---

## 4. Deletion and account closure — all open

Nothing in this section is decided. Each needs an operator decision; the recommendation column is
engineering's proposal, chosen to be implementable and honest.

| Decision | Recommendation | Notes |
|---|---|---|
| Export window after cancellation | **30 days**, read-only workspace access | Requires a restricted-access mode; `restricted` status already exists |
| Does access end immediately or at term end? | **At the end of the paid term** for voluntary cancellation; immediately on non-payment after the dunning sequence | Annual billing makes mid-term cancellation an unusual case — decide whether refunds are offered at all |
| When is production data deleted? | At the end of the 30-day export window | |
| When do backup copies expire? | 35 days after the production delete, giving a **65-day outer bound** that must be disclosed | Deletion cannot be described as instantaneous while backups exist |
| Reactivation during a grace period? | **Yes, within the 30-day window**, data intact | Cheapest possible win-back; the state machine already supports it |
| What is retained for tax, fraud and disputes? | Billing and tax records per counsel's period; immutable audit metadata; erasure audit trail. **No message content** | |
| Can merchants delete individual contacts themselves? | **Today: yes, via an erasure request; no delete button.** Recommend adding a per-contact delete that submits the same job, so the capability is discoverable | Deletion of a contact must not be reversible from the UI |
| Is deletion permanent or anonymised? | **Anonymised in place, not row-deleted.** Message content becomes a `retained_tombstone`; contact attributes are wiped; the conversation shell survives for referential integrity. Describe it accurately as *irreversible erasure of content with retention of non-identifying records* | Claiming "we delete everything" would be false |

---

## 5. Engineering work these answers create

Independent of counsel's decisions, the answers above imply code that does not exist yet:

1. Enforce a domain limit per deployment (currently unbounded).
2. Lead CSV export in the workspace.
3. Contact and lead retention sweep (`contacts` has no retention path at all).
4. Export-file expiry for `privacy_jobs` results.
5. Either implement `conversation_days` / `knowledge_days` or remove the dead columns so no future
   reader mistakes them for enforced policy.
6. Restricted read-only access mode for the post-cancellation export window.
7. A per-contact delete affordance that submits an erasure job.

Items 3, 4 and 5 are the ones that would make a Privacy Notice statement false if published
without them. They should be treated as launch-blocking once counsel fixes the numbers.

---

## References

- `counsel-brief-sku1.md` — round 1 brief
- `pii-registry.md`, `legal-basis-matrix.md`, `dsar-residual-list.md`
- `packages/catalog/src/index.ts` — plan entitlements, allowances, limits
- `docs/runbooks/sre-slos.md` — internal objectives (not customer commitments)
- `docs/runbooks/backup-restore.md`, `docs/runbooks/legal-documents.md`
