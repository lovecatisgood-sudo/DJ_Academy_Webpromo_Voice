# 05 — FlowBot V1.1 System Architecture

**Scope:** production single-tenant V1, contract-compatible with future SaaS  
**Runtime:** Node.js 24 LTS  
**Web:** pinned/tested Next.js 16.x App Router  
**Database:** Neon Postgres, Drizzle  
**Repository:** pnpm + Turborepo

## 1. System context

```text
Visitor site
  └─ stable widget loader
       └─ versioned Preact/TS Shadow-DOM bundle
            ├─ POST widget API
            ├─ short-lived-token SSE when staff is involved
            └─ POST sync fallback

Admin browser
  └─ Next.js dashboard
       ├─ authenticated admin routes
       ├─ flow editor / simulator
       ├─ inbox / CRM / analytics
       └─ dashboard SSE

Single Node deployment in V1
  ├─ Next.js standalone server
  ├─ in-memory snapshot cache
  ├─ in-memory live SSE fan-out only
  ├─ cron/worker loop for outbox and retention
  ├─ Neon pooled connection for app traffic
  ├─ Neon direct connection for migrations
  ├─ object storage for images
  └─ email provider called by outbox worker
```

No Redis, queue service, WebSocket server, AI SDK, external-channel gateway or billing service in V1.

## 2. Monorepo layout

```text
flowbot/
├─ apps/
│  ├─ dashboard/
│  │  ├─ app/(admin)/
│  │  ├─ app/api/w/[botKey]/
│  │  ├─ app/api/admin/
│  │  └─ lib/
│  └─ widget/
├─ packages/
│  ├─ core/             # pure deterministic engine
│  ├─ db/               # Drizzle schema, migrations, tenantDb
│  ├─ shared/           # enums, zod, errors, i18n defaults
│  ├─ notifications/    # outbox payload types/provider adapter
│  └─ config/           # lint, TypeScript, formatting
├─ docs/
└─ tests/
```

Dependency rules:

- `apps/*` may import packages.
- `core` imports only `shared` and has no IO.
- `db` may import `shared` but not app code.
- widget imports only browser-safe shared schemas/types.
- provider adapters do not leak into core.

## 3. Published flow version model

### 3.1 Draft

One mutable draft per bot. Nodes, owned hierarchy, options, references and keywords live in relational authoring tables.

### 3.2 Publish

Publish performs:

1. validate root, node content, option limits, same-version targets, form config and graph safety;
2. generate an immutable new published `flow_versions` row;
3. deep-copy relational authoring rows into that version;
4. serialize and zod-validate one `FlowSnapshot`;
5. update `bots.published_version_id` in the same transaction;
6. invalidate cache for the new pointer;
7. retain the previous published version for active sessions and rollback.

Published rows and snapshots are never mutated.

### 3.3 Conversation pin

Session creation reads the bot pointer and writes `conversations.flow_version_id`. Runtime always loads by that version ID, not by current bot pointer. Existing sessions therefore survive publish and rollback.

Deletion rule: a published version is `RESTRICT`-protected while referenced by a conversation. Cleanup may delete old unreferenced versions, preserving at least five newest.

## 4. Pure engine

```ts
type EngineState = {
  flowVersionId: string;
  currentNodeId: string | null;
  status: 'bot'|'awaiting_admin'|'admin_active';
  lang: 'th'|'en';
};

advance(snapshot, state, input): EngineResult
```

For FlowBot this function is synchronous internally but conforms to the shared async interface.

Result contains:

- outbound messages;
- state updates;
- analytics events;
- domain effects such as `create_lead` or `request_handoff`.

The engine never writes a database, sends email, reads HTTP headers, creates sessions or calls a provider.

Message-node chaining is iterative with hop limit 25. Reaching the limit returns a typed configuration error and a safe fallback; it must not loop or crash.

## 5. Matcher

Normalization: NFC, trim, lowercase Latin, punctuation cleanup and whitespace collapse.

Ranking:

1. exact keyword;
2. input contains keyword, subject to language minimum length;
3. optional node-content match;
4. longest keyword;
5. configured priority;
6. stable order;
7. true ties become at most three suggestions.

`keyword contains input` is prohibited. Raw input is retained only where allowed by retention/privacy rules.

## 6. Request transaction and idempotency

Every visitor mutation includes `inputId`.

`POST /api/w/:key/message`:

1. validate origin, body and language;
2. rate-limit IP and session capability;
3. hash the supplied session token and resolve the conversation identity without exposing the raw token;
4. start the tenant-scoped database transaction;
5. lock the conversation row with `SELECT ... FOR UPDATE`;
6. check `processed_inputs` for `(conversation,inputId)` **after the lock**;
7. if found, commit/return the exact stored response;
8. load the pinned immutable snapshot from cache/DB and apply state rules;
9. call the pure core engine when permitted;
10. in the same transaction:
    - insert the visitor message;
    - apply effects, including lead creation;
    - insert bot/system messages;
    - update conversation;
    - insert events;
    - insert notification outbox item where needed;
    - store the exact response JSON in `processed_inputs`;
11. commit;
12. publish minimal committed notifications to the in-memory hub;
13. return the stored response.

Lock-before-check is mandatory. Checking idempotency outside the conversation lock allows two concurrent requests with the same `inputId` to race. The database unique indexes are the final guard, not the primary concurrency design.

The provider email call never occurs in this request path.

Admin reply submission follows the same reliability principle: require a client-generated UUID `idempotencyKey`, lock the conversation, allow replies only in `admin_active`, and use the message unique index so retries cannot duplicate staff messages.

## 7. Session capability

- Generate at least 256 random bits.
- Return raw token once and store it in widget localStorage together with the last acknowledged decimal-string message sequence.
- Store SHA-256 hash only.
- Expire after 24 hours or when conversation closes.
- Never include raw token in URL, log, analytics, error or database.
- Compare hash using constant-time-safe primitives where applicable.

A session request with an expired/closed token creates a new conversation pinned to the current published version.

## 8. Realtime delivery

### 8.1 Stream token

The widget exchanges its session token through an authenticated POST for a signed short-lived stream token. The stream token contains conversation ID, bot ID, expiry and purpose; it contains no PII or raw session token.

### 8.2 Durable replay

Messages have a monotonic `sequence`.

On SSE connect/reconnect:

1. validate stream token;
2. read `Last-Event-ID` as the last seen durable sequence;
3. attach a temporary buffered listener to the live hub **before** querying history;
4. query database messages for the conversation after the cursor and capture the database high-water sequence;
5. emit the database backlog in order;
6. emit buffered live messages above the high-water mark, deduplicated by sequence;
7. switch the listener from buffer mode to direct live delivery;
8. emit current conversation state;
9. heartbeat every 25 seconds.

This buffered handoff closes the race where a message commits after the backlog query but before live attachment. The hub is only an optimization for new committed messages. It is not the source of truth and does not need to store history.

### 8.3 Sync and poll fallback

While a visible widget is in `bot` state, it performs a lightweight authenticated POST sync every 30 seconds and immediately on tab focus/visibility. This lets a staff-initiated takeover from a normal bot conversation be discovered even though SSE is not yet open. Once sync returns `awaiting_admin` or `admin_active`, the widget requests a stream token and opens SSE.

After repeated SSE failures, the same sync endpoint is used as polling fallback with `afterSequence`. It returns durable messages and current state. Raw session tokens never enter query strings. Pause the periodic timer while the document is hidden; the visibility event performs catch-up when it becomes active again.

## 9. Handoff state behavior

- In `bot`, valid inputs can run the engine.
- In `awaiting_admin`, text is stored and staff notified; option/form inputs return conflict/disabled. `return_to_bot` is allowed.
- In `admin_active`, visitor text is stored and streamed to admin; automation actions are disabled. Only admin release returns to bot.
- Release resets `current_node_id` to pinned root and inserts the root response.
- `restart` is allowed only in `bot`.

All transitions use one allowed-transition function and are tested exhaustively.

## 10. Tenant-scoped database access

`tenantDb(tenantId, fn)`:

- starts a transaction;
- calls `set_config('app.tenant_id', tenantId, true)` so context is transaction-local;
- exposes a scoped query wrapper that applies `tenant_id` predicates;
- commits/rolls back with the operation.

This is safe with Neon pooled/PgBouncer connections. RLS remains disabled in V1 but policies and tests are prepared. Enabling RLS later does not replace application predicates.

## 11. Notification outbox

Handoff and other notification-producing transactions insert `notification_outbox` rows with a deterministic dedupe key. Worker loop:

1. claim due rows with `FOR UPDATE SKIP LOCKED`;
2. call provider;
3. set sent or retry state;
4. exponential backoff with maximum attempts;
5. preserve last error without PII.

A 30-minute email throttle uses a key such as `handoff-email:{conversationId}:{windowStart}`. Inbox state is the source of truth even if notification delivery fails.

## 12. Caching

- Snapshot cache key: immutable `flowVersionId`.
- Cache entry zod-validated on load.
- LRU cap and TTL; immutable versions need no publish invalidation once loaded.
- Bot config cache may use 60-second TTL and explicit invalidation.
- `widget.js` stable loader injects a content-hashed immutable bundle.

## 13. Background work

| Worker/job | Frequency | Purpose |
|---|---|---|
| notification outbox | every minute or continuous loop | send/retry due alerts |
| retention purge | daily 03:00 Asia/Bangkok | remove expired transcript/PII data |
| auto-close | hourly | close inactive conversations per policy |
| version cleanup | daily | remove old unreferenced versions beyond retention count |
| booking expiry V1.5 | every 15 minutes | release expired pending holds |

Each records a heartbeat. Single-instance execution is acceptable V1; jobs must be idempotent.

## 14. Failure behavior

| Failure | User behavior |
|---|---|
| Public API unavailable | widget shows retry and cached contact channels |
| DB unavailable | `503 SERVICE_UNAVAILABLE`, one client retry, then degrade |
| SSE unavailable | exponential reconnect, then POST sync polling |
| Email provider unavailable | outbox retries; inbox remains correct |
| Invalid snapshot | do not run it; alert admin and show safe contact fallback |
| Publish validation failure | draft untouched; node-specific errors returned |
| No published flow | widget displays configured contact fallback; admin sees critical status |
| Token invalid/expired | create new session only through session endpoint, not message endpoint |

## 15. Graduation triggers

- More than one app instance → Redis/managed pub-sub and external job queue.
- Sustained high SSE load → dedicated gateway or managed realtime provider.
- Multi-tenant launch → enable reviewed RLS, organizations/memberships, tenant quotas and platform admin.
- AI or voice launch → add separate engines and service adapters; do not modify FlowBot deterministic behavior.
