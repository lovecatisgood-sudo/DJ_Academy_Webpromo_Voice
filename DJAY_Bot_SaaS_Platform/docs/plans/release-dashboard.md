# Release dashboard — DJAY Bot SaaS

Last updated: 2026-07-23

| Package | Sellable | Stripe map | Accepted reqs (SKU subset) | Live providers | Named merchant | Blockers |
|---------|----------|------------|----------------------------|----------------|----------------|----------|
| flowbot_basic | **false** (ready-to-flip; G7 blocked) | not live_ready (seed runbook ready) | SKU1-DEC-001..003 | staging only | worksheet drafted | Phases 9–12 evidence; Stripe live map; privacy counsel; kill-switch drill |
| flowbot_premium | false | — | — | — | — | Out of scope for SKU1 |
| ai_chat_basic | false | — | — | — | — | Separate program after SKU1 |
| ai_chat_premium | false | — | — | — | — | Social + Advanced gates |
| voice_basic_gen1 | false | — | — | admission off | — | Voice quality gates |
| voice_advanced_gen2 | false | — | — | — | — | TEL-DEC-001 blocked |

## Program rules

1. Only `flowbot_basic` may become sellable in this program.
2. Sellable requires Phases 9 (E2E+pen-test), 10 (privacy), 11 (commercial) Pass.
3. Kill switch must be drilled before production flip.
4. Platform pilot activate remains for comps — not a substitute for paid path.

## External dependencies (scheduled)

| Dependency | Owner | Needed by |
|------------|-------|-----------|
| Stripe TH / price mapping seed (`docs/runbooks/stripe-price-mapping.md`) | Finance / Commerce | Phase 11 → G7 |
| Tax/dunning SKU1 deferral (`SKU1-DEC-002`) | Finance + Legal | **accepted** (SKU1); full STRIPE-DEC-001 still blocked |
| Privacy Notice + DPA / subprocessors | Legal + Privacy | Phase 10 |
| Named merchant worksheet | Success | Phase 13 |
