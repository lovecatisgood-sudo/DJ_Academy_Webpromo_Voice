# 07 — FlowBot V1.1 API Specification

## 1. Surfaces

- Public widget API: `/api/w/:botPublicKey/*`
- Authenticated admin API: `/api/admin/*`

All inputs are zod-validated. JSON is camelCase. UUIDs are strings. Times are ISO-8601 UTC. Public endpoints enforce configured origins and rate limits.

## 2. Error envelope

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "This conversation is being handled by staff.",
    "requestId": "req_...",
    "details": {}
  }
}
```

| Code | HTTP |
|---|---:|
| VALIDATION | 422 |
| UNAUTHORIZED | 401 |
| FORBIDDEN | 403 |
| NOT_FOUND | 404 |
| CONFLICT | 409 |
| RATE_LIMITED | 429 |
| SERVICE_UNAVAILABLE | 503 |
| INTERNAL | 500 |

Tenant-crossing admin lookups return 404.

## 3. Common message shape

```ts
type ApiMessage = {
  id: string;
  sequence: string; // decimal bigint cursor; serialized as a string
  sender: 'bot'|'visitor'|'admin'|'system';
  type: 'text'|'options'|'cta'|'form'|'image'|'audio'|'system';
  content: Record<string, unknown>;
  nodeId?: string;
  createdAt: string;
};

type ConversationState = {
  status: 'bot'|'awaiting_admin'|'admin_active'|'closed';
  currentNodeId?: string;
  flowVersionId: string;
  lang: 'th'|'en';
};
```

## 4. Widget API

### 4.1 `GET /api/w/:key/config`

Returns public, non-sensitive configuration:

```json
{
  "botName": "...",
  "enabled": true,
  "defaultLang": "th",
  "langToggle": true,
  "theme": { "color": "#0E7C6B", "position": "br", "logoUrl": "..." },
  "greeting": { "th": "...", "en": "..." },
  "contactChannels": [{ "type": "line", "label": "LINE", "value": "..." }],
  "hasPublishedFlow": true,
  "widgetBundleVersion": "..."
}
```

Cache: `public, max-age=60, stale-while-revalidate=300`. Never return snapshot contents or internal IDs not needed by the widget.

### 4.2 `POST /api/w/:key/session`

Create or resume.

```json
{ "sessionToken": "optional raw token", "lang": "th", "afterSequence": "optional decimal cursor" }
```

Rules:

- No token, invalid token, expired token or closed conversation creates a new conversation pinned to the bot's current published version.
- If no published version exists, return a safe contact-only state.
- Valid token resumes and returns messages after `afterSequence`; without a cursor, return a bounded recent window and the resulting last cursor.
- Raw token is accepted only in the body and is never logged.
- The widget persists both session token and last acknowledged sequence; after reload it resumes from that cursor and deduplicates by message ID/sequence.

Response:

```json
{
  "sessionToken": "raw token for localStorage",
  "conversationId": "uuid",
  "state": { "status": "bot", "currentNodeId": "uuid", "flowVersionId": "uuid", "lang": "th" },
  "messages": [],
  "lastSequence": "42",
  "expiresAt": "..."
}
```

### 4.3 `POST /api/w/:key/message`

All visitor mutations, including form/lead submission.

```json
{
  "sessionToken": "raw token",
  "inputId": "client-generated uuid",
  "lang": "th",
  "input":
    { "type": "text", "payload": { "text": "..." } }
}
```

Supported inputs:

```ts
{ type:'text', payload:{text:string} }
{ type:'option', payload:{optionId:string} }
{ type:'form', payload:{nodeId:string,data:Record<string,string>} }
{ type:'action', payload:{action:'restart'|'return_to_bot'} }
```

- text max 1000 characters;
- form data validated against the current pinned node;
- `inputId` is mandatory and unique per conversation;
- duplicate `inputId` returns the original stored 200 response; processing locks the conversation row and checks idempotency after the lock;
- lead creation occurs atomically here;
- there is **no public `/lead` endpoint**.

Response:

```json
{
  "messages": [],
  "state": { "status": "bot", "currentNodeId": "uuid", "flowVersionId": "uuid", "lang": "th" },
  "lastSequence": "48",
  "lead": { "id": "uuid", "customerMatchCount": 1 }
}
```

State behavior:

- `bot`: normal engine processing.
- `awaiting_admin`: text is stored and returns current state; option/form/restart return 409; `return_to_bot` is allowed.
- `admin_active`: text is stored; all bot actions return 409.
- `closed`: 409 and client must create a new session.

### 4.4 `POST /api/w/:key/stream-token`

```json
{ "sessionToken": "raw token" }
```

Returns a short-lived signed token:

```json
{ "streamToken": "signed token", "expiresAt": "..." }
```

Suggested TTL: five minutes. Widget refreshes as needed. Token purpose is SSE only.

### 4.5 `GET /api/w/:key/stream?token=:streamToken`

SSE opened only while status is `awaiting_admin` or `admin_active`.

Headers support `Last-Event-ID`, whose value is the last durable message sequence seen.

Server sequence:

1. validate signed stream token;
2. attach a temporary buffered live listener;
3. replay DB messages after `Last-Event-ID` and capture the DB high-water sequence;
4. flush buffered messages above that high-water mark, deduplicated by sequence;
5. switch to direct live fan-out;
6. emit current `state`;
7. send `ping` every 25 seconds.

The buffer-before-replay order is required to prevent a commit between the history query and live attachment from being lost.

Events:

```text
event: message   id: <message.sequence>   data: <ApiMessage>
event: state                             data: <ConversationState>
event: ping                              data: {"at":"..."}
```

### 4.6 `POST /api/w/:key/sync`

Periodic bot-state liveness check, polling fallback, and explicit catch-up. An open visible widget in `bot` state calls this every 30 seconds and on focus/visibility; once handoff state is discovered it opens SSE.

```json
{ "sessionToken": "raw token", "afterSequence": "42" }
```

Response:

```json
{ "messages": [], "state": {}, "lastSequence": "48" }
```

### 4.7 Public rate limits

Default in-memory V1 limits, configurable:

- session: 10/min/IP;
- message: 20/min/IP and 20/min/session;
- stream-token: 10/min/session;
- stream: 3 concurrent/session and a global cap;
- sync: 10/min/session under normal use; allow a small burst for reconnect/catch-up.

Return `Retry-After` with 429.

## 5. Admin API

All routes require a valid server-side session, CSRF protection on mutations, role checks and tenant scoping.

### 5.1 Auth

```text
POST /api/admin/auth/login
POST /api/admin/auth/logout
GET  /api/admin/me
POST /api/admin/invites/:token/accept
```

Login response sets an httpOnly secure cookie. Login error never reveals whether an email exists.

### 5.2 Bots and status

```text
GET   /api/admin/bots
GET   /api/admin/bots/:botId/status
GET   /api/admin/bots/:botId/versions
POST  /api/admin/bots/:botId/rollback        {versionNo}
GET/PUT /api/admin/bots/:botId/widget-settings
GET/PUT /api/admin/bots/:botId/contact-channels
```

Status includes current version, draft changes, enabled state, active conversations by version and health warnings.

### 5.3 Draft flow authoring

```text
GET    /api/admin/bots/:botId/draft
POST   /api/admin/bots/:botId/draft/nodes
PATCH  /api/admin/nodes/:nodeId
POST   /api/admin/nodes/:nodeId/options
PATCH  /api/admin/options/:optionId
DELETE /api/admin/options/:optionId
PUT    /api/admin/nodes/:nodeId/keywords
GET    /api/admin/nodes/:nodeId/references
DELETE /api/admin/nodes/:nodeId?mode=detach|cascade
POST   /api/admin/bots/:botId/publish
POST   /api/admin/bots/:botId/simulate
```

Deletion:

- 409 if incoming references exist outside the owned subtree;
- response details list option and next-node references;
- cascade deletes owned descendants only;
- database target FKs use RESTRICT.

Publish response:

```json
{ "versionId": "uuid", "versionNo": 5, "warnings": [] }
```

Validation error includes node IDs and paths.

Simulation request includes state and input; response uses the same engine response shape but writes no production data.

### 5.4 Conversations and inbox

```text
GET   /api/admin/conversations?filter=&crm=&q=&cursor=&limit=
GET   /api/admin/conversations/:id
POST  /api/admin/conversations/:id/takeover
POST  /api/admin/conversations/:id/release
POST  /api/admin/conversations/:id/messages   {text, idempotencyKey: uuid}
PATCH /api/admin/conversations/:id            {crmStatus?,starred?,archived?}
DELETE /api/admin/conversations/:id            soft delete
POST  /api/admin/conversations/:id/read
GET   /api/admin/conversations/:id/notes
POST  /api/admin/conversations/:id/notes       {note}
GET   /api/admin/stream                         dashboard SSE
```

Admin message idempotency is required to prevent duplicate sends from double-click/retry. `idempotencyKey` is unique per conversation and admin sender; a retry returns the existing message. Reply is allowed only in `admin_active`, uses the 1000-character text limit, and publishes to the live hub only after commit.

Release inserts the pinned root messages and returns them.

Dashboard SSE sends minimal event IDs; clients refetch:

- `conversation.message`
- `conversation.awaiting`
- `lead.created`
- `notification.failed`

### 5.5 Customers and leads

```text
GET/POST   /api/admin/customers
GET/PATCH  /api/admin/customers/:id
DELETE     /api/admin/customers/:id             soft delete
POST       /api/admin/customers/:id/erase       full PII erasure
GET        /api/admin/customers/:id/timeline
GET        /api/admin/customers/:id/export
POST       /api/admin/conversations/:id/link-customer
DELETE     /api/admin/conversations/:id/link-customer
GET        /api/admin/customer-match-suggestions?phone=&email=&lineId=
GET        /api/admin/leads
GET        /api/admin/leads.csv
PATCH      /api/admin/leads/:id
DELETE     /api/admin/leads/:id                 soft delete
```

Linking an existing customer is explicit. Create-and-link is allowed. Duplicate/shared phone/email never returns a database uniqueness error because those fields are not unique.

### 5.6 Analytics and privacy settings

```text
GET  /api/admin/analytics/summary?range=7d|30d|90d
GET  /api/admin/analytics/unmatched?range=&lang=
GET/PUT /api/admin/tenant/settings
GET/POST /api/admin/users
DELETE /api/admin/users/:id
POST /api/admin/users/invite
```

Customer export may stream directly in V1 because data volume is small. Generated temporary files, if used, must expire and be included in erasure.

## 6. V1.5 scheduler API

```text
GET/PUT /api/admin/bots/:botId/availability
GET     /api/admin/bookings
POST    /api/admin/bookings/:id/accept
POST    /api/admin/bookings/:id/decline
GET     /api/w/:key/slots?date=YYYY-MM-DD
POST    /api/w/:key/message  input.type=form/action for booking flow
```

Booking creation must be idempotent and protected by the overlap exclusion constraint.
