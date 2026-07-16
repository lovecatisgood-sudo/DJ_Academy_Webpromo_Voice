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
- branded, realm-appropriate 404 and render-error recovery boundaries in Public,
  Tenant, Platform, and API, with all eight desktop/mobile 404 surfaces returning
  404 and passing the same accessibility, header, focus, and overflow gates;
- visible keyboard focus and no horizontal document overflow;
- no localhost registration link in the Tenant production build;
- exact HTTPS Public/Tenant cross-realm origins with build-time rejection of
  malformed production configuration without value disclosure;
- same-origin post-authentication continuation after password and MFA login,
  including rejection of encoded backslash authority ambiguity and preservation
  of a valid ownership callback;
- fragment-only issuance for one-time account links, legacy query cleanup,
  route-specific `no-referrer`, same-tab retry state, terminal state removal,
  and an existing-account invitation journey that survives Tenant sign-in;
- one accessible 12–128-character password/confirmation contract across
  registration, new-user invitation, and recovery, with mismatch correction
  preserving form and token state while sending zero mutations;
- shared email, person-name, and business-name browser boundaries matching the
  API; whitespace-only normalized names remain correctable and send zero
  registration or invitation mutations;
- Contact creation requires at least one email or phone and shares normalized
  name/phone limits with the domain schema; three field-specific failures send
  zero mutations while one valid form sends one trimmed request;
- first/additional Voice deployment forms share one component and the API,
  Studio, and immutable playbook share the actual 500-character greeting
  maximum; invalid Studio fields remain local and open the relevant tab;
- a branded registration completion and invalid-link recovery journey with one
  anti-enumerating, retryable verification resend control;
- correct permission-derived tenant and Platform navigation;
- a responsive six-step launch checklist whose status comes from server evidence,
  with administrator refresh and read-only Analyst behavior instead of
  browser-selected readiness stages, plus distinct green success and red error
  announcement treatments for the refresh mutation;
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

The release-artifact audit later found that the three web services serialized a
localhost API rewrite at build time. They now use shared request-time proxy
handlers for Public, Tenant, and Platform API paths. Focused tests and the
standalone artifact gate prove runtime authority selection, exact request
forwarding, multi-cookie response forwarding, safe body limits, and fail-closed
production behavior when `API_APP_URL` is absent. Web readiness now reflects
API readiness rather than process liveness alone. API service initialization
and readiness also reject non-HTTPS/path-bearing browser realms and hostname
reuse that would collapse host-only Tenant/Platform cookie isolation.

These results describe local production output with mocked API state and cover
only accessibility rules that axe can automate. Repeat the same gate against
deployed origins, complete manual keyboard, screen-reader, zoom/reflow,
cognitive, and representative-device review, and obtain the existing external
acceptance evidence before general availability.

The accepted onboarding views are captured at
`/tmp/djay-onboarding-owner-desktop.png` and
`/tmp/djay-onboarding-owner-mobile.png`.
