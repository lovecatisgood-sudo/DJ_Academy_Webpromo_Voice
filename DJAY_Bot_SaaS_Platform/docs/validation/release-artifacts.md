# Production release artifact validation

- Result: seven-artifact packaging and isolated runtime/static smoke gate passed
- Date: 2026-07-16
- Runtime contract: Node 24
- Deployment state: local artifact accepted; target-environment rollout pending

## Executed gates

```bash
git diff --check
scripts/use-node24.sh pnpm run package:release
scripts/use-node24.sh pnpm run qa:release-artifacts
scripts/use-node24.sh pnpm run verify
```

The packager refreshed every standalone Next.js service with the exact static
tree from its build ID. The artifact gate started API, Platform Master, public
site, and tenant workspace from their packaged runtime directories, required
their liveness contracts and browser security headers, loaded each root
document, and fetched every referenced static asset. Accepted static evidence
was:

- API: 132 files,
  `ed2145217bbacaab1882f83ac52447ba3ff2b1c44a8d90e98975cd8852914799`
- Platform Master: 24 files,
  `022e8b25c8ef542803820be1d7de85ba934d09b023c6f44d5f506ef737a6ccd9`
- Public site: 31 files,
  `25d69d082239b21490757a46d14a895bc47e163dff471d62246649e08c79843d`
- Tenant workspace: 43 files,
  `4249e18411a9d99dcf6368ee01ebb0401d95735739b484de84117101b6aa74ed`

The release audit found that all three Tenant install snippets referenced
versioned CDN modules, but the release package did not archive those modules.
The packager now produces `apps/widget-cdn/dist` with exactly three minified
browser bundles. The accepted tree digest is
`2f48f44654ec19bb44ffe0ba9599675695b44a0adca786c0a8ad63cc76621eac`.
Its manifest records each public path and SHA-384 integrity value, plus the
bounded cache, cross-origin module, resource-policy, and nosniff contracts.
Artifact QA copies the static root outside the workspace and rejects a missing,
unbranded, inaccessible, non-integrity-recorded, or restricted-identity bundle.
The public paths now come from the same checked contract used by the Tenant
snippet generator. A production Tenant build also fails before compilation when
an explicitly configured public API or widget CDN origin is not exact HTTPS.
FlowBot, AI Chat, and Voice browser acceptance creates a deployment and compares
the displayed module path, mount function, opaque key, and API origin against
that contract.

The previous standalone manifests contained a build-time
`http://127.0.0.1:3103` rewrite. A separately deployed web service could not
replace that destination at startup. Public Site, Tenant Web, and Platform
Master now package request-time proxy routes instead. Artifact QA points all
three unchanged artifacts at a runtime-selected upstream and proves all four
realm paths preserve POST method, path/query, body, browser cookie, exact
origin, upstream status/header, and two independent `Set-Cookie` values. A
focused proxy test additionally proves encoded path forwarding.
It also starts a production web artifact without `API_APP_URL` and requires a
safe `503 api_route_unavailable`, proving there is no production localhost
fallback. Each web artifact's `/api/health/ready` now depends on the API's
readiness response, and the API artifact fails readiness closed when database
authority is absent. Focused policy tests reject insecure/path-bearing or
hostname-sharing browser realms, insecure social endpoints, and non-WSS
enabled Voice routing.
The isolated API artifact also exposes legal authority as a controlled,
non-cacheable `503 unavailable` response when no approved bundle is mounted;
it never falls back to invented Terms or Privacy versions.

The Public and Tenant artifacts now issue one-time account links with fragment
state instead of query credentials. Sensitive account-link routes send
`Referrer-Policy: no-referrer`, legacy links clean themselves into same-tab
state, and Tenant Web packages the dedicated existing-account invitation route.
Registration, invitation acceptance, and recovery completion also share the
same 12-to-128-character password contract and require accessible confirmation
before any account mutation is sent.
All packaged account forms also enforce the server's email and normalized-name
boundaries. Whitespace-only registration and invitation names are rejected on
the originating field without sending a mutation, and accepted names are
trimmed before transport.
The packaged Contact form also requires an email or phone and shares its
normalized name/phone limits with the domain schema. Invalid identity data is
announced on the exact field without a request; an accepted form transports one
trimmed mutation.
The packaged Data Controls form keeps workspace export separate from
contact-scoped erasure. Missing erasure scope focuses the Contact field and
sends no request; the destructive confirmation names the contact, acceptance
sends one scoped request, and the form returns to safe export defaults.
Retention success is announced only inside the retention section.
The packaged Inbox composer rejects whitespace-only text locally, retains focus
and sends no request. One corrected reply sends exactly one trimmed message,
clears only after acceptance, and announces success through a polite status;
transport failures preserve the operator's text for manual retry.
The packaged Platform Master now gives Owner and AI Operations an inline Voice
incident-resolution form under the affected incident. Cancel and invalid
evidence send no command, accepted evidence is trimmed to the shared
12–2,000-character contract and announced politely, and a controlled transport
failure preserves the exact draft and an enabled retry control.
The packaged runtime and route-action buttons explicitly validate their
adjacent reason fields before confirmation. Whitespace-only evidence retains
focus and sends no request; corrected values are trimmed and transported once,
successful runtime change is announced politely, and authority changes reset
the drafts. Existing dead-letter recovery evidence also remains rendered with
busy controls during post-mutation refresh rather than flashing a blank panel.
The two Voice deployment creation journeys now render one shared form contract,
including exact origin, disclosure, and bilingual greeting limits. Studio uses
the same limits before transport; a greeting over the immutable Sales Core
500-character boundary produces an accessible local error, preserves the draft,
and sends no save mutation.
The packaged FlowBot and AI Chat deployment journeys use one shared accessible
form with the same exact-origin authority as Voice. Paths, queries, fragments,
credentials, remote HTTP, and overlong origins are rejected without a mutation;
corrected exact origins are normalized once and preserved through API and
storage revalidation.
The packaged FlowBot Premium operations panel also rejects unsupported
timezones and empty routing teams with field-specific accessible feedback and
zero requests. Corrected schedule and routing values send one normalized
mutation and are revalidated against domain and storage authority.
The packaged FlowBot visual editor keeps invalid Advanced JSON visible and
editable, bounds direct title/copy fields to the domain contract, and blocks
invalid or unvalidated per-node JSON from producing a stale draft PATCH. The
focused browser gate proves both invalid paths send zero requests and a repaired
draft sends exactly one.
The packaged AI Chat Studio renders a complete guided Sales Core editor with
the domain's field limits and timezone authority. Invalid guided input or
malformed Advanced JSON remains local and repairable, and unsaved visible
changes disable immutable publication and protect agent switching/navigation.
The focused browser gate proves multiline policy editing, dismissed-switch
preservation, invalid journeys with zero draft PATCHes, and one normalized
corrected candidate.

The first Voice artifact run exposed a production-only ESM failure: bundled
`ws` attempted a dynamic CommonJS require of Node's `events` module. Source
tests did not exercise the emitted bundle. The build now supplies an ESM
`createRequire` bridge; the isolated bundle starts, reports liveness, and fails
readiness closed with provider-neutral `503 not_ready` when media authority is
absent. Its accepted bundle digest is
`f83d2a3161d0055134c0d0cffac226e7af99de5f958cf3889586d2b831dc0695`.
The artifact is also started with a copied example production authority token;
it must exit before listening, name only the affected field, and never echo the
token value.

The worker artifact now includes its external PostgreSQL client, Argon2 package,
and installed native Argon2 target. QA copies the artifact outside the monorepo
before execution, proving it does not resolve those packages from workspace
`node_modules`. With database authority deliberately absent, startup fails
closed, names only `WORKER_DATABASE_URL`, and exposes no connection URL. The
accepted 56-file digest is
`a7842864ad5d4c8e3c7cb11f08473e670484dab5805419529a14b549f4e7b36a`.

These hashes describe the local generated build and are not target-deployment
evidence. The immutable deployment system must archive its own package hashes,
then repeat load-balancer health and phase browser acceptance. No release
artifact gate authorizes payment, plan activation, provider rollout, or general
availability while the existing commercial and managed-environment gates remain
open.
