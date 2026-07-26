# Phase 0 operator checklist — flip `flowbot_basic` to sellable (G7)

**For:** DJAI Academy operator (solo). **Date:** 2026-07-24.
**Goal:** one Thai merchant pays for FlowBot Basic and goes live, with a receipt and a support path.

This is the ordered walkthrough of the **owner/external** work that gates G7. Engineering scaffolding is already complete (catalog guard, metrics, Terraform, runbooks all exist — verified 2026-07-24); what remains is *executing* the gates below. Each item names the exact file/command and where to record the result.

**Truth check:** every box below is currently ☐ / `false`. The catalog correctly refuses to sell (`sellable: false`, guard `sellable_requires_live_stripe_mapping`). Nothing flips until the PASS markers in `docs/validation/phase13-sellable-g7.md` are set.

---

## Start THIS WEEK — the two clocks that can't be compressed

### A. Privacy / legal (G6c) — longest lead
- [ ] Send counsel the brief: `docs/compliance/counsel-brief-sku1.md` (packages the PII registry, legal-basis matrix, DSAR residual list, subprocessors, and a draft Privacy Notice + Terms).
- [ ] Get counsel decisions C1–C7 and **approved** Terms + Privacy text + a signed approval reference.
- [ ] Engineering builds + mounts the `djay.legal-documents.v1` bundle per `docs/runbooks/legal-documents.md`; verify `/terms` and `/privacy` render.
- [ ] Set `G6C_PASS: true` in `docs/validation/phase13-sellable-g7.md`.

### B. Meta enablement (background — for later SKU, but start now)
- [ ] Work `docs/runbooks/meta-enablement-pack.md`: submit **Business Verification**, complete the App (icon + Privacy/Terms URLs), enroll as WhatsApp Tech Provider, draft the App Review checklist + screencast script.
- [ ] Acceptance: verification submitted; checklist drafted. (Approval lands in Phase 3 — does **not** block SKU1.)

---

## Commercial (G6e)

### C. Price + Stripe live mapping (0.1)
- [ ] Confirm the FlowBot Basic price. The catalog already encodes **2,499.00 THB** first term (`packages/catalog/src/index.ts`, tax-inclusive per `SKU1-DEC-002`) — confirm or change.
- [ ] Create the Stripe **Product + Price** (THB, matching minor units) in test, then live.
- [ ] Seed the mapping per `docs/runbooks/stripe-price-mapping.md`:
  - Dry run first: `DRY_RUN=true node scripts/seed-stripe-price-mapping.mjs` (with the env vars the runbook lists).
  - Then seed **test** (→ `stripeMappingState = test_ready`), later **live** (→ `live_ready`).
- [ ] Record the test + live Price IDs; confirm catalog validation passes with `flowbot_basic` `live_ready`.
- [ ] Confirm merchant receipt/invoice renders in the Stripe portal.
- [ ] Set `G6E_PASS: true`.

---

## Deploy, observability, reliability (G6d)

### D. Cloud Run + alerts (0.3) — Terraform written, apply open
- [ ] Apply `infra/terraform/gcp-platform` to **staging**, then **prod** (ready probes are in `main.tf`; commerce alerts in `monitoring-commerce.tf`). Set `var.deploy_services=true` and `var.alarm_email=<your alert email>` so `webhook_failures` and `checkout_5xx` alerts arm.
- [ ] Confirm ready probes green on Cloud Run; checkout + webhook dashboards live.

### E. Paid-path E2E (0.3)
- [ ] With staging up + a `test_ready`/`live_ready` mapping, run `pnpm qa:merchant-first-sku` (live variant: real staging URLs + `STRIPE_TEST_READY=true`).
- [ ] Fill the 9-step evidence in `docs/validation/p-first-sku-e2e.md`.

### F. Kill-switch drill (0.4)
- [ ] Run the staging dry-run in `docs/runbooks/sellable-kill-switch.md`; log operator + UTC timestamp + elapsed (target < 15 min).
- [ ] Confirm no Sev-1 "can't activate after pay" path.
- [ ] Set `KILL_SWITCH_DRILL_UTC` and `G6D_PASS: true`.

---

## Accessibility (a11y gate)

### G. Unmocked axe green (0.5)
- [ ] Run the axe pass in `scripts/qa-merchant-first-sku.mjs` against live staging with `STRIPE_TEST_READY=true` (currently the setup-wizard/inbox/checkout-return axes are gated behind that flag).
- [ ] **Known coverage gap** (audit 2026-07-24): the **public-site register/checkout-return page** and the **FlowBot editor** are not yet axe-covered. Engineering (Agent) can extend the harness to add them — flagged as the one remaining Phase-0 code task (see "Remaining agent code" below).
- [ ] Record the keyboard-only merchant journey notes.

---

## Pilot merchant (support gate)

### H. Named merchant (0.6)
- [ ] Fill `docs/validation/named-merchant-worksheet-sku1.md` with one real friendly Thai SME (currently blank).
- [ ] Run them through the 8 checkpoints: register → verify → pay → provision → setup wizard → widget live on their origin → conversation in inbox → receipt in portal.
- [ ] Sign the worksheet; set `NAMED_MERCHANT_SIGNED: true`.

---

## The flip (only after everything above)

- [ ] All PASS markers `true` in `docs/validation/phase13-sellable-g7.md` (`G6_PASS`, `G6B_PASS`, `G6C_PASS`, `G6D_PASS`, `G6E_PASS`, `NAMED_MERCHANT_SIGNED`, `PO_SIGN`, `CTO_SIGN`).
- [ ] Set `flowbot_basic` `sellable: true` in the catalog (the guard now permits it because mapping is `live_ready`).
- [ ] Launch posture per your decision — **recommended: quiet pilot** (prove billing on one merchant before any marketing push).

---

## Remaining agent code in Phase 0 (I can do these now)

Almost all of Phase 0 is owner/external, but two items are genuine engineering I can complete:
1. **Extend axe coverage** to the public-site register/checkout-return page and the FlowBot editor (closes the coverage gap in G). Running it *green* still needs live staging, but the coverage lands now.
2. **Reserve the Meta deauthorize + data-deletion callback route stubs** (§5 of the Meta pack) so the App-settings URLs point somewhere real — optional; can also wait for Phase 3.

Everything else on this page needs your Stripe account, your counsel, prod deploy access, or a real merchant — an AI agent cannot execute it.

## References
- `docs/validation/phase13-sellable-g7.md` — the PASS-marker source of truth.
- `docs/plans/release-dashboard.md` · `docs/plans/2026-07-22-path-to-10-all-roles.md` — gate order (Forbidden: G7 without G6b + G6c + G6e).
- `docs/compliance/counsel-brief-sku1.md` · `docs/runbooks/meta-enablement-pack.md` — the two hand-off packs.
