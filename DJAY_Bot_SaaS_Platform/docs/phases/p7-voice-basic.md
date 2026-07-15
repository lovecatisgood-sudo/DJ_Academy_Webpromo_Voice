# P7: Voice Agent Basic

## Status

In progress. The provider-neutral browser/gateway protocol and deterministic
session lifecycle foundation are implemented locally. Database authority,
minute reservation/settlement, media transport, Sales Core actions, tenant
operations, migration, and production acceptance remain pending.

## Requirements

- Present the plan as the First-Generation Voice Engine and resolve only the
  internal `voice_gen1` capability profile.
- Issue a short-lived opaque grant; browser-visible contracts may contain only
  the fields approved by ADR-006.
- Run realtime media through a separately deployable DJAY voice gateway.
- Require automated-agent disclosure before ordinary assistant speech.
- Support interruption, silence, bounded reconnect, graceful terminal paths,
  and provider-neutral errors.
- Reserve concurrency, minutes, and spend before restricted routing allocation.
- Settle customer minutes exactly once under a documented rounding rule and
  release unused reservations on every unconnected or failed path.
- Execute lead, appointment, callback, and handover effects only through the
  Action Gateway.
- Keep recording disabled until disclosure, consent, retention, jurisdiction,
  and erasure policy are configured and accepted.

## Foundation delivered

1. A strict public session-grant schema with opaque grant material, WebSocket
   gateway URL, protocol version, capability label, expiration, duration,
   locale, greeting, reconnect policy, and disclosure state.
2. Explicit provider-neutral client/server message allow-lists.
3. A deterministic lifecycle that blocks ordinary assistant speech before
   disclosure, records barge-in and reconnects, rejects invalid transitions,
   and emits one terminal minute settlement or release intent.
4. An independently buildable gateway application with liveness, readiness,
   aggregate capacity, emergency pause behavior, and a fail-closed authorization
   boundary for opaque grants.
5. Static import/provider boundaries covering the voice runtime package.

## Non-goals for this foundation

- Provider adapter or restricted routing selection.
- WebSocket audio transport, codecs, speech generation, or transcript storage.
- Tenant deployment UI or public session issuance.
- Recording, telephony, outbound calling, or Gen2 behavior.
- Commercial minute values or pilot latency thresholds not yet approved.

## Next slice

Add forced-RLS voice deployments and sessions, restricted public grant issuance,
gateway-only grant consumption/reconnect authorization, atomic concurrency and
minute reservation, exactly-once terminal settlement, and integration tests for
Basic/Advanced and cross-tenant rejection.

## Rollback

The foundation adds no database schema or production route. Remove the gateway
deployment and roll back the voice runtime/gateway packages. Existing products
and schema through `0028` are unaffected.
