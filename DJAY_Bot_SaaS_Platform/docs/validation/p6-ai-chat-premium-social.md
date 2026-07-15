# P6 Validation: AI Chatbot Premium Social

- Result: First LINE security slice passed
- Date: 2026-07-15
- Database migration: `0020_ai_chat_social_line`
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

## Executed gates

```bash
scripts/use-node24.sh pnpm run typecheck
scripts/test-db-integration.sh
scripts/use-node24.sh pnpm run verify
```

All passed. PostgreSQL 16 applied migrations `0000` through `0020`. The P6
integration journey proved:

- an active Premium snapshot can create a LINE connection;
- credential plaintext and webhook keys are absent from tenant list output;
- credential ciphertext does not contain the submitted secret;
- a wrong tenant cannot revoke the connection;
- the restricted runtime resolves the connection only through its opaque key;
- the first event is accepted and creates one durable outbox item;
- exact replay returns the original receipt without another outbox item;
- an older event is recorded as `out_of_order` without downstream work;
- revocation immediately disables opaque runtime resolution;
- an active Basic snapshot cannot create a LINE connection.

Unit coverage also proves changed raw bodies fail LINE signature verification.
The full production API build contains:

- `/tenant/ai-chat/social-connections`
- `/tenant/ai-chat/social-connections/[connectionId]`
- `/public/ai-chat/social/line/[webhookKey]`

## Remaining before LINE engineering completion

- Credential health check and rotation.
- Durable inbound worker claim/retry/dead-letter operations.
- Social session/contact/conversation creation and Sales Core processing.
- Channel-native LINE outbound rendering, delivery, and status visibility.
- Subject identity review candidates without automatic merge.
- Channel quantity/fee events with approved rate treatment.
- Tenant connection and operational visibility UI.
- Browser/API QA for the connection workflow and webhook route.
- Restricted staging credentials and LINE platform acceptance.

WhatsApp and Messenger remain later controlled channel slices. No social channel
may be activated in production from this checkpoint.
