# Guided onboarding and technical launch readiness

Workspace Overview is a server-derived launch checklist. Tenant users cannot
declare an onboarding stage or mark a product ready from browser state.
`PATCH /tenant/onboarding` accepts only `{ "action": "refresh" }`; the API
recomputes progress inside the authenticated tenant transaction.

## Evidence model

The checklist reports six steps:

1. **Account secured** — verified identity and workspace ownership already
   established by provisioning.
2. **Business profile** — business name, locale, and timezone exist on the
   selected tenant.
3. **Product access** — at least one selected product has active entitlement
   access; a selection awaiting reviewed activation remains incomplete.
4. **Configure** — the selected product has a current published FlowBot or Sales
   Core version.
5. **Test end to end** — durable customer-journey evidence completed against
   the current published version: a completed FlowBot execution, completed AI
   turn, or ended Voice session with a completed turn.
6. **Technical launch readiness** — the same selected product has active
   entitlement access, a current published version, an active deployment, and
   current-version test evidence.

Evidence is tenant-scoped under forced RLS. A test from an older published
version does not satisfy the current version. A disabled or revoked deployment,
inactive access, missing subscription, or absent test keeps technical launch
readiness incomplete.

The checklist is not general-availability authority. Product pilots, approved
legal documents, commercial decisions, operational readiness, and named
merchant acceptance remain independent release gates.

## Role behavior

- Tenant Master Admin and Tenant Admin may refresh the checklist after setup or
  testing.
- Tenant Operator and Tenant Analyst receive the same factual evidence in a
  read-only view and no refresh mutation.
- When a product is selected, each incomplete configure/test step links to its
  product Studio.
- Missing authoritative onboarding or subscription data renders the shared
  retryable workspace error; it is never shown as an empty or completed state.

## Verification

```bash
scripts/use-node24.sh pnpm run lint:onboarding-readiness
scripts/use-node24.sh pnpm --filter @djay/db test
scripts/test-db-integration.sh
scripts/use-node24.sh pnpm run qa:ui-foundation
```

Production-browser evidence is written to:

- `/tmp/djay-onboarding-owner-desktop.png`
- `/tmp/djay-onboarding-owner-mobile.png`

Repeat the same journey against the deployed target with a named merchant. Do
not edit onboarding rows directly to bypass missing product evidence.
