# ADR-009: AI Text Gateway and Sales Core Boundary

- Status: Accepted
- Date: 2026-07-15
- Phase: P5

## Context

The legacy text chatbot combines tenant settings, prompt construction, a vendor
HTTP call, lead persistence, and provider metadata in one route. That contract
cannot become multi-tenant SaaS code. P5 also requires immutable playbook and
knowledge pins, reservation/settlement, structured actions, immediate takeover,
and provider-neutral public artifacts.

## Decision

AI text uses three explicit boundaries:

1. `@djay/sales-core` owns provider-neutral playbook schemas, stages, facts,
   action proposals, grounding citations, safety rules, and structured-output
   validation. It never performs an effect or imports a provider adapter.
2. `@djay/provider-gateway` is an internal-only interface. The application sends
   one normalized `sales_text` request to an authenticated internal HTTP gateway
   and receives structured output plus restricted native usage. No tenant route,
   browser package, or public DTO imports this package.
3. The AI runtime repository owns tenant/deployment/session authorization,
   immutable version pins, message-credit reservation/settlement, conversation
   writes, and Action Gateway validation. It commits validated output before any
   customer stream is released.

The upstream text implementation and routing profile are internal effective-dated
configuration. They are not encoded in public plans. The initial gateway contract
supports a deterministic test implementation so isolation, billing, safety, and
actions can be proven without production credentials. A live routing profile
requires bilingual/adversarial evaluation evidence and an audited Platform Master
activation; it does not require a public-contract change.

Web delivery uses provider-neutral NDJSON events. The runtime validates the whole
structured plan first, commits messages/actions/usage atomically, then streams the
validated customer response in chunks. This prevents partial unvalidated content
or an uncommitted action claim from reaching the visitor.

## Security and failure behavior

- The browser supplies only opaque deployment/session credentials, origin,
  message ID, locale, and visitor text.
- The database resolves tenant, web-channel entitlement, playbook, knowledge,
  conversation state, and quota authority server-side.
- Customer and knowledge text are untrusted data. They cannot alter the output
  schema, system safety rules, action allow-list, recipient, or channel binding.
- Gateway credentials and native usage remain server/internal. Gateway errors map
  to stable provider-neutral codes and never include upstream response bodies.
- Human takeover makes new AI turn claims fail before a gateway call.
- Timeouts/failures release the reservation idempotently. Successful turns settle
  one AI-response unit; raw native units go only to restricted operations data.
- Retry with the same message ID returns the first committed public result.

## Rollback

Playbook versions and sessions are immutable/pinned. Application rollback remains
compatible with the additive P5 schema. A routing incident can pause new AI turns
or roll back the internal profile without changing tenant data or exposing the
profile. No destructive migration is part of first release.

## Validation

- Basic rejects every non-web binding and wrong-origin/session request.
- wrong tenant and missing tenant context are denied by forced RLS/restricted
  functions;
- structured-output, grounding, action, injection, bilingual, refusal, and
  provider-leak suites pass;
- takeover prevents a gateway call;
- reservations settle/release exactly once under retry and failure;
- built tenant/widget assets and public response snapshots contain no restricted
  routing identifiers.
