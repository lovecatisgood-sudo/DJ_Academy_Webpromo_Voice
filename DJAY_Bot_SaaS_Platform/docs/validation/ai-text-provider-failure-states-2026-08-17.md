# AI Text provider failure-state evidence — 2026-08-17

## Scope

This evidence closes implementation of `AIT-005`; it does not record Product Owner acceptance, provider acceptance, or make a package sellable.

The restricted provider boundary now classifies timeout, dependency unavailability, invalid response, provider refusal, policy violation and provider quota exhaustion as stable internal states. OpenAI Responses refusal/incomplete envelopes, compatible-chat refusals, policy-filter responses and HTTP 429 are normalized without returning provider bodies, names, models or credentials.

The internal AI gateway retries only transient dependency unavailability once. It emits structured operator telemetry as `ai_gateway_provider_failed` with the normalized reason and returns only that safe reason to the application runtime. The deployed runtime commits the merchant-approved locale fallback with durable intent `safe_fallback.<reason>`, no actions or upstream detail, an idempotent replay, one commercial `ai_response` settlement and any measurable native usage.

## Automated evidence

- `packages/provider-gateway/src/index.test.ts`: internal-state propagation, timeout, refusal, policy filtering, quota exhaustion and provider-neutral output.
- `apps/ai-gateway/src/server.test.ts`: explicit HTTP normalization, one-call non-transient handling and structured operator reason logs.
- `packages/ai-chat-runtime/src/index.test.ts`: all five required fallback classes persist explicit intents while customer output remains neutral.
- `packages/db/src/ai-chat-runtime-store.integration.test.ts`: durable quota-exhaustion fallback, replay without another provider call, zero unreported native units and one commercial settlement.
- `TEST_DB_PORT=55536 pnpm test:db`: all 120 migrations, RLS and every wired PostgreSQL integration suite passed.

No browser or GUI was used.
