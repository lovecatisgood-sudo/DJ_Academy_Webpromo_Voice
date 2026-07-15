# INTEGRATION CONTRACT v1.2

Identical in FlowBot, AI Chatbot, and Voice Sales Agent repositories until they merge. This file overrides conflicting wording elsewhere. A contract change requires a version bump and coordinated updates across all active repositories.

## 1. Tenancy

- Every **tenant-owned** table and row has `tenant_id uuid NOT NULL`. Global platform tables such as `tenants` or future plan catalogs are exempt.
- Composite indexes used by tenant queries lead with `tenant_id`.
- App code accesses tenant data only through `tenantDb(tenantId, fn)`; direct application imports of the raw client are lint-banned.
- `tenantDb()` must use explicit tenant predicates now and set `app.tenant_id` with transaction-local scope for future RLS. It must not rely on connection-session state surviving a pooled connection.
- Cross-tenant resource access returns `404`, not a revealing `403`.

## 2. Canonical enums

```text
conversation.crm_status:
  new | pending_follow_up | appointment_made | not_closed_follow | closed_deal

conversation.status:
  bot | awaiting_admin | admin_active | closed

conversation flags:
  starred boolean | archived boolean | deleted_at timestamptz null

channel:
  web | line | messenger | whatsapp | voice

message.sender:
  bot | visitor | admin | system

message.type:
  text | options | cta | form | image | audio | system

flow node type:
  message | options | cta_link | cta_lead_form | cta_contact_card |
  cta_live_chat | cta_scheduler
```

Values come from `packages/shared`; application code must not inline status strings.

## 3. Canonical shapes

```ts
type Customer = {
  id: string;
  tenantId: string;
  name?: string;
  email?: string;
  phone?: string;
  lineId?: string;
  whatsapp?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};

type Conversation = {
  id: string;
  tenantId: string;
  botId: string;
  customerId?: string;
  flowVersionId: string;       // immutable pin for this conversation
  currentNodeId?: string;
  channel: 'web'|'line'|'messenger'|'whatsapp'|'voice';
  status: 'bot'|'awaiting_admin'|'admin_active'|'closed';
  crmStatus: 'new'|'pending_follow_up'|'appointment_made'|'not_closed_follow'|'closed_deal';
  starred: boolean;
  archived: boolean;
  lang: 'th'|'en';
  startedAt: string;
  lastActivityAt: string;
};

type Message = {
  id: string;
  sequence: string;            // decimal bigint, durable ordering and SSE replay cursor
  tenantId: string;
  conversationId: string;
  sender: 'bot'|'visitor'|'admin'|'system';
  type: 'text'|'options'|'cta'|'form'|'image'|'audio'|'system';
  content: unknown;
  nodeId?: string;
  createdAt: string;
};

type Lead = {
  id: string;
  tenantId: string;
  conversationId?: string;
  customerId?: string;
  sourceNodeId?: string;
  name?: string;
  phone?: string;
  email?: string;
  extra: Record<string, unknown>;
  createdAt: string;
  deletedAt?: string;
};
```

`Customer` is the cross-product identity anchor. Phone/email matches are suggestions only. Never silently merge customers. Exact previously confirmed channel identifiers may be auto-linked under a separately documented rule.

## 4. Engine contract

Every product brain implements the same transport-neutral interface. FlowBot's implementation is deterministic and IO-free; AI and voice implementations may await model or speech services behind their own adapters.

```ts
type EngineInput =
  | { type: 'text'; payload: { text: string } }
  | { type: 'option'; payload: { optionId: string } }
  | { type: 'form'; payload: { nodeId: string; data: Record<string, string> } }
  | { type: 'audio'; payload: { assetId: string; transcript?: string } }
  | { type: 'action'; payload: { action: 'restart'|'return_to_bot' } };

type DomainEffect =
  | { type: 'create_lead'; payload: { sourceNodeId: string; data: Record<string, string> } }
  | { type: 'request_handoff'; payload: { reason: string } }
  | { type: 'booking_request'; payload: Record<string, unknown> };

type EngineResult = {
  messages: OutboundMessage[];
  stateUpdates: Partial<Pick<Conversation, 'status'|'currentNodeId'|'lang'>>;
  events: AnalyticsEvent[];
  effects: DomainEffect[];
};

async function advance(
  ctx: {
    tenantId: string;
    botId: string;
    conversation: Pick<Conversation, 'id'|'flowVersionId'|'currentNodeId'|'status'|'lang'>;
    config: unknown;
  },
  input: EngineInput
): Promise<EngineResult>;
```

The API/application layer applies `effects` and persists messages, state, events, and idempotency results in one database transaction.

## 5. Message rendering

`OutboundMessage` is channel-neutral. Channel adapters translate it into web bubbles, LINE quick replies, Messenger buttons, WhatsApp interactive messages, or voice output.

```ts
type OutboundMessage = {
  clientRef?: string;
  type: 'text'|'options'|'cta'|'form'|'image'|'audio'|'system';
  content: Record<string, unknown>;
};
```

- Maximum six options in FlowBot-authored content.
- Channel adapters may reduce or paginate options if a destination has a smaller limit.
- User-authored text is always rendered as text, never trusted HTML.

## 6. Input idempotency and conversation versioning

- Every visitor mutation carries a client-generated UUID `inputId`.
- The unique key is `(tenant_id, conversation_id, input_id)`.
- Replaying an input returns the original stored response and creates no additional message, lead, event, or notification.
- A conversation is pinned to the published `flowVersionId` selected at session creation.
- Publish and rollback change only the bot's current pointer for **new** sessions. Existing sessions continue on their pinned version.
- A published version may not be deleted while any conversation references it.

## 7. Session capability and realtime delivery

- Visitor sessions use a cryptographically random token. Only a SHA-256 hash is stored.
- The raw session token is accepted only in request bodies or an authorization header; it never appears in URLs or logs.
- SSE uses a separate short-lived signed stream token containing only the conversation capability and expiry.
- SSE event IDs are durable message sequence values serialized as decimal strings. Reconnect uses a buffered live listener plus database replay after `Last-Event-ID`, then switches to direct live delivery.
- While the widget remains in `bot`, a 30-second/focus sync discovers staff-initiated takeover before SSE is open.
- Polling fallback uses an authenticated POST sync endpoint, not a raw session token in a query string.

## 8. Conventions

- TypeScript strict mode; zod at all boundaries; Drizzle for schema and migrations.
- Dates are UTC `timestamptz` in Postgres and rendered in `Asia/Bangkok` for V1.
- Soft delete applies to conversations, customers, and leads. PDPA erasure is a separate service that removes or redacts related PII; soft delete alone is not erasure.
- Analytics uses an append-only `events` table. Security/audit actions use a separate `audit_logs` table.
- Error envelope:

```json
{ "error": { "code": "VALIDATION", "message": "Safe message", "requestId": "req_...", "details": {} } }
```

Shared codes: `VALIDATION`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL`, `SERVICE_UNAVAILABLE`.

## 9. V1 exclusions

The contract reserves compatibility but does not authorize building multi-tenant signup, billing, external messaging delivery, AI answers, voice runtime, autonomous learning, or Google Calendar integration in FlowBot V1.

## Changelog

- **v1.2** — added immutable `flowVersionId`, durable message sequence, input idempotency, domain effects, session/stream-token rules, transaction-scoped tenant context, and explicit PDPA erasure distinction.
- **v1.1** — added Customer shape, customer links, analytics events, error envelope, and direct migration URL.
- **v1.0** — initial contract.
