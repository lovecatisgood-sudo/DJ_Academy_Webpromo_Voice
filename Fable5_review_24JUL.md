# Fable5 Review — 24 July 2026

Full-project review of DJAI / DJBOT (DJAY Bot SaaS Platform), covering: (1) what the project intends to build vs. what exists, (2) landing page design & conversion funnel, (3) merchant onboarding incl. the latest Meta/LINE platform realities, (4) feature completeness for the three personas (SaaS operator, merchant, end customer), and (5) the appointment booking system.

Companion document: `Fables5_proposal_24JUL.md` (proposed changes).

---

## 0. Executive summary

**The engineering is far ahead of the product experience.** The multi-tenant platform (`DJAY_Bot_SaaS_Platform/`) has genuinely strong foundations — forced RLS isolation, a real Sales Conversation Core that behaves like a salesperson, working LINE/WhatsApp/Messenger delivery adapters, evidence-driven onboarding for the website widget, and a serious operator console. But the four things you named as your product identity are exactly the four weakest areas today:

| Your requirement | Current state | Verdict |
|---|---|---|
| "FINE development" landing pages that sell ROI | Two disconnected landing pages; neither has ROI content, proof, pricing, or a live demo; DJBOT site is English-only | **Not achieved** |
| Tech-dummy onboarding via social-account authorization | Social channels connect by pasting tokens/secrets **both directions**; no OAuth despite your Meta app already being half-configured | **Not achieved (and achievable)** |
| AI that sells like a persistent salesperson | Sales Core is genuinely excellent — 10-stage funnel, objection stage, fact memory, grounding | **Achieved in engine, invisible in marketing** |
| FlowBot visual canvas Q&A tree | Both FlowBot editors are list/form-based; zero visual graph anywhere | **Not achieved** |
| Calendly-like booking through AI/FlowBot | Root app has a real booking engine; the SaaS platform has **no calendar UI at all**; neither sends emails/reminders | **Half-achieved, split across two codebases** |

The single biggest structural problem: **you are running three products in one repo** (root single-tenant voice/text app, FlowBot V1 standalone, and the multi-tenant platform), and the customer-facing story is fractured across them.

---

## 1. What the project intends to build vs. what exists

### 1.1 The intent (from `djay-bot-saas-platform-final-vision-v3/`)

- One workspace where SMEs deploy **FlowBot** (deterministic, no AI), **AI Chatbot** (text salesperson), and **Voice Agent** — individually or together — to discover interest, handle objections, reach a CTA, capture leads and request appointments.
- Exactly **six locked plans**: FlowBot Basic/Premium, AI Chatbot Basic/Premium, Voice Basic/Advanced. Social channels (LINE/WhatsApp/Messenger) are **AI Chatbot Premium only**.
- North-star metric: *"Qualified customer opportunities progressed to a merchant-approved next step each week."*
- Thai + English first-class. THB billing. Prices intentionally TBD config, not source constants.
- Appointments are **requests** (2–5 proposed time options, `pending_merchant_confirmation`), not confirmed bookings — confirmed booking is explicitly deferred to a separate ADR (`15-detailed-multi-tenant-implementation-plan.md` §11.4).
- FlowBot builder is specified as a **canvas and node palette** with graph validation (`04-uiux-design.md` §8).
- Channel connection mechanics (OAuth vs token paste) were **deliberately left open** as ADR-201/202/203 — the spec's language ("least-privilege app scopes", "reauthorization", "revocation") leans OAuth, but no decision was ever taken.
- Notably, the vision bundle contains **no visual design language at all** — your "impressive / high-tech / fine development" requirement exists only in your head, not in any spec. That's why it keeps not happening.

### 1.2 What actually exists — three parallel systems

1. **Root app** (`src/`, deployed at `djbot.djai.academy`): single-tenant Next.js landing + dual-mode voice/text widget + admin (Inbox/Leads/Calendar/Customers/Channels/Team/Settings) + a real booking-link calendar system. Mature, verified, in production. But its landing page still sells **website packages (5,000/3,000/10,000 THB)** — not the three bots.
2. **FlowBot V1** (`FlowBot_V1_App/`): production-grade standalone rule-bot monorepo — engine, versioned publish, widget, admin takeover, CRM, privacy tools. Flow authoring is a form/list editor; the visual canvas was explicitly a PRD non-goal.
3. **DJAY Bot SaaS Platform** (`DJAY_Bot_SaaS_Platform/`): the real future product. P0–P9 local engineering complete; `sellable=false`; Stripe checkout and Voice public runtime deliberately gated off. Public-site (DJBOT landing + registration), tenant-web (workspace), platform-master (operator console), api, workers, widgets.

### 1.3 User-flow judgment: does the current flow achieve your intent?

**No — the funnel is broken at both ends and disjointed in the middle:**

- **Top of funnel is split and self-contradicting.** The root landing (Thai, dark neon, website packages) and the DJBOT landing (English-only, light green, three bots) are different brands, different products, different domains. A visitor who meets both will be confused about what you sell.
- **Primary CTAs leak.** On the root landing, every package CTA and the chatbot-banner CTA link to `https://dev.djai.academy/contact-us/` — an external WordPress page. Your best converting asset (the embedded AI widget that captures leads into your own DB and offers booking) sits at the **bottom** of the page.
- **Middle of funnel (signup → value) is decent for the website widget only.** The platform's evidence-driven setup wizard (profile → access → configure → deploy → test) is genuinely good design. But the moment a merchant wants LINE/Facebook — the channels Thai SMEs actually live on — they hit developer-console credential surgery (§3).
- **Bottom of funnel doesn't exist yet.** Checkout is gated (`"Checkout is not open for this plan yet"`), so plan selection at registration is cosmetic. That's fine as a gate, but it means today's "funnel" ends at an empty room.
- **Upsell ladder is specified but not experienced.** The vision's entitlement-aware "locked feature explains exactly what upgrading unlocks" pattern exists in scattered 403s ("requires AI Chat Premium"), not as a designed upsell surface.

---

## 2. Landing pages: design & conversion review

### 2.1 Root landing (`public/assets/js/promo.js`, 1,141 lines + `styles.css`, 2,749 lines)

**What's good:** cohesive dark-neon system (deep navy `#050816`, cyan/purple glows, glass cards), real motion, a live countdown, thoughtful 7-slide mobile deck, competent price-anchoring (strikethroughs, "Save 50%", renewal transparency).

**What fails the "FINE development" bar:**
- **Zero proof layer.** No ROI calculator, no case studies, no testimonials, no client logos, no portfolio, no FAQ. The only ROI reasoning in the whole repo lives inside the LLM prompt (`src/lib/prompt.ts:222`) where no visitor ever sees it.
- **It's one long pricing block.** No hero narrative, no problem→solution story, no "how it works". Agency-brochure altitude, not product-launch altitude.
- **Icons are hotlinked from img.icons8.com** (`promo.js:73,117,155,161,175`) — an external dependency that instantly reads "template".
- **Wrong product.** It sells website packages; commits `f3af7ed`/`367486d` that "positioned the landing around three bots" landed in the *platform's* public-site, not here.
- Dead code: a canned keyword-chatbot (`promo.js:980–1121`) that never renders, plus a stale duplicate of the whole landing in `/assets/` and `index.html`.

### 2.2 DJBOT landing (`DJAY_Bot_SaaS_Platform/apps/public-site/app/page.tsx`)

**What's good:** clean, credible light design (forest green `#173f35` / gold `#f0b84a`, huge type, sticky nav), honest evidence-driven copy, accessible forms, correct legal/idempotency plumbing. As a *foundation* it is closer to "fine SaaS" than the root page.

**What's missing to convert:**
- **English only, `locale: "en"` hardcoded** (`page.tsx:149`) — for a Thai-first SME product this is disqualifying, and it contradicts the vision's TH/EN mandate.
- **No pricing section.** Six plans are the product's spine; the page never shows them (registration shows plan radio chips only).
- **No live demo.** You sell chatbots — the strongest possible proof is *talking to one on the page*. The root app already has an embeddable dual-mode widget; the platform has its own AI chat widget. Neither is on this page.
- **No ROI story.** The hero mock shows "+50% warm leads / −70% manual follow-up" as static decoration — unsubstantiated numbers in a fake dashboard, which sophisticated buyers discount. There's no calculator letting a merchant plug in *their* chat volume and see payback vs. a plan price.
- **No social proof, no screenshots of the real product, no security/trust badges** (you actually have real trust assets: forced RLS, MFA, data controls, a status page — unmentioned).

### 2.3 Verdict on point #2

Neither page currently makes a visitor feel "this team is high-tech and subscribing has clear ROI". The DJBOT page is the right foundation; it needs Thai, pricing, a live bot demo, an ROI calculator, and proof. The root page needs to stop competing with it (see proposal §1).

---

## 3. Onboarding & channel connection (your point #3)

### 3.1 What merchants must do today (platform)

Website widget: genuinely good — guided wizard, one-time deployment key, copy-paste snippet, install check, evidence-gated steps (`apps/tenant-web/app/workspace/setup/page.tsx`).

Social channels (`apps/tenant-web/app/workspace/ai-chat/page.tsx:165–354`): the merchant must
1. Open LINE Developers / Meta App Dashboard themselves,
2. Find and paste **secrets into password fields** (LINE: token + secret; WhatsApp: 5 values; Messenger: 4 values),
3. Copy a webhook URL back from DJBOT **into** the developer console and subscribe to events,
4. Manually rotate credentials when they expire.

This is the *reverse* of what you want, and it is more friction than Zaapi (the smoothest Thai competitor, which at least auto-sets the webhook). A "tech dummy" cannot complete this flow. Security is done well (encryption, reauth, entitlement gates) — the problem is purely UX direction.

Meanwhile your Meta app (screenshot `screenshots/meta_business_dashboard.jpeg`) already has Facebook Login for Business configured with a callback URL, and `.env.example` already contains `META_OAUTH_REDIRECT_URI` and `LINE_LOGIN_*` — but **no OAuth routes exist in the codebase yet**. The scaffolding was declared, not built.

### 3.2 What is actually possible on Meta (researched 2026-07-24)

Your ideal — *"authorize with your social account and we get the access rights"* — is **fully supported and is the industry standard** (ManyChat, Respond.io, Chatfuel all do exactly this):

- **Messenger:** Facebook Login for Business → merchant clicks Connect → picks their Page → done. Request `pages_messaging`, `pages_manage_metadata`, `pages_show_list`, `pages_read_engagement`, `business_management` (+ `human_agent` for the 7-day reply window). Store a **Business Integration System User token** (not an employee-bound user token). The SaaS can then subscribe the Page to its webhooks itself — the merchant never sees a key or a webhook URL.
- **Instagram DM:** two routes — "Business Login for Instagram" (no Facebook Page needed; scopes `instagram_business_basic` + `instagram_business_manage_messages`; note the scope renames of Jan 2025) or via the Page-linked Messenger stack. One unavoidable merchant step: toggling **"Allow access to messages"** in the IG app (the #1 support ticket across all competitors — needs an illustrated wizard step).
- **WhatsApp:** **Embedded Signup v4** (Dec 2025; v2 dies Oct 2026): one popup creates/selects the merchant's own WABA, verifies the phone number, and hands your backend an exchangeable token. Merchant owns the WABA and pays Meta directly. Requires you to enroll as a **Tech Provider** (mandatory for all ISVs since end-2025), pass Business Verification + App Review (2 screencasts), and later Access Verification to lift the 10-merchants/week cap to 200.
- **Cost/pricing watch:** WhatsApp moved to per-message pricing July 2025; **service messages start being billed Oct 1, 2026** (announced July 2026) — this must feed your plan unit-economics before prices are set.
- **Your side of the work:** Meta Business Verification, App Review with screencasts + test tenant, annual Data Use Checkup / Data Protection Assessment, token-health monitoring with a one-click "Reconnect" flow. Dev Mode lets you build and pilot the whole thing with app-role test users **before** review passes.

### 3.3 What is actually possible on LINE (researched 2026-07-24)

Here your ideal is **not** available in Thailand, and the flow must be designed around that:

- The true one-click OAuth attach (**Module channel / LINE Marketplace**) is restricted to **Japan and Taiwan** (`region` param accepts only `JP`/`TW`), corporate-partner-only, Japanese-language application. Do not plan on it for Thailand; ask LINE Thailand's partner team if a pilot exists, but assume no.
- Since Sept 2024, merchants enable the Messaging API from **LINE OA Manager** (not the Developers console). Doing so creates the channel and shows **Channel ID + Channel Secret** right there. Gotcha to warn about: the **provider choice at that step is permanent**.
- **Key insight that beats every Thai competitor:** you only need **Channel ID + Channel Secret**. From those, mint **stateless channel access tokens** server-side (`POST /oauth2/v3/token`, `client_credentials`) — the merchant never touches the "Issue token" button (and never hits Zwiz's infamous "don't press Reissue" trap). Then **set the webhook yourself via API** (`PUT /v2/bot/channel/webhook/endpoint`) and call the webhook **test** endpoint to show a green check. The only residual manual step is the "Use webhook" toggle — one illustrated instruction.
- Every Thai competitor (Zaapi, Respond.io, Zwiz.ai, BOTNOI, Readyplanet) still asks for 2–3 pasted values and most make the merchant copy webhook URLs manually. A 2-field guided flow with auto-webhook + live test would be the best LINE onboarding in the Thai market.
- Commercial note: LINE TH Free plan = 300 push messages/month, **reply messages are free and unlimited** — the bot should answer within the reply-token window wherever possible; push/broadcast is the metered resource. Pursue **LINE Thailand Developer Partner + OA Store listing** for distribution credibility (it's a directory, not a technical mechanism).

### 3.4 Verdict on point #3

Your instinct is correct and the current flow does not make sense as the end state: for Meta it demands friction that the platform explicitly makes unnecessary; for LINE it demands more friction than necessary (3+ pasted values and manual webhook steps when 2 values + automation suffice). The vision docs never decided ADR-201/202/203 — this review effectively decides them (see proposal §2).

---

## 4. Feature completeness across the three personas (your point #4)

### 4.1 For the merchant (tenant)

**Strong:** Inbox with human takeover/release; knowledge system (crawls, PDF/DOCX uploads with malware-scan pipeline, product catalog with prices); AI Chat Studio guided playbook editor with Advanced-JSON escape hatch; team/MFA/data-controls; usage & billing page with quota boundaries and safety cap.

**Weak / thin:**
- **Leads** is a bare create/list (`leads/page.tsx`, 58 lines) — no pipeline board, no stages workflow, no follow-up queue. The root app's lead pipeline (statuses, editable contact fields, notes, CSV, assignment) is *better* than the platform's.
- **Analytics have zero visualization.** Grep across both dashboards finds no charting of any kind. Merchants get numeric grids (sessions, leads, handovers, per-channel delivery) — real data, but no funnel view, no trends, no conversion rates over time, and nothing that says *"this bot made/saved you ฿X this month"*. For a product whose pitch is ROI, the merchant can never see the ROI.
- **Appointments have no UI** — captured as requests + counters + export only (§5).
- **No merchant notifications** (the encrypted outbox/email worker exists at P1 infrastructure level; merchants don't get "new hot lead" alerts on LINE/email — the highest-value notification a Thai SME can receive).

### 4.2 The AI salesperson (your key highlight) — honest assessment

This is the best part of the codebase and materially matches your "real salesperson, persistent, doesn't give up on objection" requirement:

- 10-stage funnel (`packages/sales-core`): S0 greeting → S1 intent → S2 discovery → S3 qualification → S4 recommendation → **S5 objection** → S6 CTA → S7 contact → S8 appointment → S9 close.
- Durable **sales-fact memory** per conversation (interest, pain point, budget, urgency, decision role, objection, outcome — each with evidence + confidence). This is what makes it a salesperson rather than a stateless FAQ bot.
- Objection stage with acknowledge → identify → answer with approved evidence → verify → alternative; guardrail "do not argue, shame or repeatedly push after refusal" — correctly balancing your "persistent" requirement against brand safety.
- Grounding that refuses invented prices/discounts/appointments, with citation validation; provider-neutrality enforced down to stripping "I'm an AI model X" from output.
- Entitlement-gated actions (lead capture, appointment request, handover) and confidence-threshold auto-handover.
- The root app's text-chat prompt adapter also already encodes "do not behave like a passive FAQ; sell the benefit of the benefit; handle objections without giving up".

**Gaps:** (a) none of this is *demonstrable* to a prospect — no public demo, no marketing narrative around it; (b) persistence across *sessions* (lead nurture follow-ups, "come back" push messages) is not implemented — the salesperson gives up when the customer closes the tab; (c) no merchant-visible evaluation ("your bot handled 12 price objections this week, 7 progressed").

### 4.3 FlowBot (rule-based) — the canvas requirement

**The visual canvas does not exist in either implementation:**
- FlowBot V1: two-column list + form editor; the "graph" is literally text lines `A -> B` (`admin-dashboard.tsx:1228–1236`). Drag-and-drop authoring was declared a PRD non-goal; even the spec'd read-only mindmap was never built.
- Platform FlowVisualEditor: despite the name, it's a node-card list with per-node JSON settings; connections are typed node-ID references; no wires, no canvas, no zoom/pan.

**The good news:** both data models are already true graphs (nodes, option edges, cycle detection, topological validation, CTA node types `cta_link`/`cta_lead_form`/`cta_contact_card`/`cta_live_chat`, immutable versioned publish). A React-Flow-class canvas is purely a front-end layer over what exists — no schema or engine changes needed. The vision doc (`04-uiux-design.md` §8) already specifies exactly this.

### 4.4 For the SaaS operator (you)

Platform-master is a serious **operations/finance console**: release-readiness gate, subscriptions/tenants, Stripe + FlowAccount reconciliation, dunning, webhook/dead-letter recovery, voice admission control, social channel health, two-person support-access grants. This is above-market for a product at this stage.

**Missing:** any *growth* analytics — no MRR/churn/activation funnel, no per-tenant conversion or usage trends, no cohort view, no "which merchants are close to upgrade/at churn risk". Also all tables, no charts. You can operate the platform but not steer the business from it.

### 4.5 For the end customer

Widgets (AI chat, FlowBot, voice-in-progress) are solid: bilingual, session-persistent, quick replies, handover states, accessibility, offline/retry. Social delivery adapters are implemented and tested (signature verify, channel-correct rendering, multipart resume, rate-limit and reauth mapping). The end-customer experience is not the bottleneck; the merchant's ability to get there is.

---

## 5. Appointment booking system (your last point)

### 5.1 Root app — the real booking system

What exists is legitimately Calendly-shaped (`src/app/admin/calendar/*`, `book/[slug]`, `src/lib/availability.ts`):
- Week time-grid with appointment/blocked blocks, status filters, admin filter, detail rail with confirm/reject/complete/no-show/cancel/reschedule/reassign.
- Booking links as the central object: duration presets, minimum notice, booking window, before/after buffers, max/day, require-confirmation, and a single "AI booking link" that the voice/text agents hand out after lead capture.
- Correct slot engine (rules + overrides + existing-appointment subtraction + race-safe unique index), signed booking context prefilling the public form, lead auto-flip to `appointment_set`.

**Gaps vs. Calendly-class:**
1. **No notifications whatsoever** — no email/LINE confirmation, no .ics file, no reminders, no admin alert. Verified zero hits repo-wide. This is the #1 no-show driver and the biggest single gap.
2. **No customer self-serve reschedule/cancel** (admin-only).
3. **Bangkok hard-coded** (`bangkokOffsetMs`) despite per-profile timezone fields; grid fixed 08:00–21:00.
4. No calendar sync (Google/Outlook), no auto meeting links, no month view, no drag-to-reschedule.

### 5.2 Platform — booking is a UX stub

The Sales Core proposes 2–5 time options as `appointment_requests` (`pending_merchant_confirmation`) and can export them to Sheets/webhook/CRM — but there is **no calendar page, no confirm UI, no availability model** in tenant-web. Merchants would confirm appointments by… reading the inbox. The vision deliberately scoped confirmed booking out pending an ADR, but for your funnel ("AI/FlowBot books the appointment as final CTA") a request that nobody can conveniently confirm breaks the loop.

### 5.3 Verdict

You already own the hard part (the root app's slot engine and booking-link model). The missing decisions are product ones: adopt it into the platform as the ADR-gated confirmed-booking module, and add the notification layer neither system has. FlowBot's `cta_scheduler` node type already exists in schema — unwired — as the natural FlowBot CTA into this same system.

---

## 6. Scorecard

| Area | Score /10 | One-line reason |
|---|---|---|
| Platform architecture & security | 9 | RLS, realms, entitlements, gates — above market |
| AI salesperson engine | 8.5 | Real stages/facts/objections; missing cross-session persistence & showcase |
| End-customer widgets & delivery | 8 | Solid, bilingual, resilient |
| Operator console (ops/finance) | 8 | Deep ops; no growth analytics |
| Website-widget onboarding | 7.5 | Evidence-driven wizard is genuinely good |
| Root booking engine | 7 | Correct core; zero notifications, TZ hard-coded |
| Merchant dashboard depth (leads/analytics) | 4.5 | Thin leads, zero charts, no ROI view |
| Landing pages / funnel | 4 | Split brands, no proof/pricing/demo/ROI, EN-only DJBOT |
| Social channel onboarding | 3.5 | Reverse-direction token paste; ideal flow unbuilt though achievable |
| FlowBot visual canvas | 2 | Does not exist in either implementation |
| Platform booking UX | 2 | Model + export only; no UI |

---

## 7. Key risks worth naming

1. **Three-codebase drag.** Every improvement now has to be argued into 1–3 places. The root app and FlowBot V1 are both better than the platform in specific areas (booking, lead pipeline / flow engine maturity) — the longer migration waits, the more divergence accumulates.
2. **Meta review lead time.** Business Verification + App Review + (for WhatsApp) Tech Provider & Access Verification is a 3–6 week critical path that gates the flagship onboarding experience. It should start before the code is finished.
3. **WhatsApp Oct-2026 service-message billing** will change social-channel unit economics; plan pricing (currently TBD by design) must account for it.
4. **The "impressive design" requirement has no spec.** Until a visual design language is written down (tokens, typography, motion, component quality bar), each new page will keep regressing to functional-but-plain. This review's proposal includes one.
