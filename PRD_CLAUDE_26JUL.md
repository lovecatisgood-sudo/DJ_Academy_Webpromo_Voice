# DJBOT — Product Requirements Document (PRD)

**Author:** Claude (Opus 4.8) · **Date:** 26 Jul 2026 · **Status:** Proposed for owner approval
**Supersedes for planning purposes:** the framing in `Fables5_proposal_24JUL.md`; aligns with and extends Codex's `release-dashboard.md` SKU program.
**Companion:** `Implementation_Plan_CLAUDE_26JUL.md` (how to build this).

---

## 1. Purpose

This document defines *what* DJBOT is, *who* it serves, *what* it must do, and *in what order* it earns money — so that every build decision can be checked against a single source of product truth. It reconciles three things that currently disagree: the original vision bundle (`djay-bot-saas-platform-final-vision-v3/`), what Codex actually built, and the Fable5 audit. Where they conflict, this PRD decides.

The core product bet: **most SME leads don't die because they were bad — they die because nobody replied fast enough, followed up clearly enough, or remembered the context when the buyer came back.** DJBOT is the always-on sales layer that closes that gap across web, LINE, and social chat.

---

## 2. Vision & positioning

**DJBOT is one workspace where a Thai SME deploys three sales bots — a rule-based FlowBot, an AI text salesperson, and an AI voice agent — individually or together, to answer customers instantly, qualify interest, handle objections, drive a CTA, capture leads, and request appointments.**

Positioning pillars:
- **Not a customer-service chatbot — a salesperson.** The AI is designed to sell: discover pain, recommend value, handle objections without giving up, and push toward a next step — while never lying, shaming, or pushing past a refusal.
- **Built for the channel Thai buyers actually use: LINE first**, then web and Meta (Messenger/Instagram/WhatsApp).
- **Tech-dummy onboarding.** A non-technical owner connects their channels and goes live by following guided, illustrated steps — ideally by authorizing their social account, never by hunting for API keys.
- **ROI you can calculate.** Every merchant can see, in money, what the bots recovered vs. what they paid.
- **Fine, high-tech, simple.** Every screen should make an SME owner feel "this team is serious, and this will make me money."

---

## 3. Target market & users

**Primary market:** Thai SMEs with repeated inbound chat enquiries — e-commerce, service businesses, clinics, agencies, local shops — who sell through LINE OA, Facebook/Instagram, and their website, and who lose leads after hours or to slow replies. Thai-first; English fully supported.

Three personas, three jobs-to-be-done:

| Persona | Who | Their job | What DJBOT must give them |
|---|---|---|---|
| **SaaS Operator** | DJAI (you) — Platform Owner / AI Operations | Run and grow the SaaS profitably; keep it safe, compliant, and reliable | Operator console: tenants, subscriptions, usage/margin, provider routing (confidential), release/ops controls, growth analytics |
| **Merchant** | The SME subscriber's Tenant Master Admin + staff | Convert more of their own leads with less manual effort | The three bots, one inbox, leads pipeline, knowledge, booking, channel connections, and a **money-terms ROI view** |
| **End customer** | The merchant's buyer | Get a fast, helpful, human-feeling answer and act on it | A responsive bilingual widget / LINE / social chat that answers instantly and moves them to a clear next step |

---

## 4. The product

### 4.1 Three bots + one workspace

1. **FlowBot** — deterministic, rule-based. A visual Q&A/decision tree the merchant builds on a canvas, ending in CTAs (link, lead form, contact card, live chat, scheduler). No AI, no per-message model cost. **The lowest-risk, first-to-market product.**
2. **AI Chatbot (TextBot)** — the AI salesperson. Uses the merchant's approved knowledge and playbook to run a real sales conversation across web and social channels.
3. **Voice Agent (VoiceBot)** — website voice widget for spoken qualification, callbacks, transcripts, and summaries. (Later; runtime currently gated.)

All three feed one **Unified Workspace**: contacts, leads, inbox with human takeover, knowledge, booking, analytics, billing, team, and channel management.

**Product × channel matrix (normative — `CHN-014`).** Voice cannot run on LINE, Messenger, Instagram, or WhatsApp: those Messaging APIs carry text and media, not real-time voice. "Three bots across four channels" is *not* a twelve-cell matrix, and must never be scoped or marketed as one.

| | Website | LINE | Messenger | Instagram | WhatsApp | Telephony |
|---|---|---|---|---|---|---|
| **FlowBot** | ✅ | ✅ | ✅ | planned | planned | ✗ n/a |
| **AI Chatbot** | ✅ | ✅ | ✅ | planned | ✅ | ✗ n/a |
| **Voice Agent** | ✅ | ✗ n/a | ✗ n/a | ✗ n/a | ✗ n/a | planned |

### 4.2 Brand & surface strategy

- **DJBOT is the single product brand**, one public site, one funnel.
- **The existing root single-tenant app stays live** as DJAI's own working AI-agent + booking showcase and interim revenue asset. It is **not** demoted or redirected until the platform's AI Chat can fully replace its widget. Consolidation to one codebase happens then, not now.
- FlowBot V1 standalone is a **frozen reference**; all new product work happens in the multi-tenant platform.

---

## 5. Commercial model & go-to-market sequence

### 5.1 The six-plan lock (retained)

Three families, six plans, in one workspace (a tenant may hold one tier per family, up to three, but not Basic+Premium of the same family):

| Family | Basic | Premium / Advanced |
|---|---|---|
| FlowBot | `flowbot_basic` | `flowbot_premium` |
| AI Chatbot | `ai_chat_basic` (web) | `ai_chat_premium` (web + social) |
| Voice Agent | `voice_basic_gen1` | `voice_advanced_gen2` |

No seventh SKU. Large customers get **entitlement overrides on one of the six**, never a new plan. Prices are effective-dated configuration in THB, never source constants.

> **Authority (resolved 2026-07-26).** Pricing is **decided, not open**: `DJAY_Bot_SaaS_Platform/docs/product/djay-bots-v1-market-release-prd.md` §6.1 is authoritative — **annual billing only**, Flow Starter THB 2,499 first-year / 4,999 renewal, through Voice Advanced THB 29,950 / 59,900. There is no monthly payment option; the monthly figure is display-only. That document also owns display names (**Starter / Advanced**); "Basic / Premium" in this document refers to the same internal plan keys (`flowbot_basic`, `flowbot_premium`, …) and must not be used in merchant-facing copy.
>
> This document remains authoritative for **product strategy and SKU sequencing** only.

### 5.2 SKU release ladder (the money sequence)

| Order | SKU | Why it ships when it does |
|---|---|---|
| **SKU1** | **FlowBot Basic (web)** | Safest product — deterministic, no AI cost/safety/review risk. Proves the *paid machine* (signup → pay → provision → deploy → support → invoice) with the lowest risk. Engineering is "ready-to-flip"; only commercial/legal/deploy gates remain. |
| **SKU1.1** | **FlowBot + LINE + visual canvas** | Makes SKU1 actually compelling in Thailand. LINE routes already exist (packaging flip); the canvas is the core FlowBot UX and the best demo. **This is what we launch on publicly.** |
| **SKU2** | **AI Chatbot Basic (web)** | The premium engine already built; ships after behavior is validated and the paid machine is proven. |
| **SKU3** | **AI Chatbot Premium (web + Meta + LINE)** | Requires Meta OAuth + completed Meta App Review (start paperwork at SKU1). The full "AI salesperson everywhere" pitch. |
| **SKU4–5** | **Voice Basic / Advanced** | After voice quality/admission gates pass. |

### 5.3 Key commercial decision — LINE packaging (amends the original vision)

The original vision gated **all** social channels (LINE/WhatsApp/Messenger) behind AI Chat Premium. **This PRD changes that for LINE.** Rationale: a Thai SME's #1 want is "automate my LINE," FlowBot already has working LINE routes, and forcing rule-based LINE automation onto the most expensive AI tier is backwards for this market. **LINE is available to the paid FlowBot tier.**

> **Resolved 2026-07-26 — packaging model.** Social entitlement follows `CHN-004`/`CHN-005`: an eligible **Advanced** plan includes **exactly one** social channel of the merchant's choice; further channels require the `additional_social_channel` add-on. Changing the included channel requires a cooldown or operator-approved migration. LINE is *selectable as that included channel* on the paid FlowBot tier — it is not an unlimited grant.
>
> ⚠️ **Shipped code is more permissive than this model.** Migration 0082 grants unlimited social channels once `channel.social` is set, with no single-choice rule and no cooldown — an active revenue leak. Enforcement is scheduled as **P2.5** in the onboarding spec §7.1. Until it ships, do not advertise unlimited social channels.

---

## 6. Feature requirements

Requirements are marked **[Must]** (blocks the SKU it belongs to), **[Should]**, **[Later]**.

### 6.1 FlowBot (SKU1 / SKU1.1)

- **[Must]** Deterministic flow engine with versioned, immutable publish; graph validation (unreachable node, broken edge, cycle). *(Exists.)*
- **[Must]** CTA node types: link, lead form, contact card, live chat. *(Exist.)*
- **[Must — SKU1.1]** **Visual canvas builder**: nodes as typed cards on a pan/zoom canvas, drag-to-connect edges, minimap, auto-layout for imported flows. CTA nodes visually distinct so the merchant *sees* every path terminate in a CTA. Ships read-only first, then editable. This directly fulfills the owner's "highly visually clear, appealing, interactive canvas map" requirement, which no current implementation meets.
- **[Must — SKU1.1]** "**Path without CTA**" lint alongside existing validation.
- **[Should]** Simulator overlay that highlights the traversed path on the canvas during a test run.
- **[Must]** Website widget (bilingual, resilient, accessible). *(Exists.)*
- **[Must — SKU1.1]** LINE delivery for FlowBot. *(Routes exist; needs entitlement + onboarding.)*

### 6.2 AI Chatbot — the persistent salesperson (SKU2 / SKU3)

- **[Must]** 10-stage sales flow: greeting → intent → discovery → qualification → recommendation → **objection** → CTA → contact capture → appointment → close. *(Exists in `packages/sales-core`.)*
- **[Must]** Durable per-conversation **sales-fact memory** (interest, pain, budget, urgency, decision role, objection, outcome — with evidence + confidence). This is what makes it a salesperson, not a stateless FAQ. *(Exists.)*
- **[Must]** Objection handling: acknowledge → identify → answer with approved evidence → verify → offer alternative. **Persistent but never argues, shames, or pushes past refusal.** *(Exists.)*
- **[Must]** Grounding: never invents price, discount, availability, or appointments; citation validation; provider-neutral output (no "I'm an AI/model X" leakage). *(Exists.)*
- **[Must — before marketing]** **Behavioral validation**: run the evaluation suite on real Thai + English conversations. The premium pitch depends on observed quality, which is currently *unvalidated* (golden calls were never re-run). This is a hard gate on marketing the "real salesperson" claim.
- **[Should]** Cross-session persistence / nurture: the salesperson should be able to follow up when the customer leaves (re-engagement push within channel policy), not give up at tab-close. *(Not built.)*
- **[Must]** Human takeover/release from inbox; confidence-threshold auto-handover. *(Exists.)*

### 6.3 Channels & onboarding — tech-dummy friendly (SKU1.1 + SKU3)

Onboarding is a first-class product surface. A non-technical owner must be able to connect a channel and go live by following guided, illustrated, Thai-language steps.

- **[Must]** **Website widget**: one-time deploy key + copy-paste snippet + install check. *(Exists — good.)*
- **[Must — SKU1.1]** **LINE guided connect**: illustrated OA-Manager walkthrough (incl. the *permanent-provider* warning); collect **Channel ID + Secret only**; mint **stateless tokens** server-side; **auto-set and auto-test the webhook** via API with a live green check; one illustrated "Use webhook" toggle instruction on failure. (No OAuth exists for LINE in Thailand; this beats every Thai competitor's paste-3-values-and-copy-webhook flow.)
- **[Must — SKU3]** **Meta OAuth connect**: Facebook Login for Business (Messenger) → Business Login for Instagram → WhatsApp Embedded Signup v4. Merchant clicks "Connect," picks their Page/IG/WABA, done — no keys shown. Store Business-Integration-System-User tokens; post-connect scope check; token-health "Reconnect" flow; illustrated IG "Allow access to messages" step.
- **[Must — SKU3, background from SKU1]** Operator-side Meta enablement: Business Verification, App Review (screencasts + test tenant), WhatsApp Tech Provider + Access Verification, annual Data Protection Assessment. 3–6 week external lead time.
- **[Should]** Manual token paste retained as an "advanced fallback" behind a link for every social channel.

### 6.4 Booking (SKU3, with root-app engine as source)

- **[Must — SKU3]** Booking-link model with availability rules/overrides, durations, buffers, min-notice, window, max/day, require-confirmation, and a single AI booking link. *(Exists in the root app; port to platform.)*
- **[Must — SKU3]** The loop: AI `appointment.request` and FlowBot's `cta_scheduler` node → appear on the merchant's calendar → one-click confirm into a real slot → customer notified. Appointment **requests** are never shown as confirmed until a human/integration confirms (per vision).
- **[Must — SKU3]** **Notification layer both systems lack**: confirmation + reminder by **email + LINE push to the merchant** ("🔥 hot lead wants to meet — confirm?"), `.ics` attachment, customer self-serve reschedule/cancel via signed link.
- **[Must]** Fix hard-coded Bangkok timezone → use stored per-profile timezone.
- **[Later]** Google/Outlook sync, auto meeting links, month view.

### 6.5 Analytics & ROI (SKU2+ for merchant; ongoing for operator)

- **[Must — merchant]** A **money-terms ROI view**: funnel (conversations → qualified → contact captured → appointment requested → confirmed), trends, "after-hours leads rescued," objection outcomes, and a **"value recovered" tile** (leads × merchant-entered lead value vs. subscription price). All events already emitted by the Sales Core; needs a charting layer.
- **[Should — operator]** Growth analytics: activation funnel (registered → verified → channel connected → first conversation → first lead), per-tenant usage trends, upgrade-ready / churn-risk flags, MRR after billing opens.
- **[Must]** Tenants never see provider/model names or raw margin; usage shown in customer units (sessions / message credits / minutes). *(Enforced today.)*

### 6.6 Operator console (ongoing)

- **[Must]** Tenants, subscriptions, activation, usage/quota, provider routing (confidential), release-readiness gate, reconciliation/dunning/recovery, voice admission, social channel health, two-person support-access grants. *(Largely exists.)*
- **[Should]** Growth analytics (6.5).

---

## 7. Onboarding experience bar

The whole integration flow must be understandable "by one look." Concretely, the target: **a non-technical Thai SME connects website + LINE and publishes a working bot in under 15 minutes**, never leaving guided screens except where the platform (LINE/Meta) physically forces a step, and every forced step is illustrated with a screenshot/GIF and a live success check. Friction is designed out: prefer authorization over key-hunting (Meta), prefer 2 fields + automation over paste-and-configure (LINE), and always end a connection step with a green "it works" confirmation.

### 7.1 Competitive bar (verified 2026-07-26)

Zwiz.AI onboards LINE, Messenger, **and Instagram** with a consent screen and an account picker — no token handling by the merchant, no developer console visit. **Manual credential paste is therefore a competitive deficit, not a rough edge.** Onboarding parity is a requirement, not a polish item.

### 7.2 Three acquisition modes

Onboarding capability is gated by the provider's rail, not by our engineering. Design and phasing follow `DJAY_Bot_SaaS_Platform/docs/superpowers/specs/2026-07-26-omnichannel-onboarding-design.md`.

| Mode | Channels | Merchant experience | Gate |
|---|---|---|---|
| `oauth_provider` | Messenger, Instagram, WhatsApp | consent → asset picker | Meta App Review — **open rail**, a queue anyone may join |
| `partner_attach` | LINE | consent → OA picker | LINE module channel — **closed rail**, corporate application |
| `assisted_handoff` | any | one console visit; paste token; platform does the rest | none — **available today** |

**Meta self-serve is achievable by building. LINE self-serve requires LINE's approval.** Verified: the LINE Developers Console offers no self-creatable Module channel type.

`assisted_handoff` is a permanent part of the product, not a stopgap — it is the fallback whenever an agency controls the account or a rail is unavailable. For LINE it is reduced to **one merchant action** (issue a token) because `PUT /v2/bot/channel/webhook/endpoint` lets the platform configure the webhook itself.

**Non-negotiable:** a connection is marked working only after end-to-end reachability has been *proven* (LINE `POST /v2/bot/channel/webhook/test`, Meta subscription confirmation) — never merely configured. Today a merchant pastes FlowBot credentials and receives no signal at all; that is the defect this bar exists to eliminate.

---

## 8. Design language — "fine development" as a spec

"Impressive, high-tech, simple" becomes testable, not a feeling:

- **One brand system** across public site, tenant workspace, and widgets, built on the existing `packages/shared/brand.css` tokens (forest `#173f35`, gold `#f2c14e`, Inter, 6px controls, accessible focus, reduced-motion support). Retire the root site's neon package-storefront look.
- **Per-screen quality bar:** real data in every screenshot (no lorem), owned icon set (no hotlinked icons8), one live product proof per marketing page, motion only where it demonstrates the product (150–250ms ease-out; one signature hero animation; no gratuitous glow).
- **Thai-native typography and layout**, not English-first with Thai bolted on.
- **Simple = fewer sections each doing one job**, large confident type, generous spacing.

---

## 9. Non-goals

- Not a POS, CRM suite, inventory, or general workflow platform.
- No seventh/Enterprise SKU; no per-channel à-la-carte pricing.
- No autonomous self-learning AI in V1 (improvements go through offline eval → human approval → canary).
- No reliance on LINE's one-click Module channel (Japan/Taiwan only) — design the guided flow instead.
- No public marketing of the AI "salesperson" claim before behavioral validation.
- No big-bang three-codebase migration now — consolidate after the platform's AI Chat replaces the root widget.

---

## 10. Success metrics

- **North star:** qualified customer opportunities progressed to a merchant-approved next step per week (per tenant, and aggregate).
- **Business:** first paying merchant (SKU1); paying merchants; MRR; activation rate (registered → live bot); net revenue retention (upgrade ladder).
- **Merchant value:** median first-response time (→ instant), after-hours leads rescued, lead→appointment conversion, "value recovered" ÷ price (target payback < 1 month).
- **Experience:** onboarding completion rate and time-to-live; CSAT on connection steps.

---

## 11. Key decisions

**Locked (this PRD):**
- FlowBot Basic is SKU1; ship the paid machine first.
- LINE is available to the paid FlowBot tier (amends vision invariant #12 for LINE only).
- Visual canvas is a Must for the FlowBot public launch (SKU1.1), not a later nice-to-have.
- Root app stays live as interim showcase; DJBOT is the single brand.
- AI "salesperson" behavior must pass evaluation before it is marketed.
- Appointments remain **requests** until human/integration confirmation.

**Resolved 2026-07-26:**
- **Pricing** — platform PRD §6.1 annual packages are authoritative; billing is annual-only. No longer an open decision.
- **Social packaging** — `CHN-004`: one included channel + paid extras. Enforcement is P2.5 engineering work (shipped code is currently more permissive).
- **LINE onboarding** — merchant supplies **Channel ID + Channel Secret only**; the platform mints tokens server-side (`client_credentials`) and configures the webhook via API. The merchant never opens the LINE Developers Console (`CHN-012`).
- **Voice scope** — website + telephony only; never a social-messaging channel (`CHN-014`).

**Open (owner input needed):**
1. Launch posture for web-only SKU1: quiet pilot to prove billing (recommended) vs. hold launch until SKU1.1.
2. Whether to pull **AI Chat Basic** forward if the FlowBot market response is lukewarm.
3. Which channel is the *default* included social channel per plan family (affects upgrade-ladder framing under `CHN-004`).

---

## 12. Risks & dependencies

| Risk / dependency | Impact | Mitigation |
|---|---|---|
| Meta Business Verification + App Review lead time (3–6 wks) | Blocks SKU3 social onboarding | Start paperwork at SKU1 (background) |
| **App Review is per submission** | Omitting Instagram permissions costs a *second* 3–6 wk cycle | Request `instagram_basic` + `instagram_manage_messages` in the **same** submission as the Messenger permissions, even though Instagram is built later |
| **LINE self-serve requires a module channel (closed rail)** | Onboarding parity with Zwiz is gated on LINE approving us, not on engineering | Ship `assisted_handoff` now (one merchant action); open the LINE Thailand conversation immediately — it is the long pole |
| **One module channel per OA (exclusive)** | A merchant already attached to a competitor cannot attach DJBOT | Attachment is a competitive lock; early entry compounds — reinforces starting the LINE application now |
| **Instagram not built** (Meta capability exists; DJBOT gap) | Missing a channel the competitor sells | Build with Messenger on the same rail — marginal cost is asset enumeration + adapter branch |
| Pricing/commercial decision (ADR-008) | Gates all revenue | Already unblocked for SKU1 (tax deferral accepted); make the price call now |
| WhatsApp per-message billing (service msgs billed from Oct 2026) | Changes AI Premium unit economics | Feed into SKU3 pricing; LINE-first reduces exposure |
| Web-only FlowBot is weak in Thailand | Slow SKU1 uptake | Don't launch publicly on it; pair with LINE (SKU1.1) |
| AI sales quality unvalidated | Premium pitch risk | Evaluation gate before SKU2 marketing |
| Three-codebase drift | Rising maintenance cost | Freeze FlowBot V1; converge after SKU3 |
| Solo capacity | Overrun if parallelized | Strictly serial phases; revenue-first ordering |

---

## 13. Release roadmap (summary)

| Phase | Ships | Gate |
|---|---|---|
| **0** | FlowBot Basic sellable (web) | Codex G7 (commercial/legal/deploy) |
| **1** | FlowBot + LINE + visual canvas (SKU1.1) — public launch | LINE connect works; canvas editable; pilot proof |
| **2** | Thai-first DJBOT landing + real ROI story | Pilot data available |
| **3** | AI Chat Basic → Premium (Meta OAuth + LINE) + booking loop + notifications | Eval passed; Meta approved |
| **4** | Merchant ROI dashboard + operator growth analytics; codebase consolidation | — |

Build detail, tasks, files, and acceptance criteria are in `Implementation_Plan_CLAUDE_26JUL.md`.
