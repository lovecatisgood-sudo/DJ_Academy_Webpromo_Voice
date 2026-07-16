# Cross-application UI foundation validation

- Result: shared UI and role-navigation production-browser gate passed
- Date: 2026-07-16
- Runtime contract: Node 24
- Deployment state: local production output accepted; deployed acceptance pending

## Executed gates

```bash
scripts/use-node24.sh pnpm --filter @djay/public-site build
NEXT_PUBLIC_PUBLIC_APP_URL=https://djaybot.com scripts/use-node24.sh pnpm --filter @djay/tenant-web build
scripts/use-node24.sh pnpm --filter @djay/platform-master build
scripts/use-node24.sh pnpm run qa:ui-foundation
scripts/use-node24.sh pnpm run qa:p3-ui
```

The focused unit gate passed three tenant navigation tests and three Platform
navigation tests. It proves each known role receives only authorized links and
that unknown roles fail closed.

The new production-browser gate exercised public registration and Tenant login
at 1365×900 and 390×844, plus the workspace shell for owner, admin, operator,
and analyst roles and Platform Master for owner, AI Operations, Support, and
Finance roles. It verified:

- one shared yellow DJAY Bot mark across all application realms;
- visible keyboard focus and no horizontal document overflow;
- no localhost registration link in the Tenant production build;
- correct permission-derived tenant and Platform navigation;
- a real rendered target for every visible Platform operation link;
- handled unauthenticated and unavailable-evidence states without page errors;
- the existing P3 provider-boundary and desktop/mobile operations suite remains
  green.

These results describe local production output with mocked API state. Repeat
the same gate against deployed origins, complete manual keyboard/screen-reader
review on representative devices, and obtain the existing external acceptance
evidence before general availability.
