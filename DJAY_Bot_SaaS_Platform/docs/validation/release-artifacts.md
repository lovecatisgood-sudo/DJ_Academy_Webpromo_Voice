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
  `8602f6f25c0fbda92eecca0e2c6844d751dd6b196cdea4145a7372faa5495e83`
- Platform Master: 24 files,
  `8a9d4d9193486bd746ddf8e3195758814548158e09bc6cd8b85f97af4068635c`
- Public site: 31 files,
  `5afe84a1dd519bd774a49a54436f39e86b1cc6f289e1ba1a997a11c606db92b2`
- Tenant workspace: 43 files,
  `2f493d0c3d25c20323625cc4d4dad516df8bc1209faf808e2cbce53403048156`

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
`04d08864e6a476e3af5b8ea0b2fe445cbfbdfa2d846b944e3d39a5e1a6ce6e92`.
The artifact is also started with a copied example production authority token;
it must exit before listening, name only the affected field, and never echo the
token value.

The worker artifact now includes its external PostgreSQL client, Argon2 package,
and installed native Argon2 target. QA copies the artifact outside the monorepo
before execution, proving it does not resolve those packages from workspace
`node_modules`. With database authority deliberately absent, startup fails
closed, names only `WORKER_DATABASE_URL`, and exposes no connection URL. The
accepted 56-file digest is
`c47feb9b4a8ad4a63c9d1222e4abee10170e96200635bee28703338766ecf888`.

These hashes describe the local generated build and are not target-deployment
evidence. The immutable deployment system must archive its own package hashes,
then repeat load-balancer health and phase browser acceptance. No release
artifact gate authorizes payment, plan activation, provider rollout, or general
availability while the existing commercial and managed-environment gates remain
open.
