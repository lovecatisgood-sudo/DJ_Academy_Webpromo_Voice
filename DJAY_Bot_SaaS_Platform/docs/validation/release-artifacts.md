# Production release artifact validation

- Result: six-service packaging and isolated runtime smoke gate passed
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

- API: 129 files,
  `1f8f39f9fe771a1bdcb26ad4ae3436d13a4f93e1f2b59d3bae1862981d6ab715`
- Platform Master: 21 files,
  `56d39b871606be74e517d4b860838fa542bf348499ac690171701832e55fee99`
- Public site: 25 files,
  `bad167f5f7b396685295bef80eaa6d346325b90ba2a1f69c3ff0640c4c0bec0f`
- Tenant workspace: 37 files,
  `b42ee1d9a98871d6260dace8bf007297b301abcf778bbfc993b0a3951755fa71`

The first Voice artifact run exposed a production-only ESM failure: bundled
`ws` attempted a dynamic CommonJS require of Node's `events` module. Source
tests did not exercise the emitted bundle. The build now supplies an ESM
`createRequire` bridge; the isolated bundle starts, reports liveness, and fails
readiness closed with provider-neutral `503 not_ready` when media authority is
absent. Its accepted bundle digest is
`171d09abe8c19b77333a767837cee58fabb21ac329522a7c05747691ee53e8bc`.

The worker artifact now includes its external PostgreSQL client, Argon2 package,
and installed native Argon2 target. QA copies the artifact outside the monorepo
before execution, proving it does not resolve those packages from workspace
`node_modules`. With database authority deliberately absent, startup fails
closed, names only `WORKER_DATABASE_URL`, and exposes no connection URL. The
accepted 56-file digest is
`3cac21c3796243fb65250ec828824560ae79669556f7b6a0658d61c57a75a78b`.

These hashes describe the local generated build and are not target-deployment
evidence. The immutable deployment system must archive its own package hashes,
then repeat load-balancer health and phase browser acceptance. No release
artifact gate authorizes payment, plan activation, provider rollout, or general
availability while the existing commercial and managed-environment gates remain
open.
