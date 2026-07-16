# Production release artifact runbook

The release package contains four self-contained Next.js standalone services,
the Realtime Voice gateway bundle, and the worker bundle. A plain `next build`
does not copy `.next/static` or `public` into standalone output, so raw
`.next/standalone` directories are not accepted deployment artifacts.

## Build and package

Use the pinned Node 24 runtime on the release commit:

```bash
scripts/use-node24.sh pnpm run package:release
scripts/use-node24.sh pnpm run qa:release-artifacts
```

The packager refreshes static/public files beside each standalone server and
writes `release-manifest.json` inside every generated artifact. The manifest
records the app, Node runtime contract, entrypoint, liveness and readiness
paths, build ID where applicable, asset count, and deterministic SHA-256.
Generated artifacts remain ignored by Git; the immutable deployment system
must archive and hash them.

Set `API_APP_URL` on Public Site, Tenant Web, and Platform Master at runtime to
the exact internal API HTTP(S) origin. API routing is deliberately implemented
by packaged catch-all route handlers rather than `next.config` rewrites, because
Next.js serializes rewrites at build time. Production has no localhost fallback:
missing or malformed authority returns a safe non-cacheable 503. The API itself
requires exact HTTPS Public/Tenant/Platform origins on distinct hostnames in
production, HTTPS social-provider endpoints, and WSS whenever Voice is enabled.

Deploy these roots without rearranging their internal paths:

- `apps/api/.next/standalone` with entrypoint `apps/api/server.js`
- `apps/platform-master/.next/standalone` with entrypoint
  `apps/platform-master/server.js`
- `apps/public-site/.next/standalone` with entrypoint
  `apps/public-site/server.js`
- `apps/tenant-web/.next/standalone` with entrypoint
  `apps/tenant-web/server.js`
- `apps/voice-gateway/dist` with entrypoint `index.js`
- `apps/workers/dist` with entrypoint `index.js`

Do not run a standalone Next entrypoint from the monorepo build directory while
uploading only `server.js`; traced modules, manifests, and static assets are all
part of the artifact.

## Acceptance

The artifact QA starts every Next service from its packaged runtime directory,
requires safe liveness, loads the root HTML, and fetches every referenced
JavaScript/CSS/font asset. It supplies a request-time API origin to the three web
services and proves four Public/Tenant/Platform proxy paths preserve method,
path, query, body, cookie, origin, status, upstream headers, and both rotated
`Set-Cookie` values. A second production web runtime with missing authority must
fail closed without contacting localhost. Web readiness must also reflect API
readiness, while the API must fail readiness closed without database authority.
The gate starts Voice without media authority and requires liveness plus
provider-neutral `503 not_ready` readiness. It also proves the worker rejects
missing database authority without printing a connection URL.

After deployment, repeat liveness/readiness through the real load balancer and
run the phase browser suites against the deployed origins. An artifact pass does
not replace database migrations, release-readiness evidence, tenant isolation,
provider outage, restore, or named-merchant acceptance.

## Rollback

Retain the previous complete six-service artifact set and its environment
revision. Roll back application artifacts as one compatible release unless the
incident runbook explicitly proves a service-only rollback is contract-safe.
Never copy new static assets onto an older standalone server or mix build IDs.
Database migrations remain forward-compatible and are not reversed by artifact
rollback. If asset or build-ID verification fails, keep traffic on the previous
release and publish a provider-neutral degraded state.
