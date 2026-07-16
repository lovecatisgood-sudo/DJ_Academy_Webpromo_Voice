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

- API: 128 files,
  `bbba677f827f9b5bfd6926951a39bc910d215e2cd7e74895b5ff932fcd357356`
- Platform Master: 20 files,
  `ab565831e6da9839f3c19f506b2e5f36087998eeca82e76bbff636238f73d00e`
- Public site: 24 files,
  `13f88a2b70d43e1652191fbe40160c786d3436cf269e975912975604dc631751`
- Tenant workspace: 35 files,
  `7d130222b81eafeca31c1295bb6408513f5a756ca16d4644ae56a2efc52a0893`

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
