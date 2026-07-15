# ADR-007: Canonical Lead Stages and Appointment Semantics

- Status: Accepted
- Date: 2026-07-14
- Phase: P0

## Context

FlowBot and voice/text use different lead values. The current root app can immediately confirm appointments, while target product copy distinguishes interest/appointment request from confirmed booking. Silent normalization would corrupt reporting and product entitlement.

## Decision

Canonical lead stages are:

```text
new
pending_follow_up
appointment_made
not_closed_follow
closed_deal
disqualified
```

These stages describe the commercial follow-up state. Appointment lifecycle is a separate aggregate with:

```text
requested
pending_confirmation
confirmed
completed
cancelled
rejected
no_show
```

Creating an appointment request may advance a lead to `appointment_made` only through an idempotent domain policy that records the source action. It does not imply a confirmed calendar booking.

Confirmed booking is retained as an entitled calendar capability, not enabled implicitly for every plan. It requires:

- an active tenant booking destination/configuration;
- server-side entitlement;
- valid availability and overlap checks;
- timezone and DST normalization;
- customer disclosure of request versus confirmation;
- idempotency, audit, notifications, cancellation/reschedule policy;
- optional manual confirmation when destination requires it.

Product plans without confirmed-booking entitlement may create an appointment request/lead action only. Public copy and API results must use the actual lifecycle state.

Legacy mapping is defined in the migration plan. Source status remains provenance but not an active enum.

## Consequences

- CRM reporting and appointment operations no longer overload one status field.
- Existing immediate-confirmation behavior can be preserved for entitled migrated tenants after validation.
- Entitlement catalog must define appointment request and confirmed booking capabilities separately before product launch.

## Validation

- every legacy status maps exactly once;
- duplicate action cannot create duplicate appointment or stage history;
- unavailable/overlapping slots never confirm;
- request-only entitlement cannot confirm via direct API call;
- tenant/user destination ownership is enforced by RLS and authorization;
- UI, notifications, exports, and analytics distinguish requested from confirmed.

