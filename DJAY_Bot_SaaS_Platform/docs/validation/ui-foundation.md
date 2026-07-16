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
- zero automated axe violations for the WCAG 2.2 A/AA rule set across every
  exercised route, role, breakpoint, and failure state;
- the same CSP, HSTS, referrer, permissions, opener-isolation, MIME, frame, DNS,
  and cross-domain-policy headers on every web realm, with microphone restricted
  to same-origin Tenant Web and no framework identity header;
- visible keyboard focus and no horizontal document overflow;
- no localhost registration link in the Tenant production build;
- correct permission-derived tenant and Platform navigation;
- a real rendered target for every visible Platform operation link;
- handled unauthenticated and unavailable-evidence states without page errors;
- the existing P3 provider-boundary and desktop/mobile operations suite remains
  green.

The first axe pass found a missing API document title, low-contrast Inbox,
FlowBot, and Usage helper text, a keyboard-inaccessible horizontally scrollable
FlowBot node palette, and incomplete ARIA table structures in empty Platform
operations collections. The shared markup and color tokens were corrected; the
full matrix then passed with zero automated violations.

The browser-hardening pass also found that none of the four Next.js realms had
an artifact-owned response-header policy. A shared configuration now protects
all document and API paths. The complete production matrix passed without CSP
resource or behavior failures, and `pnpm audit --audit-level high` reported no
known vulnerabilities in the resolved dependency graph.

These results describe local production output with mocked API state and cover
only accessibility rules that axe can automate. Repeat the same gate against
deployed origins, complete manual keyboard, screen-reader, zoom/reflow,
cognitive, and representative-device review, and obtain the existing external
acceptance evidence before general availability.
