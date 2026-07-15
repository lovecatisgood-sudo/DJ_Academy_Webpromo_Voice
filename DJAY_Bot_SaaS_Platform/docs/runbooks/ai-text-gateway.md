# AI Text Gateway Runbook

## Boundary contract

The application calls one internal, authenticated HTTP routing endpoint. The
request contains a provider-neutral policy, transcript, approved knowledge
chunks, and strict output schema. The response contains validated structured
output plus native input/output/cache quantities for restricted reconciliation.

Tenant UI, public widgets, API responses, exports, logs, analytics dimensions,
and support artifacts must not expose routing vendor names, model identifiers,
vendor errors, or credentials.

## Activation

1. Approve the routing profile through the restricted platform process.
2. Configure endpoint and service token in the API secret manager.
3. Run health and timeout checks without customer content.
4. Run the English/Thai factuality, sales, safety, adversarial, malformed-output,
   and provider-leak suites against the exact production profile.
5. Record evaluation digest, routing-profile revision, rollback target, owner,
   and expiry in the restricted release record.
6. Enable only the named canary cohort and observe failures, latency, usage, and
   effect reconciliation before expansion.

## Failures and rotation

Gateway timeouts, invalid JSON, schema failures, invalid citations, and leaked
routing identities fail closed with stable application error codes. Do not pass
upstream bodies or headers to the customer.

Rotate the service token using an overlap window in the deployment secret
manager. If the gateway is unhealthy, disable new AI turns while preserving Web
session sync and human takeover. Existing committed messages and effects remain
authoritative.
