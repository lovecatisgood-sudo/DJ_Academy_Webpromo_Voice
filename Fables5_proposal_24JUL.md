# Fables5 Proposal — 24 July 2026

Proposed changes based on `Fable5_review_24JUL.md`. Ordered by leverage: what most changes conversion, onboarding completion, and perceived quality per unit of work. Each item states what to build, where, and why — for your review before any implementation.

---

## Guiding decisions to lock first (the "one-pager")

These five decisions unblock everything else. My recommendation on each:

| # | Decision | Recommendation |
|---|---|---|
| D1 | One brand & funnel | **DJBOT is the product; one landing page.** The root site becomes DJAI agency site OR redirects; it stops selling website packages next to the SaaS. |
| D2 | ADR-201/202/203 (channel connection) | **Meta = OAuth-only (Facebook Login for Business + Embedded Signup v4). LINE = 2-field guided connect (ID + Secret) with stateless tokens + auto-webhook.** Manual paste survives only as an "advanced fallback" behind a link. |
| D3 | Booking ADR | **Adopt the root app's booking-link/slot engine into the platform** as the confirmed-booking module; AI/FlowBot appointment requests flow into it; add the notification layer. |
| D4 | FlowBot canvas | **Build the visual canvas in the platform only** (React Flow over the existing graph model); do not invest further in FlowBot V1's UI. |
| D5 | Design language | Adopt and document a single visual system (see §6) so "fine development" is a testable spec, not a feeling. |

---

## 1. One funnel, one impressive landing page (points #1–#2)

**Target page = `DJAY_Bot_SaaS_Platform/apps/public-site`** (the clean green/gold foundation is right). Rebuild it as a Thai-first conversion page with this section order:

1. **Hero with a live bot.** Headline on the left; on the right, not a mock — the **actual TextBot widget** running against a DJBOT-owned demo tenant ("Try selling to our bot — it will try to sell to you back"). Nothing communicates "high-tech team" like the product demonstrating itself in the first viewport. A one-tap VoiceBot trial button sits under it (reusing the proven root widget until platform voice ships).
2. **The problem band** (Thai SME reality): "ลูกค้าทัก 3 ทุ่ม ตอบตอน 9 โมง = ขายไม่ได้" — leads die from slow replies; 3 stat tiles with *sourced* numbers (replace the current invented +50%/−70%).
3. **Three bots, one workspace** — the current pillar cards, upgraded with a real product screenshot or 15-second inline autoplay clip per bot (FlowBot canvas once built, TextBot objection-handling replay, VoiceBot transcript).
4. **"A salesperson, not a chatbot" section** — your key differentiator, currently invisible. Show a real replayed conversation where the bot hits a price objection and *doesn't give up*: acknowledge → evidence → alternative → books an appointment. Annotate the stages (Discovery → Objection → CTA) alongside the bubbles. This is the single most persuasive artifact you can build and it's generated from the engine you already have.
5. **ROI calculator (interactive).** Inputs: chats/day, average order value or lead value, % missed after hours, staff cost. Output: recovered leads/month vs. plan price → payback in days. Persist the result into the signup CTA ("Start recovering ฿38,000/month"). This directly implements your "calculation-wise it has good ROI" requirement.
6. **Pricing — the six plans**, grouped by family exactly as the vision specifies, with the upsell ladder visible (Basic column shows what Premium unlocks, greyed with lock icons). Prices can show "early access" until commercial decisions land, but the *structure* must be public: hiding pricing entirely reads as not-ready.
7. **Proof & trust strip:** pilot logos/testimonials as they arrive; meanwhile use the real trust assets — bank-grade tenant isolation, MFA, Thai data controls (export/erasure), status page link, "Powered by DJBOT" network effect.
8. **Onboarding preview:** 3 screenshots — "Connect Facebook in 1 click / Connect LINE in 2 fields / Paste one snippet on your website" — the §2 work becomes a *marketing asset*.
9. **Final CTA → registration** (keep the existing form; add Thai).

**Mechanics:**
- Full TH/EN localization with Thai default (`locale` currently hardcoded `"en"` — fix; the vision mandates native Thai).
- Root landing: strip the website-package storefront to the DJAI agency site or a `/webdev` subpage; 301 the bot-related traffic to DJBOT; remove dead canned-chatbot code (`promo.js:980–1121`) and the stale `/assets` + `index.html` duplicates; replace icons8 hotlinks with an owned icon set.
- Until platform checkout opens, the CTA is "Start free — pay when you go live", which is honest about the current gate and still captures the tenant.

## 2. Frictionless channel onboarding (point #3)

### 2.1 Meta — build the OAuth flow the env vars already promise

New `integrations` module in `apps/api` + connect screens in tenant-web's setup wizard:

- **Messenger:** "Connect Facebook" button → Facebook Login for Business config → merchant picks Page → backend exchanges code → stores **Business Integration System User token** (encrypted, existing envelope-key infra) → auto-subscribes the Page to webhooks via `pages_manage_metadata`. Scopes: `pages_messaging`, `pages_manage_metadata`, `pages_show_list`, `pages_read_engagement`, `business_management`, `human_agent`.
- **Instagram:** same button flow (Business Login for Instagram or Page-linked route), plus one **illustrated wizard step** for the "Allow access to messages" toggle in the IG app, with a live webhook test that turns green (this toggle is the #1 competitor support ticket — design for it, don't discover it).
- **WhatsApp:** **Embedded Signup v4** popup → merchant creates/selects their own WABA + verifies number → exchangeable token to backend. Merchant owns the WABA and pays Meta directly — clean separation from your subscription.
- **Post-connect hygiene (all three):** check granted scopes via `/me/permissions` and show a fix-it screen if the merchant unchecked something; token-health monitor mapping error 190 → "Reconnect" button; handle deauthorize + data-deletion callbacks (fields already exist empty in your Meta app).
- **Start the paperwork now, in parallel with code:** Meta Business Verification → App Review (screencasts + reviewer test tenant) → WhatsApp Tech Provider enrollment → Access Verification. 3–6 week critical path; Dev Mode lets you pilot with app-role testers before approval.

### 2.2 LINE — the best-in-Thailand guided connect (OAuth isn't available; design around it)

- **Step A (guided, illustrated, Thai):** "เปิดใช้งาน Messaging API" walkthrough of LINE OA Manager with screenshots, including the **permanent-provider warning** ("เลือก Provider ครั้งเดียว เปลี่ยนไม่ได้ — สร้างใหม่ในชื่อร้านคุณ").
- **Step B (2 fields only):** merchant pastes **Channel ID + Channel Secret** — visible on the same OA Manager screen they just used. **No access token step at all**: mint stateless tokens server-side per request (`client_credentials`). This alone removes the "Issue/Reissue token" trap every Thai competitor suffers.
- **Step C (automatic):** platform sets the webhook via `PUT /v2/bot/channel/webhook/endpoint`, calls the webhook **test** API, and shows a live green check. If the test fails, show the single illustrated "Use webhook" toggle instruction.
- **Cost-aware bot behavior:** always answer within the free reply-token window; meter/warn on push messages (Free plan = 300/month) — surface this in merchant analytics as "free replies vs. paid pushes".
- **Distribution:** apply for LINE Thailand Developer/Technology Partner and an OA Store listing (credibility + directory traffic); ask the partner team about any TH module-channel pilot, but plan on the flow above.

### 2.3 Onboarding wizard integration

Extend the existing evidence-driven wizard (its architecture is exactly right) so each channel is a card: **Connect → Test message round-trip → Go live**, with per-channel readiness evidence like the current FlowBot steps. Target: a non-technical merchant completes website + LINE + Facebook in under 15 minutes without leaving guided screens except where the platforms force it.

## 3. FlowBot visual canvas (point #4, FlowBot half)

Build in `apps/tenant-web` over the existing `@djay/flowbot-domain` graph model (no schema changes needed):

- **React Flow (or XYFlow) canvas:** nodes as typed cards (message / options / form / condition / CTA types, premium nodes visually locked per entitlement), edges drawn from option→target references, drag-to-connect, zoom/pan/minimap, auto-layout (dagre/ELK) for imported flows.
- **CTA nodes visually distinct** (color + icon) so the merchant *sees* every path ending in a CTA — your stated requirement. Add a "paths without CTA" lint alongside the existing unreachable/cycle validation.
- **Right-panel editor** reusing the current per-node guided forms (keep the JSON escape hatch as "advanced").
- **Simulator overlay:** clicking "Test" replays a conversation while highlighting the traversed path on the canvas — turns the existing simulator into a visual selling point (and a demo-video asset for the landing page).
- Read-only canvas ships first (fast, high perceived value), interactive editing second.
- FlowBot V1 app: freeze UI investment; it remains the single-tenant reference until migration.

## 4. Booking system completion (last point)

- **Port the root booking module into the platform** (D3): booking links, availability rules/overrides, slot engine, week grid, statuses. It arrives with multi-tenancy via the existing RLS patterns.
- **Wire the loop end-to-end:** AI `appointment.request` and FlowBot's dormant `cta_scheduler` node → merchant sees requests on the calendar → one-click confirm into a real slot → customer notified. This makes "AI books the appointment" literally true while respecting the vision's request-first model.
- **Notification layer (the biggest gap in both systems):** confirmation + reminder via email (Resend is already the recommended stack) and **LINE push to the merchant** ("🔥 Hot lead: คุณสมชาย ขอนัด พรุ่งนี้ 14:00 — ยืนยัน?"); .ics attachment; customer self-serve reschedule/cancel via signed link. Merchants live on LINE — merchant-side LINE notifications will be the most-loved feature you ship.
- **Fix timezone handling** (replace hard-coded `bangkokOffsetMs` with the stored per-profile timezone; keep Asia/Bangkok as default) and make grid hours configurable.
- Later (post-GA): Google Calendar sync, auto meeting links, month view.

## 5. Analytics & ROI surfaces (point #4, both operator and merchant)

**Merchant "ROI dashboard" (ties the whole pitch together):**
- Funnel chart per bot/channel: conversations → qualified (facts captured) → contact captured → appointment requested → confirmed. The Sales Core already emits every one of these events; nothing new to instrument.
- Trend lines (7/30/90d) for leads and response time; "after-hours leads rescued" counter; objection analytics ("12 price objections handled, 7 progressed") straight from S5 stage data.
- **"Value recovered" tile:** leads × merchant-entered lead value vs. subscription price = live ROI — the in-product mirror of the landing-page calculator, and your strongest renewal/upsell lever.
- One light charting dependency (e.g. Recharts) shared by both dashboards; numeric tables stay for accessibility/export.

**Operator growth view (platform-master):** activation funnel (registered → verified → connected channel → first conversation → first lead), per-tenant usage trends flagging upgrade-ready and churn-risk tenants, MRR once billing opens. Reuses the same charting layer.

## 6. Design language — make "FINE development" a spec

Write `docs/design-language.md` + shared tokens so every surface converges:

- **Keep the DJBOT identity** (forest `#173f35`, gold `#f0b84a`, generous type scale) as the master brand across public site, tenant-web, and widgets; retire the root site's neon system with the package storefront.
- Define: type scale (display/heading/body, Thai-optimized font pairing — e.g. IBM Plex Sans Thai, already used in FlowBot), spacing grid, radius/elevation, motion rules (150–250ms ease-out micro-interactions; one signature hero animation; no gratuitous glow), chart palette, empty/loading/error state patterns, and a quality bar checklist per screen (real data in screenshots, no lorem, no hotlinked icons).
- "Simple but impactful" translates concretely to: fewer sections each doing one job, large confident type, one live product proof per page, and motion only where it demonstrates the product.

## 7. Sequencing (proposed)

| Phase | Scope | Why first |
|---|---|---|
| **A (2–3 wks)** | D1–D5 decisions; landing rebuild (Thai, demo widget, ROI calc, pricing, salesperson section); root-site cleanup; **start Meta verification/review paperwork** | Top-of-funnel + the longest external lead time |
| **B (3–4 wks)** | Meta OAuth (Messenger→IG→WhatsApp ESU) + LINE 2-field connect + wizard channel cards | Your #1 stated friction; paperwork from A lands mid-phase |
| **C (2–3 wks)** | FlowBot canvas (read-only → editable) + simulator overlay | Differentiator + demo asset for the landing |
| **D (3–4 wks)** | Booking port + notifications (email/LINE/.ics/self-serve) | Completes the AI→appointment CTA loop |
| **E (2 wks)** | Analytics/ROI dashboards (merchant + operator) | Retention/upsell once funnel fills |

Phases B–E are largely parallelizable across the api/tenant-web boundary if capacity allows. Everything above respects the platform's existing gates (no sellable flip, voice stays gated, provider confidentiality preserved).

---

### What I'd explicitly *not* do

- Don't build a seventh plan/SKU or per-channel add-on pricing — the six-plan lock is sound; social stays the AI Premium upsell.
- Don't wait for LINE's module channel to reach Thailand — design the 2-field flow now; it's a competitive advantage as-is.
- Don't keep improving FlowBot V1's dashboard or the root landing's package storefront — every hour there deepens the migration debt.
- Don't put invented stats ("+50%") anywhere a buyer can see them; replace with the calculator and sourced benchmarks until pilot data exists.
