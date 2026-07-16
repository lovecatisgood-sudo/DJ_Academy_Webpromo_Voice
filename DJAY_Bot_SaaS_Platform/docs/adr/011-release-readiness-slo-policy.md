# ADR 011: Release-readiness SLO and public-status policy

- Status: Accepted for P9 engineering and controlled release review
- Date: 2026-07-16
- Replaces: none
- Commercial effect: none; this decision does not authorize public charging

## Decision

Every staging or production release is fail-closed until one durable decision
combines current service-level observations, time-limited operational
attestations, unresolved major/critical incidents, and usage-ledger
reconciliation. Application uptime alone is not release evidence.

The initial technical objectives cover exactly seven provider-neutral service
groups. Website/signup and Workspace/API require 99.90% availability; Flow and
AI require 99.50%; Messaging, Voice, and background processing require 99.00%.
Each observation covers at least 24 hours, meets its service-specific minimum
sample count, is no older than 30 minutes, passes the recorded P95 latency
target, stays within any queue-age target, and has zero dead letters. These are
engineering release baselines, not contractual customer SLAs.

The five required attestations are on-call coverage, restore evidence, support
runbook review, security review, and privacy review. Each is append-only,
evidence-hashed, explicitly passed or failed, and valid for no more than 90
days. A newer failed or expired attestation blocks release.

Service objectives, observations, and attestations are immutable. A correction
is a new observation or attestation with new evidence. Objective changes require
a reviewed migration and ADR update; an operator UI cannot silently lower a
target. Replayed evidence hashes are idempotent and retain one authoritative
record.

Authenticated monitoring posts evidence through a server-to-server endpoint
using an independently managed bearer secret. The Platform Master gate is
available only to platform roles with health authority. Owner and Finance may
see bounded usage-reconciliation counts; Support and AI Operations receive only
the healthy/attention result. The public status API and page expose customer
labels, operational/degraded/outage/unknown state, and evidence timestamps only.
They never expose service keys, evidence references or hashes, vendors, models,
routes, credentials, costs, tenant identifiers, or incident detail.

## Consequences

- Missing, stale, short-window, low-sample, slow, unavailable, queued, or
  dead-letter evidence blocks the internal release gate.
- Any unresolved major/critical Voice incident or usage reconciliation variance
  blocks the gate.
- Public status reports `unknown` when current evidence cannot support a health
  claim. A failing service reports an outage; a near-threshold failure reports
  degraded when the stored policy permits that classification.
- `OPERATIONS_ENVIRONMENT` and `OPERATIONS_RELEASE_VERSION` are deployment
  configuration. `OPERATIONS_INGEST_TOKEN` is mandatory in production and must
  never enter browser bundles, logs, evidence references, or source control.
- The local release gate supports, but does not replace, managed monitoring,
  production on-call staffing, provider incident coordination, PITR, regional
  recovery, legal approval, or commercial approval.

## Rollback

Deploy the previous application and stop monitoring ingestion if the new reader
must be rolled back. Retain migration 0038 and all immutable evidence; do not
drop, rewrite, or backfill it destructively. A later application may resume from
the latest valid observations and attestations. Public status must return
unknown or be taken out of navigation while its evidence reader is unavailable;
it must not be replaced with a hard-coded operational claim.
