# COM-03: Usage, Packs, Forecasts and Caps

- Local implementation status: Complete
- Paid acceptance status: Blocked by the overage/pack/cap commercial decision
- Migrations: `0047_usage_funding_forecasts_alerts` through
  `0052_provider_usage_reconciliation`

## Delivered So Far

- Versioned immutable definitions for the exact Flow conversation, AI reply and
  connected Voice minute customer meters.
- Existing atomic reservations, settlement/release, immutable usage events,
  idempotency and Platform reconciliation retained.
- Deterministic pace forecast with confidence, projected quantity, allowance
  exhaustion, projected overage and estimated THB overage.
- Fail-closed shared database funding authority: included allowance,
  earliest-expiring eligible pack lots, then explicit overage consent, bounded
  by the safety cap. Tenant commerce reservation, settlement and release use
  this authority and preserve non-revealing cross-tenant responses.
- Append-only pack allocation/release evidence so abandoned or partially used
  reservations return unused pack capacity without rewriting history.
- Separate immutable provider-usage records; provider units and cost do not
  become customer billable units.
- Deduplicated 50/75/90/100 percent and projected-exhaustion alert generation,
  immutable forecast evidence and tenant outbox events.
- Tenant usage UI forecast fields and recent-MFA safety-cap management.
- Safety caps can extend through unexpired prepaid capacity without overage
  consent; only unfunded postpaid capacity requires explicit consent.
- Worker-only, idempotent Bangkok-anniversary allowance rollover with expired
  reservation release, immutable funding return evidence, refreshed snapshot
  allowance, customer cap-policy continuity and tenant outbox events.
- Restricted Flow, AI web, AI social and Voice runtime reservations now use the
  shared funding order without granting those runtime roles direct pack-ledger
  authority. Integration evidence covers included funding, prepaid-pack
  allocation, Voice partial settlement release and Advanced-plan admission.
- Reservation identity, requested quantity, funding decision and creation time
  are immutable; only valid status transitions and settlement fields may change.
- Tenant-configurable allowance thresholds, projected-exhaustion and anomaly
  alerts with encrypted write-only recipients, deterministic cooldown, durable
  retry/dead-letter behavior and append-only delivery-attempt outcomes.
- Customer-unit-only anomaly detection compares the latest hour with the prior
  24-hour baseline and never exposes provider-native units in tenant evidence.
- Provider usage reconciliation requires an exact immutable customer usage-event
  correlation. Missing, invalid and cross-subscription correlations fail into a
  restricted Platform queue; native and customer quantities are never compared
  as though they were equivalent units.
- Platform Finance/Owner remediation uses append-only cases and events with a
  different reviewer. The workflow cannot mutate usage events, reservations or
  quota balances.

## External Acceptance Still Blocked

- Carrier-specific ingestion is completed under `VOICE-06`; Stripe financial
  reconciliation is completed under `BILL-01`/`BILL-02` rather than treating
  either source as customer usage.
- Overages, pack purchases and consent activation remain disabled until decision
  `MRD-006` is approved.
