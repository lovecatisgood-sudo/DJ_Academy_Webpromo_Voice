# M2 Spec — Conversation Vertical Slice

## Goal

Prove the complete production-risk conversation lifecycle with a seeded immutable flow before building the full editor.

## Included

- widget session create/resume with hashed token;
- conversation pinned to published version;
- options/text/form/action message endpoint;
- input idempotency and stored response;
- deterministic engine integration;
- unmatched fallback;
- notification outbox row and test provider worker;
- admin conversation list/thread;
- takeover/admin reply/release;
- short-lived stream token;
- DB-backed SSE replay and POST sync fallback;
- atomic lead creation through `/message`.

## Excluded

Full design polish, flow authoring, customer timeline, analytics dashboard, scheduler and external channels.

## Acceptance journey

- [ ] New session receives root and stores a flow-version pin.
- [ ] Option advances correctly.
- [ ] Unmatched Thai text transitions to awaiting_admin.
- [ ] Fallback response and contact channels render.
- [ ] One deduped notification outbox item exists.
- [ ] Admin takes over and replies.
- [ ] Widget receives reply live.
- [ ] Forced disconnect before reply then reconnect replays it from DB once.
- [ ] Admin releases; widget receives root from pinned version.
- [ ] Lead form submits through `/message` and creates one lead atomically.
- [ ] Replaying the same inputId returns the original response and no duplicate rows.
- [ ] Publish v2 during the session; original session still uses v1, new session uses v2.
- [ ] Raw session token is absent from URL/log/database.

## Required failure tests

- DB failure mid-transaction leaves no partial lead/message/event/outbox rows.
- Email provider failure leaves retryable outbox and correct inbox state.
- SSE hub/process reset still permits DB replay.
- Expired stream token fails without revealing conversation data.
- Option/restart during admin_active returns conflict.
