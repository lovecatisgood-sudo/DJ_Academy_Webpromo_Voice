-- Merchant-facing support tickets and an audited platform response queue.
-- Ticket content is tenant-owned; platform visibility is limited to the dedicated platform role.

CREATE TABLE tenancy.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  created_by_membership_id uuid NOT NULL,
  assigned_platform_user_id uuid REFERENCES platform.users(id) ON DELETE RESTRICT,
  category text NOT NULL CHECK (category IN ('onboarding','channel','bot','knowledge','inbox','billing','account','other')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 5 AND 160),
  description text NOT NULL CHECK (char_length(description) BETWEEN 10 AND 5000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','waiting_on_customer','resolved','closed')),
  context_path text CHECK (context_path IS NULL OR (char_length(context_path) BETWEEN 1 AND 500 AND context_path LIKE '/%')),
  diagnostic_code text CHECK (diagnostic_code IS NULL OR diagnostic_code ~ '^[A-Z0-9][A-Z0-9_.-]{1,79}$'),
  idempotency_key uuid NOT NULL,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, created_by_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT,
  CHECK ((status IN ('resolved','closed')) = (resolved_at IS NOT NULL)),
  CHECK ((status = 'closed') = (closed_at IS NOT NULL))
);

CREATE TABLE tenancy.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  ticket_id uuid NOT NULL,
  author_kind text NOT NULL CHECK (author_kind IN ('customer','platform')),
  author_membership_id uuid,
  author_platform_user_id uuid REFERENCES platform.users(id) ON DELETE RESTRICT,
  body text NOT NULL CHECK (char_length(body) BETWEEN 2 AND 5000),
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, ticket_id) REFERENCES tenancy.support_tickets(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, author_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT,
  CHECK (
    (author_kind = 'customer' AND author_membership_id IS NOT NULL AND author_platform_user_id IS NULL)
    OR (author_kind = 'platform' AND author_membership_id IS NULL AND author_platform_user_id IS NOT NULL)
  )
);

CREATE INDEX tenancy_support_tickets_queue_idx
  ON tenancy.support_tickets (status, priority, last_activity_at DESC, id DESC);
CREATE INDEX tenancy_support_tickets_tenant_idx
  ON tenancy.support_tickets (tenant_id, last_activity_at DESC, id DESC);
CREATE INDEX tenancy_support_ticket_messages_timeline_idx
  ON tenancy.support_ticket_messages (tenant_id, ticket_id, created_at, id);

CREATE TRIGGER tenancy_support_ticket_messages_immutable
  BEFORE UPDATE OR DELETE ON tenancy.support_ticket_messages
  FOR EACH ROW EXECUTE FUNCTION tenancy.reject_immutable_change();

ALTER TABLE tenancy.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.support_tickets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.support_tickets
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY platform_support_tickets ON tenancy.support_tickets TO djay_platform
  USING (true) WITH CHECK (true);

ALTER TABLE tenancy.support_ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.support_ticket_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.support_ticket_messages
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY platform_support_ticket_messages ON tenancy.support_ticket_messages TO djay_platform
  USING (true) WITH CHECK (true);

REVOKE ALL ON tenancy.support_tickets, tenancy.support_ticket_messages FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON tenancy.support_tickets TO djay_runtime;
GRANT SELECT, INSERT ON tenancy.support_ticket_messages TO djay_runtime;
GRANT SELECT, UPDATE ON tenancy.support_tickets TO djay_platform;
GRANT SELECT, INSERT ON tenancy.support_ticket_messages TO djay_platform;
