-- Internal support service classes and durable, deduplicated in-app updates. Response targets are
-- operational objectives only; customer-facing code receives the class, never the target time.
CREATE TABLE platform.support_response_policies (
  service_level text PRIMARY KEY CHECK (service_level IN ('standard','priority')),
  initial_response_target interval NOT NULL CHECK (initial_response_target > interval '0'),
  customer_commitment boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO platform.support_response_policies (service_level, initial_response_target)
VALUES ('standard', interval '24 hours'), ('priority', interval '4 hours');

ALTER TABLE tenancy.support_tickets
  ADD COLUMN service_level text NOT NULL DEFAULT 'standard' CHECK (service_level IN ('standard','priority')),
  ADD COLUMN first_response_due_at timestamptz,
  ADD COLUMN first_responded_at timestamptz;
UPDATE tenancy.support_tickets SET first_response_due_at = created_at + interval '24 hours';
ALTER TABLE tenancy.support_tickets ALTER COLUMN first_response_due_at SET NOT NULL;
CREATE INDEX tenancy_support_tickets_service_queue_idx
  ON tenancy.support_tickets (service_level DESC, first_responded_at NULLS FIRST, first_response_due_at, priority, last_activity_at);

-- The database is the sole authority for mapping current entitlements to an internal response
-- class and target. The application receives the resolved result, not policy-table access.
CREATE FUNCTION tenancy.resolve_support_service(target_now timestamptz)
RETURNS TABLE (service_level text, due_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, tenancy, platform AS $$
  WITH resolved AS (
    SELECT CASE WHEN EXISTS (
      SELECT 1
      FROM tenancy.product_subscriptions subscription
      JOIN LATERAL (
        SELECT snapshot.access_mode, snapshot.resolved_json
        FROM tenancy.entitlement_snapshots snapshot
        WHERE snapshot.tenant_id = subscription.tenant_id
          AND snapshot.subscription_id = subscription.id
        ORDER BY snapshot.created_at DESC, snapshot.id DESC
        LIMIT 1
      ) latest ON true
      WHERE subscription.tenant_id = tenancy.current_tenant_id()
        AND subscription.status IN ('trialing','active','past_due','grace_period')
        AND latest.access_mode IN ('active','read_only')
        AND latest.resolved_json->'entitlements'->>'support.level' = 'priority'
    ) THEN 'priority' ELSE 'standard' END AS service_level
  )
  SELECT resolved.service_level, target_now + policy.initial_response_target
  FROM resolved
  JOIN platform.support_response_policies policy USING (service_level)
$$;

CREATE TABLE tenancy.support_ticket_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  ticket_id uuid NOT NULL,
  event_key text NOT NULL CHECK (char_length(event_key) BETWEEN 8 AND 200),
  event_kind text NOT NULL CHECK (event_kind IN ('platform_response','attachment_clean','attachment_blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, event_key),
  FOREIGN KEY (tenant_id, ticket_id) REFERENCES tenancy.support_tickets(tenant_id, id) ON DELETE RESTRICT
);
CREATE TABLE tenancy.support_ticket_notification_reads (
  tenant_id uuid NOT NULL,
  notification_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, notification_id, membership_id),
  FOREIGN KEY (tenant_id, notification_id) REFERENCES tenancy.support_ticket_notifications(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE TRIGGER tenancy_support_ticket_notifications_immutable
  BEFORE UPDATE OR DELETE ON tenancy.support_ticket_notifications
  FOR EACH ROW EXECUTE FUNCTION tenancy.reject_immutable_change();

CREATE FUNCTION tenancy.capture_support_platform_response()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
BEGIN
  IF NEW.author_kind <> 'platform' THEN RETURN NEW; END IF;
  UPDATE tenancy.support_tickets SET first_responded_at = COALESCE(first_responded_at, NEW.created_at)
    WHERE tenant_id = NEW.tenant_id AND id = NEW.ticket_id;
  INSERT INTO tenancy.support_ticket_notifications (tenant_id, ticket_id, event_key, event_kind, created_at)
    VALUES (NEW.tenant_id, NEW.ticket_id, 'platform_response:' || NEW.id::text, 'platform_response', NEW.created_at)
    ON CONFLICT (tenant_id, event_key) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER tenancy_support_platform_response_notification
  AFTER INSERT ON tenancy.support_ticket_messages FOR EACH ROW EXECUTE FUNCTION tenancy.capture_support_platform_response();

CREATE FUNCTION tenancy.capture_support_attachment_result()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
BEGIN
  IF NEW.status = OLD.status OR NEW.status NOT IN ('clean','infected','failed') THEN RETURN NEW; END IF;
  INSERT INTO tenancy.support_ticket_notifications (tenant_id, ticket_id, event_key, event_kind, created_at)
    VALUES (NEW.tenant_id, NEW.ticket_id, 'attachment_result:' || NEW.id::text || ':' || NEW.status,
      CASE WHEN NEW.status = 'clean' THEN 'attachment_clean' ELSE 'attachment_blocked' END, now())
    ON CONFLICT (tenant_id, event_key) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER tenancy_support_attachment_result_notification
  AFTER UPDATE OF status ON tenancy.support_ticket_attachments
  FOR EACH ROW EXECUTE FUNCTION tenancy.capture_support_attachment_result();

CREATE FUNCTION tenancy.mark_support_notification_read(target_ticket_id uuid, target_notification_id uuid, target_membership_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE current_tenant uuid := tenancy.current_tenant_id();
BEGIN
  IF current_tenant IS NULL OR NOT EXISTS (SELECT 1 FROM tenancy.memberships membership
    WHERE membership.tenant_id = current_tenant AND membership.id = target_membership_id
      AND membership.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
      AND membership.status = 'active')
    OR NOT EXISTS (SELECT 1 FROM tenancy.support_ticket_notifications notification
      WHERE notification.tenant_id = current_tenant AND notification.ticket_id = target_ticket_id AND notification.id = target_notification_id)
  THEN RETURN false; END IF;
  INSERT INTO tenancy.support_ticket_notification_reads (tenant_id, notification_id, membership_id)
    VALUES (current_tenant, target_notification_id, target_membership_id) ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;

ALTER TABLE tenancy.support_ticket_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.support_ticket_notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.support_ticket_notifications
  USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY platform_support_notifications ON tenancy.support_ticket_notifications TO djay_platform USING (true) WITH CHECK (true);
ALTER TABLE tenancy.support_ticket_notification_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.support_ticket_notification_reads FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.support_ticket_notification_reads
  USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON platform.support_response_policies, tenancy.support_ticket_notifications,
  tenancy.support_ticket_notification_reads FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.resolve_support_service(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.mark_support_notification_read(uuid, uuid, uuid) FROM PUBLIC;
GRANT SELECT ON tenancy.support_ticket_notifications, tenancy.support_ticket_notification_reads TO djay_runtime;
GRANT EXECUTE ON FUNCTION tenancy.resolve_support_service(timestamptz) TO djay_runtime;
GRANT EXECUTE ON FUNCTION tenancy.mark_support_notification_read(uuid, uuid, uuid) TO djay_runtime;
GRANT SELECT ON platform.support_response_policies, tenancy.support_ticket_notifications TO djay_platform;
