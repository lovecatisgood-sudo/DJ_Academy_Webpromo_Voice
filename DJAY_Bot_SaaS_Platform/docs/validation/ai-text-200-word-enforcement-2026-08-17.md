# AI Text 200-word enforcement evidence — 2026-08-17

## Scope

This evidence closes implementation of `AIT-009`; it does not record Product Owner acceptance or make a package sellable.

AI Text policy instructs the provider to target roughly 40–80 words and never exceed 200 locale-aware words. English and Thai runtime counting uses `Intl.Segmenter`. An oversized candidate receives exactly one controlled rewrite that may change only `customerResponse`; stage, intent, facts, citations, response goal, proposed actions, handover and quick replies must remain identical. Customer text is never truncated or sliced.

If the rewrite fails, remains oversized, or changes protected structure, the runtime commits the merchant-approved locale fallback through the normal durable turn boundary. It records aggregate native units from both attempts, settles one commercial `ai_response`, and replays the committed response without another provider call.

## Automated evidence

- `packages/sales-core/src/index.test.ts`: 199/200/201 boundaries, English words, unspaced Thai segmentation, and 40–80/200 policy instructions.
- `packages/ai-chat-runtime/src/index.test.ts`: one successful English rewrite, one successful Thai rewrite, still-oversized fallback, protected-structure fallback, aggregate usage and no truncation.
- `packages/db/src/ai-chat-runtime-store.integration.test.ts`: durable over-limit fallback, 15-word committed response, idempotent replay, two-attempt native usage and one commercial settlement.
- `TEST_DB_PORT=55535 pnpm test:db`: all 120 migrations, RLS and every wired PostgreSQL integration suite passed.

No browser or GUI was used.
