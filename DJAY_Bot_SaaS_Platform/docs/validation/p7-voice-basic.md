# P7 Validation: Voice Agent Basic

- Result: Protocol/lifecycle foundation passed; P7 release gate remains open
- Date: 2026-07-15
- Database migrations: none in this foundation; current schema remains `0028`
- Production activation: Disabled

## Executed foundation gates

```bash
scripts/use-node24.sh pnpm --filter @djay/voice-runtime test
scripts/use-node24.sh pnpm --filter @djay/voice-gateway test
scripts/use-node24.sh pnpm --filter @djay/voice-runtime typecheck
scripts/use-node24.sh pnpm --filter @djay/voice-gateway typecheck
scripts/use-node24.sh pnpm run lint:boundaries
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

## Remaining P7 gates

- Forced-RLS deployment/session schema and tenant authorization tests.
- Opaque grant issuance, one-time consumption, replay-safe reconnect, origin and
  deployment binding, expiration, and emergency stop.
- Atomic minute/concurrency/spend reservation and exactly-once settlement under
  retry, disconnect, timeout, and crash recovery.
- Realtime audio, interruption, silence, noise, reconnect, transcript, summary,
  Sales Core, Action Gateway, callback, and handover integration.
- English and Thai quality/latency evaluation with approved pilot thresholds.
- Tenant UI, browser bundle confidentiality scan, runtime monitoring/runbook,
  migration, retention/erasure, and named merchant acceptance.

This evidence does not authorize a voice pilot or production activation.
