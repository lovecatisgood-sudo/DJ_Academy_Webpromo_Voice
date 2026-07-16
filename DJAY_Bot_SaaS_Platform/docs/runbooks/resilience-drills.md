# Replay, queue recovery, and pool exhaustion runbook

This runbook supplies three technical attestations for the fail-closed release
gate. Run it in every target environment and retain a restricted, immutable
artifact whose SHA-256 is submitted through the operations ingestion endpoint.
The local command proves the application mechanisms only; it is not production
evidence.

## Acceptance criteria

### Event replay

- A durable outbox item keeps the same provider idempotency key across every
  attempt. For email, the key is the immutable outbox UUID—not a new random UUID.
- An ambiguous first delivery may be retried, but the provider-side effect count
  remains one.
- Once the outbox is sent, another worker pass claims nothing and creates no
  second effect.

### Queue recovery

- A retryable failed item becomes due only after bounded exponential backoff.
- A processing lock older than five minutes can be reclaimed with
  `FOR UPDATE SKIP LOCKED`; the item finishes exactly once.
- Payload contents and decrypted recipients never appear in logs or drill
  evidence.
- A dead-letter is not changed with direct SQL. Manual dead-letter recovery
  remains fail-closed until the reviewed two-person replay workflow is deployed;
  any dead letter keeps the SLO/release gate blocked.

### Pool exhaustion

- Saturating every configured connection makes `/api/health/ready` return 503
  within the readiness deadline; `/api/health/live` remains process liveness.
- Concurrent readiness calls share one outstanding database probe so health
  checks do not create an unbounded query backlog.
- Releasing capacity lets the pending probe and a new database query complete.
- Responses expose only `ready` or `unavailable`, never SQL, host, role, pool,
  tenant, provider, or credential details.

## Local execution

```bash
scripts/use-node24.sh pnpm run qa:p9-resilience
```

The command creates a fresh PostgreSQL 16 cluster, applies every migration,
runs an ambiguous email-delivery retry, reclaims a stale worker lock, saturates a
two-connection pool, verifies the bounded readiness failure and recovery, then
records staging drill attestations in the isolated database.

The full database suite repeats the same drill:

```bash
scripts/use-node24.sh pnpm test:db
```

## Production execution

1. Announce the maintenance window and identify the primary/secondary operator.
2. Use non-customer synthetic data in the target environment.
3. Capture build version, environment, start/end timestamps, sample IDs, result
   counts, duplicate-effect count, readiness timeout, recovery latency, and safe
   error codes. Exclude message bodies, emails, tokens, connection strings, SQL,
   provider/model identity, and customer identifiers.
4. Abort if an unexpected customer effect, cross-tenant read, unbounded wait,
   leaked error, or unrecovered connection appears.
5. Hash the immutable artifact and submit separate `event_replay`,
   `queue_recovery`, and `pool_exhaustion` attestations. A failed run must be
   submitted as failed; do not leave an older passing result as the latest claim.
6. Confirm Platform Master shows 8/8 current attestations only after every other
   operational review also passes.

## Rollback and incident handling

- The email idempotency contract is backward compatible because the durable
  outbox UUID already exists. If the delivery adapter must roll back, pause the
  worker first; do not resume a version that generates a new key per retry.
- The readiness endpoint is additive. Remove it from the load-balancer check
  before rolling back the application, but keep liveness distinct from
  readiness.
- Migration 0039 only expands accepted attestation kinds. Retain it and all
  immutable evidence during rollback.
- If a drill creates a duplicate effect or cannot recover, record failed
  attestations, block release, preserve the evidence, and open an incident.
