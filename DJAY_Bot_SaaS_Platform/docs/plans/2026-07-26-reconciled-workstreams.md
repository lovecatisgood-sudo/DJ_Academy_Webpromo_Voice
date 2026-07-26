# Reconciled workstreams — one dependency-ordered plan

**Date:** 2026-07-26 · **Status:** Active planning authority for sequencing
**Reconciles:** `Implementation_Plan_CLAUDE_26JUL.md` (phases) with `GPTSOL_AUDIT26JUL.md` §13 (workstreams)

## Planning rules (from the owner, via `GPTSOL_CURRENT_STATE_26JUL.md`)

- **No day/week/month estimates. No calendar roadmaps.** Earlier plans violated this; it is corrected here.
- Order derives from **product and technical dependencies**, not predicted speed.
- Every workstream states **acceptance evidence** — how completion is proven — rather than elapsed time.
- External gates run in parallel and are never on the critical path of buildable work.

## Why the order changed

Delivered work so far (below) was **channel plumbing**: correct, now genuinely tested, and almost invisible to a merchant. The Codex audit scores merchant value **3.7/10**, UX **4.8/10**, competitive readiness **3.8/10** against architecture **8.8** and security design **8.5**. That gap is not in the channel layer.

Meta channels are blocked on App Review regardless, so reordering ahead of them costs nothing. The next work is therefore **merchant-visible product**, starting with the FlowBot canvas.

---

## Delivered and verified

Evidence: 13 integration tests against a disposable PostgreSQL 16 container, 570 unit tests, typecheck 57/57 forced, full 29-check lint chain clean.

| Item | Evidence |
|---|---|
| Channel Connection Framework (3 acquisition modes) | design spec; only the acquisition layer varies |
| LINE two-field onboarding (no developer console) | server-side `client_credentials` minting; webhook set + reachability proven via LINE's own test endpoint |
| Mint coalescing + bounded cache | test proving 20 concurrent mints → 1 request |
| FlowBot channel health endpoint (`CHN-007`) | data-driven linter that demonstrably fails when a health route is removed |
| SLO objectives + 3 live metrics | `sre-slos.md`; 2 metrics deliberately dormant rather than proxied |
| `CHN-004` enforcement (migration 0084) | 9 integration tests incl. direct-`INSERT`-refused-by-trigger and grandfathering |
| Migration staleness guard | adversarial test reproducing the real defect from historical SQL |
| Document authority resolved | pricing, packaging, product × channel matrix |

---

## W0 — Release truth and hygiene

**Depends on:** nothing. **Blocks:** every claim made to a buyer.

- Apply migration `0084` to the platform database, closing the social-entitlement leak. Additive and test-proven, but never executed outside a container.
- Run the full `pnpm run test:db` end-to-end once, to confirm the migration glob does not disturb the later Voice/Text legacy stages.
- Correct public claims: Instagram and WhatsApp are **planned**, not available (`CHN-009`, `CHN-010`). Remove invented outcome percentages.
- Reconcile catalogue/purchase truth with the annual-only pricing decision; seed the Stripe live price map from the authoritative table.
- Replace the `error.message` duplicate-key check in the root booking route with `error.code === '23505'`, and check production for colliding appointment slots before deploying the new unique index.

**Acceptance:** 0084 applied and the CHN-004 suite passing against the platform database; full harness green; no unavailable channel presented as available anywhere public; Stripe live mapping recorded with the catalogue validating `live_ready`.

## W1 — FlowBot visual authoring canvas

**Depends on:** nothing (graph model, validation and immutable publish already exist). **Blocks:** public launch credibility, the primary demo asset.

The PRD makes this a Must for public launch and the editor is still a linear list. This is the largest merchant-visible gap with no external dependency.

- Render nodes as typed cards on a pan/zoom canvas with a minimap; edges from the existing option/`nextNodeId`/`targetNodeId` references.
- Auto-layout so existing and imported flows render sensibly.
- CTA nodes visually distinct, so every terminating path is visibly a CTA.
- "Path without CTA" lint beside the existing unreachable/cycle validation.
- Read-only canvas first, then editable (drag-to-connect, palette add/delete, re-parent). Node editor reuses the current guided forms, keeping the Advanced-JSON escape hatch.
- Simulator overlay highlighting the traversed path during a test run.

**Acceptance:** a merchant builds and edits a branching flow visually, sees every CTA path at a glance, receives the lint warning for a CTA-less path, and runs a test that animates the path — with no regression to publish, rollback or validation. Captured as a demo recording.

## W2 — Thai-first acquisition and workspace

**Depends on:** nothing. **Blocks:** the entire Thai funnel; W5's ROI story.

- Fix the hardcoded `locale: "en"` on the public site; Thai default with a full TH/EN toggle.
- Complete TH coverage across the merchant workspace, not English with Thai bolted on.
- Thai-native typography and layout.

**Acceptance:** a Thai-only reader completes register → pay → connect website + LINE → publish → first lead without encountering English, evidenced by a recorded walkthrough.

## W3 — Inbox, contacts and leads as operations

**Depends on:** W2 (localised surfaces). **Blocks:** W4.

Currently a foundation, not an operating surface: no assignment, no SLA, no reply-window awareness, and Leads is not a pipeline.

- Assignment and ownership; SLA/first-response surfacing; reply-window state visible per channel (LINE's free window is commercially load-bearing).
- Leads as a pipeline with stages, next action, and outcome.
- Mobile-usable inbox; team operations depth.

**Acceptance:** two staff members handle a shared inbox concurrently — assign, take over, release, and record an outcome — with the reply-window state correct per channel and no lost or double-handled conversation.

## W4 — CTA → appointment conversion loop

**Depends on:** W3. **Blocks:** the product's core promise.

The loop still lives mainly in the old root application.

- Port the root booking engine into the platform with RLS multi-tenancy.
- Wire AI `appointment.request` and FlowBot's dormant `cta_scheduler` into it; merchant one-click confirm.
- Notification layer neither system has: email, LINE push to the merchant, `.ics`, and customer self-serve reschedule/cancel via signed link.
- Replace the hardcoded Bangkok offset with the stored per-profile timezone.

**Acceptance:** a bot creates an appointment request, the merchant confirms in one click, both parties are notified, and the time is correct for a non-Bangkok profile. Appointment requests never display as confirmed before confirmation.

## W5 — Merchant value analytics

**Depends on:** W4 (outcomes to measure), W2 (localised surfaces).

Analytics currently measure product usage rather than qualified outcomes.

- Funnel (conversations → qualified → contact captured → appointment requested → confirmed), trends, after-hours leads rescued, objection outcomes.
- "Value recovered" in money against subscription price, from events the Sales Core already emits.
- Keep numeric tables for export and accessibility.

**Acceptance:** a merchant sees payback in Baht derived from real pilot data, with no invented rates, and can export the underlying numbers.

## W6 — Meta: Messenger and Instagram end to end

**Depends on:** Meta App Review (external, already running). **Note:** build both together — same rail.

- The seven routes from the onboarding design; asset enumeration for Pages **and** linked Instagram Business accounts.
- Instagram prerequisite pre-flight: Business account, linked to the granted Page, message access allowed — never an empty picker in place of an explanation.
- Deauthorize and data-deletion callbacks; token-health reconnect.
- Raw-body signature verification validated against a **real** Meta delivery, not only synthetic buffers.

**Acceptance:** a merchant connects a Page and an Instagram account by consent and asset selection with no credential handling, and a real message on each channel receives a bot reply and appears in the inbox.

## W7 — WhatsApp

**Depends on:** W6, plus WhatsApp Tech Provider status. Embedded Signup is a materially different flow (phone verification, WABA, templates) and warrants its own sub-spec.

**Acceptance:** as W6, plus per-message service charges disclosed under `CHN-008` and never presented as included usage.

## W8 — AI TextBot as a measured product

**Depends on:** `ai-gateway` deployed and reachable (`AI_TEXT_GATEWAY_ENDPOINT` + service token); the behavioural evaluation gate.

- Run the evaluation suite on real Thai and English conversations before any "salesperson" marketing claim.
- Then AI Chat Basic (web), then Premium (web + LINE + Meta).
- AI Chat gate parity with FlowBot's relaxed entitlement predicate.

**Acceptance:** recorded evaluation evidence on discovery → objection → CTA → capture in both languages; then each SKU passing its paid-path E2E with provider confidentiality verified.

## W9 — Operator console as an operating system

**Depends on:** W0. Independent of merchant workstreams.

Platform Master has strong controls on one oversized page.

- Route-based daily operations with Tenant 360.
- Channel connection health across all tenants — currently a total blind spot.
- Assisted setup link issuance; time-boxed audited support sessions.
- Decide whether the operator dashboard needs to distinguish "auto-reply on" from "webhook inactive"; today both persist as `channel_health_failed` and the distinction lives only in the response body.

**Acceptance:** an operator diagnoses a broken merchant connection and either fixes it or issues a setup link, without reading logs or touching the database.

## W10 — VoiceBot behind operational proof

**Depends on:** telephony provider ADR; voice admission gates.

- Website voice first; telephony separately gated.
- Merchant-facing voice onboarding per the design doc: numbers provisioned by the operator, merchant confirms disclosure, hours, routing and transfer fallback, then places a test call.

**Acceptance:** a test call reaches the disclosure and a transfer fallback works; no voice channel is offered on any social-messaging surface (`CHN-014`).

## W11 — Acceptance and release evidence

**Depends on:** the workstreams it certifies.

The system has broad unit and integration coverage but **no demonstrated deployed merchant E2E** using a real database, workers, billing and providers.

- Route-level test harness for `apps/api` (none exists; route↔package wiring is currently covered only by typecheck).
- A deployed end-to-end run with a named pilot merchant.
- axe/accessibility green on the sellable surfaces; keyboard-only journey recorded.

**Acceptance:** the eight named-merchant checkpoints signed against a deployed environment, with a receipt and a support path.

## W12 — Consolidation

**Depends on:** platform AI Chat replacing the root widget (W8).

Retire the root single-tenant path; converge to one brand and codebase. `FlowBot_V1_App` stays frozen until superseded — and its `.env.local` still points at the **live root-app database**, which should be repointed or archived regardless.

---

## External gates — start or continue now, never blocking

| Gate | Why it cannot wait |
|---|---|
| Meta Business Verification + App Review | Blocks W6/W7. **Request Instagram permissions in the same submission as Messenger** — review is per submission. |
| LINE module channel inquiry (Thailand track) | Only route to Zwiz-style consent onboarding. One module per OA is exclusive, so early entry compounds. Two-field onboarding means this is an optimisation, not survival. |
| Privacy Notice, DPA, subprocessor list | Blocks G6c and therefore any sale. |
| Stripe live price mapping | Blocks all revenue. Price is already decided — seed, don't re-decide. |
| Named pilot merchant | Supplies W5's real numbers and W11's acceptance signatures. |

## Standing engineering rules earned this session

1. **Never claim a database test cannot run.** `scripts/test-db-integration.sh` provides a disposable container. Both Claude and Codex wrongly accepted "skipped", which hid four real defects.
2. **Never recreate a SQL function from a stale base.** Grep every migration for the function name and derive from the highest-numbered one. The lineage guard catches the common case; it is not a SQL equivalence checker, so diff by hand too.
3. **Prefer additive migrations and write-time triggers** over dropping and recreating SECURITY DEFINER functions.
4. **A connection is not working until a provider round-trip proves it.** Configuration is not evidence.
5. **A metric that cannot be computed correctly is not emitted.** A proxy that over-reports a hard SLO is worse than a gap.
