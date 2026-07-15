# P6 Validation: AI Chatbot Premium Social

- Result: LINE local runtime and delivery engineering passed
- Date: 2026-07-15
- Database migrations: `0020_ai_chat_social_line` through `0024_ai_chat_social_delivery`
- P6 phase status: Active; not complete
- Production activation: Disabled

## Delivered slice

- Premium-only LINE connection creation and revocation.
- Envelope-encrypted LINE access token and channel secret.
- One-time opaque webhook key stored only as a SHA-256 digest.
- Safe tenant list DTO with channel, account reference, status, and health only.
- Raw-body `X-Line-Signature` verification before JSON parsing or mutation.
- LINE text, postback, and opt-out normalization.
- Connection/event replay and per-subject timestamp ordering.
- One durable inbound outbox item only for a newly accepted event.
- Forced RLS and fixed-path public runtime functions with no table grants.
- Role-gated tenant UI for connection creation, health, credential rotation, and
  revocation, with one-time webhook URL display.
- Live provider health checks with safe error codes and explicit
  `reauthorization_required` state.
- Credential version increments and audit logs for rotation and health checks.
- Envelope-encrypted external subject IDs and reply tokens in immutable receipts.
- Worker-only inbound claim leases with `SKIP LOCKED`, current Premium authority,
  exponential retry, terminal dead letters, and safe audited error codes.
- Per-subject worker serialization plus idempotent contact, LINE conversation,
  pinned playbook session, inbound message, quota reservation, and AI turn setup.
- Shared Sales Core generation and one atomic commit for structured actions,
  transcript output, native usage, quota settlement, and the outbound reply.
- Worker-only outbound delivery claims with bounded retry, terminal dead letter,
  commit-time Premium authority checks, and encrypted recipient/reply material.
- Immutable per-attempt channel quantity events. Blocked requests record zero
  attempted units, and no monetary rate or billable amount is invented.
- Provider receipt IDs remain in the mutable delivery ledger while immutable
  conversation messages remain unchanged.
- Delayed provider failure updates delivery visibility without automatic resend.
- Subject opt-out closes automation and the AI session even if commercial
  authority changes before the control event is processed.
- Tenant delivery totals plus production-browser owner and viewer operation QA.

## Executed gates

```bash
scripts/use-node24.sh pnpm run typecheck
scripts/test-db-integration.sh
scripts/use-node24.sh pnpm run verify
scripts/use-node24.sh pnpm run qa:p6-line
```

All passed. PostgreSQL 16 applied migrations `0000` through `0024`. The P6
integration journey proved:

- an active Premium snapshot can create a LINE connection;
- credential plaintext and webhook keys are absent from tenant list output;
- credential ciphertext does not contain the submitted secret;
- a wrong tenant cannot revoke the connection;
- a wrong tenant cannot read runtime credentials;
- a failed authorization health result suspends runtime resolution;
- credential rotation increments its version, restores active state, and never
  exposes either the old or new secret in the tenant DTO;
- a successful health result is visible to the tenant without secret material;
- the restricted runtime resolves the connection only through its opaque key;
- the first event is accepted and creates one durable outbox item;
- exact replay returns the original receipt without another outbox item;
- an older event is recorded as `out_of_order` without downstream work;
- revocation immediately disables opaque runtime resolution;
- an active Basic snapshot cannot create a LINE connection.
- the restricted worker decrypts subject/reply/credential material only for an
  authorized claim, retries the same durable item, and can terminate it as a
  safe dead letter.
- retrying a claimed inbound event reuses its contact, conversation, session,
  turn, and reservation instead of duplicating domain state or quota.
- an approved structured response creates one lead, fact, appointment request,
  two options, AI message, settled quota event, native-usage row, and outbound
  delivery in the same transaction;
- one transient outbound failure and retry create two exact quantity events and
  one final provider receipt without mutating the immutable transcript message;
- a delayed channel failure becomes visible as a terminal failed delivery;
- a terminal generation failure releases its quota reservation and records safe
  turn and outbox error codes;
- an opt-out marks the subject opted out, closes the conversation, completes the
  session, and acknowledges the control job.

Unit coverage also proves changed raw bodies fail LINE signature verification.
The full production API build contains:

- `/tenant/ai-chat/social-connections`
- `/tenant/ai-chat/social-connections/[connectionId]`
- `/tenant/ai-chat/social-connections/[connectionId]/health`
- `/public/ai-chat/social/line/[webhookKey]`

Production Chromium also passed the built LINE tenant surface at desktop and
mobile sizes. It exercised health, rotation, connection, one-time webhook, and
revocation operations; verified viewer read-only behavior; and found no secret,
provider-identity, console, or horizontal-overflow leak.

## Remaining before LINE production acceptance

- Subject identity review candidates without automatic merge.
- Approved monetary rate treatment if channel fees become billable.
- Restricted staging credentials and LINE platform acceptance.
- Queue-age, delivery-failure, and usage alert verification.
- Kill/revoke and rollback rehearsal with a named merchant.

WhatsApp and Messenger remain later controlled channel slices. No social channel
may be activated in production from this checkpoint.
