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

`NEXT_PUBLIC_PUBLIC_APP_URL` is the tenant sign-in link back to public
registration. Set it to the deployed public origin before building Tenant Web.
Next.js embeds this public value at build time, so changing only the runtime
environment does not update an existing artifact. `TENANT_APP_URL` controls
public login, verification, and invitation destinations at server runtime. The
safe production fallback is `https://app.djaybot.com`; local development uses
the explicit value in `.env.example`. Never ship a localhost URL in a public
artifact.

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
visibility, safe cross-application links, every public account route, the API
root, all twelve tenant routes at both breakpoints, every tenant role, every
platform role, direct-route denial, mutation visibility, public catalog,
workspace-session, authoritative product-read, Platform-session, and
role-authorized Platform-resource failures, retry actions, and the existence of
each visible Platform navigation target. It also aborts representative public,
Tenant, and Platform mutations and requires visible feedback with a re-enabled
control.

Do not promote when this gate fails. A passing local gate does not replace
real-device accessibility review, named-merchant acceptance, managed service
evidence, commercial approval, or the release-readiness gate.
