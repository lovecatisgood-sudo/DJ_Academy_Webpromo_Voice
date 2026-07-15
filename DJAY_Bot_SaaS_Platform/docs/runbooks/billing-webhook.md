# Billing Webhook Inbox

Configure a dedicated restricted database credential plus independent signature
and envelope keys:

```text
BILLING_DATABASE_URL
BILLING_WEBHOOK_SECRET
BILLING_WEBHOOK_ENVELOPE_KEY
```

The pilot endpoint is `POST /public/billing/webhooks/pilot`. Requests require:

```text
x-djay-timestamp: Unix seconds
x-djay-signature: HMAC-SHA256(timestamp + "." + raw body)
```

The timestamp tolerance is five minutes. The API verifies the signature before
parsing, limits the body to 256 KiB, stores a SHA-256 body hash, encrypts the raw
body, and inserts one row per provider key/external event ID. Exact replay is
accepted idempotently. Reusing an event ID with a different body is rejected and
must alert operations.

The inbox is not subscription authority by itself. A worker must map an external
customer/subscription reference to exactly one tenant, validate allowed
out-of-order transitions, apply the transition transactionally, write audit and
outbox events, and mark the inbox row applied. Do not expose provider keys,
external references, payloads, or signature failures to tenant responses.
