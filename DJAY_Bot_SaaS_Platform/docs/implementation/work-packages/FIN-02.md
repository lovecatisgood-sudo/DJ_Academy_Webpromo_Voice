# FIN-02 - FlowAccount Synchronization And Reconciliation

Status: local platform complete through `0059_accounting_daily_reconciliation`; live
dispatch is blocked by `FIN-DEC-001` and `VENDOR-DEC-001`.

## Implemented

- Provider-neutral `AccountingAdapter` contract plus a FlowAccount client-credentials HTTP transport.
- Separate test/live base URLs, reusable expiring access token, 36-character idempotency guard and current HTTP 429 backoff handling.
- Versioned mapping/parsing contract injection; the transport does not invent Thai accounting fields.
- Transactional invoice and credit-note accounting outbox with worker-only claim, retry, rejection, unknown-outcome and dead-letter authority.
- Immutable encrypted request/response attempt evidence and immutable local-to-FlowAccount references.
- Canonical local document projection that never grants the provider authority to edit the local invoice or credit-note ledger.
- Daily remote reconciliation queue with encrypted immutable snapshots and exact missing/reference/currency/amount comparison.
- Restricted Platform Finance attention queue and independent Platform Owner/Finance remediation review.
- PostgreSQL 16 integration covers successful invoice sync, rejected credit sync, remote amount mutation and two-person remediation.
- Transport unit tests cover client-credential token reuse and provider rate limiting.

## External Completion Inputs

- FlowAccount organization sandbox client ID/secret and later production authority.
- Accountant/legal-approved document selection and mapping for VAT status, contacts, tax IDs,
  branches, line items, discounts, tax, withholding, payment state, numbering and credit-note workflow.
- Pinned sandbox fixtures for accepted, duplicate, rejected, missing and remotely mutated documents.
- Approved reconciliation and correction operating procedure.

## Fail-Closed Behavior

- No default production mapping exists.
- No FlowAccount secret or provider payload is stored in source control or exposed to tenant UI.
- All packages remain non-sellable and accounting dispatch remains disabled until the external
  inputs, sandbox acceptance and finance/legal review are recorded.
