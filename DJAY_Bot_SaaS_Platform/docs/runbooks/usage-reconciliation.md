# Tenant usage reconciliation runbook

## Scope

This runbook covers customer-unit visibility before paid billing is enabled.
The authoritative customer units are Flow runs, AI responses, and Voice minutes.
Provider-native units and cost remain restricted and never enter tenant pages,
exports, tickets, screenshots, or general logs.

## Normal checks

1. Confirm the subscription, latest entitlement snapshot, and quota account have
   the same tenant, product, and pinned plan version.
2. Confirm reserved quantity equals the total still-open reservations for the
   current account. Settled quantity must equal immutable settled/credited/waived
   usage under the documented event semantics.
3. Confirm the Usage Center's committed quantity equals settled plus reserved,
   and remaining values never fall below zero.
4. Confirm a null allowance, safety cap, or overage rate is shown as not
   configured—not zero, free, unlimited, or billable.
5. Confirm every cross-tenant context sees only its own subscriptions and quota
   accounts under forced RLS.

## Mismatch response

1. Stop rollout expansion and preserve the subscription, entitlement, quota,
   reservation, usage-event, request, and audit identifiers.
2. Do not repair totals by direct SQL and do not rewrite immutable usage events.
3. Identify an open reservation, duplicate/missing settlement, wrong entitlement
   snapshot, or period mismatch through the scoped repositories and worker
   evidence.
4. Release or settle only through the idempotent supported lifecycle command.
5. Rerun the tenant-scoped overview and the PostgreSQL integration gate. Escalate
   any cross-tenant result or negative quantity as a security incident.

## Pre-release commercial rule

All current plan versions are non-sellable and carry null commercial values.
Do not infer prices, allowance promises, overage, tax, invoice, refund, trial,
grace, or cancellation behavior. Keep paid activation disabled until ADR-008 is
accepted and the full P9 validation record passes.

## Rollback

The Usage Center is read-only. Application rollback removes the view without
changing subscriptions or metering. Preserve quota accounts, reservations,
usage events, entitlement snapshots, and audit evidence for forward repair and
future invoice reconciliation.
