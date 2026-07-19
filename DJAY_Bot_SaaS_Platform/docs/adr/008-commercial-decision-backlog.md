# ADR-008: Commercial Decision Backlog

- Status: Partially superseded by the market-release PRD and catalogue; remaining policies block paid GA
- Date: 2026-07-14
- Phase: P0 decision boundary

## Owner direction recorded 2026-07-17

The business owner selected Stripe as the payment-provider direction. This
resolves the preferred-provider name only; it does not accept this ADR or
authorize checkout. Stripe Thailand account verification, contract/test
credentials, cards-versus-PromptPay collection behavior, and all remaining
values below are still required. See proposed ADR-013 for the wider provider
stack and implementation-state record.

## Context

The exact annual first-term and renewal prices, included allowances, advertised
overage rates, packs, add-ons and professional-service floors are locked by the
market-release PRD and catalogue version `djay-bots-th-2026-01`. Paid launch
still cannot infer tax, refund, dunning, pack consumption, overage consent,
safety-cap or accounting policy.

## Decision already locked

- Settlement currency is THB unless a later accepted ADR adds currencies.
- Public catalog has exactly six plan keys.
- Prices, allowances, overage rates, tax treatment, grace periods, and provider product/price IDs are immutable versioned data, never product-logic constants.
- Payment webhooks are signature-verified, inboxed, idempotent, ordered/reconciled, audited, and applied through subscription state transitions.
- Usage uses reservation plus immutable settlement/credit ledger; invoice lines reference the applicable plan/rate version.
- Entitlement enforcement is not delegated to the payment provider.

## Required business decisions

Before checkout implementation is finalized:

1. payment provider and Thailand merchant-account capability;
2. VAT registration/status, inclusive versus exclusive display, tax invoice fields, numbering, credit-note behavior, and retention;
3. monthly/annual billing availability and proration;
4. free trial length, card requirement, and one-trial-per-business controls;
5. overage consent and enforcement policy for each published meter;
6. hard cap, prepaid credit, or postpaid overage behavior;
7. failed-payment retry, grace, suspension, cancellation, and data retention;
8. upgrade/downgrade timing and entitlement effects;
9. refund/cancellation policy and approval roles;
10. promotion/coupon rules and abuse prevention;
11. invoice delivery and customer billing contacts;
12. reconciliation, dispute, chargeback, and manual adjustment process.

Legal/accounting review is required for Thai tax invoices, VAT, consumer/business terms, privacy, refunds, and cross-border processors. Engineering documentation is not legal or tax advice.

## Implementation constraint

Public prices may be displayed from the immutable catalogue, but no real
charge, paid activation, invoice or overage collection launches until the
remaining decisions in `requirements/market-release-decisions.yaml` are
accepted with provider contracts, test fixtures, reconciliation, migration and
rollback evidence.
