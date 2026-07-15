# 06 — FlowBot V1.1 Database Schema

**Database:** Neon Postgres 16  
**ORM:** Drizzle  
**Timezone:** store UTC `timestamptz`; render Asia/Bangkok  
**Authority:** the SQL design and invariants in this document override older sketches.

## 1. Conventions

- UUID primary keys unless an ordered sequence is specifically required.
- Every tenant-owned table has `tenant_id` and tenant-leading indexes.
- Status values are text with CHECK constraints; canonical values live in `packages/shared`.
- Published flow versions are immutable.
- `updated_at` is maintained in application code or one shared trigger.
- Soft delete: customers, conversations and leads.
- Privacy erasure is an application service across related tables, not a single `deleted_at` update.
- Composite foreign keys prevent cross-tenant and cross-flow-version references.

## 2. Logical relationships

```text
tenants
 ├─ users ─ user_sessions / user_invites
 ├─ bots ─ flow_versions ─ nodes ─ node_options / node_keywords
 │       ├─ contact_channels
 │       └─ conversations ─ messages / processed_inputs / notes / leads / events
 ├─ customers ─ conversations / leads / bookings
 ├─ notification_outbox
 ├─ audit_logs
 └─ job_heartbeats
```

## 3. Authoritative DDL

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  settings jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email citext NOT NULL,
  password_hash text NOT NULL,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'admin'
    CHECK (role IN ('owner','admin')),
  last_active_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, email)
);

CREATE TABLE user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  token_hash bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, user_id)
    REFERENCES users(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX user_sessions_lookup
  ON user_sessions(tenant_id, user_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE user_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email citext NOT NULL,
  role text NOT NULL CHECK (role IN ('owner','admin')),
  token_hash bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, created_by)
    REFERENCES users(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE bots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  public_key text NOT NULL UNIQUE,
  name text NOT NULL,
  default_lang text NOT NULL DEFAULT 'th'
    CHECK (default_lang IN ('th','en')),
  widget_settings jsonb NOT NULL DEFAULT '{}',
  allowed_origins text[] NOT NULL DEFAULT '{}',
  published_version_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE TABLE flow_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  bot_id uuid NOT NULL,
  status text NOT NULL
    CHECK (status IN ('draft','published','retired')),
  version_no integer NOT NULL CHECK (version_no > 0),
  snapshot jsonb,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, bot_id, id),
  UNIQUE (tenant_id, bot_id, version_no),
  FOREIGN KEY (tenant_id, bot_id)
    REFERENCES bots(tenant_id, id) ON DELETE CASCADE,
  CHECK (
    (status = 'draft' AND snapshot IS NULL AND published_at IS NULL)
    OR
    (status IN ('published','retired') AND snapshot IS NOT NULL AND published_at IS NOT NULL)
  )
);
CREATE UNIQUE INDEX one_draft_per_bot
  ON flow_versions(tenant_id, bot_id)
  WHERE status = 'draft';

ALTER TABLE bots ADD CONSTRAINT bots_current_version_fk
  FOREIGN KEY (tenant_id, id, published_version_id)
  REFERENCES flow_versions(tenant_id, bot_id, id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  flow_version_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN (
    'message','options','cta_link','cta_lead_form',
    'cta_contact_card','cta_live_chat','cta_scheduler'
  )),
  parent_id uuid,
  next_node_id uuid,
  sort_order integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  content_th text NOT NULL DEFAULT '',
  content_en text NOT NULL DEFAULT '',
  image_url text,
  searchable_content boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, flow_version_id, id),
  FOREIGN KEY (tenant_id, flow_version_id)
    REFERENCES flow_versions(tenant_id, id) ON DELETE CASCADE
);
ALTER TABLE nodes ADD CONSTRAINT node_parent_same_version_fk
  FOREIGN KEY (tenant_id, flow_version_id, parent_id)
  REFERENCES nodes(tenant_id, flow_version_id, id)
  ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE nodes ADD CONSTRAINT node_next_same_version_fk
  FOREIGN KEY (tenant_id, flow_version_id, next_node_id)
  REFERENCES nodes(tenant_id, flow_version_id, id)
  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX one_root_per_flow_version
  ON nodes(tenant_id, flow_version_id)
  WHERE parent_id IS NULL;
CREATE INDEX nodes_by_version
  ON nodes(tenant_id, flow_version_id, sort_order);

CREATE TABLE node_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  flow_version_id uuid NOT NULL,
  node_id uuid NOT NULL,
  target_node_id uuid NOT NULL,
  sort_order integer NOT NULL,
  label_th text NOT NULL,
  label_en text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, node_id, sort_order),
  FOREIGN KEY (tenant_id, flow_version_id, node_id)
    REFERENCES nodes(tenant_id, flow_version_id, id)
    ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (tenant_id, flow_version_id, target_node_id)
    REFERENCES nodes(tenant_id, flow_version_id, id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE node_keywords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  flow_version_id uuid NOT NULL,
  node_id uuid NOT NULL,
  lang text NOT NULL CHECK (lang IN ('th','en')),
  keyword text NOT NULL,
  normalized_keyword text NOT NULL,
  priority integer NOT NULL DEFAULT 100,
  substring_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, node_id, lang, normalized_keyword),
  FOREIGN KEY (tenant_id, flow_version_id, node_id)
    REFERENCES nodes(tenant_id, flow_version_id, id) ON DELETE CASCADE
);
CREATE INDEX node_keywords_match
  ON node_keywords(tenant_id, flow_version_id, lang, priority);

CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text,
  email citext,
  phone text,
  phone_normalized text,
  line_id text,
  whatsapp text,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (tenant_id, id)
);
-- Phone and email are intentionally NOT unique; family/shared contact details exist.
CREATE INDEX customers_phone_match
  ON customers(tenant_id, phone_normalized)
  WHERE phone_normalized IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX customers_email_match
  ON customers(tenant_id, email)
  WHERE email IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX customers_line_identity
  ON customers(tenant_id, line_id)
  WHERE line_id IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  bot_id uuid NOT NULL,
  flow_version_id uuid NOT NULL,
  customer_id uuid,
  channel text NOT NULL DEFAULT 'web'
    CHECK (channel IN ('web','line','messenger','whatsapp','voice')),
  session_token_hash bytea NOT NULL,
  session_expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'bot'
    CHECK (status IN ('bot','awaiting_admin','admin_active','closed')),
  crm_status text NOT NULL DEFAULT 'new'
    CHECK (crm_status IN (
      'new','pending_follow_up','appointment_made',
      'not_closed_follow','closed_deal'
    )),
  current_node_id uuid,
  lang text NOT NULL DEFAULT 'th' CHECK (lang IN ('th','en')),
  starred boolean NOT NULL DEFAULT false,
  archived boolean NOT NULL DEFAULT false,
  unread_admin integer NOT NULL DEFAULT 0 CHECK (unread_admin >= 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  deleted_at timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, id, flow_version_id),
  UNIQUE (tenant_id, bot_id, session_token_hash),
  FOREIGN KEY (tenant_id, bot_id)
    REFERENCES bots(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, bot_id, flow_version_id)
    REFERENCES flow_versions(tenant_id, bot_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, customer_id)
    REFERENCES customers(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, flow_version_id, current_node_id)
    REFERENCES nodes(tenant_id, flow_version_id, id) ON DELETE RESTRICT
);
CREATE INDEX conversations_inbox
  ON conversations(tenant_id, archived, last_activity_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX conversations_awaiting
  ON conversations(tenant_id, status, last_activity_at DESC)
  WHERE status = 'awaiting_admin' AND deleted_at IS NULL;
CREATE INDEX conversations_customer
  ON conversations(tenant_id, customer_id, last_activity_at DESC)
  WHERE customer_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX conversations_version_ref
  ON conversations(tenant_id, flow_version_id);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  tenant_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  flow_version_id uuid NOT NULL,
  sender text NOT NULL CHECK (sender IN ('bot','visitor','admin','system')),
  admin_user_id uuid,
  type text NOT NULL CHECK (type IN (
    'text','options','cta','form','image','audio','system'
  )),
  content jsonb NOT NULL,
  node_id uuid,
  client_request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, conversation_id, flow_version_id)
    REFERENCES conversations(tenant_id, id, flow_version_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, admin_user_id)
    REFERENCES users(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, flow_version_id, node_id)
    REFERENCES nodes(tenant_id, flow_version_id, id) ON DELETE RESTRICT,
  CHECK ((sender IN ('visitor','admin')) = (client_request_id IS NOT NULL)),
  CHECK (
    (sender = 'admin' AND admin_user_id IS NOT NULL)
    OR (sender <> 'admin' AND admin_user_id IS NULL)
  )
);
CREATE INDEX messages_sync
  ON messages(tenant_id, conversation_id, sequence);
CREATE UNIQUE INDEX one_client_message_per_request
  ON messages(tenant_id, conversation_id, sender, client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE TABLE processed_inputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  input_id uuid NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, conversation_id, input_id),
  FOREIGN KEY (tenant_id, conversation_id)
    REFERENCES conversations(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id uuid,
  customer_id uuid,
  flow_version_id uuid,
  source_node_id uuid,
  name text,
  phone text,
  phone_normalized text,
  email citext,
  extra jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, conversation_id, flow_version_id)
    REFERENCES conversations(tenant_id, id, flow_version_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, customer_id)
    REFERENCES customers(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, flow_version_id, source_node_id)
    REFERENCES nodes(tenant_id, flow_version_id, id) ON DELETE RESTRICT,
  CHECK (
    (conversation_id IS NULL AND flow_version_id IS NULL)
    OR (conversation_id IS NOT NULL AND flow_version_id IS NOT NULL)
  ),
  CHECK (source_node_id IS NULL OR flow_version_id IS NOT NULL)
);
CREATE INDEX leads_recent
  ON leads(tenant_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX leads_phone_match
  ON leads(tenant_id, phone_normalized)
  WHERE phone_normalized IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE conversation_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  user_id uuid NOT NULL,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, conversation_id)
    REFERENCES conversations(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, user_id)
    REFERENCES users(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL,
  bot_id uuid NOT NULL,
  conversation_id uuid,
  type text NOT NULL CHECK (type IN (
    'session_start','option_click','keyword_match','keyword_miss','fallback',
    'cta_view','cta_click','lead_submit','takeover','release',
    'booking_requested','booking_accepted'
  )),
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, bot_id)
    REFERENCES bots(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, conversation_id)
    REFERENCES conversations(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX events_aggregate
  ON events(tenant_id, bot_id, type, created_at DESC);

CREATE TABLE contact_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  bot_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN (
    'line','whatsapp','messenger','phone','email','url'
  )),
  label text NOT NULL,
  value text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, bot_id)
    REFERENCES bots(tenant_id, id) ON DELETE CASCADE,
  UNIQUE (tenant_id, bot_id, sort_order)
);

CREATE TABLE notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id uuid,
  channel text NOT NULL CHECK (channel IN ('email')),
  type text NOT NULL,
  dedupe_key text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','sent','failed','cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, dedupe_key),
  FOREIGN KEY (tenant_id, conversation_id)
    REFERENCES conversations(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX notification_outbox_due
  ON notification_outbox(status, next_attempt_at)
  WHERE status IN ('pending','failed');

CREATE TABLE audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_user_id uuid,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES users(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX audit_logs_recent
  ON audit_logs(tenant_id, created_at DESC);

CREATE TABLE job_heartbeats (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_name text NOT NULL,
  last_started_at timestamptz,
  last_succeeded_at timestamptz,
  last_failed_at timestamptz,
  last_error text,
  PRIMARY KEY (tenant_id, job_name)
);

-- ===== V1.5 scheduler =====
CREATE TABLE availability_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  bot_id uuid NOT NULL,
  weekday integer NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_min integer NOT NULL CHECK (start_min BETWEEN 0 AND 1439),
  end_min integer NOT NULL CHECK (end_min BETWEEN 1 AND 1440),
  slot_minutes integer NOT NULL CHECK (slot_minutes IN (15,30,45,60,90,120)),
  buffer_minutes integer NOT NULL DEFAULT 0 CHECK (buffer_minutes BETWEEN 0 AND 240),
  min_lead_hours integer NOT NULL DEFAULT 2 CHECK (min_lead_hours BETWEEN 0 AND 720),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_min > start_min),
  FOREIGN KEY (tenant_id, bot_id)
    REFERENCES bots(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE availability_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  bot_id uuid NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  FOREIGN KEY (tenant_id, bot_id)
    REFERENCES bots(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  bot_id uuid NOT NULL,
  conversation_id uuid,
  customer_id uuid,
  slot_start timestamptz NOT NULL,
  slot_end timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','declined','cancelled','expired')),
  visitor_name text NOT NULL,
  phone text NOT NULL,
  phone_normalized text NOT NULL,
  email citext,
  meeting_link text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CHECK (slot_end > slot_start),
  FOREIGN KEY (tenant_id, bot_id)
    REFERENCES bots(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, conversation_id)
    REFERENCES conversations(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, customer_id)
    REFERENCES customers(tenant_id, id) ON DELETE RESTRICT
);
ALTER TABLE bookings ADD CONSTRAINT no_active_booking_overlap
  EXCLUDE USING gist (
    tenant_id WITH =,
    bot_id WITH =,
    tstzrange(slot_start, slot_end, '[)') WITH &&
  ) WHERE (status IN ('pending','accepted'));
```

## 4. Snapshot shape

```jsonc
{
  "schemaVersion": 1,
  "flowVersionId": "uuid",
  "versionNo": 5,
  "rootId": "uuid",
  "nodes": {
    "uuid": {
      "type": "options",
      "title": "Pricing",
      "content": { "th": "...", "en": "..." },
      "imageUrl": null,
      "nextId": null,
      "searchableContent": false,
      "config": {},
      "options": [
        { "id": "uuid", "label": { "th": "...", "en": "..." }, "targetId": "uuid" }
      ],
      "keywords": [
        { "lang": "th", "value": "ราคา", "normalized": "ราคา", "priority": 10, "substring": true }
      ]
    }
  }
}
```

Validate on publish and on load. Never execute an invalid snapshot.

## 5. Important invariants

- `flow_versions` referenced by conversations cannot be deleted.
- Node parent, next and option target stay in one flow version.
- Target-node deletion is restricted until incoming references are changed.
- Phone/email customer indexes are non-unique.
- LINE identity is unique when present and active.
- Every visitor input and admin reply has a client request UUID and is unique per conversation/sender.
- Raw session tokens are absent from the schema.
- Notification provider delivery is represented by an outbox row first.
- Booking overlap is prevented for pending/accepted ranges, not only identical start times.

## 6. Migration and seed strategy

- Commit generated/reviewed SQL migrations.
- Use direct Neon URL for migrations and pooled URL for application traffic.
- Additive migrations first; backfill; then constraints.
- Prefer forward-fix over down migrations.
- Seed one production tenant and owner from environment values; never commit a production password.
- Test seed contains two tenants to prove isolation.

## 7. RLS readiness

RLS remains disabled in V1, but policies can be committed:

```sql
-- ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY conversations_tenant_isolation ON conversations
-- USING (
--   tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
-- );
```

Application pattern:

```sql
BEGIN;
SELECT set_config('app.tenant_id', :tenant_id, true); -- transaction local
-- scoped queries with explicit tenant_id predicates
COMMIT;
```

Do not use connection-session `SET app.tenant_id = ...` with pooled connections.

## 8. Privacy erasure behavior

The erasure service must locate all customer-linked data and remove/redact PII from customer fields, leads, message/form content, notes, bookings, event payloads, outbox payloads and generated exports. Conversation shells and non-identifying aggregate counts may remain when legally/business appropriate. Audit log records the action without storing erased PII.
