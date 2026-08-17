# AI Text restricted provider-boundary evidence — 2026-08-17

## Scope

This evidence closes implementation of `AIT-001`; it does not record Product Owner acceptance, live-provider acceptance, or make a package sellable.

Production API startup requires an internal AI gateway endpoint and independent service token. Application runtime code uses only `createHttpTextProviderGateway`; it has no provider credential fields or direct OpenAI-compatible adapter. Direct Text adapters and provider credentials are owned by the separately built `apps/ai-gateway` service, whose generation route returns not-found without exact service authority.

The durable `lint:ai-provider-boundary` gate scans application and package source on every `pnpm verify`. It fails if a direct Text adapter leaves the provider gateway/AI gateway boundary, if API production authority stops failing closed, if provider credentials or gateway service authority enter browser applications/widgets, or if isolated release-artifact authorization and example-secret rejection checks disappear.

## Automated evidence

- `scripts/check-ai-provider-boundary.mjs`: source ownership, API fail-closed composition, browser/widget credential exclusion and release-artifact contract.
- `packages/provider-gateway/src/index.test.ts`: service-token internal transport and normalized provider-neutral results.
- `apps/ai-gateway/src/server.test.ts`: denied unauthenticated generation and normalized restricted output.
- `scripts/qa-release-artifacts.mjs`: isolated built gateway rejects unauthorized generation and copied example production credentials without disclosing their values.
- `pnpm verify`: boundary gate, lint, type checks, tests and all production builds passed.
- `pnpm package:release && pnpm qa:release-artifacts`: packaged runtimes, route-specific microphone policy, service authorization and copied-example-secret rejection passed.

No browser or GUI was used.
