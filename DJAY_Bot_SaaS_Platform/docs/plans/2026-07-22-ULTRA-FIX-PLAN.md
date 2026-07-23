# ULTRA Fix Plan — DJAY Bot SaaS ≥9.5 + Root Voice Safety

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Execute **gate order from Plan v2**. Checkbox steps are mandatory. Do **not** set `sellable: true` until **G7** (after **G6b**).
>
> **Authority stack (highest wins on conflict):**  
> 1. [`2026-07-22-FULL-IMPLEMENTATION-PLAN.md`](./2026-07-22-FULL-IMPLEMENTATION-PLAN.md) (**phase order & clear steps**)  
> 2. [`2026-07-22-path-to-10-all-roles.md`](./2026-07-22-path-to-10-all-roles.md) (Cast B gates G6c/d/e + rubrics)  
> 3. This ULTRA plan (schemas, file maps, low-level checklists)  
> 4. [`2026-07-22-score-to-9.5-plan-v2-amended.md`](./2026-07-22-score-to-9.5-plan-v2-amended.md) (gate theory)  
> 5. [`2026-07-22-score-to-9.5-excellence-program.md`](./2026-07-22-score-to-9.5-excellence-program.md) (task catalog)  
> 6. `docs/product/djay-bots-v1-market-release-prd.md` (EXP/ONB/COM)  
> 7. `AGENTS.md` (hard isolation rules)

**Goal:** Deliver one self-serve sellable SKU (default **`flowbot_basic`**) so a merchant can register → pay → wizard → deploy → first conversation without Platform Master, while fixing prior Root Voice vulnerabilities and certifying all role rubrics ≥9.5.

**Architecture:** Keep modular monolith + forced RLS + realm cookies + evidence-based onboarding. Add `purchase_intent`, Stripe webhook activation as default path, linear wizard, role-based IA, abuse floor before pay, pen-test before sellable. Root Voice is a **separate release train**.

**Tech Stack:** Node 24, pnpm 11.12, Next.js App Router, PostgreSQL 16, Zod, `@neondatabase`/`postgres`, Stripe, Vitest, existing Chromium QA scripts, existing `enforceRateLimit` → `operations.rate_limits`.

**Default locked decisions (override only in G0 with written decision-register update):**
- First SKU: `flowbot_basic`
- Commercial model: **paid-first** (no open trial)
- Calendar: **P50 = 14 weeks**, P80 = 20 weeks, stretch = 10 weeks
- UI languages: `en` + `th` chrome for first-SKU surfaces
- Platform `activatePilot` remains for comps only

---

## Global Constraints

- Never trust browser-supplied tenant, role, plan, price, provider, or model IDs.
- Browser cannot mark onboarding ready; only `{ "action": "refresh" }` recomputes evidence.
- FlowBot packages import no AI/provider packages.
- Provider/model IDs never enter tenant/public DTOs, widgets, exports, or errors.
- Exactly one active Tenant Master Admin per tenant.
- Cross-tenant access returns non-revealing `not_found` / 404.
- `sellable: true` only after G6 + G6b + accepted requirement subset for that SKU.
- Do not parallel-edit the same megapage (`flowbot/page.tsx`, `ai-chat/page.tsx`, `workspace/page.tsx`) across W3 and W6.
- Prefer extend `enforceRateLimit` / `commerce-store` / `activatePilot` over new parallel systems.
- Root Voice fixes never commit `.env.local` secrets.

---

## 0. Baseline inventory (what already exists)

### SaaS (reuse — do not rebuild)

| Capability | Location | Plan action |
|------------|----------|-------------|
| Register / verify / tenant provision | `packages/auth`, `packages/db/src/auth-store.ts`, `apps/public-site` | Fix copy; attach purchase intent |
| Pending subscription | `commerce-store.createPendingSubscription` | Keep; activate via webhook not only pilot |
| Stripe checkout prepare/complete | `commerce-store`, `apps/api/app/tenant/billing/checkout/route.ts` | Already has Origin + `hasSensitiveTenantAssurance` |
| Pilot activate | `commerce-store` ~activatePilot, Platform UI | Keep as escape hatch |
| Durable rate limits | `enforceRateLimit` in `apps/api/lib/http.ts` → `operations.rate_limits` via auth-store | **Extend** to checkout/auth gaps |
| Onboarding evidence | `tenant-workspace-store.ts`, `GET/PATCH /tenant/onboarding` | Add `nextHref` / wizard |
| RLS / realms / cookies | `scoped-transaction`, auth-cookies, AGENTS.md | Preserve |
| Inbox takeover | tenant inbox routes + UI | Add search; role home |
| Deploy + origin allowlist | WebsiteDeploymentForm, public widget routes | Use in wizard |
| Catalogue sellable gate | `packages/catalog` requires `sellable && stripeMappingState === live_ready` | Flip only at G7 |

### Root Voice (fix — production risk)

| Defect | File | Fix |
|--------|------|-----|
| Session mint without CORS check | `src/app/api/session/route.ts` | `isAllowedCorsRequest` before provider/DB |
| Lead without CORS check | `src/app/api/lead/route.ts` | Same |
| Voice quota counts all channels | `reserveConversation` in session route | Filter `channel = 'voice_widget'` |
| Double-book race | `booking/appointments/route.ts` | Exclusion or transactional claim |
| No security headers | `next.config.ts` | CSP / frame-ancestors / nosniff / Referrer / HSTS |
| API auth redirects HTML | `admin-auth.ts` | `requireAdminApi` → 401 JSON |
| Lead PATCH always ok | `api/admin/leads/[id]/route.ts` | 404 if 0 rows |
| Dead search UI | `AdminShell.tsx` | Remove or implement |

### PRD requirements to implement for first SKU (minimum set)

Must reach `implemented` then `accepted` for G7 (IDs from PRD):  
`EXP-003, EXP-004, EXP-005, EXP-006, EXP-007, EXP-008, EXP-009`,  
`ONB-001, ONB-002, ONB-003, ONB-004` (if FlowBot) **or** `ONB-006` (if AI Chat),  
`ONB-010` (independent product state), `ONB-012` (test ≠ customer allowance),  
plus shared COM/BIL subset required for checkout webhook activation (use registry filter for `flowbot_basic` + `shared` billing activation only — do not accept all 291).

---

## 1. File map (create / modify)

### Train RV — Root Voice (`DJAI_WebDev_Landing_Page/` root)

| Path | Action |
|------|--------|
| `src/lib/cors.ts` | Keep; ensure callers use `isAllowedCorsRequest` |
| `src/app/api/session/route.ts` | Gate CORS; quota filter |
| `src/app/api/lead/route.ts` | Gate CORS |
| `src/app/api/booking/appointments/route.ts` | Atomic slot claim |
| `scripts/migrate.mjs` or new SQL migration | Exclusion/unique for appointments |
| `src/lib/admin-auth.ts` | Split page vs API auth |
| `src/app/api/admin/leads/[id]/route.ts` | Rowcount check |
| `next.config.ts` | Security headers |
| `src/app/admin/AdminShell.tsx` | Dead search |
| `scripts/smoke-public.mjs` | Add CORS negative assertion |

### Train SS — SaaS (`DJAY_Bot_SaaS_Platform/`)

| Path | Action |
|------|--------|
| `packages/db/migrations/0079_purchase_intents.sql` | **Create** |
| `packages/db/src/commerce-store.ts` | Intent CRUD + webhook consume |
| `packages/db/src/commerce-store.integration.test.ts` | Extend |
| `packages/shared/src/*` | PlanKey types / messages if needed |
| `apps/api/lib/tenant-mutation.ts` | **Create** helper |
| `apps/api/lib/http.ts` | Ensure checkout rate-limit helpers exported |
| `apps/api/lib/container.ts` | Commerce capability profile (start without Stripe when commerce off) |
| `apps/api/app/public/auth/register/route.ts` | Accept/store intent planKey |
| `apps/api/app/tenant/billing/checkout/route.ts` | Rate limit + intent resolve |
| `apps/api/app/public/billing/webhooks/stripe/route.ts` | Ensure activation path sets `accessMode: active` |
| `apps/api/app/tenant/onboarding/route.ts` | Return `nextHref`/`nextLabel` |
| `packages/db/src/tenant-workspace-store.ts` | Compute next actions + hrefs |
| `apps/public-site/app/page.tsx` | Honest copy; intent wiring |
| `apps/tenant-web/app/workspace/page.tsx` | Primary CTA + hrefs |
| `apps/tenant-web/app/workspace/setup/**` | **Create** wizard routes |
| `apps/tenant-web/app/workspace/WorkspaceSidebar.tsx` | Grouped nav + role home |
| `apps/tenant-web/app/workspace/inbox/page.tsx` | Search |
| `apps/tenant-web/app/workspace/security/page.tsx` | MFA QR |
| `apps/tenant-web/app/workspace/flowbot/page.tsx` | Tab collapse (after wizard) |
| `apps/tenant-web/app/styles.css` + i18n dicts | Mobile drawer + TH/EN |
| `packages/authorization/src/index.ts` | Narrow conversation_manager (ADR) |
| `requirements/market-release-decisions.yaml` | Paid-path decision |
| `requirements/market-release-v1.yaml` | sellable flip **only at G7** |
| `docs/plans/scoreboard.md` | **Create** |
| `docs/plans/release-dashboard.md` | **Create** |
| `docs/validation/score-evidence-9.5.md` | **Create** at G8 |
| `docs/runbooks/sellable-kill-switch.md` | **Create** before G7 |
| `scripts/qa-merchant-first-sku.mjs` (or e2e) | **Create** unmocked G6 |

---

## 2. Gate checklist (execute in order)

Copy into `docs/plans/scoreboard.md` and tick only with evidence links.

- [ ] **G0** Program lock
- [ ] **RV-G1** Root Voice safety
- [ ] **G1b** Abuse floor (SS)
- [ ] **G2** Paid path
- [ ] **G3** First-run UX
- [ ] **G4** Operate UX
- [ ] **G5** Hardening
- [ ] **G6** Unmocked E2E
- [ ] **G6b** Pen-test lite
- [ ] **G7** One SKU sellable
- [ ] **G8** Role rubrics ≥9.5
- [ ] **G9** Soak ~9.9
- [ ] **G10** Production 10 (later)

**Forbidden:** Skip G1b or G6b. Mocked G6 for G8. Sellable before pen-test.

---

## PHASE A — G0 Program lock

### Task A1: Lock decisions and dashboards

**Files:**
- Create: `DJAY_Bot_SaaS_Platform/docs/plans/scoreboard.md`
- Create: `DJAY_Bot_SaaS_Platform/docs/plans/release-dashboard.md`
- Modify: `DJAY_Bot_SaaS_Platform/requirements/market-release-decisions.yaml`
- Modify: `DJAY_Bot_SaaS_Platform/PROJECT_STATE.md`
- Modify: `DJAY_Bot_SaaS_Platform/README.md` (engineering complete ≠ sellable)

**Interfaces:**
- Produces: `FIRST_SKU=flowbot_basic`, `COMMERCIAL_MODEL=paid_first`, `P50_WEEKS=14`, `P80_WEEKS=20`

- [ ] **Step 1:** Write `release-dashboard.md` with columns: Package | Sellable | Stripe map | Accepted reqs | Live providers | Named merchant | Blockers. Pre-fill six packages all sellable=false.
- [ ] **Step 2:** Write `scoreboard.md` with baseline multi-role scores (from Jul 22 review) + empty rubric checkboxes from Plan v2.
- [ ] **Step 3:** Add decision-register entry: “Paid self-serve path authorized for staging toward single-SKU GA; all other packages remain non-sellable; Platform pilot activate retained for comps.”
- [ ] **Step 4:** Name owners in PROJECT_STATE: Commerce, Onboarding, Studio UX, Inbox, Security, SQA, Root Voice.
- [ ] **Step 5:** Confirm legal JSON bundle loads on public-site staging (registration not 503).
- [ ] **Step 6:** Commit docs-only.

**Exit:** G0 Pass.

---

## PHASE B — RV-G1 Root Voice safety

### Task B1: CORS gate before side effects

**Files:**
- Modify: `src/app/api/session/route.ts`
- Modify: `src/app/api/lead/route.ts`
- Modify: `scripts/smoke-public.mjs`
- Test: extend smoke or add `scripts/smoke-cors-negative.mjs`

**Interfaces:**
- Consumes: `isAllowedCorsRequest(request)` from `src/lib/cors.ts`
- Produces: Disallowed Origin → 403 JSON **before** `reserveConversation` / OpenAI / Gemini

- [ ] **Step 1:** Write failing smoke: `POST /api/session` with `Origin: https://evil.example` expects **403** and **no** new conversation row / no clientSecret.
- [ ] **Step 2:** In `POST` of session route, immediately after body parse start (before reserve):

```ts
if (!isAllowedCorsRequest(request)) {
  return corsJson(request, { error: "Origin is not allowed." }, { status: 403 });
}
```

- [ ] **Step 3:** Same guard at top of `lead/route.ts` POST.
- [ ] **Step 4:** Note: missing Origin may still pass `isAllowedCorsRequest` today — document as “non-browser clients allowed”; rate limits + caps remain mandatory. Do **not** open `*` in production.
- [ ] **Step 5:** Run smoke; commit.

### Task B2: Voice quota channel filter

**Files:**
- Modify: `src/app/api/session/route.ts` (`reserveConversation` CTE)
- Modify: text chat session route to use its own cap if shared table

- [ ] **Step 1:** Failing test/query fixture: insert N text conversations same day; voice mint must still succeed until voice cap.
- [ ] **Step 2:** Change quota count to:

```sql
where started_at >= date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok'
  and channel = 'voice_widget'
```

(Ensure inserts set `channel` correctly for voice vs text.)

- [ ] **Step 3:** Verify text path uses `channel = 'text_widget'` and its own cap.
- [ ] **Step 4:** Commit.

### Task B3: Appointment overlap protection

**Files:**
- Modify: `src/app/api/booking/appointments/route.ts`
- Modify: `scripts/migrate.mjs` (or add SQL)

- [ ] **Step 1:** Add migration for exclusion or unique constraint on active appointments per booking_link + time range, e.g. prevent overlapping `pending_confirmation`/`confirmed` for same `booking_link_id`.
- [ ] **Step 2:** Wrap find+insert in a transaction with `SELECT … FOR UPDATE` on booking_link or advisory lock keyed by link id + start.
- [ ] **Step 3:** Concurrent double-POST test: exactly one 200, one 409/400 “no longer available”.
- [ ] **Step 4:** Commit.

### Task B4: Headers, API auth, lead PATCH, dead search

**Files:**
- Modify: `next.config.ts`
- Modify: `src/lib/admin-auth.ts`
- Modify: `src/app/api/admin/**` to use API helper
- Modify: `src/app/api/admin/leads/[id]/route.ts`
- Modify: `src/app/admin/AdminShell.tsx`

- [ ] **Step 1:** Add headers in `next.config.ts`:

```ts
async headers() {
  return [{
    source: "/:path*",
    headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
      // HSTS only when behind HTTPS prod
    ],
  }];
}
```

- [ ] **Step 2:** Add `requireAdminApi()` returning 401 JSON; keep `requireAdmin()` redirect for pages.
- [ ] **Step 3:** Lead PATCH: if update rowCount 0 → 404 `{ error: "Not found." }`.
- [ ] **Step 4:** Remove non-functional search input **or** wire to leads search — prefer remove for RV-G1.
- [ ] **Step 5:** `pnpm smoke:public`; curl headers; commit.

**Exit:** RV-G1 Pass. Soft dependency only for SS marketing “portfolio safe”.

---

## PHASE C — G1b Abuse floor (SaaS)

### Task C1: Extend durable rate limits to checkout + tighten auth

**Files:**
- Modify: `apps/api/app/tenant/billing/checkout/route.ts`
- Modify: `apps/api/app/public/auth/login/route.ts` (verify limits present)
- Modify: webhook routes if missing limits
- Reuse: `enforceRateLimit` from `apps/api/lib/http.ts`

**Interfaces:**
- Consumes: existing `operations.rate_limits` via `enforceRateLimit(scope, key, limit, windowMs)`
- Produces: checkout ≤ e.g. 10 / 15 min / tenant+user; webhook flood protected

- [ ] **Step 1:** Confirm checkout already calls `hasSensitiveTenantAssurance` (it does) — keep; add MFA-required policy when `mfaEnabled` on actor.
- [ ] **Step 2:** Add `enforceRateLimit("tenant-billing-checkout", `${tenantId}:${userId}`, 10, 15*60*1000)` before Stripe create.
- [ ] **Step 3:** Verify register/login rate limits remain; add test hitting 429.
- [ ] **Step 4:** CSP baseline: ensure `config/next-security-headers.ts` applied to public-site + tenant-web; document residual `unsafe-inline` in `docs/validation/csp-baseline.md`.
- [ ] **Step 5:** Commit.

**Exit:** G1b Pass — **required before G2 UI work ships to staging**.

---

## PHASE D — G2 Paid path

### Task D1: `purchase_intents` migration + store API

**Files:**
- Create: `packages/db/migrations/0079_purchase_intents.sql`
- Modify: `packages/db/src/commerce-store.ts`
- Modify: `packages/db/src/commerce-store.integration.test.ts`
- Update schema registry / migration runner lists if required by repo convention

**Schema (normative):**

```sql
-- billing.purchase_intents
id uuid primary key,
registration_id uuid null,
tenant_id uuid null references tenancy.tenants(id),
plan_key text not null,
plan_version_id uuid null,
status text not null check (status in ('open','consumed','expired','canceled')),
created_at timestamptz not null default now(),
expires_at timestamptz not null,
consumed_at timestamptz null,
consumed_checkout_intent_id uuid null
-- RLS: tenant_id = tenancy.current_tenant_id() when set; system role for pre-tenant
```

**Interfaces:**

```ts
createPurchaseIntent(input: {
  planKey: string;
  registrationId?: string;
  tenantId?: string;
  ttlHours?: number; // default 72
}): Promise<{ intentId: string }>

attachPurchaseIntentToTenant(tenantId: string, registrationId: string): Promise<void>

resolvePurchaseIntentForCheckout(
  context: TenantContext,
  intentId: string,
): Promise<{ planKey: string; planVersionId: string } | { status: "unavailable" }>

consumePurchaseIntent(args: {
  intentId: string;
  checkoutIntentId: string;
}): Promise<void>
```

- [ ] **Step 1:** Write integration tests for create → attach on verify → resolve → consume idempotent.
- [ ] **Step 2:** Apply migration `0079`; second run applies zero.
- [ ] **Step 3:** Implement store methods with parameterized SQL only.
- [ ] **Step 4:** Never accept price/entitlement from browser.
- [ ] **Step 5:** Commit.

### Task D2: Wire register / verify / checkout / webhook activation

**Files:**
- Modify: `apps/api/app/public/auth/register/route.ts`
- Modify: verify-email provisioning path in auth-store
- Modify: `apps/api/app/tenant/billing/checkout/route.ts`
- Modify: Stripe webhook handler to set `accessMode: "active"` on paid success (reuse existing settlement)
- Modify: `apps/public-site/app/page.tsx` copy
- Modify: `apps/tenant-web` usage/overview for package picker when `accessMode !== active`

**PRD:** EXP-004, EXP-005, EXP-007, EXP-008, EXP-009

- [ ] **Step 1:** Register accepts optional `selectedPlanKey` → `createPurchaseIntent` (status open).
- [ ] **Step 2:** On email verify tenant create → `attachPurchaseIntentToTenant`.
- [ ] **Step 3:** Unsubscribed Overview: “Choose product” → `createPendingSubscription` + checkout (not Platform).
- [ ] **Step 4:** Checkout resolves intent server-side; Stripe session; webhook activates entitlement **without** Platform button.
- [ ] **Step 5:** Return URL `/workspace/usage?checkout=return` reconciles local state only (EXP-008) — no provision from query success flag.
- [ ] **Step 6:** Replace copy: remove “confirmed after email verification”; use “We’ll activate this plan after payment” / “Saved as your setup preference”.
- [ ] **Step 7:** Tests: duplicate webhook; expired checkout replace; pilot activate still works.
- [ ] **Step 8:** Staging dry-run with Stripe test card — evidence screenshot + request ids in validation note.

**Exit:** G2 Pass.

---

## PHASE E — G3 First-run UX

### Task E1: Server nextHref + Overview CTA

**Files:**
- Modify: `packages/db/src/tenant-workspace-store.ts`
- Modify: `apps/api/app/tenant/onboarding/route.ts`
- Modify: `apps/tenant-web/app/workspace/page.tsx`
- Modify: `scripts/check-onboarding-readiness.mjs` if contract changes
- Align: `docs/runbooks/onboarding-launch-readiness.md`

**Produces:** Each incomplete step includes `{ key, label, detail, complete, nextHref?, nextLabel? }`

- [ ] **Step 1:** Map:
  - business profile → `/workspace/setup/profile` (or settings)
  - no active access → `/workspace/usage` (checkout)
  - configure → `/workspace/flowbot` (or setup/configure)
  - deploy → setup/deploy
  - test → setup/test
- [ ] **Step 2:** Overview renders sticky primary button = first incomplete `nextHref`.
- [ ] **Step 3:** Ensure `href` is always set when `!complete` (fixes dead Continue bug).
- [ ] **Step 4:** Remove/replace Operations “Mark reviewed” fake guides with links into wizard.
- [ ] **Step 5:** Lint onboarding readiness Pass; commit.

### Task E2: Linear wizard (ONB-003 + ONB-004)

**Files:**
- Create: `apps/tenant-web/app/workspace/setup/page.tsx` (+ steps)
- Reuse: FlowBot template chips, WebsiteDeploymentForm, publish APIs
- Ensure: preview/test does not charge customer allowance (ONB-012) — assert meter tags

**Steps UI:** Profile → Template/greeting → Publish → Exact origin + key → Install check → Current-version test → Celebrate (launchReady)

- [ ] **Step 1:** Wizard shell with save & exit; resume from onboarding evidence.
- [ ] **Step 2:** Gate each step on server evidence after refresh.
- [ ] **Step 3:** Role-aware: operators read-only.
- [ ] **Step 4:** TH/EN chrome strings for wizard + sidebar + checkout return (minimal dict).
- [ ] **Step 5:** Chromium journey (can be partial until G6 full unmocked).

**Exit:** G3 Pass.

---

## PHASE F — G4 Operate UX

### Task F1: IA + mobile + role home

**Files:**
- Modify: `WorkspaceSidebar.tsx`
- Modify: tenant-web login redirect / workspace default route by role
- Modify: `styles.css` mobile drawer

**Nav groups:** Get live (Overview, Setup) · Customers (Inbox, Contacts, Leads) · Products (FlowBot, …) · Workspace (Team, Usage, Security, Data)

- [ ] **Step 1:** `tenant_human_agent` / operator default → `/workspace/inbox`.
- [ ] **Step 2:** Owner default → `/workspace` or `/workspace/setup` if not launchReady.
- [ ] **Step 3:** Hide or demote product studios for agent role (view-only → hidden preferred).
- [ ] **Step 4:** Mobile drawer instead of 3-col link soup.
- [ ] **Step 5:** Humanize role/stage labels (no snake_case in chrome).

### Task F2: Inbox search + MFA QR

**Files:**
- Modify: inbox page + API list endpoint (add `q` param, tenant-scoped)
- Modify: `security/page.tsx` — QR from `otpauth://` URI

- [ ] **Step 1:** Search by name/phone/email ilike; empty state CTA.
- [ ] **Step 2:** MFA enroll shows QR image + manual key + recovery download.
- [ ] **Step 3:** **Do not** build full leads pipeline in G4 (deferred W5b).

### Task F3: Studio tab collapse (serialize after E2)

**Files:**
- Modify: `flowbot/page.tsx` → tabs Setup | Flow | Deploy | Channels | Advanced
- Optionally AI Chat later; first SKU is FlowBot

- [ ] **Step 1:** Freeze wizard; then refactor FlowBot only.
- [ ] **Step 2:** Rename dishonest “Test Call” if Voice touched; N/A for Flow-only SKU.

**Exit:** G4 Pass.

---

## PHASE G — G5 Hardening

### Task G1: `withTenantMutation` helper + allowlist migration

**Files:**
- Create: `apps/api/lib/tenant-mutation.ts`
- Migrate first: checkout, subscriptions POST, privacy, team invite, flowbot deploy/publish

```ts
export async function withTenantMutation<T>(
  request: NextRequest,
  options: {
    permission: Parameters<typeof tenantRoleAllows>[1];
    assurance?: "none" | "recent_auth" | "recent_mfa";
    rateLimit: { scope: string; limit: number; windowMs: number };
    bodySchema: z.ZodType<T>;
  },
  handler: (ctx: {
    context: NonNullable<Awaited<ReturnType<typeof resolveTenantRequest>>>["context"];
    session: NonNullable<Awaited<ReturnType<typeof resolveTenantRequest>>>["session"];
    services: NonNullable<Awaited<ReturnType<typeof resolveTenantRequest>>>["services"];
    body: T;
    requestId: string;
  }) => Promise<Response>,
): Promise<Response>
```

- [ ] **Step 1:** Unit test: missing origin → 404/not_found; missing permission → 404; rate limit → 429; bad body → 400.
- [ ] **Step 2:** Refactor allowlisted routes to use helper.
- [ ] **Step 3:** ADR: narrow `tenant_conversation_manager` publish/deploy permissions.
- [ ] **Step 4:** Document commerce capability profile in `container.ts` — API boots with `commerce_enabled=false` without Stripe secrets; add startup test.
- [ ] **Step 5:** Split only billing activation helpers out of `commerce-store.ts` if file touched beyond ~tolerance.

**Exit:** G5 Pass.

---

## PHASE H — G6 / G6b Proof

### Task H1: Unmocked merchant E2E

**Files:**
- Create: `scripts/qa-merchant-first-sku.mjs` (or Playwright under `tests/e2e/merchant-first-sku.spec.ts`)
- Create: `docs/validation/p-first-sku-e2e.md`

**Flow:** register → verify (test inbox) → checkout Stripe test → webhook → active → wizard complete → widget message on allowed origin → inbox shows conversation

**Negatives:** evil Origin on widget; cross-tenant resource 404; checkout idempotency; webhook replay

- [ ] **Step 1:** Script against staging URLs; **no API mocks**.
- [ ] **Step 2:** axe on wizard, inbox, checkout return.
- [ ] **Step 3:** Record evidence paths in validation doc.
- [ ] **Step 4:** G6 Pass only if all green.

### Task H2: Pen-test lite + abuse

**Produces:** `docs/validation/pen-test-lite-first-sku.md`

Checklist: IDOR tenant resources, checkout without assurance, webhook secret, widget origin bypass, rate-limit effectiveness, session cookie flags, XSS in i18n/wizard

- [ ] **Step 1:** Run internal red-team checklist; file findings.
- [ ] **Step 2:** Fix all Critical/High or document compensating control + owner.
- [ ] **Step 3:** Abuse: 100 checkout attempts → 429; signup flood → 429.
- [ ] **Step 4:** G6b Pass.

---

## PHASE I — G7 Sellable + kill switch

### Task I1: Kill switch runbook + drill

**Files:**
- Create: `docs/runbooks/sellable-kill-switch.md`

- [ ] **Step 1:** Document &lt;15 min: set sellable=false, pause Stripe webhook, force checkout_unavailable, comms template.
- [ ] **Step 2:** Drill once in staging; log timestamp in scoreboard.

### Task I2: Flip one package

**Files:**
- Modify: catalogue seed / `market-release-v1.yaml` for `flowbot_basic` only
- Ensure `stripeMappingState: live_ready`
- Accept requirement subset in registry (PO + counsel as required)
- Update decision-register

- [ ] **Step 1:** Staging sellable=true soak ≥48h.
- [ ] **Step 2:** Production flip with kill switch ready.
- [ ] **Step 3:** Named merchant worksheet signed.
- [ ] **Step 4:** G7 Pass.

---

## PHASE J — G8 Certification

### Task J1: Rubric board

**Files:**
- Create: `docs/validation/score-evidence-9.5.md`
- Update: `docs/plans/scoreboard.md`

For each role Must-Pass in Plan v2, paste evidence link (PR, test log, screenshot, pen-test section).

- [ ] **Step 1:** Merchant, Staff (interim), SQA, UX/UI, SWE, CTO, Red team, PM, Product, Agent all Pass.
- [ ] **Step 2:** Open issues only Low severity.
- [ ] **Step 3:** G8 Pass — declare multi-role ≥9.5.

---

## PHASE K — Post-G8 (not blocking first 9.5)

- W5b: Leads pipeline + contacts human profile editor
- AI Chat / Voice SKUs as separate programs
- Social live activation
- G9 soak 14d → ~9.9
- G10 30–90d SLOs → 10

---

## 3. Commands cheatsheet

```bash
# SaaS
cd DJAY_Bot_SaaS_Platform
scripts/use-node24.sh pnpm install
scripts/use-node24.sh pnpm verify
scripts/test-db-integration.sh
scripts/use-node24.sh pnpm run lint:onboarding-readiness
# after G6 script exists:
scripts/use-node24.sh node scripts/qa-merchant-first-sku.mjs

# Root Voice
cd ..
pnpm smoke:public
pnpm smoke:no-secrets   # expects failure when secrets present — use CORS negative script instead for RV-G1
```

---

## 4. Risk register (plan-level)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Stripe TH / counsel delay | High | Schedule | P80=20w; keep sellable false |
| Waive G1b/G6b under pressure | Med | Security cliff | Forbidden in Global Constraints |
| Megapage merge conflicts | Med | Quality | Serialize W3→W6 |
| Expand to 6 packages | Med | Never ship | Release dashboard one-SKU rule |
| container Stripe coupling | Med | Deploy fail | Capability profile test in G5 |
| Score theater without evidence | Med | Fake 9.5 | Binary rubrics + G8 evidence file |

---

## 5. Definition of Done (program)

1. Merchant completes paid self-serve FlowBot Basic journey without Platform click.  
2. RV-G1 production Voice defects closed.  
3. G6 unmocked + G6b pen-test evidenced.  
4. One package sellable with kill switch drilled.  
5. `score-evidence-9.5.md` complete — all role rubrics Pass.  
6. Decision register + PROJECT_STATE say “one SKU GA”; others non-sellable.

---

## 6. Immediate next 5 actions

1. Human confirms G0 locks (or edits FIRST_SKU).  
2. Open RV Task B1 (CORS) PR.  
3. Open SS Task D1 (`0079_purchase_intents`) PR with failing tests.  
4. Draft kill-switch runbook stub.  
5. Create empty `scoreboard.md` / `release-dashboard.md`.

---

*End of ULTRA Fix Plan. Related canvases: plan-v2-near-10, trio-prd-code-plan-rating, multi-role-saas-review, self-serve-onboarding-design, full-codebase-audit, plan-critique-review.*
