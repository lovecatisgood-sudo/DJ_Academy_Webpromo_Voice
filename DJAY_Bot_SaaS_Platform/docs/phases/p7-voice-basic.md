# P7: Voice Agent Basic

## Status

In progress. The provider-neutral browser/gateway protocol, deterministic
session lifecycle, restricted database authority, realtime media engine, and
Sales Core turn/action path are implemented locally. Tenant deployment
operations, a deployable browser widget, and the WebSocket-owned gateway/session
lifecycle are also implemented and pass local production-build acceptance.
Legacy migration, live English/Thai quality and latency evaluation, production
activation, and named-merchant acceptance remain pending.

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
13. A 25 KB minified browser widget (about 8 KB gzip) with strict lightweight
    public DTO decoding, bilingual consent/error copy, call states, mute/end,
    active-call confirmation, bounded reconnect, transcript display, raw PCM
    playback, and cross-browser compressed microphone input.
14. A real WebSocket upgrade boundary that owns authorization, process capacity,
    protocol sequencing, media admission, maximum-duration termination,
    disconnect/reconnect, and exactly-once finish calls. The obsolete HTTP
    authorization placeholder can no longer reserve an orphaned call.
15. ESM and classic-script widget bundles with a mandatory confidentiality scan,
    plus an exact-origin tenant install snippet.
16. Migration `0031_voice_sales_core` with immutable per-session agent/playbook
    pins, forced-RLS turn state, durable turn idempotency, transcript persistence,
    restricted native usage, and function-only Voice service authority.
17. Voice deployments now own a Voice Sales Core agent and default bilingual
    playbook, so a Voice-only tenant does not depend on AI Chat subscription
    authority to create a deployment.
18. A restricted Gen1 realtime adapter accepts only PCM16 16 kHz microphone
    frames, owns the automated-agent opening, and permits ordinary assistant
    audio only after a validated Sales Core turn has returned.
19. The Voice turn API reuses the shared grounded AI runtime and commits only
    allow-listed, currently entitled lead, sales-fact, appointment, follow-up,
    handover, and merchant-email actions atomically with the assistant message.
20. AudioWorklet-first browser capture with a ScriptProcessor fallback, raw PCM
    playback, durable failure handling, action-status reporting, and safe
    provider-neutral terminal behavior.
21. Gateway-owned silence policy warns after 45 seconds of customer inactivity
    and settles once at the 60-second idle timeout, with reviewed environment
    overrides that fail configuration when warning is not lower than timeout.

## Non-goals for this foundation

- Recording, telephony, outbound calling, or Gen2 behavior.
- Commercial minute values or pilot latency thresholds not yet approved.

## Next slice

Complete live English/Thai quality, latency, silence/noise, interruption, and
reconnect evaluation with restricted staging credentials. Add the reviewed
legacy migration and retention/erasure treatment, then obtain named-merchant
acceptance before enabling the paused runtime in production.

## Rollback

Keep `VOICE_RUNTIME_ENABLED=false`, remove the gateway deployment, and roll back
the voice API/runtime code. Application rollback must remain compatible with
migration `0029`; session, usage, and lease evidence is retained for audit and
reconciliation.
