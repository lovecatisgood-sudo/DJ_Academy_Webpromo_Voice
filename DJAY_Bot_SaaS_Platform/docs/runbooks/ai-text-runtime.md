# AI Text Runtime Runbook

## Required services and secrets

- API uses `AI_DATABASE_URL`, `AI_TEXT_GATEWAY_ENDPOINT`,
  `AI_TEXT_GATEWAY_SERVICE_TOKEN`, and `AI_NOTIFICATION_ENVELOPE_KEY`.
- The SaaS owner selects the provider with `AI_TEXT_PROVIDER=openai|xai|gemini`
  and supplies `AI_TEXT_API_KEY` plus `AI_TEXT_MODEL` as server-only settings.
  Existing provider-specific names remain compatibility aliases:
  `OPENAI_API_KEY` + `OPENAI_RESPONSES_MODEL`, `XAI_API_KEY` (or
  `GROK_API_KEY`) + `XAI_TEXT_MODEL`, and `GEMINI_API_KEY` +
  `GEMINI_TEXT_MODEL`.
  Merchants cannot select or inspect provider or model identity.
- Workers use `WORKER_DATABASE_URL`, `AI_WORKER_ENABLED=true`,
  `AI_NOTIFICATION_ENVELOPE_KEY`, and the approved email delivery configuration.
- The runtime database role is restricted to fixed functions. Do not substitute
  a tenant, migration, owner, or administrative database URL.
- Store gateway tokens and the base64-encoded 32-byte notification key in the
  deployment secret manager. They are not tenant settings.

## Health and safe observation

Monitor request ID, tenant ID, deployment ID, session/turn IDs, public plan,
channel, state, latency bucket, queue age, attempt count, customer message-credit
quantity, and safe gateway error code. Do not log prompts, customer text,
knowledge chunks, contact data, recipients, credentials, session keys, raw
structured output, provider names, or model identifiers.

Alert on elevated start/turn failures, origin denials, idempotency conflicts,
structured-output rejection, unsupported citations, queue age, dead letters,
takeover suppression failures, usage reconciliation variance, and every
provider-leak detector event.

## Incident response

1. Disable the affected deployment or rollout flag without rewriting published
   playbooks or existing sessions.
2. Preserve request/turn correlation IDs and safe operational telemetry in the
   restricted incident system.
3. Revoke the deployment key or internal gateway token if credential exposure is
   suspected.
4. Keep customer effects idempotent. Never replay an effect by editing a
   completed turn, usage event, appointment, or outbox item.
5. Reconcile reservations and settlements before adjusting quota balances.
6. For cross-tenant, prompt/PII leak, or routing-identity suspicion, stop new AI
   traffic and invoke the security incident process.

## Rollback and recovery

Application rollback must remain compatible with migrations `0017`-`0019`.
Published playbooks and started-session pins are immutable. Roll back behavior by
publishing a new version or disabling a deployment, not by rewriting history.

Notification claims have stale-lock recovery and bounded retries. Requeue only
through an audited operation after confirming the tenant, entitlement, active
profile, and recipient configuration remain valid.
