# External dependency outage runbook

This runbook supplies the provider-neutral `dependency_outage` attestation for
the fail-closed release gate. A local pass proves application behavior only. A
production pass requires controlled failure or an approved fault-injection
facility for every enabled external delivery/runtime dependency.

## Current dependency boundary

The current application path depends on PostgreSQL plus configured AI text,
realtime Voice, email, and social-channel endpoints. Payment collection is
disabled and has no accepted provider. Rate limits, queues, leases, and encrypted
privacy exports are PostgreSQL-backed; this release does not use Redis/a runtime
cache or object storage. Therefore cache-loss and object-store-outage are marked
`not_applicable_not_deployed`, not `passed`.

Do not introduce a cache or object store as a deployment optimization without a
new tenant-scoped key/prefix design, encryption and retention review, bounded
readiness, loss/outage behavior, integration test, monitoring objective, and
rollback plan. Once deployed, it becomes mandatory dependency-outage evidence.

## Acceptance matrix

- AI text connection refusal/503 becomes only `temporarily_unavailable`; a
  stalled call ends at the configured timeout, the reserved turn is failed and
  released, no assistant message/native usage is committed, and upstream body,
  endpoint, provider/model, credentials, or tenant data are absent from output.
- Realtime Voice setup refusal/stall becomes a safe gateway error and releases
  admission. An outage after admission becomes retryable `media_unavailable`,
  settles the session `unavailable` exactly once, closes restricted media, and
  frees process/durable capacity. Second-Generation never falls back to
  First-Generation.
- Email delivery rejection follows bounded retry using the immutable outbox UUID
  and cannot create a second provider effect. Exhaustion reaches a visible dead
  letter and blocks release.
- LINE, WhatsApp, and Messenger transient failures preserve durable receipt and
  multipart progress, use bounded retry, and never invent success. Ambiguous or
  terminal effects remain dead letters; operators do not use generic replay.
- Public/tenant errors and retained evidence are provider-neutral and contain no
  message body, recipient, transcript/audio, token, credential, routing identity,
  customer identifier, native cost, or margin.

## Local execution

```bash
scripts/use-node24.sh pnpm run qa:p9-dependency-outage
scripts/use-node24.sh pnpm run qa:p9-resilience
scripts/use-node24.sh pnpm test:db
```

The focused command checks text 503 and timeout normalization, AI turn failure,
Voice setup timeout/pre- and post-admission outage mapping, email retry/dead
letter behavior, and social adapter failure contracts. The database/resilience
suites prove durable release, idempotency, retry, and terminal queue state.

## Target-environment exercise

1. Inventory enabled dependency endpoints and accountable owners. Record only
   provider-neutral capability labels in the artifact.
2. Announce the window; ensure a Platform Owner, AI Operations, Support, and the
   dependency escalation contact are present. Use synthetic non-customer data.
3. For each enabled capability, inject refusal, timeout, and post-acceptance loss
   where applicable. Capture request/effect counts, bounded failure latency,
   reservation/capacity before and after, queue age/dead letters, recovery time,
   and safe public error codes.
4. Abort on duplicate effects, stuck quota/capacity, silent fallback, fabricated
   success, unbounded wait, customer impact, cross-tenant data, or restricted
   identity/content leakage. Open an incident and submit failed evidence.
5. Restore the dependency, confirm new work and stale-lease recovery, and verify
   no automatic resend of terminal/ambiguous social or webhook effects.
6. Hash the immutable restricted artifact and submit `dependency_outage` through
   the authenticated operations endpoint with a validity of at most 90 days.
   Platform Master must show 9/9 only after all other evidence is current.

## Rollback

Migration `0041_dependency_outage_attestation.sql` only expands the accepted
evidence kind. Retain it and all immutable evidence during application rollback.
If the application cannot preserve the behavior above, pause the affected
capability or admission route and publish a provider-neutral degraded/outage
state; never remove the attestation requirement or backdate an older pass.
