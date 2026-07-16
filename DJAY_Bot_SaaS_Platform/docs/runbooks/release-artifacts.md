# Production release artifact runbook

The release package contains four self-contained Next.js standalone services,
one static customer-widget CDN artifact, the Realtime Voice gateway bundle, and
the worker bundle. A plain `next build` does not copy `.next/static` or `public`
into standalone output, so raw `.next/standalone` directories are not accepted
deployment artifacts.

## Build and package

Use the pinned Node 24 runtime on the release commit:

```bash
scripts/use-node24.sh pnpm run package:release
scripts/use-node24.sh pnpm run qa:release-artifacts
```

The packager refreshes static/public files beside each standalone server and
writes `release-manifest.json` inside every generated artifact. The manifest
records the app, Node or static runtime contract, entrypoint, liveness and
readiness paths, build ID where applicable, asset count, and deterministic SHA-256.
Generated artifacts remain ignored by Git; the immutable deployment system
must archive and hash them.

Set `API_APP_URL` on Public Site, Tenant Web, and Platform Master at runtime to
the exact internal API HTTP(S) origin. API routing is deliberately implemented
by packaged catch-all route handlers rather than `next.config` rewrites, because
Next.js serializes rewrites at build time. Production has no localhost fallback:
missing or malformed authority returns a safe non-cacheable 503. The API itself
requires exact HTTPS Public/Tenant/Platform origins on distinct hostnames in
production, HTTPS social-provider endpoints, and WSS whenever Voice is enabled.

Tenant install code also contains public browser authorities fixed into its
JavaScript build. Set `NEXT_PUBLIC_API_APP_URL` and
`NEXT_PUBLIC_WIDGET_CDN_URL` to exact HTTPS origins for a custom production
deployment, or leave them unset to use `https://api.djaybot.com` and
`https://cdn.djaybot.com`. An explicit HTTP, path-bearing, credential-bearing,
query-bearing, or fragment-bearing value fails the production Tenant build.
Changing either public origin requires rebuilding Tenant Web; changing only the
runtime `API_APP_URL` does not update merchant snippets.

Deploy these roots without rearranging their internal paths:

- `apps/api/.next/standalone` with entrypoint `apps/api/server.js`
- `apps/platform-master/.next/standalone` with entrypoint
  `apps/platform-master/server.js`
- `apps/public-site/.next/standalone` with entrypoint
  `apps/public-site/server.js`
- `apps/tenant-web/.next/standalone` with entrypoint
  `apps/tenant-web/server.js`
- `apps/widget-cdn/dist` as a static root containing exactly
  `flowbot/v1/index.js`, `ai-chat/v1/index.js`, and `voice/v1/index.js`
- `apps/voice-gateway/dist` with entrypoint `index.js`
- `apps/workers/dist` with entrypoint `index.js`

Serve the widget root only over HTTPS at the reviewed CDN origin. Apply the
manifest's `Cache-Control`, `Access-Control-Allow-Origin`,
`Cross-Origin-Resource-Policy`, and `X-Content-Type-Options` values exactly.
Each product path is a compatible `v1` channel with bounded revalidation, not
an immutable filename. Deploy all three files atomically, retain the manifest's
per-file SHA-384 evidence, and purge/revalidate the three paths after promotion.

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
The gate also copies the widget CDN artifact outside the workspace and proves
all three versioned bundles match their tree hash and SHA-384 records, contain
the canonical DJAY shell, expose accessible dialog controls, preserve the
cross-origin static-host contract, and contain no restricted runtime identity.
Its asset paths must exactly match the shared install contract used by Tenant
Web.
It starts Voice without media authority and requires liveness plus
provider-neutral `503 not_ready` readiness. It also proves the worker rejects
missing database authority without printing a connection URL.

After deployment, repeat liveness/readiness through the real load balancer and
run the phase browser suites against the deployed origins. An artifact pass does
not replace database migrations, release-readiness evidence, tenant isolation,
provider outage, restore, or named-merchant acceptance.

## Rollback

Retain the previous complete seven-artifact set and its environment
revision. Roll back application artifacts as one compatible release unless the
incident runbook explicitly proves a service-only rollback is contract-safe.
Never copy new static assets onto an older standalone server or mix build IDs.
Do not mix widget files or a widget manifest from different releases.
Database migrations remain forward-compatible and are not reversed by artifact
rollback. If asset or build-ID verification fails, keep traffic on the previous
release and publish a provider-neutral degraded state.
