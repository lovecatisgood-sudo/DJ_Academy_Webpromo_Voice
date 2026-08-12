-- Optional merchant feedback captured when a support request is closed.
CREATE TABLE tenancy.support_ticket_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  ticket_id uuid NOT NULL,
  submitted_by_membership_id uuid NOT NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text CHECK (comment IS NULL OR char_length(comment) BETWEEN 2 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, ticket_id),
  FOREIGN KEY (tenant_id, ticket_id) REFERENCES tenancy.support_tickets(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, submitted_by_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX tenancy_support_ticket_feedback_rating_idx
  ON tenancy.support_ticket_feedback (rating, created_at DESC, id DESC);

CREATE TRIGGER tenancy_support_ticket_feedback_immutable
  BEFORE UPDATE OR DELETE ON tenancy.support_ticket_feedback
  FOR EACH ROW EXECUTE FUNCTION tenancy.reject_immutable_change();

ALTER TABLE tenancy.support_ticket_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.support_ticket_feedback FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.support_ticket_feedback
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY platform_support_ticket_feedback ON tenancy.support_ticket_feedback TO djay_platform
  USING (true) WITH CHECK (true);

REVOKE ALL ON tenancy.support_ticket_feedback FROM PUBLIC;
GRANT SELECT, INSERT ON tenancy.support_ticket_feedback TO djay_runtime;
GRANT SELECT ON tenancy.support_ticket_feedback TO djay_platform;
