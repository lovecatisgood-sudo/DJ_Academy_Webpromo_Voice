-- One durable, per-membership notification center fed only by authoritative lifecycle rows.
CREATE TABLE tenancy.tenant_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  event_key text NOT NULL CHECK (char_length(event_key) BETWEEN 8 AND 240),
  category text NOT NULL CHECK (category IN ('action_needed','product_health','usage_cost','billing','team_security','completed')),
  severity text NOT NULL CHECK (severity IN ('info','success','warning','critical')),
  event_kind text NOT NULL CHECK (char_length(event_kind) BETWEEN 3 AND 100),
  entity_type text NOT NULL CHECK (char_length(entity_type) BETWEEN 3 AND 80),
  entity_id uuid NOT NULL,
  deep_link text NOT NULL CHECK (deep_link ~ '^/workspace(/[a-z0-9?=&_-]+)*$'),
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, event_key),
  FOREIGN KEY (tenant_id) REFERENCES tenancy.tenants(id) ON DELETE RESTRICT
);
CREATE INDEX tenancy_notification_center_recent_idx
  ON tenancy.tenant_notifications (tenant_id, category, occurred_at DESC, id DESC);
CREATE TRIGGER tenancy_tenant_notifications_immutable BEFORE UPDATE OR DELETE ON tenancy.tenant_notifications
  FOR EACH ROW EXECUTE FUNCTION tenancy.reject_immutable_change();

CREATE TABLE tenancy.tenant_notification_reads (
  tenant_id uuid NOT NULL,
  notification_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, notification_id, membership_id),
  FOREIGN KEY (tenant_id, notification_id) REFERENCES tenancy.tenant_notifications(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE FUNCTION tenancy.queue_tenant_notification(
  target_tenant_id uuid, target_event_key text, target_category text, target_severity text,
  target_event_kind text, target_entity_type text, target_entity_id uuid,
  target_deep_link text, target_occurred_at timestamptz
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE result_id uuid;
BEGIN
  INSERT INTO tenancy.tenant_notifications (
    tenant_id, event_key, category, severity, event_kind, entity_type, entity_id, deep_link, occurred_at
  ) VALUES (
    target_tenant_id, target_event_key, target_category, target_severity, target_event_kind,
    target_entity_type, target_entity_id, target_deep_link, target_occurred_at
  ) ON CONFLICT (tenant_id, event_key) DO NOTHING RETURNING id INTO result_id;
  IF result_id IS NULL THEN SELECT id INTO result_id FROM tenancy.tenant_notifications
    WHERE tenant_id = target_tenant_id AND event_key = target_event_key; END IF;
  RETURN result_id;
END;
$$;

CREATE FUNCTION tenancy.capture_customer_operations_notification() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE category_value text; severity_value text; link_value text; entity_type_value text; entity_id_value uuid; occurred_value timestamptz; kind_value text;
BEGIN
  IF TG_TABLE_NAME = 'appointment_status_history' THEN
    category_value := CASE WHEN NEW.to_status IN ('completed','cancelled','rejected','no_show') THEN 'completed' ELSE 'action_needed' END;
    severity_value := CASE WHEN NEW.to_status IN ('cancelled','rejected','no_show') THEN 'warning' WHEN NEW.to_status = 'completed' THEN 'success' ELSE 'info' END;
    link_value := '/workspace/appointments'; entity_type_value := 'appointment_request'; entity_id_value := NEW.appointment_request_id;
    occurred_value := NEW.changed_at;
    kind_value := 'appointment.' || NEW.to_status;
  ELSIF TG_TABLE_NAME = 'voice_callback_status_history' THEN
    category_value := CASE WHEN NEW.to_status = 'pending' THEN 'action_needed' ELSE 'completed' END;
    severity_value := CASE WHEN NEW.to_status = 'cancelled' THEN 'warning' WHEN NEW.to_status = 'completed' THEN 'success' ELSE 'info' END;
    link_value := '/workspace/appointments'; entity_type_value := 'voice_callback_request'; entity_id_value := NEW.callback_request_id;
    occurred_value := NEW.changed_at;
    kind_value := 'callback.' || NEW.to_status;
  ELSE
    category_value := 'completed'; severity_value := 'success'; link_value := '/workspace/contacts';
    entity_type_value := 'customer_value_event'; entity_id_value := NEW.id;
    occurred_value := NEW.recorded_at;
    kind_value := 'deal_value.recorded';
  END IF;
  PERFORM tenancy.queue_tenant_notification(NEW.tenant_id, TG_TABLE_NAME || ':' || NEW.id::text,
    category_value, severity_value,
    kind_value,
    entity_type_value, entity_id_value, link_value, occurred_value);
  RETURN NEW;
END;
$$;
CREATE TRIGGER tenancy_appointment_notification_center AFTER INSERT ON tenancy.appointment_status_history
  FOR EACH ROW EXECUTE FUNCTION tenancy.capture_customer_operations_notification();
CREATE TRIGGER tenancy_callback_notification_center AFTER INSERT ON tenancy.voice_callback_status_history
  FOR EACH ROW EXECUTE FUNCTION tenancy.capture_customer_operations_notification();
CREATE TRIGGER tenancy_value_notification_center AFTER INSERT ON tenancy.customer_value_events
  FOR EACH ROW EXECUTE FUNCTION tenancy.capture_customer_operations_notification();

CREATE FUNCTION tenancy.capture_existing_lifecycle_notification() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE category_value text; severity_value text; link_value text; kind_value text; entity_value uuid; occurred_value timestamptz;
BEGIN
  IF TG_TABLE_NAME = 'support_ticket_notifications' THEN
    category_value := 'action_needed'; severity_value := CASE WHEN NEW.event_kind = 'attachment_blocked' THEN 'warning' ELSE 'info' END;
    link_value := '/workspace/support'; kind_value := 'support.' || NEW.event_kind; entity_value := NEW.ticket_id;
    occurred_value := NEW.created_at;
  ELSIF TG_TABLE_NAME = 'customer_billing_notifications' THEN
    category_value := 'billing';
    severity_value := CASE WHEN NEW.event_key IN ('payment.failed','subscription.restricted','cancellation.failed') THEN 'critical'
      WHEN NEW.event_key IN ('subscription.past_due','subscription.grace_period') THEN 'warning'
      WHEN NEW.event_key IN ('payment.succeeded','subscription.active','credit_note.issued') THEN 'success' ELSE 'info' END;
    link_value := '/workspace/usage'; kind_value := 'billing.' || NEW.event_key; entity_value := NEW.source_id;
    occurred_value := NEW.effective_at;
  ELSIF TG_TABLE_NAME = 'usage_alert_deliveries' THEN
    category_value := 'usage_cost'; severity_value := CASE WHEN NEW.alert_key LIKE '%100%' OR NEW.alert_key LIKE '%exhaust%' THEN 'critical' ELSE 'warning' END;
    link_value := '/workspace/usage'; kind_value := 'usage.' || NEW.alert_key; entity_value := NEW.quota_account_id;
    occurred_value := NEW.created_at;
  ELSIF TG_TABLE_NAME = 'membership_invitations' THEN
    category_value := CASE WHEN NEW.status = 'pending' THEN 'action_needed' ELSE 'team_security' END;
    severity_value := CASE WHEN NEW.status IN ('expired','revoked') THEN 'warning' WHEN NEW.status = 'accepted' THEN 'success' ELSE 'info' END;
    link_value := '/workspace/team'; kind_value := 'team.invitation_' || NEW.status; entity_value := NEW.id;
    occurred_value := COALESCE(NEW.accepted_at, NEW.created_at);
  ELSE
    category_value := CASE WHEN NEW.status = 'failed' THEN 'product_health' ELSE 'completed' END;
    severity_value := CASE WHEN NEW.status = 'failed' THEN 'warning' ELSE 'success' END;
    link_value := '/workspace/test-center'; kind_value := 'test.' || NEW.product_key || '_' || NEW.status; entity_value := NEW.subject_id;
    occurred_value := NEW.observed_at;
  END IF;
  PERFORM tenancy.queue_tenant_notification(NEW.tenant_id, TG_TABLE_NAME || ':' || NEW.id::text || ':' || kind_value,
    category_value, severity_value, kind_value, TG_TABLE_NAME, entity_value, link_value,
    occurred_value);
  RETURN NEW;
END;
$$;
CREATE TRIGGER tenancy_support_notification_center AFTER INSERT ON tenancy.support_ticket_notifications
  FOR EACH ROW EXECUTE FUNCTION tenancy.capture_existing_lifecycle_notification();
CREATE TRIGGER tenancy_billing_notification_center AFTER INSERT ON tenancy.customer_billing_notifications
  FOR EACH ROW EXECUTE FUNCTION tenancy.capture_existing_lifecycle_notification();
CREATE TRIGGER tenancy_usage_notification_center AFTER INSERT ON tenancy.usage_alert_deliveries
  FOR EACH ROW EXECUTE FUNCTION tenancy.capture_existing_lifecycle_notification();
CREATE TRIGGER tenancy_invitation_notification_center AFTER INSERT OR UPDATE OF status ON tenancy.membership_invitations
  FOR EACH ROW EXECUTE FUNCTION tenancy.capture_existing_lifecycle_notification();
CREATE TRIGGER tenancy_regression_notification_center AFTER INSERT ON tenancy.bot_regression_runs
  FOR EACH ROW EXECUTE FUNCTION tenancy.capture_existing_lifecycle_notification();

CREATE FUNCTION tenancy.mark_tenant_notification_read(target_notification_id uuid, target_membership_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE current_tenant uuid := tenancy.current_tenant_id();
BEGIN
  IF current_tenant IS NULL OR NOT EXISTS (SELECT 1 FROM tenancy.memberships membership
    WHERE membership.tenant_id = current_tenant AND membership.id = target_membership_id
      AND membership.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid AND membership.status = 'active')
    OR NOT EXISTS (SELECT 1 FROM tenancy.tenant_notifications notification
      WHERE notification.tenant_id = current_tenant AND notification.id = target_notification_id)
  THEN RETURN false; END IF;
  INSERT INTO tenancy.tenant_notification_reads (tenant_id, notification_id, membership_id)
    VALUES (current_tenant, target_notification_id, target_membership_id) ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;

ALTER TABLE tenancy.tenant_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.tenant_notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.tenant_notifications USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
ALTER TABLE tenancy.tenant_notification_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.tenant_notification_reads FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.tenant_notification_reads USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
REVOKE ALL ON tenancy.tenant_notifications, tenancy.tenant_notification_reads FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.queue_tenant_notification(uuid,text,text,text,text,text,uuid,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.mark_tenant_notification_read(uuid,uuid) FROM PUBLIC;
GRANT SELECT ON tenancy.tenant_notifications, tenancy.tenant_notification_reads TO djay_runtime;
GRANT EXECUTE ON FUNCTION tenancy.mark_tenant_notification_read(uuid,uuid) TO djay_runtime;
