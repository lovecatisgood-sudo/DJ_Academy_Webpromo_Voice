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

## Delivered LINE, WhatsApp, and Messenger slices

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
12. Shared Sales Core generation plus atomic structured actions, transcript,
    usage settlement, and one durable outbound reply.
13. Channel-native LINE reply/push delivery with bounded retry, dead-letter,
    provider receipt IDs, and exact attempted-quantity events.
14. Delivery-status and opt-out control handling, including opt-out after
    entitlement loss and delayed provider-failure visibility.
15. Tenant delivery metrics and production-browser owner/viewer operations QA.
16. Tenant-visible email/phone identity review suggestions with no automatic
    contact merge or merge action.
17. Premium-only WhatsApp connection, health, credential rotation, and
    revocation through the shared tenant authority and audit boundary.
18. Meta verification challenge and raw-body `X-Hub-Signature-256` verification
    on an opaque WhatsApp callback route.
19. WhatsApp text, button, interactive reply, and delivery-status normalization
    through the shared ordered, deduplicated inbound runtime.
20. Customer-service-window enforcement at delivery claim time. Requests after
    24 hours fail closed with no decrypted authority and zero attempted units.
21. Channel-native WhatsApp text/button delivery with durable successful-part
    progress. A later-part failure preserves receipt IDs and resumes only the
    unsent suffix.
22. Tenant WhatsApp setup, one-time callback display, delivery metrics, health,
    credential rotation, revocation, and owner/viewer browser QA.
23. Premium-only Messenger Page connection, health, credential rotation, and
    revocation through the shared tenant authority and audit boundary.
24. Meta verification challenge and raw-body `X-Hub-Signature-256` verification
    on an opaque Messenger callback route.
25. Messenger text, postback, delivery, and read normalization through the
    shared ordered, deduplicated inbound runtime.
26. Channel-native Messenger quick replies and Page-token delivery through the
    24-hour service window and resumable multipart ledger.
27. Tenant Messenger setup, one-time callback display, delivery metrics, health,
    credential rotation, revocation, and owner/viewer browser QA.

## Non-goals for this slice

- Media ingestion, arbitrary recipient entry, marketing, or bulk sending.
- Template management, identity merge, omnichannel analytics, or channel rate
  pricing. Identity candidates may only support explicit review, never automatic
  merge.

## Schema and API impact

- Migrations `0020` through `0027` add social connections, immutable inbound
  receipts, subject/session initialization, atomic response commit, outbound
  delivery, immutable channel quantity events, suggest-only identity review,
  service-window enforcement, and resumable multipart progress.
- Tenant routes manage LINE, WhatsApp, and Messenger connections under
  `ai_chat.channels.manage`.
- The public LINE, WhatsApp, and Messenger webhook routes are opaque-key
  addressed and use only the restricted AI runtime database role.

## Rollback

- Disable or revoke every social connection.
- Remove the public LINE, WhatsApp, and Messenger webhook routes from the deployed
  application.
- Application rollback must remain compatible with migrations `0020`-`0027`;
  tables and receipts are retained for audit and replay safety.

## Gate for the next slice

- Full workspace verification passes.
- PostgreSQL 16 applies migrations `0000` through `0027`.
- AI Basic cannot create or resolve a LINE, WhatsApp, or Messenger connection.
- Wrong-tenant IDs disclose nothing and mutate nothing.
- Invalid signatures create no receipt.
- Exact event replay returns the original receipt and creates no new work.
- Older subject events are retained as out of order and are not processable.
- Retried turns and deliveries do not duplicate contacts, actions, usage, or
  provider receipt state.
- WhatsApp delivery closes after 24 hours without decrypting recipient or
  credentials, and a partial multipart failure resumes at the first unsent part.
- Messenger uses the same closed-window and resumable multipart authority.
- Opt-out closes automation and delayed delivery failure is visible to tenants.
