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
  `6101dc2255e0fcc7330e48c9aabc47f61a7830bf4cbb787ec5b4fce7e54f97e5`
- Platform Master: 24 files,
  `8d143ca185f32b82009d3cb346eea61d69caf7867c776ace812bb60724c897a7`
- Public site: 31 files,
  `a98e9921906475f728b3c90619d00f3515425d85cea20a870fb794aaeacfbf63`
- Tenant workspace: 42 files,
  `a27586833d2cbe8b4037ce06f06d21b0bb64148cdf5bdd6bf8356a6345e4fd80`

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
The two Voice deployment creation journeys now render one shared form contract,
including exact origin, disclosure, and bilingual greeting limits. Studio uses
the same limits before transport; a greeting over the immutable Sales Core
500-character boundary produces an accessible local error, preserves the draft,
and sends no save mutation.

The first Voice artifact run exposed a production-only ESM failure: bundled
`ws` attempted a dynamic CommonJS require of Node's `events` module. Source
tests did not exercise the emitted bundle. The build now supplies an ESM
`createRequire` bridge; the isolated bundle starts, reports liveness, and fails
readiness closed with provider-neutral `503 not_ready` when media authority is
absent. Its accepted bundle digest is
`71d53ec1da5008f1883ffe06df44a9e615ca1ff606cdc757e4d9d8d8ea238a9f`.
The artifact is also started with a copied example production authority token;
it must exit before listening, name only the affected field, and never echo the
token value.

The worker artifact now includes its external PostgreSQL client, Argon2 package,
and installed native Argon2 target. QA copies the artifact outside the monorepo
before execution, proving it does not resolve those packages from workspace
`node_modules`. With database authority deliberately absent, startup fails
closed, names only `WORKER_DATABASE_URL`, and exposes no connection URL. The
accepted 56-file digest is
`8cca6f56c008a604d50a71c7560d1d23129874d69acc1e116c89792af6bbf46c`.

These hashes describe the local generated build and are not target-deployment
evidence. The immutable deployment system must archive its own package hashes,
then repeat load-balancer health and phase browser acceptance. No release
artifact gate authorizes payment, plan activation, provider rollout, or general
availability while the existing commercial and managed-environment gates remain
open.
