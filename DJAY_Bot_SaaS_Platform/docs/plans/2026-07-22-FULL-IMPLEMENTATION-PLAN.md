# Full Implementation Plan — Phase by Phase

**Product:** DJAY Bot SaaS (first sellable SKU) + Root Voice safety  
**Default SKU:** `flowbot_basic` (paid-first)  
**Goal:** Merchant self-serve go-live; all role rubrics ≥9.5; path to ~9.9/10  
**Calendar:** P50 ≈ **16–18 weeks** · P80 ≈ **22 weeks** · stretch ≈ 12 weeks  

**Authority:** This document is the **execution order**. Detail schemas/APIs live in `2026-07-22-ULTRA-FIX-PLAN.md`. Specialist gates live in `2026-07-22-path-to-10-all-roles.md`. On conflict: **this plan’s phase order wins**.

**Hard rules:**
1. Never set `sellable: true` without Phase 9 (pen-test) + Phase 10 (privacy) + Phase 11 (commercial).
2. One SKU only until Phase 16.
3. Do not rewrite FlowBot studio pages while the wizard is still being built (Phase 6 before Phase 7 studio tabs).
4. Keep RLS / realm cookies / evidence-based onboarding — extend, don’t replace.

---

## How to read each phase

Every phase has:
- **Why** — what problem it solves  
- **Who** — owners  
- **Steps** — ordered work  
- **Done when** — exit gate (must all be true)  
- **Depends on** — previous phases  

Tick steps in order. Do not start the next phase’s *shipping* work until the prior phase’s **Done when** is met (parallel prep is OK where noted).

---

# PART 0 — Setup

## Phase 0 — Program lock

**Why:** Without a locked SKU, calendar, and owners, the team will expand scope and never ship.

**Who:** PM + CTO + Product Owner  

**Steps:**
1. Confirm first SKU = `flowbot_basic` (or write a one-line change to AI Chat Basic and replace “FlowBot” below).
2. Confirm commercial model = **paid-first** (no open trial).
3. Publish `docs/plans/release-dashboard.md` (all packages non-sellable; blockers listed).
4. Publish `docs/plans/scoreboard.md` (baseline scores + empty rubric checkboxes).
5. Update `requirements/market-release-decisions.yaml`: paid self-serve path authorized for one SKU; pilot activate kept for comps.
6. Name owners: Commerce, Onboarding, Inbox, Security, Privacy, SRE, RevOps, Support, SQA, Root Voice.
7. Verify staging legal Terms/Privacy bundle loads (registration does not 503).
8. Book counsel (privacy notice/DPA) and finance (tax decision) for Phases 10–11.

**Done when:** Decisions written; dashboards exist; owners named; legal bundle loads; counsel/finance meetings scheduled.  

**Gate:** **G0**

---

# PART 1 — Safety floors (do not take paid traffic yet)

## Phase 1 — Root Voice production hotfixes

**Why:** The live Voice app can mint sessions without proper Origin checks, double-book slots, and mix text into voice quotas. Fix this on its own train so the portfolio is not bleeding while SaaS improves.

**Who:** Root Voice engineer + SQA  

**Depends on:** Phase 0 (soft)

**Steps:**
1. **CORS before side effects** — On `POST /api/session` and `POST /api/lead`, call `isAllowedCorsRequest`; if false return 403 **before** DB reserve or provider mint. Add smoke: evil Origin → 403, no clientSecret.
2. **Voice quota** — Daily cap counts only `channel = 'voice_widget'`; text uses its own cap.
3. **Booking race** — Transactional claim or DB exclusion so two concurrent bookings cannot take the same slot; add concurrency test.
4. **Security headers** — `next.config.ts`: nosniff, Referrer-Policy, frame denial/CSP frame-ancestors, HSTS in HTTPS prod.
5. **Admin API auth** — JSON 401 helper for API routes; pages keep redirect.
6. **Lead PATCH** — Return 404 when zero rows updated.
7. **Dead search** — Remove non-functional admin search (or implement later).
8. Run `pnpm smoke:public` + CORS negative script; deploy Root Voice when green.

**Done when:** All steps evidenced; smoke Pass; no open Critical on Root Voice session/booking.  

**Gate:** **RV-G1**  
**Note:** Optionally document “single-instance Hostinger” **or** add durable rate limits for Root Voice (required later for SRE ≥9.5 — see Phase 12).

---

## Phase 2 — SaaS abuse floor

**Why:** You must not open checkout until abuse controls and CSP baseline exist. SaaS already has durable `enforceRateLimit` and checkout reauth — extend them.

**Who:** Security + API  

**Depends on:** Phase 0  

**Steps:**
1. Add `enforceRateLimit` to tenant billing **checkout** (per tenant+user).
2. Confirm login/register/webhook rate limits remain; add/adjust tests for 429.
3. Keep `hasSensitiveTenantAssurance` on checkout; if user has MFA enabled, require recent MFA for checkout.
4. Apply CSP baseline to public-site + tenant-web; document any residual `unsafe-inline` in `docs/validation/csp-baseline.md`.
5. Smoke: rapid checkout attempts → 429.

**Done when:** Checkout is rate-limited; reauth/MFA policy documented and tested; CSP note published.  

**Gate:** **G1b** — **hard stop before Phase 4 UI goes to staging**

---

# PART 2 — Self-serve money path

## Phase 3 — Purchase intent (data foundation)

**Why:** PRD EXP-004 — plan choice must be a server-side intent, never browser price/plan authority.

**Who:** Commerce / DB  

**Depends on:** Phase 0  

**Steps:**
1. Add migration `0079_purchase_intents` (see ULTRA schema: plan_key, status open/consumed/expired/canceled, tenant/registration linkage, RLS).
2. Implement store APIs: `createPurchaseIntent`, `attachPurchaseIntentToTenant`, `resolvePurchaseIntentForCheckout`, `consumePurchaseIntent`.
3. Integration tests: create → attach on verify → resolve → consume idempotent; reject browser price fields.
4. Run migration twice (second applies zero).

**Done when:** Migration + tests Pass in CI/DB harness.  

**Internal milestone:** Intent ready (no user-facing sellable yet)

---

## Phase 4 — Checkout → webhook → active access

**Why:** Today merchants stop at “awaiting Platform activation.” This phase makes **payment** the activator.

**Who:** Commerce + Public site + Tenant Usage  

**Depends on:** Phase 2, Phase 3  

**Steps:**
1. **Register** — Optional plan selection creates `purchase_intent` (status `open`).
2. **Verify email** — Tenant provision attaches intent to tenant.
3. **Copy fix** — Remove “plan confirmed after verification”; say preference saved / activates after payment.
4. **Unsubscribed workspace** — Show Choose product / Checkout (not empty dead Studios). Studios explain “pay to unlock.”
5. **Checkout** — Resolve intent server-side → existing `prepareStripeCheckout` / Stripe session → return URL reconciles state only (never provision from `?success=`).
6. **Webhook** — Verified Stripe event sets subscription `accessMode: active` (+ plan snapshot). Idempotent; replay-safe.
7. **Keep** Platform `activatePilot` for comps only; document revenue rule (pilot ≠ paid).
8. Staging dry-run with Stripe **test** card: pay → active **without** Platform click. Screenshot + request IDs in `docs/validation/`.

**Done when:** Staging merchant completes pay→active alone; duplicate webhook safe; pilot path still works; signup copy honest.  

**Gate:** **G2**

---

# PART 3 — Make the product finishable

## Phase 5 — Actionable Overview (next steps that link)

**Why:** Launch checklist says “Action needed” but often has no `href` — merchants are stuck.

**Who:** Onboarding + Tenant web  

**Depends on:** Phase 4 (can start wiring after Phase 3)

**Steps:**
1. Server computes `nextHref` / `nextLabel` per incomplete step (profile, pay/activate, configure, deploy, test).
2. Overview shows **one primary button** = first incomplete step.
3. Replace Operations “Mark reviewed” fake guides with links into real setup.
4. Keep browser unable to mark ready — only refresh recomputes evidence.
5. Update onboarding readiness lint/runbook if contract changes.

**Done when:** No incomplete step without a working link; lint Pass.  

**Milestone:** Checklist is actionable

---

## Phase 6 — Setup wizard (FlowBot Basic)

**Why:** PRD ONB-003/004 — guided path from paid access to first live widget conversation.

**Who:** Product + FlowBot eng + UX  

**Depends on:** Phase 4, Phase 5  

**Steps:**
1. Build `/workspace/setup` wizard shell: save & exit, resume, role-aware read-only for non-admins.
2. **Step A — Business profile** (locale, timezone, hours, handover destination).
3. **Step B — Bot** — template/blank, greeting, lead capture (reuse FlowBot editor pieces).
4. **Step C — Publish** current version.
5. **Step D — Deploy** — exact HTTPS origin + one-time key + install snippet + install check.
6. **Step E — Test** — current-version journey that does **not** consume customer allowance (ONB-012).
7. **Step F — Celebrate** when server evidence says launchReady; invite teammate CTA optional.
8. Ship **en + th** chrome strings for wizard, nav, checkout return.
9. Manual walkthrough on staging.

**Done when:** Paid staging tenant can finish wizard to launchReady; TH/EN toggle works on those surfaces.  

**Gate:** **G3**

---

## Phase 7 — Day-2 operate UX

**Why:** Owners and staff need a usable console after go-live — not a 13-item dump.

**Who:** UX + Inbox + Security  

**Depends on:** Phase 6 (freeze wizard before big FlowBot page refactors)

**Steps:**
1. **Grouped nav:** Get live · Customers · Products · Workspace.
2. **Role homes:** Owner → Overview/Setup if not ready; Agent/Operator → **Inbox**.
3. Hide or demote product studios for pure agent roles.
4. **Mobile drawer** (not 3-column link soup) + skip link.
5. Humanize snake_case roles/stages in UI.
6. **Inbox search** (name/phone/email).
7. **MFA QR** + manual key + recovery codes download.
8. **FlowBot studio tabs** (after wizard frozen): Setup | Flow | Deploy | Channels | Advanced; proper `tab`/`tabpanel` ARIA.
9. Defer full leads pipeline to Phase 15 (not required for first ≥9.5).

**Done when:** Role homes work; search works; MFA QR works; mobile drawer works; FlowBot tabs + ARIA axe-clean on that page.  

**Gate:** **G4**

---

## Phase 8 — Engineering hardening

**Why:** Reduce footguns before adversaries and paying traffic.

**Who:** SWE + Security  

**Depends on:** Phase 4+ (mutate allowlisted routes)

**Steps:**
1. Add `withTenantMutation` helper (authz + Origin + assurance + rate limit + Zod).
2. Migrate allowlist: checkout, subscriptions, deploy/publish, privacy jobs, team invite.
3. ADR: narrow `tenant_conversation_manager` if it over-grants publish/deploy.
4. **Commerce capability profile** — API starts without Stripe secrets when commerce disabled; add boot test.
5. Split only the billing pieces you touch out of giant `commerce-store` if needed.
6. Unit tests for helper denial paths (403/404/429).

**Done when:** Allowlisted routes use helper; commerce-off boot test Pass; ADR merged.  

**Gate:** **G5**

---

# PART 4 — Prove it (no sellable yet)

## Phase 9 — Unmocked E2E + pen-test

**Why:** Mocked UI QA is not proof. Selling without adversarial review is unacceptable.

**Who:** SQA + Red team  

**Depends on:** Phases 4–8  

**Steps:**
1. Write `scripts/qa-merchant-first-sku` (or Playwright) against **staging**, **no API mocks**:  
   register → verify → pay (Stripe test) → wizard → widget message on allowed origin → appears in Inbox.
2. Negatives: evil Origin; cross-tenant 404; checkout idempotency; webhook replay.
3. Axe on wizard, inbox, checkout return (live).
4. Pen-test lite checklist: IDOR, checkout without reauth, webhook secret, widget origin, rate limits, XSS in i18n.
5. Abuse: signup/checkout flood → 429.
6. Fix all Critical/High or document compensating control with owner.
7. File evidence under `docs/validation/`.

**Done when:** E2E green; pen-test Critical/High closed; axe report attached.  

**Gates:** **G6** + **G6b**

---

## Phase 10 — Privacy compliance gate

**Why:** Specialist review scored Privacy plan at 4/10. You cannot ethically sell without DSAR completeness and processor disclosure.

**Who:** Privacy owner + Counsel + Eng  

**Depends on:** Phase 9 (can draft registry earlier)

**Steps:**
1. Publish **PII registry** (`docs/compliance/pii-registry.md`) for all personal data stores.
2. Extend erasure/export to cover known gaps (action payloads, voice outcome summaries, social subjects, object refs) **or** counsel-approved residual list with legal hold.
3. Legal-hold behavior: erasure skips held records; documented.
4. Legal basis matrix (contract / consent / legitimate interest) for lead + transcript processing; wire contact consent where required.
5. Update Privacy Notice: subprocessors (OpenAI, Stripe, email, GCP, channels if any), DPA posture, transfers.
6. DSAR runbook + SLA (e.g. 30 days) for Support.
7. Spot-check logs for PII leakage.

**Done when:** Counsel accepts notice bump; DSAR coverage tests or signed residual list; runbook published.  

**Gate:** **G6c** — **required before Phase 13**

---

## Phase 11 — Commercial / RevOps gate

**Why:** Tax/dunning (ADR-008) and pilot-vs-paid rules must be explicit before money.

**Who:** RevOps + Finance + Counsel  

**Depends on:** Phase 4, Phase 9  

**Steps:**
1. Decision in register: implement tax/dunning for SKU1 **or** explicit deferral (“inclusive price / offline tax; no automated dunning in SKU1”).
2. Stripe mapping `live_ready` for `flowbot_basic` in staging then prod config.
3. Pilot comps vs paid recognition rules (no double-count).
4. Merchant can open invoice/receipt (Stripe Customer Portal minimum OK).
5. Copy for expired/failed checkout (EXP-008 states).

**Done when:** Decision signed; receipt path works; dashboard shows Stripe ready for one SKU.  

**Gate:** **G6e** — **required before Phase 13**

---

## Phase 12 — Reliability / SRE gate

**Why:** Paying traffic needs ready probes and basic SLOs, not only “app started.”

**Who:** SRE  

**Depends on:** Phase 8–9  

**Steps:**
1. Point Cloud Run (or host) **readiness** probe to `/health/ready` (not only live).
2. Worker readiness: DB + basic backlog/outbox signal if applicable.
3. Metrics: checkout success %, webhook failures, API 5xx.
4. Alerts to a named owner for webhook spike / checkout 5xx.
5. Root Voice: durable rate limits **or** signed “single-instance only” ops constraint in DEPLOYMENT.md.
6. Rehearse sellable kill switch once in staging (see Phase 13).

**Done when:** Ready probes live in staging; metrics visible; Voice RL decision documented; kill-switch dry-run done.  

**Gate:** **G6d** (prefer before prod sellable; **required for G8**)

---

# PART 5 — Sell and certify

## Phase 13 — Sellable flip (one SKU)

**Why:** Only now is it safe to let strangers pay.

**Who:** PO + Commerce + SRE + Support  

**Depends on:** Phases 9, 10, 11 (and ideally 12)

**Steps:**
1. Publish Support playbook: payment/access desync, webhook delay, wrong origin, MFA lockout, invite expired, DSAR (`docs/runbooks/customer-support-sku1.md`) + TH macros for top tickets.
2. Publish kill-switch runbook (&lt;15 min: sellable=false, pause webhook, force checkout_unavailable, comms).
3. Drill kill switch in staging; log timestamp.
4. Staging: `flowbot_basic` sellable=true soak ≥48h.
5. Accept requirement subset for SKU1 in registry (EXP/ONB/COM agreed list only — not all 291).
6. Production flip with kill switch armed.
7. Named merchant Success worksheet signed.

**Done when:** One package sellable in prod; playbooks + kill switch evidenced; named merchant signed.  

**Gate:** **G7**

---

## Phase 14 — Everyone ≥9.5 certification

**Why:** Prove Cast A + Cast B rubrics with links, not vibes.

**Who:** PM + all owners  

**Depends on:** Phase 13, Phase 12  

**Steps:**
1. Fill `docs/validation/score-evidence-9.5.md` for every role Must-Pass (Plan v2 + path-to-10 Cast B).
2. Confirm only Low severity debt remains.
3. Update scoreboard: all roles ≥9.5.
4. Public/internal announcement: “SKU1 GA; other packages non-sellable.”

**Done when:** Evidence file complete; PM + CTO sign.  

**Gate:** **G8**

---

# PART 6 — Stretch to ~9.9 and 10

## Phase 15 — Post-GA hardening (does not block G8)

**Why:** Staff CRM and second products can wait.

**Steps (pick by priority):**
1. Leads pipeline + human contacts editor.
2. AI Chat / Voice as **separate** programs (repeat Phases 3–14 pattern).
3. Social channel live activation when provider worksheets exist.
4. Deeper studio polish / knowledge pinning UX.

---

## Phase 16 — Soak (~9.9)

**Depends on:** Phase 14  

**Steps:**
1. 14-day production soak; zero Sev-1.
2. Support ticket themes reviewed weekly; playbooks updated.
3. No second SKU sellable unless a new program starts.

**Gate:** **G9**

---

## Phase 17 — True 10

**Depends on:** Phase 16  

**Steps:**
1. 30–90 days: checkout SLO, uptime, webhook lag, MTTR within targets.
2. External security/privacy letter as required.
3. Churn/support load within targets.

**Gate:** **G10**

---

# Timeline (P50 view)

| Weeks | Phases |
|------|--------|
| 0–1 | 0, 1 (parallel), 2 start, 3 start |
| 2–4 | 2 done, 3–4 (paid path) |
| 4–7 | 5–6 (checklist + wizard) |
| 7–9 | 7–8 (operate UX + hardening) |
| 9–11 | 9 (E2E + pen-test) |
| 10–13 | 10–12 (privacy, commercial, SRE) overlapping |
| 13–15 | 13–14 (sellable + certify ≥9.5) |
| 15–17 | 16 soak ~9.9 |
| +30–90d | 17 → 10 |

---

# One-page checklist (gates only)

- [ ] Phase 0 — G0 Program lock  
- [ ] Phase 1 — RV-G1 Root Voice safe  
- [ ] Phase 2 — G1b Abuse floor  
- [ ] Phase 3 — Purchase intent  
- [ ] Phase 4 — G2 Paid path  
- [ ] Phase 5 — Actionable Overview  
- [x] Phase 6 — G3 Wizard
- [x] Phase 7 — G4 Operate UX
- [x] Phase 8 — G5 Hardening
- [ ] Phase 9 — G6 + G6b Proof (scaffolds + runbooks landed; staging evidence open)
- [ ] Phase 10 — G6c Privacy (engineering package landed; counsel sign-off open)  
- [ ] Phase 11 — G6e Commercial (SKU1 tax/dunning deferral + EXP-008 landed; Stripe live_ready evidence open)  
- [ ] Phase 12 — G6d Reliability (probes/metrics/kill-switch runbook landed; staging apply + drill open)  
- [ ] Phase 13 — G7 Sellable (ready-to-flip package landed; sellable=false until PASS markers)  
- [ ] Phase 14 — G8 Everyone ≥9.5 (evidence scaffold landed; signatures open)  
- [ ] Phase 15 — Post-GA backlog published (workstreams not started)
- [ ] Phase 16 — G9 ~9.9 (checklist scaffold; soak not started)
- [ ] Phase 17 — G10 True 10 (SLO shell; not started)

---

# Start tomorrow morning

1. Finish **Phase 0** (2–4 hours of docs/decisions).  
2. Open PR for **Phase 1 Step 1** (Root Voice CORS).  
3. Open PR for **Phase 3** (purchase_intents migration + failing tests).  
4. Send finance/counsel the Phase 10–11 decision requests.  

When Phase 0 is signed off, say **execute Phase 1** and implementation begins in order.
