# PR-06 Starter handover evidence — 2026-08-17

## Scope

This checkpoint makes explicit human handover available in the production deterministic Flow schema and runtime without incorrectly requiring Flow Advanced.

## Implemented authority

- `handover` is a core terminal node with optional Thai/English customer copy.
- The deterministic engine changes the conversation to `handover`, emits `handover.request` with `reason=configured_handover` and default owner routing, and records `handover_requested`.
- `team_route` remains Premium-only and retains named-team and routing-strategy semantics.
- The tenant visual editor can create the core node; graph analysis recognizes it as a CTA and no outgoing connector is allowed.

## Verification

- Domain tests prove schema fixtures and edge/CTA coverage remain exhaustive across every declared node type.
- Engine tests prove a Flow Starter authority can execute configured handover with localized output and without Premium entitlements.
- Tenant tests prove every node has localized canvas labels and the shared graph model remains exhaustive.
- `pnpm verify` passed all 35 package lint, typecheck, unit-test and production-build tasks.
- `TEST_DB_PORT=55506 pnpm test:db` passed all 117 migrations and the complete PostgreSQL integration, RLS, recovery and guarded rollback suite.
- No browser or GUI was opened.

## Gates intentionally open

- Collected-context completeness across runtime, Inbox and notification handling.
- Real widget/browser, responsive/accessibility, staging and named-merchant acceptance.
- All six approved templates and exhaustive English/Thai route proofs.
- `FLS-011` remains `in_progress`; no requirement is accepted and all packages remain non-sellable.
