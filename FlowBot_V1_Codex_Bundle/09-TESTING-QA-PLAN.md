# 09 — FlowBot V1.1 Testing & QA Plan

## 1. Test strategy

```text
Unit: engine, matcher, validator, transitions, normalization, effects
Integration: API + real Postgres branch, auth, tenancy, transactions, jobs
E2E: real dashboard/widget journeys on staging
Non-functional: performance, accessibility, security, reconnect and recovery
```

Suggested gates:

- `packages/core`: at least 90% line coverage and 100% transition-map coverage.
- Schema/API/security invariants are test-name-visible and cannot be waived by overall coverage.

## 2. Unit tests

### Engine traversal

- root and option target;
- message auto-advance;
- link back to root;
- cycle hop limit;
- invalid/missing target typed failure;
- all node types;
- form validation and `create_lead` effect;
- fallback and `request_handoff` effect;
- release/root behavior for pinned version.

### Matcher

Required examples:

| Input | Expected |
|---|---|
| `ราคา` | exact Thai keyword |
| `อยากทราบราคาจัดฟันค่ะ` | input contains a valid Thai keyword |
| `PRICE?` | normalized exact English keyword |
| `a` | no substring match against `appointment` |
| `pr` | no English substring match below minimum |
| `นัด` | valid Thai substring/exact according to keyword |
| `ราคา จองคิว` | deterministic tie or up to three suggestions |
| unmatched installment question | fallback and raw-text event subject to privacy handling |

Test longest keyword, priority, stable order, keyword language, disabled substring and optional content matching. Assert `keyword contains input` is never used.

### Publish validator

- exactly one root;
- max six options;
- all targets in same version;
- no dangling target;
- valid form config;
- CTA-less leaf warning;
- graph cycles accepted but runtime-safe;
- snapshot zod validation.

### State machine

Exhaustive matrix for bot, awaiting_admin, admin_active and closed. Verify:

- return-to-bot only from awaiting;
- restart only from bot;
- option/form blocked during handoff;
- admin reply only during admin_active;
- illegal transitions return conflict.

## 3. Database and integration tests

Use an ephemeral Neon branch or local Postgres compatible with production.

### Tenancy and relationship safety

- two seeded tenants;
- every admin route rejects foreign IDs with 404;
- attempt cross-tenant customer, node and conversation links;
- attempt option target across flow versions;
- target deletion with incoming reference is blocked;
- published version deletion while referenced is blocked.

### Version pinning

1. create session on v1;
2. move conversation to a non-root node;
3. publish v2 with different IDs/content;
4. continue original session and assert v1 content/state;
5. create new session and assert v2;
6. rollback pointer and verify only subsequent new sessions change.

### Idempotency and atomic form submission

- same `inputId` twice returns identical response;
- exactly one visitor message, lead, event set, outbox item and processed-input row;
- inject failure after lead creation but before commit; assert zero partial rows;
- concurrent duplicate requests produce one committed outcome.
- duplicate or concurrent admin reply `idempotencyKey` creates exactly one staff message.

### Session security

- database contains only token hash;
- raw token not found in captured logs/errors;
- expired/closed token behavior;
- invalid token does not reveal conversation existence;
- valid token resumes from the persisted decimal-string cursor;
- reload with a stale cursor catches up without duplicate rendering;
- stream token purpose/expiry/bot binding.

### SSE and sync

- admin sends while connected;
- force disconnect before delivery;
- reconnect with Last-Event-ID and receive missed DB message once;
- connect with empty ID and receive backlog in sequence;
- sequence and sync cursors serialize as decimal strings, not unsafe JSON numbers;
- a message committed between backlog query and live handoff is delivered exactly once through the temporary buffer;
- staff takes over a normal `bot` conversation while the visitor is idle; 30-second/focus sync discovers state and catches up the reply, then opens SSE;
- live-hub restart does not lose committed message;
- polling sync returns the same ordered messages;
- duplicate SSE delivery is client-deduplicated by sequence/id.

### Outbox

- handoff transaction creates deduped outbox row;
- same conversation within 30-minute window does not create second email item;
- provider failure retries with backoff;
- inbox remains correct if email never sends;
- worker claim is safe under concurrent workers.

### Customer identity and privacy

- two customers may share phone/email;
- matching returns multiple suggestions;
- no automatic link;
- exact LINE identity uniqueness;
- erasure removes/redacts PII across all documented tables and generated export;
- audit log contains no erased values.

### Booking V1.5

- overlapping pending/accepted ranges are rejected;
- expired/declined ranges free capacity;
- slot end must exceed start.

## 4. E2E journeys

1. Login and bot status.
2. Widget new session and option path.
3. Unmatched Thai question → fallback → awaiting badge → email outbox visible in test adapter.
4. Takeover → reply → widget receives within target → forced reconnect replays message → release returns pinned root.
5. Lead form through `/message` → CRM lead → customer suggestions → explicit link.
6. Retry lead input and prove no duplicate.
7. Draft edit → reference link → simulator → publish → new session sees new version while existing session stays old.
8. Delete node with incoming reference shows blocker and reference list.
9. Customer with shared phone → multiple suggestions → explicit selection.
10. Customer export then erasure.
11. Responsive inbox: mobile list → thread → profile and back navigation.
12. Widget API-down/contact fallback and SSE-to-polling fallback.
13. Language toggle TH/EN.
14. Owner invite and final-owner protection.
15. V1.5 booking lifecycle when implemented.

## 5. Non-functional tests

- k6 expected-load message test: p95 under 300 ms, excluding external notification provider.
- SSE soak: at least 100 streams for 30 minutes on staging or hosting-equivalent; stable memory and heartbeat.
- Browser matrix: Chrome, Safari/iOS, Firefox, Chrome Android.
- Widget on hostile CSS page.
- axe: no serious/critical issues.
- keyboard-only inbox and widget.
- Thai font and long-label visual checks.
- reduced-motion.
- Hostinger/proxy test for SSE buffering and timeouts.

## 6. CI stages

```text
format-check
lint
typecheck
unit
schema/migration verification
integration on isolated DB
build
secret scan
dependency audit/triage
staging deploy
Playwright E2E
```

## 7. Definition of done

- acceptance criteria and tests green;
- docs/API/schema updated;
- no blocking TODO;
- no raw token/PII in logs;
- migration reviewed;
- failure and rollback path demonstrated;
- contract invariants preserved.

## 8. Release blockers

Do not release with a failure in:

- tenant isolation;
- flow-version pinning;
- idempotency;
- atomic form/lead creation;
- SSE replay/sync;
- session-token secrecy;
- outbox retry;
- customer non-auto-merge;
- privacy erasure;
- app and flow rollback.
