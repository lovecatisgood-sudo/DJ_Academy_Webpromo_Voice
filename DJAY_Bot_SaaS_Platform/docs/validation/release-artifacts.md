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
  `2d2eccf2bf643ff9421ec2800d90f5e30fcac6cc836addf017cf35dc950fe810`
- Platform Master: 24 files,
  `9e47dd9549a050ab9796cc24df284adf5479cd102e32560fbdfe35e015bde225`
- Public site: 30 files,
  `fcc6e0aaf84521caa09a160fb4d548cec5cccf5098b7c90b9971e20353ac4831`
- Tenant workspace: 42 files,
  `03d20afdd56a4368c2de29f7505c879fa481bf222b8e087b9b72bd271b37ad33`

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

The first Voice artifact run exposed a production-only ESM failure: bundled
`ws` attempted a dynamic CommonJS require of Node's `events` module. Source
tests did not exercise the emitted bundle. The build now supplies an ESM
`createRequire` bridge; the isolated bundle starts, reports liveness, and fails
readiness closed with provider-neutral `503 not_ready` when media authority is
absent. Its accepted bundle digest is
`d7a362f24c640b5091476fb6e03da411417453bcd1e6ab353730fa9aac9a41a2`.
The artifact is also started with a copied example production authority token;
it must exit before listening, name only the affected field, and never echo the
token value.

The worker artifact now includes its external PostgreSQL client, Argon2 package,
and installed native Argon2 target. QA copies the artifact outside the monorepo
before execution, proving it does not resolve those packages from workspace
`node_modules`. With database authority deliberately absent, startup fails
closed, names only `WORKER_DATABASE_URL`, and exposes no connection URL. The
accepted 56-file digest is
`11bd2a67badca2c13bd865f55f7a25b09f946303d0220fd34b5e98f5a8c866f1`.

These hashes describe the local generated build and are not target-deployment
evidence. The immutable deployment system must archive its own package hashes,
then repeat load-balancer health and phase browser acceptance. No release
artifact gate authorizes payment, plan activation, provider rollout, or general
availability while the existing commercial and managed-environment gates remain
open.
