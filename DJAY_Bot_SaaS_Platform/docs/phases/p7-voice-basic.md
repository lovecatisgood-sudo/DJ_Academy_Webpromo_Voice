# P7: Voice Agent Basic

## Status

In progress. The provider-neutral browser/gateway protocol, deterministic
session lifecycle, and restricted database authority are implemented locally.
Tenant deployment operations are implemented locally. Media transport, Sales
Core actions, legacy migration, and
production acceptance remain pending.

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
6. Migration `0029_voice_basic_authority` with forced-RLS deployments, sessions,
   transport connections, and concurrency leases. The voice service role has
   function-only authority and no table grants.
7. Gen1-only public grant issuance bound to an opaque deployment digest, exact
   origin, active Basic snapshot, short expiration, and an opaque grant digest.
8. Gateway authorization that atomically checks current entitlement, serializes
   tenant concurrency, reserves the configured maximum rounded minutes, and
   creates one expiring lease before media allocation.
9. Idempotent same-connection authorization, bounded new-connection reconnect,
   and exactly-once terminal minute settlement or release with lease cleanup.
10. A disabled-by-default public grant API and service-token-only gateway
    authorization, disconnect, and finish endpoints.
11. Tenant `voice.read` and `voice.deploy` permissions, a forced-RLS repository,
    and APIs for Basic-only creation, safe listing, disable/enable, and
    irreversible revocation with audit history.
12. A tenant Voice workspace that shows only the First-Generation label,
    exact-origin deployment settings, one-time keys, safe prefixes, and status
    controls without routing identity.

## Non-goals for this foundation

- Provider adapter or restricted routing selection.
- WebSocket audio transport, codecs, speech generation, or transcript storage.
- Recording, telephony, outbound calling, or Gen2 behavior.
- Commercial minute values or pilot latency thresholds not yet approved.

## Next slice

Add the browser voice widget, connect the gateway transport to
disconnect/finish commits, add crash/expiry
reaping, then integrate realtime media, Sales Core actions, transcript policy,
callback, and handover.

## Rollback

Keep `VOICE_RUNTIME_ENABLED=false`, remove the gateway deployment, and roll back
the voice API/runtime code. Application rollback must remain compatible with
migration `0029`; session, usage, and lease evidence is retained for audit and
reconciliation.
