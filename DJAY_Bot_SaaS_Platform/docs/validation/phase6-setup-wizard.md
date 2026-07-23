# Phase 6 — Setup wizard (FlowBot Basic / G3)

Date: 2026-07-22

## Delivered

- `/workspace/setup` linear wizard: profile → access → configure/publish → deploy → test → celebrate
- Save & exit to Overview; resume from first incomplete server step; role-aware read-only chrome
- Reuses FlowBot APIs, `WebsiteDeploymentForm`, install snippet + install check
- Server checklist `nextHref` for FlowBot configure/deploy/test (and incomplete profile) → `/workspace/setup`
- Sidebar **Setup** nav item; Operations Flow Bot guide → setup
- Minimal `en` + `th` chrome (`lib/i18n/setup-chrome.ts`) for wizard, nav labels, checkout return

## Verification

```bash
cd DJAY_Bot_SaaS_Platform
scripts/use-node24.sh pnpm run lint:onboarding-readiness
scripts/use-node24.sh pnpm --filter @djay/db exec vitest run src/tenant-workspace-store.test.ts
scripts/use-node24.sh pnpm --filter @djay/tenant-web exec vitest run \
  app/workspace/WorkspaceSidebar.test.ts \
  lib/i18n/setup-chrome.test.ts
scripts/use-node24.sh pnpm --filter @djay/tenant-web exec tsc --noEmit
```

## Open (not blocking wizard shell)

- **ONB-012** meter exemption for setup/test journeys: live widget journeys still use normal customer metering until a dedicated setup-test tag is implemented.
- Staging paid-tenant walkthrough to `launchReady` (requires active FlowBot access + real origin test).
- Stripe dry-run evidence remains open from Phase 4.
