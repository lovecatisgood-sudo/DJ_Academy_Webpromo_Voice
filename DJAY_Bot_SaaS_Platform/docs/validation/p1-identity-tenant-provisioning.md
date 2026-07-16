# P1 Validation: Identity and Tenant Provisioning

- Result: Passed
- Date: 2026-07-14
- Product code migrated: none
- Database: PostgreSQL 16
- Runtime: Node 24, pnpm 11.12.0

## Browser mutation hardening checkpoint

On 2026-07-16 the origin/CSRF boundary was re-audited against ADR-004. The
shared validator now maps every mutation path to exactly one Public, Tenant, or
Platform application origin rather than trusting every DJAY application origin
as one set. API, widget, webhook, internal-service, missing, malformed, and
sibling-realm origins fail closed. Focused unit coverage exercises registration,
invitation, login, recovery, MFA, Tenant, Platform, and non-browser paths. The
workspace lint gate also scans all browser route files and currently proves that
all 66 exported POST, PUT, PATCH, and DELETE handlers invoke
`hasTrustedOrigin(request)`.

The same 2026-07-16 hardening pass centralized every authentication cookie
write. Seven focused serialization tests prove distinct Tenant/Platform names,
host-only scope, `HttpOnly`, production `Secure`, Tenant `SameSite=Lax`,
Platform `SameSite=Strict`, session `Path=/`, endpoint-only MFA challenge paths,
bounded TTLs, and deletion with the matching issuance attributes. A workspace
lint gate reports zero direct cookie writes in API route files, preventing a new
handler from bypassing the reviewed policy.

The 2026-07-16 onboarding audit removed browser-selected readiness stages.
`GET /tenant/onboarding` now derives technical progress from the selected
tenant's profile, subscription/access, published configuration, active
deployment, and current-version completed journey evidence. PATCH accepts only
an evidence refresh action. Focused unit coverage proves product selection
cannot become `ready` without launch evidence, while PostgreSQL integration
proves an isolated tenant with no product remains below product selection.

The first-time account audit also closed the expired-verification dead end.
Accepted registration now becomes a dedicated completion state with the entered
email preserved only in the local resend field. Successful registration and an
invalid or expired link expose the same generic resend result so the browser
cannot enumerate accounts. Production Chromium proves one registration and one
resend request, missing-token recovery, a retryable dropped resend transport,
responsive layout, and automated WCAG 2.2 A/AA acceptance.

The authentication continuation audit found that a prefix-only path check could
accept an encoded backslash sequence that browser URL normalization interpreted
as an external authority. The shared navigation policy now rejects raw and
encoded slash/backslash ambiguity, control characters, credentials, and
external schemes. Both password and MFA completion use the same resolver.
Twenty-three focused tests cover accepted and rejected paths and exact
cross-realm origins. Production Chromium proves malicious continuations fall
back to `/workspace` on the Tenant origin and a valid ownership callback is
preserved.

The one-time-link audit moved newly issued verification, recovery, invitation,
and ownership credentials from query strings to fragments, preventing them from
entering HTTP request targets or referrers. Legacy query links remain usable and
are immediately cleaned into same-tab state. Production Chromium proves clean
addresses, `no-referrer` headers, retry preservation, terminal cleanup, and the
new desktop/mobile existing-account invitation continuation through Tenant
sign-in. PostgreSQL integration proves the unauthenticated invitation attempt
returns `sign_in_required`, a different identity cannot be substituted, and the
matching identity receives the invited role without creating another user.

The credential-entry audit aligned registration, new-user invitation, and
password recovery with the server's 12–128-character boundary and added an
accessible confirmation field to all three. Production Chromium submits three
different confirmations and proves the shared error is announced, fields and
one-time state remain intact, the command becomes correctable, and the relevant
API request count stays zero. Tenant and Platform current-password inputs also
enforce the server maximum. A workspace lint gate prevents any of these forms
from silently dropping the shared contract.

The identity-field audit then aligned every browser email input with the API's
320-character maximum. Public registration and new-user invitation share the
server's normalized 2–160-character display-name contract; registration also
uses the 2–200-character business-name contract. Production Chromium proves
whitespace-only values are announced on the exact field, preserve correctable
input and invitation-token state, and issue zero registration or invitation
mutations. Successful requests send the trimmed values. A workspace lint gate
scans all application email inputs and the two normalized-name journeys.

Visual evidence:

- `/tmp/djay-registration-complete-desktop.png`
- `/tmp/djay-registration-complete-mobile.png`
- `/tmp/djay-verification-recovery-desktop.png`
- `/tmp/djay-verification-recovery-mobile.png`

## Implemented scope

- Public registration, email verification, login, logout, recovery, resend, and
  session endpoints.
- Atomic verified-user, tenant, exactly-one-owner membership, onboarding,
  legal-acceptance, audit, and outbox provisioning.
- Tenant workspace selection, session rotation/revocation, onboarding, team
  invitations, tenant MFA, and MFA-gated ownership transfer.
- Separate Platform Master application, identities, cookies, sessions, MFA,
  recovery codes, database role, audit, and one-time offline owner bootstrap.
- Forced RLS, same-tenant foreign keys, deferred exactly-one-active-owner
  invariant, restricted database roles, and branded tenant/platform/system
  execution contexts.
- Encrypted outbox payloads, restricted worker claim, retry/backoff, dead-letter
  handling, and HTTP email adapter.

## Automated evidence

The full workspace gate passed:

```bash
scripts/use-node24.sh pnpm run verify
```

This ran TypeScript linting, import/provider-boundary scans, type checking,
unit tests, and production builds for every application and package.

The disposable PostgreSQL integration gate passed:

```bash
scripts/test-db-integration.sh
```

It applied migrations `0000` through `0005` and verified:

- missing-context and A-to-B cross-tenant access denial;
- forced-RLS grants and same-tenant foreign-key enforcement;
- last-owner denial and atomic owner transfer;
- concurrent registration, verification, recovery, invitation, replay, and
  ownership-transfer behavior;
- tenant and platform MFA, recovery-code digests, session rotation, and revoke;
- restricted worker delivery of real registration, recovery, invitation, and
  transfer outbox payloads;
- tenant team repository isolation.

## HTTP and browser evidence

A disposable production build and database fixture were exercised on desktop
and mobile viewports. The gate verified:

- public and API health returned 200;
- login without an allowed Origin was rejected with a generic 401;
- tenant session/team pages authenticated and rendered without horizontal
  overflow;
- a tenant cookie could not access `/platform/me`;
- platform password login returned `mfa_required` without issuing a session;
- valid TOTP completed platform authentication;
- a platform cookie could not access tenant session routes;
- public, tenant, and platform pages stayed within viewport bounds;
- no provider/model identifier appeared in tenant/public HTML or bundles;
- no unexpected browser errors or missing assets remained.

The unauthenticated Platform Master shell intentionally probes `/platform/me`
and receives 401 before showing login. That expected network response is not an
authentication failure after MFA.

## Recovery evidence

The exercised database was dumped, restored to a fresh database, and checked.
The restored database retained the expected tenant, platform user, and active
tenant session records. See `../runbooks/backup-restore.md`.

## Production prerequisites

- Inject independent random secrets for every auth, hashing, encryption, and
  platform setting; never share tenant and platform secrets.
- Use TLS-only origins and secure cookies behind explicitly configured trusted
  proxies.
- Run migrations as the migrator, not an application role.
- Configure and test a real email endpoint before enabling registration.
- Complete Platform Owner bootstrap through the one-time offline procedure and
  store the displayed recovery codes outside the runtime environment.
- Enable operational metrics/alerts for auth denial, outbox age/dead letters,
  owner-invariant failures, RLS denial, and platform login.
- Take and verify a pre-deployment backup; retain a forward-fix migration path.

P1 is complete. Sellable plans and payment remain disabled until the later
catalog, entitlement, usage, and billing gates pass.
