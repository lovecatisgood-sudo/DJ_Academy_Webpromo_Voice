# Legal package → product impact

Source: `DEEJAI_DJBOT_COMPLETE_LEGAL_PACKAGE` (47 documents, counsel draft, 27 July 2026)
Assessed: 2026-07-27 against the codebase at `agent/recovery-p6-start`.

The package is written correctly for our situation: it separates **current fact** from **target
policy** and forbids presenting targets as current (`45_current_state_launch_conditions.md` §2).
That means most items below are not "the documents are wrong" — they are **product work the
documents create**, plus a small number of genuine conflicts.

Legend: **BLOCKER** = registration or publication cannot honestly go live without it.
**REQUIRED** = needed before the relevant text is published. **LATER** = tied to a dormant product.

---

## 0. One conflict to resolve first

**Transcript maximum: 730 vs 3,650.**

Counsel's interim advice (message of 27 July) said "maximum standard merchant setting: 730 days,"
and I implemented that ceiling in `apps/api/app/tenant/retention-policy/route.ts` and recorded it
as `SKU1-DEC-004`.

The full package contradicts it in four places, all stating **30–3,650 days** as the merchant range:

- `03_counsel_decision_schedule.md` CD-10 — marked **Current fact**
- `07_flowbot_basic_product_schedule.md` §7
- `21_layered_end_customer_privacy_notice.md` Layer 2, Retention
- `22_flowbot_basic_data_use_notice.md` §6
- `38_retention_deletion_standard.md` §1

Since the layered notice and the Basic data-use notice are **end-customer facing**, shipping the
730 cap would make three published documents inaccurate on day one — the precise failure mode §2
of the launch-conditions document exists to prevent.

**Resolution required from counsel — two clean options:**

1. **Revert the cap to 3,650** and keep the notices as drafted. Lowest friction; the notices are
   already consistent.
2. **Keep 730** and have counsel restate CD-10, §7, Layer 2 and §6 before approval. Tighter
   privacy posture, but it is four coordinated text edits, and the package's own version rule
   (`05` §2) makes a retention change a new-version event.

Engineering has no preference beyond wanting one answer. Until it is resolved the 730 cap stays in
code, because it is the more conservative of the two and can be widened without a data migration.

Also correct in `SKU1-DEC-004`: backups are **30 days after production purge**
(`03` CD-13, `38` §2), not the 35 I recorded from the interim advice.

---

## 1. End-customer widget — the largest gap

**Nothing in this section exists today.** The FlowBot widget renders chat only: no notice, no
merchant identity, no consent controls (`packages/flowbot-widget/src/index.ts` — the only
`notice` elements are loading/offline/handover status messages).

| # | Requirement | Source | Status |
|---|---|---|---|
| 1.1 | **Layer-1 notice inside the widget**, Thai and English, naming DEEJAI LAB CO., LTD. as platform provider and the Merchant as operator, with links to the Merchant notice and `https://djai.academy/legal/privacy` | `21` Layer 1 | **BLOCKER** — the Thai and English text is already written in `21`; it needs a home in the UI |
| 1.2 | **Merchant identity and contact displayed** in the chat surface | `44` §2 | **BLOCKER** — publication checklist item |
| 1.3 | **Do-not-submit guidance**: no passwords, OTPs, full card details, identity documents, sensitive or emergency information | `21` Layer 1, `43` §5 | **BLOCKER** |
| 1.4 | **Separate, unticked optional consent controls**, no bundling, no dark patterns, detailed-notice link beside each control, and **refusal must not block chat** | `34` §3, `22` §2 | **BLOCKER if any optional purpose is offered** — see §2 for the recommendation that avoids most of this |
| 1.5 | Human help must be available | `44` §2 | Partially met — handover exists |

Note 1.1 is a strong argument for finishing the locale work (Track B1) first: the notice is
bilingual by requirement, and the widget currently has no locale state to select on.

---

## 2. Consent subsystem — and the recommendation that removes most of it

The package defines six consent purposes (`34` §1) with **13 evidence fields** each (`34` §2:
subject identifier, tenant/deployment, purpose, status, exact text version, notice version,
timestamp, source, locale, proportionate IP/device evidence, channels, partner ID, withdrawal
time/source), immutable historical text, withdrawal at least as easy as consent, and suppression
that prevents re-import.

**What exists today:** a single column, `tenancy.contacts.consent_status`, with values
`unknown | granted | denied | withdrawn` (`0007_shared_domain.sql:6-7`). No purpose dimension, no
text version, no evidence, no withdrawal path, no suppression list, no preference centre. The
route `https://djai.academy/privacy/preferences` promised in `22` §6 **does not exist**
(`apps/public-site/app/` has `privacy` and `terms`, no `privacy/preferences`).

### Recommendation: offer only `deejai_marketing` at launch

Of the six purposes, the package already disables two and makes two dormant:

| Purpose | Package position | Recommendation |
|---|---|---|
| `merchant_marketing` | Merchant's own controller responsibility | Out of scope for us |
| `deejai_marketing` | Offered on Basic | **Build this one** |
| `partner_marketing:<id>` | "Disabled until a partner is named/contracted" (`03` CD-04) | Do not build |
| `model_development` | Offered on Basic, but requires the whole of `36` | **Do not offer at launch** — see below |
| `voice_recording` | Voice dormant; recording disabled/zero | Later |
| `voice_marketing_call` | Voice dormant | Later |

**Not offering `model_development` at launch removes an entire subsystem.** Admission requires
active consent, merchant-not-disabled, direct-identifier removal, free-text screening for
identifiers/sensitive/credentials/medical/financial/child indicators, a 30-day quarantine for
failures, a dataset register with owner/purpose/source period/screening version/retention/region/
approved users/model list, dual approval, and leakage/memorisation/bias/injection/extraction
evaluation before release (`36` §2–§9, `37`). That is a project, not a feature. Declining to offer
the control keeps documents `24`, `27`, `36` and `37` dormant and costs nothing at launch, because
we have no model-training programme running.

Taking that recommendation, the launch consent build is: **one purpose, one control, full evidence
record, withdrawal, suppression, preference centre.** Still real work, but bounded.

| # | Requirement | Status |
|---|---|---|
| 2.1 | Per-purpose consent records with the 13 evidence fields, immutable text version | **BLOCKER** — new table; `consent_status` is insufficient |
| 2.2 | Withdrawal at least as easy as consent, taking effect on future campaigns immediately | **BLOCKER** |
| 2.3 | Suppression list preventing re-import, retained 5 years | **BLOCKER** |
| 2.4 | `https://djai.academy/privacy/preferences` self-serve centre | **BLOCKER** — named in end-customer text |
| 2.5 | Consent evidence retained 5 years after withdrawal / last reliance | REQUIRED |
| 2.6 | New consent when purpose, partner, channel, data category or retention changes materially | REQUIRED — versioning rule |

---

## 3. Registration and publication controls

| # | Requirement | Source | Status |
|---|---|---|---|
| 3.1 | **DPA acceptance is mandatory at registration** — `03` CD-06 is marked **Adopted**, not proposed | `03`, `13` | **BLOCKER** — registration binds only `terms_version` and `privacy_version` (`0001_identity_tenancy.sql:113-114`). There is no DPA version, and the bundle schema has no DPA document at all |
| 3.2 | Authority-to-bind confirmation with the exact checkbox wording in `44` §1 | `44` §1 | **BLOCKER** — no such field |
| 3.3 | Acceptance record must store **IP, user agent, exact text or hash, and event ID** alongside versions | `44` §1, `05` §2 | **BLOCKER** — none of these are recorded |
| 3.4 | Legal bundle must carry an **immutable content hash**; registration fails closed on missing, unapproved, **expired** or **hash-mismatched** | `05` §2, `44` §4 | **PARTIAL** — `legalDocumentsBundleSchema` (`packages/shared/src/legal-documents.ts:25-35`) has schema/approvalStatus/approvalReference/approvedAt/terms/privacy but **no hash and no expiry**. Fail-closed on missing/unapproved/version-drift already works and is guarded by `scripts/check-legal-registration.mjs` |
| 3.5 | **Publication checklist gate** before a bot may go live: merchant identity shown, notices linked, optional controls separate, core chat works without consent, no credential/OTP/card collection, accurate prices/contact, human help | `44` §2 | **BLOCKER** — no publication gate exists |
| 3.6 | Publication blocked if the three-domain limit is not enforced | `44` §4 | **BLOCKER** — see §4.1 |

3.4 is worth doing carefully: it is the same fail-open pattern this repo keeps producing. A bundle
without a hash cannot detect tampering or drift, so the gate would pass on a modified file.

---

## 4. Product specification changes

| # | Change | Source | Status |
|---|---|---|---|
| 4.1 | **Three-domain maximum** per Basic merchant, technically enforced | `07` §2, `44` §4 | **BLOCKER** — `allowed_origins text[]` is unbounded (`0009_flowbot_saas.sql:65`). Add a limit and a negative test |
| 4.2 | Support is **email only, 09:00–18:00 ICT business days, target next business day** | `03` CD-22, `07` §5 | REQUIRED — currently only `support.level: "standard"` with no channel or hours anywhere. Put it in the catalog and the support copy |
| 4.3 | **No SLA, no service credits** | `03` CD-21, `07` §5 | REQUIRED in Terms. Matches my earlier recommendation; `docs/runbooks/sre-slos.md` stays internal |
| 4.4 | One-click lead CSV export is **explicitly not promised** until released | `07` §3 | Resolved — de-scoped from launch. Subject-data export via privacy jobs is the promised path |
| 4.5 | Acceptable-use restrictions: no emergencies, diagnosis, personalised final legal/investment advice, credential/OTP/card collection, intentional sensitive data, child-directed collection without guardian approval, automated high-impact decisions | `07` §9, `12`, `43` | REQUIRED — needs AUP acceptance plus, ideally, template/flow-editor guidance. Full technical enforcement is not implied |
| 4.6 | Regulated sectors may use FAQs, hours, appointments, human contact — **no diagnosis, prescription, eligibility decision, rejection or final professional advice** | `43` §4 | REQUIRED in AUP |
| 4.7 | Premium requires a **merchant-facing model-development disable control** | `44` §3, `46` | LATER — Premium, not SKU1 |
| 4.8 | Billing remains Stripe-hosted; no card data reaches us | `43` §5 | Already true |

---

## 5. Retention and deletion — corrected schedule

Supersedes the numbers in `retention-schedule-sku1.md` where they differ.

| Data | Package position | Enforced today |
|---|---|---|
| Chat content | Default 365; merchant 30–3,650 (**see §0 conflict**); then tombstone | Yes |
| Voice recording | Disabled, zero | Yes — `shared-domain-store.ts:752` forces 0 |
| Contacts/leads | **Current: until erasure/closure.** Target 24 months after last activity | No sweep — target only |
| Privacy export object | 7-day link **and physical purge** | Link expiry yes; **purge missing** |
| Closure → read-only → purge | Paid term, then 30-day read-only/reactivation, then purge | Not implemented |
| Backups | Within **30 days** after production purge | Unverified |
| Application logs | 30 days | Unverified |
| Security/audit | 24 months except legal/immutable | Not implemented |
| Billing/tax | **7 years** | Not implemented |
| Consent evidence | 5 years after withdrawal/last reliance | n/a — no consent store |
| Suppression | 5 years | n/a |
| Deejai marketing contact | Withdrawal, or 24 months after last engagement | n/a |
| Model quarantine / dataset / provenance | 30 days / 24 months / 7 years | n/a — recommend not offering |
| Legal hold | Until written release | Yes |

`38` §3 also constrains **how we describe deletion**: public text must state the actual method
(tombstone, identifier removal, cryptographic destruction) and **never promise immediate deletion
of everything**. That matches what the code actually does.

---

## 6. Hosting, vendors and mailboxes

| # | Requirement | Status |
|---|---|---|
| 6.1 | Disclose **Neon/AWS Ohio, USA** as the current primary database until an Asian production deployment is applied *and independently verified* | `45` §1/§4 — confirms my §0.1 finding. The disclosure text is drafted; nothing to build, but nothing may claim Thai residency |
| 6.2 | **Provision support / privacy / legal / security mailboxes** | **BLOCKER** — `privacy@djai.academy` is named in end-customer text (`21`, `22`). Publishing an address that bounces is worse than none |
| 6.3 | **Name and approve the transactional email provider** | **BLOCKER** — delivery is provider-agnostic (`EMAIL_DELIVERY_ENDPOINT`); no provider is chosen. Requires vendor due diligence per `41` |
| 6.4 | Verify the DNS/TLS provider and list it if it processes personal data | **BLOCKER** — outside the repo; if anything terminates TLS it is a subprocessor |
| 6.5 | No analytics, Sentry, Cloudflare or partner activation is approved | Already true — none are present in code. **Do not add any before due diligence** |
| 6.6 | Subprocessor list must include Neon and AWS | Confirmed against `16`; my `counsel-answers-round2.md` §2 list stands |

---

## 7. Dormant products — this confirms the SKU ladder

`05` §1 marks the **AI Text, Voice and LINE schedules as Dormant**, and `45` §3 item 13 says keep
partner, AI, Voice and LINE disabled until a specific gate. `46` lists AI/Voice/LINE as requiring
product-specific approval.

This is counsel independently arriving at the PRD's SKU ladder. It does **not** say Text Bot and
Voice Bot are excluded from the platform — both are built and both have drafted schedules ready to
activate. It says each needs its own approval gate before it is sold, which is the same structure
as the sellable flip.

One consequence worth noting: the **LINE add-on is dormant too**. If LINE is meant to be the
compelling part of the launch (PRD SKU1.1), its schedule needs to move from dormant to approved,
and that is a counsel decision to request explicitly rather than assume.

---

## 8. Recommended order

Dependency order, not a schedule.

1. **Resolve §0** — one question to counsel, unblocks the retention text.
2. **Mailboxes, email provider, DNS verification** (6.2–6.4) — no code, external lead time.
3. **Three-domain limit** (4.1) — small, and publication is blocked without it.
4. **Legal bundle hash + expiry + DPA document** (3.4, 3.1) — extends an existing, tested
   fail-closed path rather than creating a new one.
5. **Registration acceptance record** (3.2, 3.3) — checkbox wording, IP/UA/hash/event ID.
6. **Widget notice + merchant identity + do-not-submit guidance** (1.1–1.3) — needs locale first.
7. **Consent subsystem, `deejai_marketing` only** (2.1–2.4) — the largest build.
8. **Publication checklist gate** (3.5) — depends on 1, 3 and 4.1 being real.
9. **Retention jobs**: contact sweep, export-object purge, closure workflow (5).
10. **AUP acceptance and editor guidance** (4.5, 4.6).

Items 1–5 are cheap relative to their gating power. Item 7 is the one that deserves a design pass
before any code.

---

## References

- `DEEJAI_DJBOT_COMPLETE_LEGAL_PACKAGE/individual_documents_md/` — all 47 documents
- `counsel-answers-round2.md` — engineering's factual answers to counsel's round-2 questions
- `retention-schedule-sku1.md` — superseded on backups (35 → 30) and pending on §0
- `requirements/market-release-decisions.yaml` — `SKU1-DEC-004`
