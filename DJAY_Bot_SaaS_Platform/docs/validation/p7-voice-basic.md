# P7 Validation: Voice Agent Basic

- Result: Browser transport/widget gate passed; P7 release gate remains open
- Date: 2026-07-15
- Database migrations: `0029_voice_basic_authority`, `0030_voice_runtime_recovery`
- Production activation: Disabled

## Executed foundation gates

```bash
scripts/use-node24.sh pnpm --filter @djay/voice-runtime test
scripts/use-node24.sh pnpm --filter @djay/voice-gateway test
scripts/use-node24.sh pnpm --filter @djay/voice-widget build
scripts/use-node24.sh pnpm --filter @djay/voice-widget test
scripts/use-node24.sh pnpm --filter @djay/voice-runtime typecheck
scripts/use-node24.sh pnpm --filter @djay/voice-gateway typecheck
scripts/use-node24.sh pnpm run lint:boundaries
scripts/test-db-integration.sh
scripts/use-node24.sh pnpm run verify
scripts/use-node24.sh pnpm run qa:p7-voice
scripts/use-node24.sh pnpm run qa:p3-ui
P7_TENANT_QA_URL=http://127.0.0.1:3111 scripts/use-node24.sh pnpm run qa:p7-voice
```

All passed across 30 packages/apps. Coverage proves that:

- the Gen1 public grant uses the First-Generation label and contains no routing,
  credential, vendor, model, or cost fields;
- generation-label mismatch and recording without disclosure fail validation;
- client and server events reject fields and error codes outside the public
  protocol allow-list;
- assistant speech is blocked until automated-agent disclosure completes;
- customer barge-in interrupts assistant speech and is counted;
- reconnect succeeds only inside the configured window;
- one 62-second connected session creates a two-minute settlement intent;
- an unused expired grant creates a zero-minute release intent;
- terminal lifecycle state rejects a second settlement transition;
- gateway liveness/readiness/capacity are aggregate and provider-neutral;
- paused/full capacity, invalid grants, unsupported protocol, and unavailable
  authorization all fail closed with safe errors.
- the restricted voice role stores only deployment/grant digests and receives
  no direct table privileges;
- even the migration/admin connection cannot invoke the voice service functions,
  and an Advanced-only Gen2 snapshot cannot enter the P7 grant path;
- wrong origins and deployment keys cannot issue a grant;
- authorization reserves two maximum minutes for a configured 90-second call
  and one tenant concurrency lease in the same transaction;
- replaying the same connection creates no second reservation or lease;
- another session is rejected while the one-call tenant limit is occupied;
- disconnect is idempotent, the disconnected connection cannot be replayed, and
  a new connection can resume inside the configured window without reserving
  again;
- a 62-second terminal commit settles two minutes, releases concurrency, closes
  the conversation, and a duplicate terminal call returns the stored result;
- after release, the waiting session can connect and a one-second call settles
  one minute under the same rounding rule.
- settlement derives cumulative connected time from durable connection history,
  excludes reconnect downtime, and retains gateway-reported time only for
  reconciliation;
- two concurrent worker reapers settle each expired or stale session once,
  release its reservation and lease, and close its conversation;
- the runtime starts paused, direct control-table access is denied, and only an
  active Platform Owner or AI Operations role can read/change the audited
  control through its restricted functions;
- gateway heartbeats preserve active sessions while paused and terminate them
  safely when emergency stop becomes authoritative;
- tenant deployment creation requires active Basic Gen1 authority and an exact
  origin; an invalid path origin fails before storage;
- only a one-time deployment key is returned, while subsequent lists expose its
  safe prefix and never its plaintext;
- forced RLS prevents another tenant from reading or revoking the deployment;
- disable immediately blocks public grant issuance, enable restores it only
  with current authority, and revoke is audited and irreversible;
- operator and analyst roles can read Voice state but cannot deploy; owner and
  tenant admin hold the explicit deployment permission.
- WebSocket upgrade rejects missing origins and unsupported protocol versions,
  while process admission never exceeds configured capacity;
- authorization failure returns only a retryable provider-neutral error, media
  admission failure settles `unavailable`, and abnormal close records a bounded
  reconnect instead of falsely settling the session;
- a normal widget/gateway journey sequences connect, disclosure, assistant
  speech, customer interruption, media chunks, end, and terminal settlement;
- the public widget produces strict ESM and classic-script bundles of about
  25 KB minified / 8 KB gzip, and bundle scans find no routing or credential
  identifiers;
- Chromium desktop and mobile journeys pass microphone consent/denial, active
  call confirmation, mute/end, microphone cleanup, overflow, accessible button
  names, bilingual-safe rendering, and confidentiality checks.
- Chromium tenant-workspace journeys reject path-bearing origins before an API
  call, expose the correct one-time install snippet, require confirmation before
  irreversible revocation, and remain responsive on desktop and mobile.

The API production build includes the disabled-by-default
`/public/voice/session` route and the service-authorized voice `authorize`,
`heartbeat`, `disconnect`, and `finish` routes plus restricted Platform runtime
controls. The voice gateway also builds as an
independent Node application.

## Remaining P7 gates

- Restricted realtime media adapter and production speech transport.
- Spend reservation once approved rates exist; no monetary value is invented by
  this slice.
- Realtime audio, interruption, silence, noise, reconnect, transcript, summary,
  Sales Core, Action Gateway, callback, and handover integration.
- English and Thai quality/latency evaluation with approved pilot thresholds.
- Migration, retention/erasure, and named merchant acceptance.

This evidence does not authorize a voice pilot or production activation.

## Crash recovery and operational control

Migration `0030_voice_runtime_recovery` keeps Voice admission paused by default.
Platform Owner and AI Operations users can resume, pause, or emergency-stop the
runtime through a recently reauthenticated, audited platform control. Pause
rejects new grants and connections while allowing active sessions to finish;
emergency stop also causes active and reconnecting sessions to settle and close.

The gateway sends five-second authority heartbeats. The worker-side reaper owns
eventual cleanup of expired grants, reconnect deadlines, stale gateway
connections, duration limits, and emergency-stop sessions. Settlement is derived
from the complete database connection history, excluding reconnect downtime; the
gateway-reported duration is retained only for reconciliation. Voice activation
requires `VOICE_REAPER_ENABLED=true`, a 30-second or stricter reviewed stale
threshold, and confirmed platform runtime mode after the media adapter passes its
acceptance gate.
