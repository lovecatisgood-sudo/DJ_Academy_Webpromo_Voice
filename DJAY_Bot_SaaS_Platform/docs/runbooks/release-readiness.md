# Release readiness and public status runbook

This runbook operates the technical release gate defined by ADR 011. It does not
approve prices, invoices, taxes, payment collection, or general availability.

## Deployment configuration

Configure these values in the deployment secret/configuration system:

- `OPERATIONS_ENVIRONMENT`: exactly `staging` or `production`.
- `OPERATIONS_RELEASE_VERSION`: the immutable build or release identifier.
- `OPERATIONS_INGEST_TOKEN`: a random secret of at least 32 characters. It is
  required when `NODE_ENV=production` and belongs only in monitoring and API
  deployments.

Use different ingestion tokens per environment. Rotate by updating the API and
monitoring secret stores together, then send one synthetic observation and
confirm a `201 recorded` response. A repeated evidence hash must return
`200 replayed`. Never put the token, raw monitoring payload, tenant/customer
data, vendor/model identity, or credentials in a source reference.

## Record a service observation

Monitoring posts a completed window to `POST /internal/operations/status` with
`Authorization: Bearer <secret>`. The body is bounded and strict:

```json
{
  "kind": "observation",
  "environment": "staging",
  "serviceKey": "tenant_api",
  "windowStart": "2026-07-15T09:00:00.000Z",
  "windowEnd": "2026-07-16T09:00:00.000Z",
  "sampleCount": 12000,
  "successfulCount": 11996,
  "latencyP95Ms": 740,
  "queueAgeSeconds": null,
  "deadLetterCount": 0,
  "evidenceSha256": "<64 lowercase hexadecimal characters>",
  "sourceReference": "monitor:release-20260716"
}
```

Compute the SHA-256 from the retained evidence artifact, not from a mutable URL.
Use one of the seven schema-controlled service keys. Availability is calculated
by PostgreSQL from sample and success counts; clients cannot submit it directly.
Do not send a partial window as a 24-hour result.

## Record an operational attestation

Post the same endpoint with `kind: attestation`, one of `on_call`, `restore`,
`support_runbook`, `security_review`, `privacy_review`, or one of the executable
technical drill kinds, an explicit
`passed`/`failed` status, a validity interval of no more than 90 days, an
evidence hash, and a safe opaque source reference. Record failure evidence as a
new failed attestation; never edit an earlier pass.

Restore attestations require a successful separate-cluster or managed recovery
exercise. On-call attestations require a named current primary/secondary rota
in the restricted evidence system. Security, privacy, and support evidence must
be approved by the accountable reviewer, not self-asserted by deployment code.
Event replay, queue recovery, and pool exhaustion require the executable checks
in `resilience-drills.md`. Dependency outage requires the enabled-dependency
matrix in `dependency-outage.md`; synthetic UI fixtures do not qualify.

## Review the gate

1. Build and pass the self-contained six-service artifact gate in
   `release-artifacts.md`; record the immutable deployment artifact hashes.
2. Open Platform Master and locate **Public release readiness**.
3. Confirm environment and release version match the intended deployment.
4. Require 7/7 service objectives and 9/9 current attestations.
5. Require zero blocking incidents and a healthy usage ledger.
6. Investigate every red service card. Do not promote while evidence is missing
   or the API cannot load the gate.
7. Platform Owner approves deployment only through the reviewed release
   workflow. Finance evidence does not confer payment or invoice authority.

`GET /public/status` and `/status` are intentionally provider-neutral. Unknown
is the correct public state when evidence is absent or unreadable. Do not replace
unknown with a manual operational claim.

## Incident and recovery procedure

- Support owns customer communication and verifies the on-call/runbook evidence.
- AI Operations owns runtime investigation and uses restricted routing tools;
  internal route identity must not appear on the public page.
- A major/critical Voice incident remains blocking until its durable incident
  record is resolved. Monitoring status alone cannot override it.
- For a bad evidence payload, generate a corrected artifact and append a new
  observation/attestation. Database updates and deletes are deliberately denied.
- For ingestion authentication failures, verify secret versions without logging
  values. Rotate if exposure is suspected and audit the evidence timeline.
- For database recovery, run `pnpm run qa:p9-restore` locally and follow
  `backup-restore.md` for managed infrastructure. Preserve migration 0038 and
  later additive operations migrations, their ACLs, immutable evidence rows,
  and incident/recovery functions.

## Validation

```bash
scripts/use-node24.sh pnpm test:db
scripts/use-node24.sh pnpm run qa:p9-restore
scripts/use-node24.sh pnpm run qa:p9-resilience
scripts/use-node24.sh pnpm run qa:p9-dependency-outage
scripts/use-node24.sh pnpm run package:release
scripts/use-node24.sh pnpm run qa:release-artifacts
scripts/use-node24.sh pnpm run qa:p9-status
scripts/use-node24.sh pnpm run qa:p9-operations
```

Run browser checks against production builds. A release is still blocked until
real environment observations and attestations replace local QA fixtures.
