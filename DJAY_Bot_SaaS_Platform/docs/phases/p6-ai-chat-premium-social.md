# P6: AI Chatbot Premium Social

## Status

Active engineering phase. P5 AI Chatbot Basic Web is the accepted foundation.
Production social activation remains disabled.

## Requirements

- Build in controlled order: LINE, WhatsApp, Messenger.
- Require an active `ai_chat_premium` entitlement for every connection,
  health, binding, webhook, runtime, delivery, and usage path.
- Keep credentials envelope-encrypted and return them only to the restricted
  runtime needed to verify or deliver a channel request.
- Verify webhook signatures against the untouched body before JSON parsing or
  mutation.
- Deduplicate by connection and external event ID.
- Record events older than the accepted subject offset as out of order and do
  not enqueue them for AI processing.
- Keep external subjects connection-scoped. Similar email or phone data may
  create a review candidate but must never merge contacts automatically.
- Use durable inbound and outbound jobs with bounded retry and dead-letter
  visibility.
- Record channel fee quantities without inventing a THB rate.
- Keep provider/model identity absent from tenant, public, widget, export, log,
  and user-visible error contracts.

## First LINE slice

This slice delivers:

1. Premium-only LINE connection creation and revocation.
2. One-time opaque webhook key and envelope-encrypted LINE credentials.
3. Tenant-safe connection listing with no credential or webhook disclosure.
4. Raw-body `X-Line-Signature` verification before parsing.
5. LINE text, postback, and opt-out normalization.
6. Connection/event deduplication and per-subject timestamp ordering.
7. Forced-RLS storage and fixed-path runtime functions with no runtime table
   grants.
8. Negative tests for AI Basic, wrong-tenant substitution, invalid signature,
   replay, and out-of-order events.
9. Tenant-admin connection operations for health, encrypted credential rotation,
   reauthorization, audit history, and revocation.
10. Encrypted subject/reply material and worker-only inbound claim, retry, and
    dead-letter operations with claim-time Premium reauthorization.
11. Per-subject serialization and idempotent shared contact, conversation,
    pinned session, inbound message, quota reservation, and AI turn creation.

## Non-goals for this slice

- AI response generation or outbound LINE delivery.
- WhatsApp or Messenger routes.
- Media ingestion, arbitrary recipient entry, marketing, or bulk sending.
- Template management, identity merge, omnichannel analytics, or channel rate
  pricing.

## Schema and API impact

- Migration `0020_ai_chat_social_line` adds social connections, subject offsets,
  and immutable inbound receipts.
- Tenant routes manage LINE connections under `ai_chat.channels.manage`.
- The public LINE webhook route is opaque-key addressed and uses only the
  restricted AI runtime database role.

## Rollback

- Disable or revoke every social connection.
- Remove the public LINE webhook route from the deployed application.
- Application rollback must remain compatible with migration `0020`; tables and
  receipts are retained for audit and replay safety.

## Gate for the next slice

- Full workspace verification passes.
- PostgreSQL 16 applies migrations `0000` through `0020`.
- AI Basic cannot create or resolve a LINE connection.
- Wrong-tenant IDs disclose nothing and mutate nothing.
- Invalid signatures create no receipt.
- Exact event replay returns the original receipt and creates no new work.
- Older subject events are retained as out of order and are not processable.
