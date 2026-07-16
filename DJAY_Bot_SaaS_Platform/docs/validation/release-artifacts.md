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
their liveness contracts, loaded each root document, and fetched every
referenced static asset. Accepted static evidence was:

- API: 129 files,
  `6bd55a0d0f9db70e7b6e6df4cfb441220e88c3a043e90c6edaa89007d6915097`
- Platform Master: 21 files,
  `4c465a90b49d66b0349024485906da2d0e06c840346bc9fe128fe7579651132b`
- Public site: 25 files,
  `035ccb432cfe74224216426987648f1ad02e611134f27c54183302c58e120a75`
- Tenant workspace: 37 files,
  `edc18733ad99210de52c5ec7b9b4af6febc2a12797bac7d878f64e5bad3d7818`

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
