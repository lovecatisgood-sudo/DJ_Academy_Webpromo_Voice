# Voice Runtime Runbook

## Scope and release state

This runbook covers browser Voice Basic and Advanced admission, gateway authority,
heartbeats, quota settlement, crash recovery, and operational stop controls.
The restricted realtime media and Sales Core action path are implemented.
Production activation remains prohibited until the live bilingual quality and
latency gate, retention review, and named merchant acceptance are complete.

## Required services and configuration

- API requires `VOICE_RUNTIME_ENABLED=true`, `VOICE_DATABASE_URL`,
  `VOICE_GATEWAY_URL`, and the independent Voice service token.
- Gateway requires the authorization, heartbeat, disconnect, finish, restricted
  media-context, and Sales Core turn endpoints, the same service token, the
  restricted media credentials, exact approved Advanced route keys, and an
  approved capacity limit.
- Workers require `WORKER_DATABASE_URL`, `VOICE_REAPER_ENABLED=true`, the
  reviewed stale threshold, and the reviewed batch size.
- Keep deployment and session credentials out of logs, tickets, screenshots,
  analytics, and browser persistence. Only opaque digests are durable.
- Keep Platform Master, API, worker, gateway, and database clocks synchronized.
  Clock drift can delay recovery and must block activation.
- Configure `VOICE_SILENCE_WARNING_SECONDS` below
  `VOICE_IDLE_TIMEOUT_SECONDS`. The reviewed defaults warn at 45 seconds and
  settle an idle session at 60 seconds.

## Activation sequence

1. Apply migrations through `0036_voice_advanced_runtime` and confirm the
   runtime is `paused` with reason `activation_required`.
2. Start the worker with the Voice reaper enabled. Confirm repeated idle cycles
   complete without errors before starting the gateway.
   Keep privacy processing enabled so the hourly transcript-retention sweep runs.
3. Start the gateway with admission paused. Readiness remains false unless the
   restricted media credential plus context and Sales Core turn endpoints are configured.
4. Validate the approved media adapter. Run the complete desktop,
   mobile, Thai, English, interruption, silence, reconnect, and cleanup gate.
5. In Platform Master, enter the release record identifier as the operational
   reason and select **Resume admission**. This requires a recent MFA-backed
   platform session and creates an immutable platform audit record.
6. Issue one named staging session. Reconcile connection history, heartbeats,
   concurrency lease, reservation, terminal settlement, conversation closure,
   and the public transcript before expanding admission.

Do not enable `VOICE_RUNTIME_ENABLED` without the worker reaper. Do not resume
admission while the gateway readiness check is false.

## Safe observation and alerts

Platform Master exposes only runtime mode, active and reconnecting counts,
expired grants, stale connections, control version, and safe reason. Alert the
restricted operations channel when:

- stale connections or expired grants remain after two reaper intervals;
- reconnecting sessions remain beyond their configured deadline;
- active sessions exceed reviewed gateway or tenant concurrency;
- reservations, settled minutes, leases, and terminal usage events do not
  reconcile;
- gateway heartbeat authority fails three consecutive times;
- readiness is false on an admitting gateway; or
- any tenant boundary or provider-confidentiality detector fails.

Never log audio, transcript content, session/deployment credentials, customer
identifiers, routing identity, internal cost, or unapproved monetary rates.

## Pause and emergency stop

- **Pause new sessions** blocks new grants and transport connections. Existing
  connected sessions may finish. A transport lost during a pause cannot resume.
- **Emergency stop** blocks new admission and instructs heartbeating gateways to
  end active sessions as unavailable. The reaper independently settles issued,
  active, and reconnecting sessions, so cleanup does not depend on a live
  gateway process.
- Use a non-sensitive incident or change-record identifier as the reason. Do not
  put customer data or credentials in the reason field.

For suspected cross-tenant access, credential exposure, disclosure sequencing
failure, or unapproved routing disclosure, use emergency stop, preserve the
immutable audit/usage evidence, revoke affected deployment keys, and invoke the
security incident process.

## Gateway crash and recovery

1. Leave the worker running. It closes stale connections at their last durable
   heartbeat, excludes reconnect downtime, settles usage exactly once, releases
   concurrency, and closes the conversation.
2. Restart the gateway in paused local capacity and verify authority and media
   readiness before accepting connections.
3. Inspect Platform Master for stale or reconnecting counts. They must return to
   zero within the reviewed stale threshold plus two worker intervals.
4. Reconcile one recovered session's reported duration against its
   database-derived connected duration. The reported value is evidence only and
   never billing authority.
5. Resume admission only after the affected release or incident record is
   approved.

Do not release leases, change reservations, or rewrite session status by direct
SQL. The reaper and terminal authority functions are the only supported recovery
path.

## Rollback

Application rollback must remain compatible with migrations `0029` through `0036`.
Pause admission first, allow active sessions to finish or use emergency stop,
then verify no reservations or leases remain open. Do not drop recovery columns,
functions, controls, or immutable usage/audit evidence during rollback.
