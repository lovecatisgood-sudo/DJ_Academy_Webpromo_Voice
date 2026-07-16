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
- A dead-letter is never changed with direct SQL. Use the reviewed recovery
  workflow only for an eligible email item after correcting its root cause.
- Approval requires a different Platform Owner and creates one due retry through
  the normal worker. The release gate remains blocked until delivery succeeds
  and fresh zero-dead-letter evidence is accepted.
- FlowBot webhooks and social inbound/delivery remain non-replayable; escalate
  them for queue-specific remediation rather than selecting a similar email row.

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

The focused two-person recovery contract can be exercised separately:

```bash
scripts/use-node24.sh pnpm run qa:p9-recovery
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
6. Confirm Platform Master shows 9/9 current attestations only after every other
   operational review also passes.

## Reviewed dead-letter recovery

1. Confirm the source failure is understood and corrected. If the item is not
   listed in Platform Master, it is not approved for manual replay.
2. Support, AI Operations, or Owner selects the opaque eligible email item and
   records a 12–500 character root-cause/replay reason. Do not paste customer
   data, recipients, payloads, credentials, SQL, or provider/model details.
3. A different Platform Owner signs in again if authentication is older than ten
   minutes, reviews the reason and safe error, then approves one retry or rejects.
4. Confirm the request is `applied` and the normal worker consumes the item.
   Approval alone is not success and does not clear the release blocker.
5. Confirm the provider effect is singular under the immutable outbox UUID,
   source status becomes `sent`, backlog returns to normal, and fresh SLO/drill
   evidence reports zero dead letters. Otherwise open an incident and stop.

## Rollback and incident handling

- The email idempotency contract is backward compatible because the durable
  outbox UUID already exists. If the delivery adapter must roll back, pause the
  worker first; do not resume a version that generates a new key per retry.
- The readiness endpoint is additive. Remove it from the load-balancer check
  before rolling back the application, but keep liveness distinct from
  readiness.
- Migrations 0039 and 0040 are additive. Retain their request, review, audit, and
  attestation evidence during rollback; pause recovery actions before reverting
  the application.
- If a drill creates a duplicate effect or cannot recover, record failed
  attestations, block release, preserve the evidence, and open an incident.
