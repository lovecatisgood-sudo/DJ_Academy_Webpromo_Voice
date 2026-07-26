# Counsel brief — SKU1 (`flowbot_basic`) privacy & terms sign-off

**Purpose:** give external counsel everything needed to sign gate **G6c (privacy)** so that Thai-merchant registration for FlowBot Basic can open. This brief packages the engineering compliance record and proposes draft Privacy Notice + Terms text. **Nothing here is approved legal content.**

**Prepared for counsel by:** DJAI Academy (operator) + engineering.
**Date prepared:** 2026-07-24 · **First SKU:** `flowbot_basic` (FlowBot Basic, web-only at launch).
**Jurisdiction:** Thailand — Personal Data Protection Act B.E. 2562 (PDPA). Merchants and their end customers are primarily in Thailand; hosting region to be confirmed in the DPA (see §4).

> ⚠️ **STATUS: COUNSEL DRAFT — NOT APPROVED. DO NOT MOUNT.**
> Per `docs/runbooks/legal-documents.md`, registration stays fail-closed until a counsel-**approved**, versioned `djay.legal-documents.v1` bundle is mounted with `approvalStatus: "approved"` and a signed `approvalReference`. The draft in §6 must be reviewed, edited, and formally approved by counsel before it becomes that bundle. Engineering will not mount unapproved text.

---

## 1. What we need from you (decision checklist)

| # | Decision counsel must make | Feeds |
|---|----------------------------|-------|
| C1 | Confirm **controller/processor roles**: for merchant end-customer data (leads, conversations), is DJAY a **processor** and the merchant the **controller**? (Engineering assumes yes — see `legal-basis-matrix.md`.) | Privacy Notice wording; DPA |
| C2 | Approve the **legal-basis matrix** (§3) or amend each row. | Privacy Notice |
| C3 | Sign the **DSAR residual list** (§3) — the items automated erasure does *not* wipe — or require engineering follow-up before sellable. | G6c gate; `dsar-residual-list.md` |
| C4 | Confirm the **subprocessor list** (§4) and transfer posture (SCCs/adequacy per processor). | Privacy Notice subprocessor section; DPA |
| C5 | Confirm **retention periods** where the registry says "policy days" / "operational" (§3) — set concrete numbers. | Privacy Notice; product config |
| C6 | Edit + **approve the Privacy Notice + Terms draft** (§6); provide a signed approval reference and effective date. | The mounted bundle |
| C7 | Confirm whether a **merchant DPA** is offered on request vs. click-through at registration. | Registration flow; §4 |

Return C1–C7 and engineering will (a) fill the bundle exactly as approved, (b) run the promotion steps in `legal-documents.md`, and (c) mark `G6C_PASS: true` in `docs/validation/phase13-sellable-g7.md`.

---

## 2. Product facts counsel should rely on

- **What FlowBot Basic is:** a rule-based (no-AI) chat automation widget a merchant embeds on their own website. The merchant authors a question→answer flow ending in calls-to-action (e.g. "get a quote"). It captures leads and conversations for the merchant.
- **Who the data subjects are:** (a) merchant staff (registration/auth), (b) the merchant's own end customers (contacts, leads, conversation messages).
- **AI / Voice / social channels (LINE, Meta) are NOT in SKU1.** They appear in later SKUs and will each add subprocessors and a Privacy Notice version bump. The subprocessor list in §4 marks which apply now vs. later so the SKU1 notice can be scoped tightly.
- **Payments** are handled by Stripe (Stripe-hosted checkout + portal); DJAY does not store card data.
- **Data-subject rights** are served in-product: tenant "privacy jobs" run export/erasure for end-customer contacts (`tenancy.privacy_jobs`), with an immutable lineage record proving fulfilment. Merchant-staff account data is handled by separate account-delete flows.

---

## 3. Engineering compliance record (already documented — for your review/sign-off)

These four living documents are the substance of the privacy posture. This brief summarizes; **the source files are authoritative**:

1. **PII registry** — `docs/compliance/pii-registry.md`. Every store of personal data, its source, retention, whether it is exportable, and how it is erased. Note the SKU1-relevant stores are the contact/lead/conversation/message tables; Voice/social stores are listed but not active in SKU1.
2. **Legal-basis matrix** — `docs/compliance/legal-basis-matrix.md`. Proposed lawful basis per processing activity (Contract, Legal obligation, Legitimate Interest, Consent). **Counsel action C2.** The consent hook is `tenancy.contacts.consent_status`; erasure sets it to `withdrawn`.
3. **DSAR residual list** — `docs/compliance/dsar-residual-list.md`. The items automated erasure (migration `0080_privacy_g6c_erasure_hold`) does **not** wipe — knowledge-source blobs that may embed uploaded PII, audit metadata, provider-side copies, legal-hold transcripts. **Counsel must sign this (C3)** or require engineering closure before we sell.
4. **Subprocessors** — `docs/compliance/subprocessors-draft.md` (superseded by §4 below for the SKU1 scope). **Counsel action C4.**

**Retention values to set (C5):** the registry uses "policy days" for `tenancy.messages` and "operational" for several stores. Counsel/operator must choose concrete retention (e.g. conversation transcripts retained N months unless legal hold) so the Privacy Notice states a real period.

---

## 4. Subprocessor list — SKU1 scope (proposed; confirm C4)

**Active in FlowBot Basic (web-only) at launch:**

| Subprocessor | Purpose | Personal data | Region / transfer posture (confirm) |
|--------------|---------|---------------|-------------------------------------|
| Google Cloud Platform | Hosting, database, logging, object storage | Merchant + end-customer operational and personal data at rest | Choose GCP region (recommend an Asia region for Thai data residency); GCP DPA + SCCs as applicable |
| Stripe | Checkout, invoices, billing portal | Merchant billing identity + email; card data is Stripe-hosted (not stored by DJAY) | Stripe DPA / SCCs; Stripe processes outside TH — disclose transfer |
| Transactional email provider (Resend, as configured) | Email verification, invitations, notices | Merchant staff email + name | Provider DPA; discloses off-platform email copies |

**Deferred — add on the version bump when the SKU ships (NOT in SKU1 notice):**

| Subprocessor | Ships with | Note |
|--------------|-----------|------|
| AI provider (routed; e.g. OpenAI) | AI Chat / Voice SKUs | Prompts/transcripts minimized; **no provider/model names in any tenant-facing surface** (product invariant) |
| LINE | FlowBot LINE tier / AI Premium | Channel subject IDs + message text |
| Meta (Messenger / Instagram / WhatsApp) | AI Chat Premium | Channel subject IDs + message text |

**Transfers:** engineering does not write transfer language into UI copy. Counsel supplies the SCC/adequacy statement per processor for the signed bundle.

**Merchant DPA (C7):** decide whether DJAY's merchant-facing DPA is (a) offered on request and linked from the Privacy Notice, or (b) accepted click-through alongside Terms at registration. The registration flow already records versioned Terms + Privacy acceptance and can carry a DPA version too.

---

## 5. How approval becomes live (engineering will run this — no action for counsel beyond C6)

Per `docs/runbooks/legal-documents.md`:

1. Counsel returns approved Terms + Privacy text (from §6, edited) + a signed approval reference + effective date.
2. Engineering builds the `djay.legal-documents.v1` JSON: `approvalStatus: "approved"`, the `approvalReference`, distinct `terms.version` and `privacy.version` keys, sections as plain text (no HTML).
3. Validate against the schema, run the verification suite, mount read-only via `LEGAL_DOCUMENTS_FILE`, roll the API.
4. Verify `GET /public/legal/terms` and `/public/legal/privacy` return the approved versions and `/terms` + `/privacy` render at desktop + mobile.
5. Set `G6C_PASS: true` in `docs/validation/phase13-sellable-g7.md`.

Registration is **fail-closed** until step 3 completes — there is no way to accidentally ship unapproved text.

---

## 6. Proposed Privacy Notice + Terms draft (UNAPPROVED — counsel edits this)

> This is a **starting draft** to save counsel time, written in the plain-text, section/paragraph shape the bundle requires. It is **not legal advice and not approved**. Counsel must verify PDPA sufficiency, correct every claim against the product, set real retention periods, and formally approve before it is used. Bracketed `[…]` values need confirmation.

### 6a. Privacy Notice (draft) — `privacy.version` candidate: `privacy-2026-07`

**Title:** DJBOT Privacy Notice
**Effective date:** `[YYYY-MM-DD]`
**Summary:** How DJAI Academy ("DJAI", "we") handles personal data in the DJBOT FlowBot Basic service, and the rights available to merchants and their customers under Thailand's PDPA.

- **Who we are and our role.** DJAI Academy operates DJBOT. For your merchant account (your staff's name, email, login), we are the data controller. For the end-customer data your bot collects on your website (contacts, leads, conversation messages), **you the merchant are the controller and DJAI acts as your processor** under a Data Processing Agreement. `[Confirm C1.]`
- **What we collect.** Merchant account data (name, email, login credentials verifier, billing identity via Stripe). End-customer data your bot captures (display name, contact identifiers you collect, message content, lead notes). Security data (IP address, request identifiers) for protecting the service. We do not collect payment card numbers; Stripe handles payments.
- **Why we use it and our lawful basis.** To provide and secure the service and process your subscription (performance of contract); to meet legal and accounting obligations (legal obligation); to keep the service safe and prevent abuse (legitimate interest). End-customer marketing by a merchant relies on the merchant's consent or legitimate-interest basis, recorded per contact. `[Confirm against legal-basis-matrix.md, C2.]`
- **How long we keep it.** Account data for the life of the account. Conversation and lead data for `[retention period — C5]` unless you delete it sooner or a legal hold applies. On erasure we anonymize or remove personal fields and retain only records needed for audit and to prove the deletion. `[C5.]`
- **Who we share it with (subprocessors).** We use Google Cloud (hosting), Stripe (payments), and `[email provider]` (service emails). Each is bound by a data-processing agreement. A current subprocessor list is available at `[URL/section]`. `[Confirm C4; transfer statements per processor.]`
- **Where data is processed / international transfers.** `[Counsel to state hosting region and any transfers outside Thailand with the safeguard relied on — C4.]`
- **Your rights.** Under the PDPA you may request access, a copy (portability), correction, deletion, restriction, or objection, and may withdraw consent. Merchants can run export and deletion for their end-customer contacts inside the product; end customers should contact the merchant who operates the bot. To exercise rights regarding your own merchant account, contact us at `[privacy contact email]`.
- **Security.** We encrypt credentials and personal identifiers, apply least-privilege access, and monitor for abuse. No method is perfectly secure.
- **Changes.** We version this notice. Material changes require you to review and accept the new version before continuing to use the service.
- **Contact.** `[DJAI Academy legal/privacy contact + address; DPO if appointed.]`

### 6b. Terms of Service (draft) — `terms.version` candidate: `terms-2026-07`

**Title:** DJBOT Terms of Service
**Effective date:** `[YYYY-MM-DD]`
**Summary:** The agreement between DJAI Academy and a merchant using DJBOT FlowBot Basic.

- **The service.** DJBOT FlowBot Basic is a rule-based chat automation widget for your website. `[Scope, availability, no uptime guarantee beyond what you commit.]`
- **Your account.** You are responsible for your account, your staff's access, and the accuracy of your details.
- **Acceptable use.** `[Prohibited uses; you are responsible for the content of your flows and lawful handling of your customers' data.]`
- **Your customers' data.** You are the controller of the end-customer data your bot collects; DJAI processes it on your instructions under the DPA. You are responsible for having a lawful basis and your own privacy notice to your customers.
- **Fees and billing.** FlowBot Basic is `[THB price — see §7]`, billed via Stripe. `[Renewal, tax-inclusive per SKU1-DEC-002, refunds, cancellation.]`
- **Suspension and termination.** `[Grounds; effect on data; export window.]`
- **Liability and warranties.** `[Counsel — limitation of liability, disclaimers, governing law = Thailand.]`
- **Changes to terms.** Versioned; continued use after acceptance of a new version constitutes agreement.
- **Contact / governing law.** `[DJAI Academy details; Thai law; dispute venue.]`

---

## 7. Commercial note (context, not a legal question)

The catalog already encodes a first-term amount for `flowbot_basic` of **2,499.00 THB** (`packages/catalog/src/index.ts`, `commercial(249_900, …)` in minor units). Tax-inclusive per accepted decision `SKU1-DEC-002`. Terms §Fees should reflect the operator's confirmed price and renewal terms. This is an operator/finance decision, surfaced here only so the Terms fee clause is consistent.

---

## 8. References (authoritative sources)

- `docs/runbooks/legal-documents.md` — the mount contract and fail-closed behavior.
- `docs/compliance/pii-registry.md` · `legal-basis-matrix.md` · `dsar-residual-list.md` · `subprocessors-draft.md`.
- `docs/validation/phase13-sellable-g7.md` — where `G6C_PASS` is recorded.
- `docs/validation/legal-registration.md` — registration acceptance validation.
