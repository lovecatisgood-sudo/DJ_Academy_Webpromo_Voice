# Phase 7 — Day-2 operate UX (G4)

Date: 2026-07-22

## Delivered

- Grouped workspace nav: Get live · Customers · Products · Workspace
- Role homes: agents/operators → Inbox; billing → Usage; owners → Overview (Setup when not launch-ready at redirect helpers)
- Product studios hidden for `tenant_human_agent`
- Mobile drawer + skip link (`#workspace-main`)
- Shared humanize helpers for roles/stages/tokens
- Inbox `q` search on name / phone / email (`normalized_value`)
- MFA QR from `otpauthUrl` + recovery codes download
- FlowBot studio tabs: Setup | Flow | Deploy | Channels | Advanced with `tab` / `tabpanel` ARIA

## Verification

```bash
cd DJAY_Bot_SaaS_Platform
./scripts/use-node24.sh pnpm --filter @djay/tenant-web exec vitest run \
  app/workspace/WorkspaceSidebar.test.ts \
  lib/workspace-labels.test.ts \
  lib/i18n/setup-chrome.test.ts
./scripts/use-node24.sh pnpm --filter @djay/tenant-web exec tsc --noEmit
./scripts/use-node24.sh pnpm --filter @djay/db exec tsc --noEmit
```

Leads pipeline remains deferred to Phase 15.
