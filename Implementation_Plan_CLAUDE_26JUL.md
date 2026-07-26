# DJBOT — Full Implementation Plan

**Author:** Claude (Opus 4.8) · **Date:** 26 Jul 2026 · **Companion to:** `PRD_CLAUDE_26JUL.md`

This is the *how*. It is sequenced for a **solo operator + AI coding agents**, so phases are strictly serial: finish and ship each before starting the next. Task owners are marked **[You]** (owner/commercial/legal), **[Agent]** (AI-implementable engineering), or **[Ext]** (external party: counsel, Meta, LINE, pilot merchant). "Files" reference verified paths in this repo.

---

## 0. Guardrails (apply to every phase)

- **Respect the release gates.** Do not flip `sellable=true` for any plan before its G-gate passes. The catalog enforces `sellable_requires_live_stripe_mapping`.
- **Provider confidentiality is load-bearing.** No tenant/customer surface may reveal provider or model names. Keep session/widget contracts opaque.
- **Two codebases, clear roles.** New product work → `DJAY_Bot_SaaS_Platform/`. Root app (`src/`) stays in production but receives only bugfixes + the booking engine we later port *out* of it. FlowBot V1 (`FlowBot_V1_App/`) is frozen.
- **Verification before "done."** Every engineering task ships with typecheck + unit + integration + a real driven-flow check (the platform already has PostgreSQL integration, Playwright, secret-scan, and smoke gates — extend them, don't bypass).
- **i18n from the start.** Any new merchant/customer-facing string is added in TH + EN; Thai is default.

---

## Phase 0 — FlowBot Basic can take money (G7) · ~2–3 weeks · mostly non-code

**Goal:** a real Thai merchant pays for FlowBot Basic and goes live, end to end, with a receipt and a support path. No new product scope.

Open items are taken from `docs/plans/2026-07-22-path-to-10-all-roles.md` (unchecked boxes) and `docs/plans/release-dashboard.md`.

### 0.1 Commercial [You + Ext:finance]
- ~~Decide FlowBot Basic THB price~~ — **resolved 2026-07-26.** Price is already normative in `DJAY_Bot_SaaS_Platform/docs/product/djay-bots-v1-market-release-prd.md` §6.1: **Flow Starter THB 2,499 first-year / THB 4,999 renewal, annual billing only.** Seed Stripe from that table; do not re-decide. Confirm only the tax treatment per `SKU1-DEC-002`.
- Seed the **Stripe live price mapping** per `docs/runbooks/stripe-price-mapping.md`; set the plan version `stripeMappingState = live_ready`.
- **Acceptance:** catalog validation passes with `flowbot_basic` `live_ready`; test + live Stripe price IDs recorded.

### 0.2 Legal / privacy [You + Ext:counsel] — *start first; longest lead time*
- Publish Privacy Notice + DPA + subprocessor list (G6c / Phase 10). List current subprocessors (hosting, Stripe, email/Resend); LINE/Meta added when those channels ship.
- Erasure/export coverage test pass or counsel-approved residual list.
- **Acceptance:** G6c signed; Privacy Notice live and linked from public-site (already wired to `/public/legal`).

### 0.3 Deploy & observability [Agent + You]
- Apply Cloud Run ready probes (Terraform written) to staging, then prod.
- Deploy checkout + webhook metrics/alerts (code written).
- Run the paid-path E2E against the `live_ready` plan (`docs/validation/p-first-sku-e2e.md`).
- **Acceptance:** ready probes green on Cloud Run; checkout + webhook dashboards live; E2E paid path green.

### 0.4 Ops drills [You + Agent]
- Execute and log the kill-switch drill (`docs/runbooks/sellable-kill-switch.md`).
- Confirm no Sev-1 "can't activate after pay" path open.
- **Acceptance:** kill-switch drill logged; activation-after-pay verified.

### 0.5 Accessibility [Agent]
- Unmocked axe scan green on the SKU1 surfaces (public-site register/checkout return, tenant setup wizard, FlowBot editor, inbox).
- Record the keyboard-only merchant journey notes.
- **Acceptance:** axe green; keyboard journey documented.

### 0.6 Pilot merchant [You + Ext:merchant]
- Name one friendly Thai SME in `docs/validation/named-merchant-worksheet-sku1.md` (currently blank).
- Run them through: register → verify → pay → provision → setup wizard → widget live on their origin → conversation in inbox → receipt in billing portal.
- **Acceptance:** all 8 worksheet checkpoints signed (Phase 13 step 7).

### 0.7 Background: start Meta enablement [You + Ext:Meta] — *do not wait for Phase 3*
- Begin Meta Business Verification, create/complete the App (icon, privacy URL, data-deletion callback — the callback fields are currently empty in your Meta app), enroll as WhatsApp Tech Provider.
- **Acceptance:** verification submitted; App Review checklist drafted with screencast script.

**Phase 0 Definition of Done:** G7 pass on `release-dashboard.md`; one paying pilot merchant live on FlowBot Basic (web). Launch posture per owner decision (recommended: keep it a quiet pilot).

---

## Phase 1 — FlowBot becomes Thai-compelling: LINE + Visual Canvas (SKU1.1) · ~3–4 weeks

**Goal:** the product a Thai merchant buys with pride and the assets to demo it. Two parallel-ish workstreams; land LINE first (revenue lever), canvas second (experience + demo).

### Workstream A — LINE for FlowBot [Agent]

Technical facts: FlowBot LINE routes already exist — `apps/api/app/tenant/flowbot/social-connections/route.ts`, `apps/api/app/public/flowbot/social/line/[webhookKey]/route.ts`, and the delivery adapter in `packages/channel-adapters/src/index.ts`. No new schema; this is entitlement + onboarding UX + token strategy.

- **A1. Entitlement flip:** add LINE capability to the paid FlowBot tier in `packages/catalog/src/index.ts` and the entitlements package; gate the connect UI on it. **Per `CHN-004` (resolved 2026-07-26), LINE is *selectable as the one included social channel*, not an unlimited grant.** Full single-choice + cooldown enforcement is P2.5 below; for Phase 1, ship the capability and record which channel occupies the included slot so P2.5 has the data it needs.
- **A2. Stateless token strategy:** implement channel-access-token minting from **Channel ID + Secret** via `POST https://api.line.me/oauth2/v3/token` (`client_credentials`) in the LINE adapter, so the merchant never touches the "Issue token" button. Cache per request/short TTL.
- **A3. Guided connect UI** in tenant-web (extend the setup wizard, `apps/tenant-web/app/workspace/setup/page.tsx`, and the channel card in the FlowBot studio):
  - Illustrated Thai OA-Manager walkthrough incl. **permanent-provider warning**.
  - Two fields only: Channel ID + Channel Secret.
  - On submit: encrypt + store, mint token, **auto-set webhook** via `PUT /v2/bot/channel/webhook/endpoint`, call **webhook test** endpoint, show live green check.
  - Fallback: illustrated "Use webhook" toggle instruction if test fails; "advanced: paste token" behind a link.
- **A4. Privacy update:** add LINE as a subprocessor (feeds 0.2 list).
- **A5. Cost-aware behavior:** answer within the free reply-token window; surface "free replies vs. metered pushes" in the connection panel (LINE TH Free = 300 pushes/mo).
- **Acceptance:** a merchant connects a real LINE OA in ≤2 fields, sees a green webhook check, and a FlowBot flow responds on LINE end-to-end; unit + integration tests for token mint, webhook set/test, inbound signature verify, outbound render.

### Workstream B — Visual canvas [Agent]

Technical facts: the graph model already exists (`@djay/flowbot-domain` `flowNodeSchema`, option/target edges, cycle/topological validation, immutable publish). The current editor `apps/tenant-web/app/workspace/flowbot/FlowVisualEditor.tsx` is a node-card list. **No schema or engine changes needed** — this is a front-end layer.

- **B1.** Add React Flow (XYFlow) to tenant-web; render nodes as typed cards on a pan/zoom canvas with a minimap; edges from existing option/`nextNodeId`/`targetNodeId` references.
- **B2.** Auto-layout (dagre/ELK) so existing/imported flows render sensibly.
- **B3.** CTA nodes visually distinct (color + icon) so every terminating path is visibly a CTA.
- **B4.** "**Path without CTA**" lint surfaced beside existing unreachable/cycle validation before publish.
- **B5.** Right-panel node editor reuses the current guided forms (keep Advanced-JSON escape hatch).
- **B6.** Ship **read-only canvas first** (fast, demoable), then editable: drag-to-connect, add/delete node from palette, re-parent.
- **B7.** Simulator overlay highlighting the traversed path during a test run (upgrades the existing simulator; produces a marketing clip).
- **Acceptance:** a merchant builds/edits a branching flow visually, sees CTA paths at a glance, gets a lint warning for a CTA-less path, and can run a test that animates the path; no regression to publish/rollback/validation.

**Phase 1 DoD:** FlowBot sells as "automate your LINE with a beautiful visual builder"; canvas + simulator captured as demo assets; pilot merchant migrated to LINE + canvas.

---

## Phase 2.5 — Close the social-entitlement leak (`CHN-004`) · ~1 week · [Agent]

**Added 2026-07-26.** Migration 0082 grants **unlimited** social channels once `channel.social` is set, with no single-choice rule and no cooldown. The authoritative commercial model (`CHN-004`/`CHN-005`) is **one included channel + paid extras**. Shipped code is therefore more permissive than the offer — a revenue leak.

- **2.5.1** Record the chosen included channel per subscription.
- **2.5.2** Enforce: connecting a *different* channel requires elapsed cooldown, an active `additional_social_channel` add-on, or operator-approved migration.
- **2.5.3** Migration relaxing/replacing the 0082 predicate; mirror in the five AI Chat SECURITY-DEFINER functions.
- **2.5.4** Merchant UI shows which channel holds the included slot and the cost of changing it.
- **2.5.5** Boundary linter asserting `CHN-007` — every channel exposes a self-test/health path (FlowBot social currently has none, violating a shipped normative requirement).
- **Acceptance:** integration tests for included-channel selection, cooldown rejection, add-on acceptance, and operator override; linter fails when a channel lacks a health path.

> Do not advertise unlimited social channels before this ships.

---

## Phase 2 — Credible landing + real ROI story · ~2 weeks · [Agent + You]

**Goal:** a Thai-first DJBOT page that converts, using the pilot's *real* numbers. Foundation exists: `apps/public-site/app/page.tsx` + `styles.css` + `packages/shared/brand.css`.

- **2.1 Thai-first:** fix hardcoded `locale: "en"` (`page.tsx:149`); TH default, full TH/EN toggle.
- **2.2 Hero = live proof:** embed the FlowBot canvas mini-demo or the actual bot widget in the first viewport (not the current static mock).
- **2.3 Salesperson section:** a replayed real conversation hitting a price objection and *not giving up* → booking, annotated with the sales stages. (Generate from the Sales Core once Phase 3 eval exists; until then, use a FlowBot flow demo.)
- **2.4 Pricing section:** real FlowBot tiers + prices; six-family structure visible with upgrade ladder (locked Premium features shown).
- **2.5 Proof:** pilot merchant's real numbers + testimonial; replace invented "+50% / −70%" placeholders.
- **2.6 ROI calculator:** inputs (chats/day, lead value, % missed after-hours) → recovered value vs. price → payback; grounded in pilot data, not invented rates.
- **2.7 Onboarding preview:** "Connect LINE in 2 fields · paste one snippet."
- **2.8 Root-site cleanup:** stop selling website packages against DJBOT; 301 bot-intent traffic to DJBOT; keep root app as the live AI-agent showcase; delete dead canned-chatbot code (`public/assets/js/promo.js:980–1121`) and the stale `/assets` + `index.html` duplicates; replace icons8 hotlinks with an owned icon set.
- **Acceptance:** Lighthouse/axe pass; TH default renders; calculator produces a payback figure; a cold visitor can understand the product, see a live bot, see a price, and reach registration in one scroll.

**Phase 2 DoD:** public launch of SKU1.1 on a page that makes an SME believe and buy.

---

## Phase 3 — AI Chat program: the premium salesperson · major arc · [Agent + You + Ext]

Meta paperwork from 0.7 lands during this phase. Ships as its own gated SKUs.

### 3.1 Validate behavior first [Agent + You]
- Run the vision's evaluation suite on real Thai + English conversations (discovery → objection → CTA → capture); tune playbook/prompt; record evidence.
- **Gate:** no marketing of the "real salesperson" claim until this passes.

### 3.2 Meta OAuth onboarding [Agent]
- Build the connect flows in tenant-web + `apps/api` integration routes (none exist today):
  - Messenger via Facebook Login for Business; IG via Business Login for Instagram; WhatsApp via Embedded Signup v4.
  - Store Business-Integration-System-User tokens (reuse envelope-key encryption); auto-subscribe Page to webhooks; scope check via `/me/permissions`; token-health "Reconnect" (error 190); illustrated IG "Allow access to messages" step; wire deauthorize + data-deletion callbacks.
- Reuse the Phase 1 LINE connect for AI Chat.
- **Acceptance:** merchant connects FB/IG/WA by clicking Connect and picking their asset — no keys shown; end-to-end AI reply on each channel with real credentials.

### 3.3 Ship AI Chat Basic (web) → Premium (social) [Agent + You]
- AI Chat Basic sellable behind its G-gate (web only); then Premium (web + Meta + LINE).
- **Acceptance:** each SKU passes its paid-path E2E + eval; provider confidentiality verified.

### 3.4 Booking loop + notifications [Agent]
- Port the root app's booking engine (`src/lib/availability.ts`, `src/app/admin/calendar/*`, `book/[slug]`, `api/booking/*`) into the platform with RLS multi-tenancy.
- Wire AI `appointment.request` and FlowBot's dormant `cta_scheduler` node into it; merchant one-click confirm.
- **Notification layer:** email (Resend) + **LINE push to merchant** + `.ics` + customer self-serve reschedule/cancel via signed link. Fix hard-coded `bangkokOffsetMs` → per-profile timezone.
- **Acceptance:** AI/FlowBot creates an appointment request → merchant confirms in one click → customer + merchant notified; timezone correct for a non-Bangkok profile.

**Phase 3 DoD:** the full vision — a validated AI salesperson across web + LINE + Meta that books appointments.

---

## Phase 4 — Analytics, ROI surfaces, consolidation · ongoing · [Agent]

- **4.1 Merchant ROI dashboard:** funnel + trends + "value recovered" tile, from events the Sales Core already emits; one shared charting lib (Recharts) in tenant-web + platform-master; keep numeric tables for export/accessibility.
- **4.2 Operator growth analytics:** activation funnel, per-tenant usage trends, upgrade-ready/churn-risk flags, MRR.
- **4.3 Codebase consolidation:** once platform AI Chat replaces the root widget, retire the root single-tenant path; converge to one brand + codebase; FlowBot V1 remains frozen until superseded.
- **Acceptance:** merchant sees payback in money; operator sees activation + upgrade signals; root widget traffic migrated.

---

## Cross-cutting workstreams

- **Testing/verification:** extend existing gates (PostgreSQL integration, Playwright desktop/mobile, secret-scan, smoke, axe). Every channel connect gets an integration test for signature verify + render + deliver + health.
- **Security/privacy:** each new channel/subprocessor updates the Privacy Notice + DPA; encrypted credentials; least-privilege scopes; token-health monitoring.
- **Observability:** server-timing/metrics on new routes; checkout/webhook/channel-delivery dashboards; dead-letter + reauth alerts (patterns exist in workers/platform-master).
- **i18n:** TH/EN for every new surface; Thai default.

---

## Critical path & sequencing

```
Phase 0 (2–3 wk) ─ pricing + legal + deploy + pilot ── SKU1 sellable
   └─ 0.7 Meta paperwork [runs in background through Phase 1–2] ──────────────┐
Phase 1 (3–4 wk) ─ LINE connect (A) then Visual canvas (B) ── SKU1.1 ready    │
Phase 2 (2 wk)   ─ Thai landing + ROI (uses pilot data) ── public launch      │
Phase 3 (major)  ─ eval → Meta OAuth (needs paperwork done ◄──────────────────┘)
                    → AI Basic → AI Premium → booking loop + notifications
Phase 4 (ongoing)─ analytics + consolidation
```

**Longest external lead times, start immediately (Phase 0):** Privacy/DPA counsel work (0.2) and Meta Business Verification/App Review (0.7). Everything else can wait for its phase; these cannot.

---

## Definition of done (per phase, one line each)

- **P0:** a Thai merchant pays for FlowBot Basic and goes live with a receipt.
- **P1:** that merchant runs on LINE with a visual-canvas-built flow.
- **P2:** a cold visitor understands, sees a live bot + real ROI + price, and registers.
- **P3:** a validated AI salesperson sells on web + LINE + Meta and books appointments.
- **P4:** merchants see payback in money; the business runs on one codebase.

---

## Immediate next actions (this week)

1. **[You + counsel]** Start Privacy Notice/DPA (0.2) and **[You + Meta]** Meta Business Verification (0.7) — the two clocks that can't be compressed later.
2. **[You + finance]** Decide FlowBot Basic price + seed Stripe live map (0.1).
3. **[You]** Secure and name one Thai SME pilot merchant (0.6).
4. **[Agent]** On your go, I'll pick up the code-ready Phase 0 items (deploy probes, checkout/webhook metrics, axe fixes) so they land while the commercial/legal clocks run.
