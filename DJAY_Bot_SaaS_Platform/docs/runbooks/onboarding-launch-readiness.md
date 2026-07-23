# Guided onboarding and technical launch readiness

Workspace Overview is a server-derived launch checklist. Tenant users cannot
declare an onboarding stage or mark a product ready from browser state.
`PATCH /tenant/onboarding` accepts only `{ "action": "refresh" }`; the API
recomputes progress inside the authenticated tenant transaction.

## Evidence model

The checklist reports four actionable steps (each incomplete step includes
server `nextHref` / `nextLabel`):

1. **Account secured** — verified identity and workspace ownership already
   established by provisioning.
2. **Business profile** — business name, locale, and timezone exist on the
   selected tenant. Incomplete profile deep-links to `/workspace/setup`
   (also available under `/workspace/settings` via `PATCH /tenant/profile`).
3. **Product access** — at least one selected product has active entitlement
   access; a selection awaiting payment/activation links to `/workspace/usage`.
4. **Technical launch readiness** — the focused product has active access, a
   current published version, an active deployment, and current-version test
   evidence. For Flow Bot, incomplete configure/deploy/test states deep-link to
   `/workspace/setup`; other products deep-link to their studios; activate
   deep-links to Usage.

## Setup wizard

`/workspace/setup` is the FlowBot Basic guided path (profile → access → bot
template/publish → deploy/snippet/install check → live test → celebrate).
Progress always comes from server evidence after refresh — the wizard never
marks launch ready from browser-only state.

Evidence is tenant-scoped under forced RLS. A test from an older published
version does not satisfy the current version. A disabled or revoked deployment,
inactive access, missing subscription, or absent test keeps technical launch
readiness incomplete.

The checklist is not general-availability authority. Product pilots, approved
legal documents, commercial decisions, operational readiness, and named
merchant acceptance remain independent release gates.

## Role behavior

- Tenant Master Admin and Tenant Admin may refresh the checklist after setup or
  testing and may update the business profile.
- Tenant Operator and Tenant Analyst receive the same factual evidence in a
  read-only view and no refresh mutation.
- Operations “Setup guides” only link into real studios / Overview — they do
  not offer a browser “Mark reviewed” shortcut around evidence.

## Verification

```bash
scripts/use-node24.sh pnpm run lint:onboarding-readiness
scripts/use-node24.sh pnpm --filter @djay/db exec vitest run src/tenant-workspace-store.test.ts
scripts/test-db-integration.sh
scripts/use-node24.sh pnpm run qa:ui-foundation
```

Production-browser evidence is written to:

- `/tmp/djay-onboarding-owner-desktop.png`
- `/tmp/djay-onboarding-owner-mobile.png`

Repeat the same journey against the deployed target with a named merchant. Do
not edit onboarding rows directly to bypass missing product evidence.
