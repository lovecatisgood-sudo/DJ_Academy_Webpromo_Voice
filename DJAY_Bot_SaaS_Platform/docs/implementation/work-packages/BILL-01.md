# BILL-01 - Stripe Subscription And Financial Authority

Status: in progress. Local checkout, lifecycle, immutable evidence, Portal authority,
tenant document presentation, independent Stripe financial reconciliation, subscription
lifecycle controls, reviewed webhook recovery and customer billing notifications are implemented
through `0063_customer_billing_notifications`. Live sale remains disabled.

## Implemented

- Authenticated server-created Stripe Checkout Sessions; no Payment Link is trusted as subscription authority.
- Checkout intent is bound to tenant, pending subscription, the same user's immutable accepted contract snapshot, catalogue version, verified test/live price mapping, exact THB amount and idempotency key.
- Stripe receives only the internal checkout intent ID, contract SHA-256 and public plan key as correlation metadata. Browser-supplied tenant, price, customer and subscription references are not authoritative.
- Checkout and Customer Portal return URLs are restricted to `TENANT_APP_URL`; returned URLs are encrypted at rest and returned once to the authorized caller.
- Checkout, contract acceptance and Customer Portal routes require trusted origin, tenant billing permission and recent sensitive-session assurance.
- Raw Stripe webhook signatures, timestamp tolerance and live/test mode are verified before encrypted durable inbox acceptance.
- Worker-only ordered webhook claim, retry and dead-letter authority uses `FOR UPDATE SKIP LOCKED` and exact external/event correlation.
- `checkout.session.completed` links Stripe customer/subscription references only after session, contract hash, mode and payment-state validation.
- Subscription transitions are monotonic by provider occurrence time, constrained by the local state machine and produce immutable entitlement snapshots.
- `invoice.paid` activates access and appends invoice/payment evidence; payment failure and subscription events use the same lifecycle authority.
- Invoice, credit-note, payment, refund and lifecycle records are append-only with forced RLS and no tenant table-write grant.
- Customer Portal customer reference is resolved server-side from the tenant's Stripe link; the browser cannot choose a Stripe customer.
- Tenant billing presents sanitized invoice and credit-note facts through a tenant-scoped security-definer contract; encrypted provider URLs and raw payloads remain private.
- A restricted worker retrieves Stripe invoices independently, encrypts the raw provider snapshot, records its digest and performs exact normalized reference, currency, state and amount comparison.
- Stripe reconciliation differences appear in Platform Finance and require a different Platform Owner/Finance reviewer before remediation approval.
- Payments, refunds and credit notes have their own restricted retrieval queue, encrypted immutable provider snapshots and exact reference/state/currency/amount reconciliation.
- Payment retrieval supports authoritative invoice, PaymentIntent and Charge references; refund and credit-note retrieval use their dedicated Stripe endpoints.
- Non-invoice finance differences use the same different-reviewer remediation rule and are visible in a separate Platform Finance queue.
- Stripe subscription periods, renewal and cancellation facts are synchronized from signed subscription webhooks rather than inferred locally.
- Owners and billing managers can schedule cancellation at the current Stripe term end or revoke it; both operations require recent MFA assurance and durable idempotent evidence.
- Entitlements remain active until Stripe confirms actual cancellation, when the normal webhook state machine appends the terminal entitlement snapshot.
- Versioned dunning policies require a different reviewer and there is deliberately no seeded active policy.
- The restricted lifecycle worker applies only `past_due -> grace_period -> restricted` under an active approved policy and appends entitlement, lifecycle and audit evidence.
- Platform Master exposes dunning policy history, proposal and independent activation controls; Finance receives read-only visibility.
- Ignored Stripe lifecycle events caused by missing authority, unsupported provider state or an invalid transition enter a durable restricted recovery queue.
- The recovery worker retrieves the exact Stripe event, stores an encrypted immutable provider snapshot and verifies its external ID, type and occurrence time before permitting review.
- Platform Owner/Finance recovery decisions require a different reviewer; an approved retry only returns the original webhook to the ordered inbox and never edits subscription state directly.
- Subscription, payment, cancellation, refund and credit-note events create immutable tenant-visible billing notices with per-user read receipts.
- Owners and billing managers can configure an encrypted recipient, Thai or English fixed templates and the exact event categories delivered by email.
- The restricted notification worker rechecks the current tenant preference at claim time, applies bounded retries/dead-letter handling and appends immutable delivery-attempt evidence.
- GCP/AWS secret contracts include Stripe keys, webhook secret and separate webhook/checkout envelope keys.
- Focused PostgreSQL 16 integration proves contract-bound checkout, replay, paid activation, Stripe period synchronization, reversible term-end cancellation, actual cancellation, approved dunning/grace/restriction, immutable invoice/payment/credit evidence, Portal creation, independent provider mismatch detection and two-person remediation review.

## Remaining Before Local Completion

- Upgrade proration, add-on cadence, dispute handling and resubscription lifecycle after policy approval.
- Tax line-item detail and legally approved Thai invoice/credit-note fields once the accountant/legal decisions are supplied.

## External Release Gates

- Stripe test and live products/prices/coupon verified against the six locked catalogue plans.
- Stripe Customer Portal, webhook endpoint/events, automatic tax and invoice settings configured in both modes.
- Thai VAT, tax invoice, credit-note, withholding, refund, promotion and renewal terms approved.
- Test-mode acceptance evidence, live-mode smoke evidence and finance reconciliation evidence recorded.
- Plans remain `sellable=false` until every applicable gate passes.
