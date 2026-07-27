# Launch critical path — response to GPTSOL_27JUL_AUDIT

**Date:** 2026-07-27
**Status:** active plan. Supersedes the ordering in `docs/plans/2026-07-26-reconciled-workstreams.md` where they conflict; that document remains the reference for W1–W5 task detail.
**Scope:** what must be true before `flowbot_basic` can be sold to a real Thai merchant, in dependency order, with machine-checkable acceptance evidence for each step.

---

## 0. Verdict on the audit

Every material finding was re-verified against the code. Results:

| Finding | Verdict | Evidence checked |
|---|---|---|
| B-01 public claims exceed evidence | **VALID** | `apps/public-site/app/page.tsx:46,211-213` — "up to 50%", "+50%", "-70%", "Channels 4"; registry reports 0/297 accepted |
| B-02 no package sellable | **VALID, but not a trust hazard** | `packages/catalog/src/index.ts:74` `sellable:false` default; **checkout already fails closed** at `packages/db/src/commerce-store.ts:133` → `plan_not_sellable`. The defect is that there is nothing to sell, not that we might mis-sell. |
| B-03 FlowBot journey incomplete | **VALID** | `FlowCanvas.tsx:94` `readOnlyNotice`; `flowbot/page.tsx:370` raw token form; `leads/page.tsx` is 58 lines; no appointment surface anywhere in `apps/tenant-web` |
| B-04 green verify ≠ release gate | **VALID** | `verify` = lint+typecheck+test+build only; `test:db`, `test:a11y`, `qa:*` all excluded; `tests/a11y/sku1-surfaces.test.ts:98` `describe.skipIf(!enabled)` exits 0 with 9 skipped |
| H-01 Thai-first not implemented | **VALID, understated** | only three i18n modules exist (`flow-canvas`, `line-connect`, `setup-chrome`); `public-site/app/page.tsx:149` hardcodes `locale: "en"` |
| H-02 raw secrets exposed to merchants | **VALID** | `ai-chat/page.tsx:329,344` collect accessToken + appSecret + verifyToken + phoneNumberId + businessAccountId in plain forms |
| H-03 Instagram incomplete | **VALID, understated** | Instagram appears in **documentation only**. Zero `.ts`/`.tsx` implementation, and no `channel.instagram` entitlement key exists anywhere. It is 0% built while four documents promise it. |
| H-04 leads are records not workflow | **VALID** | 58-line page |
| H-05 booking not closed in SaaS | **VALID** | `grep -ril appointment apps/tenant-web` matches only build output and unrelated pages |
| H-07 root chat mutation non-atomic | **VALID** | `src/app/api/chat/message/route.ts:189-267` — read count, check cap, insert, increment, model call, insert, increment; no lock, no idempotency key |
| H-08 signed PII in URL | **VALID** | `src/lib/booking-context.ts:22-60` signs, never encrypts; name/email/phone/LINE ride in a query parameter |
| H-09 Bangkok-hardcoded timezone | **VALID** | as reported |
| H-10 fire-and-forget analysis | **VALID** | `src/lib/background-analysis.ts:5` `void analyzeAndPersistConversation(...).catch(...)` |
| H-11 operator console monolith | **VALID** | `apps/platform-master/app/page.tsx` = 106 KB / 1190 lines |
| H-12 accessibility fails open | **VALID** | my own harness; the criticism is correct |

**One correction to the audit, and it changes the plan.** The audit prescribes six priorities and implies all of them gate revenue. They do not. `scripts/check-sellable-flip-ready.mjs` already encodes the real gate, and it names **eight markers** and **four open evidence files**. Every one of the four is *non-code*:

- `phase9-e2e-pentest.md` — staging deploy + HTTP/operator pen-test evidence
- `phase10-privacy-g6c.md` — **counsel sign-off** (engineering package complete)
- `phase11-commercial-g6e.md` — **Stripe `live_ready`** evidence (code ready)
- `phase12-reliability-g6d.md` — **staging Terraform apply + kill-switch drill**

So the shortest honest path to first revenue is *deploy to staging and collect external sign-offs*, not *build more features*. The audit's Priorities 2–4 (editable canvas, leads pipeline, appointments, ROI) are **not** in the gate.

**But shipping against that gate alone would be a mistake, and this is where the audit is right.** A merchant who pays and then meets a read-only canvas, a raw-token LINE form, and an English workspace will not feel "high quality, well considered." The gate measures *safety*; it does not measure *impressiveness*. The user's stated goal is explicitly the second.

**Therefore: two tracks, run in parallel, with one hard sequencing rule.**

- **Track A (Honesty)** must land *immediately* and blocks nothing else. It is cheap and it is the only finding that is actively harmful today.
- **Track B (Product)** is what earns the merchant's trust. It is the audit's Priority 2–3.
- **Track C (Gate)** is what makes the sale legal and safe.
- **Rule: do not flip `sellable=true` until Track B's onboarding loop is done, even if Track C completes first.** Passing the gate with a read-only canvas is permitted by the script and forbidden by this plan.

---

## 1. What the audit missed

These are real, verified, and absent from the audit. Two are latent production defects.

### M-A. NULL allowance is read as zero — unlimited plans reject every request

`packages/db/migrations/0070_flowbot_social_usage_funding.sql:42` and `0048_usage_funding_authority.sql:81` both wrap the allowance in `COALESCE(account.included_quantity, 0)`. The catalog convention for "unlimited" is `null`. So any plan configured unlimited collapses to **zero** and every reservation is refused as `flowbot_allowance_exhausted`.

Nothing currently sets `null`, so it is dormant — but it is a trap laid directly across the upgrade path we intend to sell.

**Fix:** special-case `included_quantity IS NULL` as unlimited in both funding paths before any plan uses it. Integration test: an unlimited plan funds a reservation beyond any finite bound.

### M-B. AI Chat social gate still hard-codes `ai_chat_premium`

FlowBot's gate was relaxed in `0082` to `product_key='flowbot' AND (channel.social OR active add-on)`. AI Chat was not. `ai_chat_premium` remains hard-coded in `packages/db/src/ai-social-store.ts:102` and in five SECURITY DEFINER functions (`0020:117`, `0021:106`, `0022:77,162`, `0023:123`, `0024:81`).

Consequence: an AI Chat Starter tenant who buys a social add-on is silently refused. That is a paid entitlement that does not work.

**Fix must be additive.** Do not recreate those five functions from their historical definitions — that is exactly the mistake `packages/db/src/migration-function-lineage.ts` was built to catch. Use a trigger or a helper predicate function the existing functions can call.

### M-C. Meta app may be the wrong type

The app reports `app_type: 0` with gaming artifacts. If it is not a Business app, the entire `oauth_provider` rail for Messenger/Instagram/WhatsApp is blocked regardless of how much code we write. **Verify before scheduling any Meta work.**

### M-D. Meta raw-body webhook signature verification has never met a real delivery

Flagged repeatedly and still unproven. `X-Hub-Signature-256` must be computed over the exact unparsed body; Next.js body handling makes this easy to get subtly wrong. No test exercises it against a genuine Meta payload.

### M-E. Quoted `.env` values will break on Cloud Run / `docker --env-file`

Values are wrapped in quotes. `docker --env-file` and Cloud Run env injection treat quotes as literal characters, so the connection strings will contain `"` and fail. This will surface for the first time during the Track C staging deploy.

### M-F. Node engine mismatch

The platform declares `node >=24`; the dev machine runs v22.23.1, warning on every command. We are validating on a runtime we do not intend to ship.

### M-G. `FlowBot_V1_App/.env.local` still points at the live root-app production database

Frozen reference code aimed at production. A stray `pnpm migrate` there is a production incident.

---

## 2. Track A — Honesty (do first, blocks nothing)

The only finding that is harmful *today*, because the site is live.

### A1. Strip unevidenced numeric claims

- Remove `apps/public-site/app/page.tsx:46` ("Increase lead conversion by up to 50%") and the stat block at `:211-213` (`+50%`, `-70%`, `Channels 4`).
- Replace with capability statements that are true now, or with a metric that has a stated definition, source, and baseline.
- **Acceptance:** a lint script `check-public-claims.mjs` fails on any `%`-bearing marketing string in `public-site` not present in an allowlist that cites its evidence file. Wire into `pnpm lint`.

### A2. Label capability states honestly

Introduce four explicit states — `active`, `preview`, `pilot`, `unavailable` — and derive the public badge from the release registry rather than hand-written copy.

Instagram must read **`unavailable`**, not "coming soon". It has no code.

- **Acceptance:** `qa:release-artifacts` asserts every advertised capability maps to a registry entry, and that no capability without accepted evidence renders as `active`.

### A3. Show real prices at the decision point

Plan cards must show exact first-year and renewal price, currency, tax treatment, and billing interval (annual only).

- **Acceptance:** extend `check-market-release-decisions.mjs` to fail if a rendered plan card lacks any of the five fields.

---

## 3. Track B — The onboarding loop that earns trust

This is the user's actual goal: seamless, frictionless, impressive. Ordered by dependency.

### B1. Locale before anything else

`locale: "en"` at `public-site/app/page.tsx:149` is the first thing that betrays "Thai-first".

1. Language chooser on the public site, persisted to a cookie, before registration.
2. Registration carries the chosen locale into tenant creation; it becomes workspace state, not a per-request guess.
3. Extract the tenant-web workspace strings into `lib/i18n/` modules alongside the three that exist. Cover the launch slice: setup, flowbot, connect/line, canvas, inbox, leads, and every error/empty/recovery state within them.

- **Acceptance:** a lint script fails on user-visible literal strings in the launch-slice routes. A Playwright journey completes registration → publish entirely in Thai with zero English leakage, asserted by locator text.

### B2. Guided LINE becomes the only path

The guided flow at `apps/tenant-web/app/workspace/flowbot/connect/line/page.tsx` is genuinely good — it is our strongest onboarding asset. It is undermined by the raw-token form still sitting at `flowbot/page.tsx:370`.

1. Make the channel panel's primary and default LINE action route to `connect/line`.
2. Move raw credential entry behind a collapsed **Advanced** disclosure, restricted to the owner role, and write an audit record whenever it is used.
3. Do the same for the AI Chat page's WhatsApp/Messenger forms — but see B6; those channels stay `unavailable` until the Meta rail is real, so the cleanest move is to gate the whole panel rather than restyle it.

- **Acceptance:** extend `check-onboarding-readiness.mjs` to fail if a non-advanced code path in tenant-web collects `channelAccessToken`, `appSecret`, `pageAccessToken`, or `verifyToken`. Playwright: a merchant reaches a tested LINE connection without ever seeing a token field.

### B3. Editable canvas (W1 Stage 3)

The single largest gap between the PRD's promise and the product.

1. Node palette; create, move, duplicate, delete.
2. Drag-to-connect edges with live validation against `flowNodeEdges` — reject invalid edges at the interaction, not at publish.
3. Side panel for node content editing.
4. Autosave drafts with explicit draft/published/tested state and timestamps.
5. Undo/redo.
6. **Keyboard-and-screen-reader authoring path**, plus a textual outline equivalent to the graph. Not optional — H-12 and the accessibility gate both bite here, and it is the same work that makes the canvas usable on a phone.

Hold the existing invariant: **graph advisories must never block publish.** All four callers of `validateFlowForPublish` hard-block, and the repo's own fixture is a legitimate two-node cycle. Advisories surface as warnings and focus the offending node; only genuine validation errors block.

- **Acceptance:** `qa:p4-flowbot` extended to author a flow end-to-end via canvas only; a keyboard-only journey builds and connects two nodes; axe reports zero serious/critical on the canvas.

### B4. Test and publish without leaving the canvas

1. Simulate from a chosen start node.
2. Overlay the traversed path.
3. Show the resulting action / lead / appointment.
4. On a validation failure, focus the exact broken node with a plain-language explanation.

- **Acceptance:** the simulator's traversed path matches the runtime engine's path for the same input, asserted against `flowbot-engine`, not re-implemented in the UI.

### B5. Close the merchant operations loop

The audit is right that this is where the value story lives, but it is also the largest body of work. Sequence it *after* B1–B4, because a merchant who cannot author a flow never generates a lead to manage.

1. **Leads** → a real pipeline: owner, status, next action + date, expected value, won/lost reason, filtering, detail view.
2. **Inbox** → unread/channel/owner/priority filters, assignment, pagination or virtualization.
3. **Appointments** → port the proven confirm/reschedule/cancel/reminder loop from the root app's admin surface into the SaaS architecture. The root app already does this; the SaaS does not. Port the *behaviour*, not the structure.
4. **Customer timeline** → one consolidated view across bot, human, lead, appointment, and outcome events.
5. **Money metrics** → define `qualified`, `booked`, `attended`, `won`, `lost`, `value`, `staff_time_saved` as durable events; let the merchant configure values; present conservative attribution with documented rules and drill-down.

- **Acceptance:** the audit's own §13 items 9–14, run against a real database, no manual SQL.

### B6. Channels behind honest gates

Do **not** build Instagram or Meta merchant flows yet.

1. First resolve **M-C** — confirm the Meta app type. If it is not a Business app, create one; everything else is wasted effort until then.
2. Then prove **M-D** — raw-body `X-Hub-Signature-256` verification against a genuine Meta delivery.
3. Only then submit Messenger and Instagram permissions in a *single* App Review submission.
4. Until accepted, all three Meta channels render `unavailable` per A2.

LINE Module Channel remains a separate, slower track (corporate application, Thai entity eligibility unknown). The guided two-field flow is the shipping answer and is good enough that Module Channel is an optimisation, not a blocker.

---

## 4. Track C — Make the gate real, then pass it

### C1. Fix the accessibility harness so it cannot fail open

My harness is the defect. `describe.skipIf(!enabled)` means a missing base URL reports success.

1. Add `AXE_REQUIRE=true`. When set, a missing base URL, missing session, or any skipped test is a **failure**, not a skip.
2. Add the canvas and public registration to the audited surface list.
3. Define a written disposition policy for `moderate` findings rather than silently ignoring them.

- **Acceptance:** `AXE_REQUIRE=true pnpm test:a11y` with no servers running **exits non-zero**. That is the test of the test.

### C2. Build `release:gate` — one non-skipping command

`verify` proves compilation. It must stop being mistaken for a release decision.

```
release:gate =
  provision clean PostgreSQL 16
  → apply all migrations (fail if fewer than the on-disk count)
  → seed fixtures
  → start api, tenant-web, public-site, workers, widgets; wait on health checks
  → pnpm test:db                     (roles, RLS, cross-tenant negatives)
  → qa:p4-flowbot, qa:p6-line        (desktop + mobile, non-skipping)
  → AXE_REQUIRE=true pnpm test:a11y
  → assert zero unintended skipped tests across all suites
  → gate:sellable-flip
  → emit one immutable evidence bundle
```

Two hard rules: **missing infrastructure fails the gate, never skips it**; and the bundle is content-addressed so evidence cannot be edited after the fact.

- **Acceptance:** deliberately stop the database → gate fails with a clear setup error, not a green skip. Deliberately skip one test → gate fails.

Note that `test:db` already provisions its own disposable PostgreSQL 16 container and discovers migrations from disk. `release:gate` composes it; it does not replace it.

### C3. Fix the two latent defects before staging

- **M-A** NULL allowance → unlimited. Both funding paths, with an integration test.
- **M-B** AI Chat social gate parity. Additive migration only; run `migration-function-lineage` and hand-diff.

### C4. Fix the deployment blockers before the staging apply

- **M-E** strip quotes from all `.env` values; add a `check-production-configuration` assertion that rejects quoted values.
- **M-F** move the dev environment to Node 24, or lower the declared engine to match reality. Do not ship on an untested runtime.
- **M-G** repoint or delete `FlowBot_V1_App/.env.local`. It aims at production.

### C5. Harden the root app's live paths

The root app is live at djbot.djai.academy and handles real customer PII. These are not deferrable just because the app is "interim".

1. **H-08** move booking context server-side under a short-lived opaque one-time ID; stop putting signed PII in query strings; set a strict referrer policy. *Highest priority — this is a live privacy exposure.*
2. **H-07** add a request idempotency key, lock the conversation row, persist a pending turn transactionally, complete or fail it through an explicit state machine.
3. **H-10** move post-conversation analysis into a durable job with retries, idempotency, and dead-lettering.
4. **H-09** IANA timezone calculations end-to-end; test DST gaps, overlaps, and midnight boundaries.
5. **M-03/M-04/M-05** shared bounded rate limiter keyed after trusted-proxy normalisation; canonical configured origins instead of forwarded headers; stable public error codes with correlation IDs.

Then freeze root feature growth.

### C6. Collect the four external evidence items

None of these are code. They are the actual critical path and they involve other people, so start them **now**, in parallel with Tracks A and B.

| Marker | What it needs | Owner |
|---|---|---|
| `G6_PASS` / `G6B_PASS` | staging deploy + HTTP and operator pen-test, Crit/High closed | us |
| `G6C_PASS` | counsel sign-off on the privacy package (`docs/compliance/counsel-brief-sku1.md` is ready) | external counsel |
| `G6E_PASS` | Stripe account live, price mapping `live_ready`, one real receipt | us + Stripe |
| `G6D_PASS` | staging Terraform apply + kill-switch drill, recorded UTC | us |
| `KILL_SWITCH_DRILL_UTC` | drill executed and timestamped | us |
| `STAGING_SOAK_END_UTC` | soak completed | us |
| `NAMED_MERCHANT_SIGNED` | one named pilot merchant signed | sales |
| `PO_SIGN` | product owner sign-off | you |

**Counsel sign-off and the named merchant are the two longest poles and neither depends on any code.** Begin both immediately.

---

## 5. The flip

When Track C's eight markers are green **and** Track B's B1–B4 are complete:

1. Set `flowbot_basic.sellable = true` in both `packages/catalog/src/index.ts` and `requirements/market-release-v1.yaml`.
2. Run `AUTHORIZE_SELLABLE_FLIP=true pnpm gate:sellable-flip`.
3. Run `release:gate` once more; archive the evidence bundle.
4. Ship. Every other package stays `sellable: false`.

`flowbot_premium` must remain non-sellable — the gate enforces this explicitly at `check-sellable-flip-ready.mjs:40`, and **M-A** is the reason why it should.

---

## 6. Ordering summary

Parallel from now:

- **A1–A3** — immediately, independent of everything.
- **C6** — immediately; counsel and the pilot merchant are the long poles.
- **C3, C4** — before any staging work.
- **C5.1** (booking PII) — immediately; live exposure.
- **B1 → B2 → B3 → B4** — the sequenced product spine.
- **C1 → C2** — after B3 exists, so the canvas is inside the gate.
- **B5** — after B4.
- **B6** — gated on M-C, which is a five-minute check that unblocks or kills a large body of work. Do it now.

The one thing not to do is what the repository has been doing: adding breadth. Instagram, WhatsApp, and Voice all have foundations and no complete journey. Finish one.
