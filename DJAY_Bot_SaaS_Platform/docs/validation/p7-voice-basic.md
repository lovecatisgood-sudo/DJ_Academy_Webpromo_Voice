# P7 Validation: Voice Agent Basic

- Result: Protocol/lifecycle foundation passed; P7 release gate remains open
- Date: 2026-07-15
- Database migrations: `0029_voice_basic_authority`
- Production activation: Disabled

## Executed foundation gates

```bash
scripts/use-node24.sh pnpm --filter @djay/voice-runtime test
scripts/use-node24.sh pnpm --filter @djay/voice-gateway test
scripts/use-node24.sh pnpm --filter @djay/voice-runtime typecheck
scripts/use-node24.sh pnpm --filter @djay/voice-gateway typecheck
scripts/use-node24.sh pnpm run lint:boundaries
scripts/test-db-integration.sh
scripts/use-node24.sh pnpm run verify
```

All passed across 29 packages/apps. Coverage proves that:

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
- tenant deployment creation requires active Basic Gen1 authority and an exact
  origin; an invalid path origin fails before storage;
- only a one-time deployment key is returned, while subsequent lists expose its
  safe prefix and never its plaintext;
- forced RLS prevents another tenant from reading or revoking the deployment;
- disable immediately blocks public grant issuance, enable restores it only
  with current authority, and revoke is audited and irreversible;
- operator and analyst roles can read Voice state but cannot deploy; owner and
  tenant admin hold the explicit deployment permission.

The API production build contains 93 route handlers, including the disabled-by-default
`/public/voice/session` route and the service-authorized voice `authorize`,
`disconnect`, and `finish` routes. The voice gateway also builds as an
independent Node application.

## Remaining P7 gates

- Browser voice widget and production media transport.
- Expired unused-grant/reconnect reaping, crash recovery, emergency stop, and
  concurrent race tests beyond the serialized integration journey.
- Spend reservation once approved rates exist; no monetary value is invented by
  this slice.
- Realtime audio, interruption, silence, noise, reconnect, transcript, summary,
  Sales Core, Action Gateway, callback, and handover integration.
- English and Thai quality/latency evaluation with approved pilot thresholds.
- Browser widget UI, browser bundle confidentiality scan, runtime monitoring/runbook,
  migration, retention/erasure, and named merchant acceptance.

This evidence does not authorize a voice pilot or production activation.
