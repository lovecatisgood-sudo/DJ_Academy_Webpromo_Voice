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

Public Site, Tenant Web, and Platform Master route their same-origin API paths
through `proxyApiRequest` at request time. `API_APP_URL` must be an exact HTTP
or HTTPS API origin; it is required in production and may use the localhost
fallback only during development. The proxy preserves method, encoded path,
query, browser cookies, exact `Origin`, request body, upstream status, streaming
body, and every `Set-Cookie` value while removing hop-by-hop headers. It caps
browser request bodies at 256 KiB and returns a provider-neutral, non-cacheable
`503 api_route_unavailable` when authority is missing, invalid, or unreachable.
Each web service exposes `/api/health/ready`, which reports ready only when the
API's own readiness contract succeeds; use liveness for process restarts and
readiness for traffic admission.
Never restore Next.js build-time rewrites for API traffic: they bake the build
machine address into the standalone artifact. `pnpm run lint:runtime-proxies`
protects all four realm routes and all seven supported HTTP methods.

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
the explicit value in `.env.example`. Both values must be exact origins: HTTPS
in production, with no credentials, path, query, fragment, or trailing slash.
Local HTTP is accepted only for loopback hosts outside production. Invalid
configuration fails closed and logs only the field name. Never ship a localhost
URL in a public artifact.

Authentication `next` values are untrusted input. Route every password and MFA
continuation through `safeSameOriginPath`; do not replace it with prefix checks
or direct `window.location` assignment. The resolver deliberately rejects raw
and encoded separator ambiguity and falls back to `/workspace`.

New verification, recovery, invitation, and ownership email links must encode
opaque values in the URL fragment, never the query. The account-link clients
support old query links only for compatibility: they immediately move values to
same-tab `sessionStorage`, replace the visible address with the clean route, and
clear storage after success or permanent invalidity. Do not use persistent
storage. Existing-account invitations cross from Public to Tenant in a fragment,
then continue through `/?next=%2Finvitations%2Faccept`; the login page must use
`window.location.replace` so the credential page is not retained in history.

Every password-creation form must import `newPasswordConstraints` and
`passwordConfirmationError` from `@djay/shared`. Registration, new-user
invitation, and recovery use the same 12–128-character guidance and require a
second `autocomplete="new-password"` field. A mismatch is a local validation
error: call `reportValidity`, announce the shared message, preserve fields and
one-time state, and do not create an idempotency key or call the API. Current
Tenant and Platform password fields retain `autocomplete="current-password"`
and the server maximum of 128 characters. Do not add composition rules that
would reject long passphrases without an accepted identity-policy change.

Every browser email input must use `emailFieldConstraints` or the exact
320-character API maximum. Registration and new-user invitation must use the
shared display/business-name constraints, `identityTextError`, and
`normalizeIdentityText`: validate the trimmed length on the originating field,
call `reportValidity`, preserve the form and one-time state, and send no
mutation until corrected. Person names are 2–160 characters and business names
are 2–200 characters after surrounding space is removed. Do not rely only on
raw HTML `minlength`, because a whitespace-only value can satisfy that check.

Contact creation must call the shared `contactCreationError` before setting a
busy state or sending a request. At least one email or phone is required;
display names are 1–200 normalized characters and a supplied phone is 7–32.
Associate the shared guidance with both identity fields, report the error on the
originating control, preserve every value, and use `role="alert"` for correction
failures. A successful contact mutation uses a polite status and transports
trimmed values. The server schema imports the same numeric limits; changing one
side without the other is not accepted.

Both Voice deployment creation locations must render `VoiceDeploymentForm`;
never copy its fields back into `page.tsx`. Creation routes and Studio updates
must use `voiceDeploymentFieldLimits`. The 500-character bilingual greeting
maximum comes from the immutable Sales Core playbook and is authoritative over
older 1,000-character route/UI declarations. Before a Studio save,
`voiceDeploymentValidationError` must validate normalized names, greetings,
disclosures, 1–20 bounded origins, whole-number call duration, and reconnect
window. Invalid drafts remain local, switch to the relevant Studio tab, and use
an assertive error without sending a mutation.

`config/next-security-headers.ts` is the single application-level browser
policy for API, Public Site, Tenant Web, and Platform Master. It limits content,
forms, frames, objects, connections, workers, and media to the minimum origins
needed by the current product; sends HSTS, strict referrer (and `no-referrer` on
one-time account-link routes), MIME-sniffing,
opener-isolation, frame, DNS-prefetch, and cross-domain-policy protections; and
denies camera, geolocation, payment, and USB access. Microphone access is denied
in every realm except same-origin Tenant Web, where Voice testing requires it.
Do not add an external CSP origin or device capability without a reviewed
feature requirement and a production-browser regression test. The deployment
edge may add stricter transport controls but must not remove these artifact
headers.

## Customer widget foundation

FlowBot, AI Chat, and Voice import the same browser-safe foundation from
`@djay/shared/widget-ui`. It owns the canonical green/yellow tokens, responsive
panel geometry, mobile safe-area placement, 44px controls, focus treatment,
forced-colors support, reduced-motion behavior, non-modal dialog relationship,
exact HTTP(S) API-origin validation, and bounded public requests. Product files
may add only the interaction-specific stream, form, transcript, or Voice-state
styles after this foundation.

FlowBot and AI Chat use durable database sync, not process-local live fan-out.
Their polling must remain single-flight, pause while an input or form control is
being edited, avoid hidden-tab work, preserve a visitor draft across a required
rerender, and show a saved-conversation failure state. A connection retry must
never restart or mutate the conversation. Voice must update its elapsed timer
without rebuilding controls or displacing keyboard focus.

Run the static policy plus the three real-browser product gates:

```bash
scripts/use-node24.sh pnpm run lint:widget-foundation
P4_QA_SCOPE=widget scripts/use-node24.sh pnpm run qa:p4-flowbot
P5_QA_SCOPE=widget scripts/use-node24.sh pnpm run qa:p5-ai-chat
scripts/use-node24.sh pnpm run qa:p7-voice
```

The CDN deployment contract and package evidence are governed by
`release-artifacts.md`. Do not hand-copy a package `dist/index.js` to the CDN.
Promote the complete `apps/widget-cdn/dist` artifact and its manifest.

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

FlowBot, AI Chat, and Voice deployment origins must remain exact HTTPS origins
without paths, queries, fragments, or credentials; localhost-only HTTP is for
local development. The focused P4, P5, and P7 browser gates must prove invalid
input sends zero mutations, and the shared static guard must prove the Tenant,
API, and storage layers still use the same authority.

FlowBot Premium schedule and routing changes must also pass the P4 browser gate:
unsupported IANA timezones and empty member selections remain local, while one
corrected submission is trimmed and sent exactly once. Do not bypass the shared
key/name/timezone/member contract in the UI, API, domain, or repository.

FlowBot draft authoring must validate against `flowSnapshotSchema` before PATCH.
Malformed Advanced JSON must retain the same editable value and an open repair
control. Per-node JSON must not update the rendered definition until it parses
and passes `flowNodeSchema`, and any pending node-settings error must block Save.

AI Chat authoring must render `AiPlaybookEditor` instead of requiring merchant
administrators to author raw Sales Core JSON. Its guided identity, policy,
message, contact, timezone, and availability fields must use
`aiPlaybookFieldLimits`, and the complete candidate must pass
`aiPlaybookSchema` before PATCH. Advanced JSON remains an expert escape hatch:
malformed or schema-invalid text stays visible and editable, disables guided
fields, and sends no stale mutation. Any visible playbook or knowledge change
must make Publish unavailable until Save succeeds and the authoritative draft
is reloaded. Preserve blank/newline editing in list fields, protect browser
navigation while dirty, and require explicit confirmation before switching to
another agent with unsaved work.

Do not promote when this gate fails. A passing local gate does not replace
manual keyboard, screen-reader, zoom/reflow, cognitive, or representative-device
review. It also does not replace named-merchant acceptance, managed service
evidence, commercial approval, or the release-readiness gate.
