# Cross-application UI foundation

Public registration, the tenant workspace, Platform Master, and the human-facing
API root share
`packages/shared/brand.css`. The shared layer owns the brand palette, type
stack, keyboard focus ring, control radius, and reduced-motion behavior. Each
application may retain realm-specific emphasis: customer surfaces use green,
while restricted Platform operations use red for danger and release-blocking
states. The yellow DJAY Bot mark must remain identical across all three realms.

Navigation is an authorization surface. Tenant workspace links are derived
from the selected membership role and `tenantRoleAllows`. Platform operation
links are derived from the platform role and `platformRoleAllows`. Unknown
roles fail closed. A hidden link is not the security boundary; every API route
must continue to enforce the same permission independently.

Authoritative workspace reads also fail closed in the UI. A workspace-session
failure renders a no-shell authentication-context error; a product-data failure
preserves the authorized workspace shell and renders the shared page error.
Neither state may be represented as an empty collection or remain in a loading
state. Both states must say that saved data is unchanged and expose a **Try
again** action. Secondary-panel failures may remain inline when the surrounding
authoritative page data is valid.

The public catalog follows the same rule while keeping owner registration
available without a product choice. A catalog outage must be disclosed beside
the selector and must not look like an empty catalog. Platform `/me` failures
must be distinguished from `401`/`403`: authentication failures return to sign
in, while service or network failures render the branded Platform retry state.
Authorized Platform resource failures are named in the dashboard alert and
must not render a false “no records” message. Existing release-readiness,
reconciliation, and recovery sections retain their stricter fail-closed states.

Every browser mutation uses `safeMutationFetch` from `@djay/shared`. It converts
a rejected connection or a non-JSON gateway error into a non-OK, safe JSON
response so each existing action handler reaches its normal failure branch,
clears its busy state, and shows non-destructive guidance. Endpoint-specific
JSON errors remain intact for conflict, recent-authentication, and independent-
review messages. Sign-out failures never redirect or claim that the session was
closed. Do not use this helper to reinterpret a successful response or to retry
a non-idempotent mutation automatically.

The API's `hasTrustedOrigin` check is route-realm-specific. `/tenant/*`,
`/platform/*`, public registration/invitation, and tenant login/recovery paths
accept only their assigned application origin. The API origin, missing or
malformed origins, sibling DJAY applications, widgets, webhooks, and internal
services are not interchangeable browser realms. `pnpm run
lint:browser-origins` scans every state-changing handler in the browser route
trees and fails when the check is absent. Add a new browser mutation realm to
`expectedBrowserMutationOrigin` and its tests deliberately; do not broaden the
shared allow-list.

All authentication cookie writes go through `apps/api/lib/auth-cookies.ts`.
Tenant sessions use host-only `HttpOnly`, production `Secure`, `SameSite=Lax`,
and `Path=/`; Platform sessions use the same base protections with
`SameSite=Strict`. Tenant and Platform MFA challenges are restricted to their
respective challenge endpoints. Expiration repeats the exact path and security
attributes used at issuance. `pnpm run lint:auth-cookies` rejects direct route
cookie writes, while the focused API tests inspect the emitted `Set-Cookie`
headers, TTL, absence of `Domain`, and explicit secure deletion. Change cookie
names, paths, or cross-site behavior only through a reviewed identity ADR and a
session migration plan.

Public Site, Tenant Web, Platform Master, and API must each keep an app-level
`not-found.tsx` and client `error.tsx`. Both use the shared structure in
`packages/shared/recovery.css`: an unexpected URL explains that no state was
changed and links to the safest realm home, while a render error offers an
explicit retry and warns Tenant/Platform operators to verify state before
repeating a mutation. `pnpm run lint:ui-recovery` prevents a realm from losing
these boundaries or diverging from the shared visual system. The production
browser gate exercises every 404 at desktop and mobile breakpoints, including
the response status, security headers, focus, overflow, recovery link, brand,
and automated accessibility rules.

The support-access banner is a security disclosure, not decorative content. If
its status read fails, the workspace shows an explicit warning to refresh
before handling customer data or making changes; it must never silently imply
that no Platform support grant is active.

The workspace Overview product summary is backed by `/tenant/subscriptions` for
every Tenant role. It shows each configured public product, tier, subscription
state, and effective access mode with a safe link to that product. “No products
are configured” is allowed only after both onboarding and subscription reads
succeed with an empty subscription array. Either authoritative read failing
must render the shared Overview retry state.

Secondary Studio reads preserve valid primary authoring data but must remain
truthful. FlowBot operational reads, AI Chat shared resources, and Voice
Knowledge, notification-profile, social-connection, and analytics failures
render inline retry states and never substitute an empty configuration or zero
analytics for an unavailable response. Actions that depend on unverified team,
recipient, or connection data remain disabled. Role-restricted FlowBot team and
downgrade reads are not requested when the active role lacks their permission.
Platform headings describe the evidence to review and do not make an
unconditional “operational” claim before those reads complete.

`NEXT_PUBLIC_PUBLIC_APP_URL` is the tenant sign-in link back to public
registration. Set it to the deployed public origin before building Tenant Web.
Next.js embeds this public value at build time, so changing only the runtime
environment does not update an existing artifact. `TENANT_APP_URL` controls
public login, verification, and invitation destinations at server runtime. The
safe production fallback is `https://app.djaybot.com`; local development uses
the explicit value in `.env.example`. Never ship a localhost URL in a public
artifact.

`config/next-security-headers.ts` is the single application-level browser
policy for API, Public Site, Tenant Web, and Platform Master. It limits content,
forms, frames, objects, connections, workers, and media to the minimum origins
needed by the current product; sends HSTS, strict referrer, MIME-sniffing,
opener-isolation, frame, DNS-prefetch, and cross-domain-policy protections; and
denies camera, geolocation, payment, and USB access. Microphone access is denied
in every realm except same-origin Tenant Web, where Voice testing requires it.
Do not add an external CSP origin or device capability without a reviewed
feature requirement and a production-browser regression test. The deployment
edge may add stricter transport controls but must not remove these artifact
headers.

## Local production-browser acceptance

Build the four Next.js applications, start their production output on ports
3110 through 3113, then run:

```bash
scripts/use-node24.sh pnpm run qa:ui-foundation
scripts/use-node24.sh pnpm run qa:p3-ui
```

For deployed acceptance, set `PUBLIC_QA_URL`, `TENANT_QA_URL`,
`PLATFORM_QA_URL`, and `API_QA_URL` to the reviewed origins. The foundation gate
checks desktop and mobile overflow, shared brand color, keyboard focus
visibility, and an axe scan restricted to automated WCAG 2.2 A/AA rules. It
also enforces the complete browser security-header policy, rejects framework
identity exposure, and detects CSP-blocked runtime resources. It checks safe
cross-application links, every public account route, the API root, all twelve
tenant routes at both breakpoints, every tenant role, every platform role,
direct-route denial, mutation visibility, public catalog,
workspace-session, authoritative product-read, Platform-session, and
role-authorized Platform-resource failures, retry actions, and the existence of
each visible Platform navigation target. It also aborts representative public,
Tenant, and Platform mutations and requires visible feedback with a re-enabled
control.

Do not promote when this gate fails. A passing local gate does not replace
manual keyboard, screen-reader, zoom/reflow, cognitive, or representative-device
review. It also does not replace named-merchant acceptance, managed service
evidence, commercial approval, or the release-readiness gate.
