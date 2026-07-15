# ADR 010: AI Premium Social Channel Policy

- Status: Accepted for controlled P6 engineering
- Date: 2026-07-15
- Replaces: none
- Resolves: ADR-201 through ADR-204 implementation dependencies conservatively;
  commercial rates and external platform approvals remain release gates

## Decision

AI Chatbot Premium supports LINE, WhatsApp, and Messenger through separate
adapters and one normalized social event contract. Connections are merchant
owned, credentials are envelope-encrypted, webhook paths use opaque lookup keys,
and every POST is verified against the raw request body before parsing or data
mutation.

Initial activation is inbound and reply first. Unsolicited marketing, arbitrary
recipient entry, merchant-authored templates, media ingestion, and bulk sends are
disabled. WhatsApp and Messenger replies require an open customer-service window;
outside-window delivery requires a platform-approved template that is not part of
the initial P6 activation. LINE replies use the inbound reply token where
available and otherwise use a recipient already verified by that connection.

Each external event is stored by connection and external event ID. Duplicate
events return the original receipt without another response. Events older than a
subject's accepted offset are recorded as out of order and do not trigger AI.
Inbound processing and outbound delivery are durable worker jobs with bounded
retry, backoff, dead-letter visibility, and idempotent delivery keys.

Social subjects are connection-scoped verified identities. They may reuse their
existing contact on that exact connection. Cross-channel email/phone similarity
creates a review candidate only; it never merges contacts automatically. Merge
and undo are separate audited operations deferred until the review workflow is
explicitly accepted.

Every outbound attempt records a channel-fee classification and quantity, but no
THB price is invented while the rate card is TBD. Tenant surfaces disclose that
external channel charges follow the approved rate card and show usage quantities,
not internal cost or margin.

## Channel rules

- LINE: validate `X-Line-Signature` as base64 HMAC-SHA256 of the untouched body
  with the channel secret; deduplicate `webhookEventId`; use event timestamp for
  ordering; support text and postback input; render concise text/quick replies.
- WhatsApp: verify the subscription challenge token and validate
  `X-Hub-Signature-256` as hexadecimal HMAC-SHA256 of the untouched body with the
  app secret; normalize text/interactive input and message status events; enforce
  the reply window and approved-template boundary.
- Messenger: use the same challenge/signature boundary with its app secret;
  normalize text/postback input and delivery/read/failure events; enforce the
  reply window and supported quick-reply limits.

API versions and host bases are restricted deployment configuration, not tenant
input. Least-privilege app scopes, business verification, template approval,
privacy/legal review, and final fee treatment must pass before production GA.

## Consequences

AI Basic cannot create, rotate, health-check, bind, or execute any social
connection. Premium channel failures are isolated and visible independently.
Tenant DTOs expose channel, connection state, policy state, and safe error codes;
they never expose credential material, raw signatures, internal AI routing, or
native cost.
