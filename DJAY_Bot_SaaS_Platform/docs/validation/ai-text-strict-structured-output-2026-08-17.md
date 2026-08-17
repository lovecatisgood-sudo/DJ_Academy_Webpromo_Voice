# AI Text strict structured-output evidence — 2026-08-17

## Scope

This evidence closes implementation of `AIT-003`; it does not record Product Owner acceptance, live-provider acceptance, or make a package sellable.

The restricted AI gateway generates its provider JSON Schema from the canonical Sales Core Zod schema and requests strict structured output. The schema requires customer text, intent, response-level confidence, safety/refusal metadata, qualification facts, source-revision/chunk citations, typed lead and external-action proposals, and handover reason, department and summary. Unknown fields are rejected.

Application validation remains authoritative after generation. It enforces cross-field lead/action and handover invariants, citation authority, entitlements, locale-aware length, and a single bounded structural repair. The runtime deterministically recalculates response confidence before committing the complete structured result. Public responses expose only approved customer text, quick replies and configured public actions.

## Automated evidence

- `packages/sales-core/src/index.test.ts`: required strict JSON Schema fields, closed objects, safety-state invariants, typed actions and policy instructions.
- `apps/ai-gateway/src/server.test.ts`: provider request uses `json_schema` with `strict: true` and the canonical required fields.
- `packages/ai-chat-runtime/src/index.test.ts`: validated output receives deterministic response confidence and explicit safety metadata before commit.
- `packages/db/src/ai-chat-runtime-store.integration.test.ts`: PostgreSQL stores confidence, safety metadata and typed lead/action proposals atomically with the turn.
- `packages/provider-gateway/src/index.test.ts`: both supported text adapter shapes carry strict schemas and normalize output.
- `TEST_DB_PORT=55537 pnpm test:db`: all 120 migrations and every wired PostgreSQL integration suite passed.
- `pnpm verify`, `pnpm package:release`, `pnpm qa:release-artifacts`, and `pnpm run test:release-gate`: source, production builds and all eight isolated runtime artifacts passed.

No browser or GUI was used.
