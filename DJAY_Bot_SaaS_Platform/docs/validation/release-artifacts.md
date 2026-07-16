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

- API: 130 files,
  `a892b5b8d02a498c0c8d8aeef05310cc25d6f5939f16c7b8c28e1c7c822e8542`
- Platform Master: 22 files,
  `dcd297aa6f0eacd21a84d4f7a2322a6106b38b167fda48d7f5d1d079af92c064`
- Public site: 26 files,
  `24f9d7cf7268ea9310bd330dbf7a09ca58eeafa93a4536ff86bfc0910324c021`
- Tenant workspace: 38 files,
  `77d6bd75766226c3c0bc99907d7390193dcd93fd3f599d845105d623ab57d9df`

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
