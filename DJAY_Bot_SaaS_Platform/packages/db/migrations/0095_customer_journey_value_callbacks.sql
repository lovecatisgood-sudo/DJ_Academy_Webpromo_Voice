-- Merchant-confirmed outcome value and callback history complete the cross-product customer journey.
-- Both ledgers are append-only; corrections are new evidence rather than silent rewrites.
CREATE TABLE tenancy.customer_value_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  conversation_id uuid,
  event_type text NOT NULL DEFAULT 'deal_won' CHECK (event_type = 'deal_won'),
  amount_minor bigint NOT NULL CHECK (amount_minor BETWEEN 1 AND 9000000000000000),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  recorded_by_membership_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, contact_id) REFERENCES tenancy.contacts(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, lead_id) REFERENCES tenancy.leads(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, conversation_id) REFERENCES tenancy.conversations(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, recorded_by_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX tenancy_customer_value_contact_idx
  ON tenancy.customer_value_events (tenant_id, contact_id, recorded_at DESC);
CREATE TRIGGER tenancy_customer_value_events_immutable
  BEFORE UPDATE OR DELETE ON tenancy.customer_value_events
  FOR EACH ROW EXECUTE FUNCTION tenancy.reject_immutable_change();

CREATE FUNCTION tenancy.record_customer_deal_value(
  target_contact_id uuid, target_lead_id uuid, target_conversation_id uuid,
  target_amount_minor bigint, target_currency text,
  target_membership_id uuid, target_idempotency_key uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE
  current_tenant uuid := tenancy.current_tenant_id();
  result_id uuid;
BEGIN
  IF current_tenant IS NULL OR target_amount_minor NOT BETWEEN 1 AND 9000000000000000
    OR target_currency !~ '^[A-Z]{3}$'
  THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM tenancy.memberships membership
    WHERE membership.tenant_id = current_tenant AND membership.id = target_membership_id
      AND membership.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
      AND membership.status = 'active')
  THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM tenancy.leads lead JOIN tenancy.contacts contact
      ON contact.tenant_id = lead.tenant_id AND contact.id = lead.contact_id
    WHERE lead.tenant_id = current_tenant AND lead.id = target_lead_id
      AND lead.contact_id = target_contact_id AND lead.status = 'closed_deal'
      AND contact.status = 'active')
  THEN RETURN NULL; END IF;
  IF target_conversation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM tenancy.conversations conversation
    WHERE conversation.tenant_id = current_tenant AND conversation.id = target_conversation_id
      AND conversation.contact_id = target_contact_id
      AND (conversation.lead_id IS NULL OR conversation.lead_id = target_lead_id)
  ) THEN RETURN NULL; END IF;

  INSERT INTO tenancy.customer_value_events (
    tenant_id, contact_id, lead_id, conversation_id, amount_minor, currency,
    recorded_by_membership_id, idempotency_key
  ) VALUES (
    current_tenant, target_contact_id, target_lead_id, target_conversation_id,
    target_amount_minor, target_currency, target_membership_id, target_idempotency_key
  ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING RETURNING id INTO result_id;
  IF result_id IS NOT NULL THEN RETURN result_id; END IF;
  SELECT id INTO result_id FROM tenancy.customer_value_events
    WHERE tenant_id = current_tenant AND idempotency_key = target_idempotency_key
      AND contact_id = target_contact_id AND lead_id = target_lead_id
      AND conversation_id IS NOT DISTINCT FROM target_conversation_id
      AND amount_minor = target_amount_minor AND currency = target_currency;
  RETURN result_id;
END;
$$;

CREATE TABLE tenancy.voice_callback_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  callback_request_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL CHECK (to_status IN ('pending','completed','cancelled')),
  actor_membership_id uuid,
  request_id text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, callback_request_id) REFERENCES tenancy.voice_callback_requests(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX tenancy_voice_callback_history_idx
  ON tenancy.voice_callback_status_history (tenant_id, callback_request_id, changed_at, id);
CREATE TRIGGER tenancy_voice_callback_status_history_immutable
  BEFORE UPDATE OR DELETE ON tenancy.voice_callback_status_history
  FOR EACH ROW EXECUTE FUNCTION tenancy.reject_immutable_change();

INSERT INTO tenancy.voice_callback_status_history (
  tenant_id, callback_request_id, from_status, to_status, request_id, changed_at
) SELECT tenant_id, id, NULL, status, 'migration:0095', created_at
  FROM tenancy.voice_callback_requests;

CREATE FUNCTION tenancy.capture_voice_callback_status_history() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
BEGIN
  IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO tenancy.voice_callback_status_history (
      tenant_id, callback_request_id, from_status, to_status,
      actor_membership_id, request_id, changed_at
    ) VALUES (
      NEW.tenant_id, NEW.id, CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END, NEW.status,
      NULLIF(current_setting('app.membership_id', true), '')::uuid,
      COALESCE(NULLIF(current_setting('app.request_id', true), ''), 'system'), now()
    );
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER tenancy_voice_callback_status_capture
  AFTER INSERT OR UPDATE OF status ON tenancy.voice_callback_requests
  FOR EACH ROW EXECUTE FUNCTION tenancy.capture_voice_callback_status_history();

CREATE FUNCTION tenancy.transition_voice_callback_request(
  target_callback_id uuid, target_status text, target_membership_id uuid
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE
  current_tenant uuid := tenancy.current_tenant_id();
  current_status text;
BEGIN
  IF current_tenant IS NULL OR target_status NOT IN ('completed','cancelled') THEN RETURN 'not_found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM tenancy.memberships membership
    WHERE membership.tenant_id = current_tenant AND membership.id = target_membership_id
      AND membership.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
      AND membership.status = 'active')
  THEN RETURN 'not_found'; END IF;
  SELECT status INTO current_status FROM tenancy.voice_callback_requests
    WHERE tenant_id = current_tenant AND id = target_callback_id FOR UPDATE;
  IF current_status IS NULL THEN RETURN 'not_found'; END IF;
  IF current_status = target_status THEN RETURN 'replayed'; END IF;
  IF current_status <> 'pending' THEN RETURN 'invalid_transition'; END IF;
  UPDATE tenancy.voice_callback_requests SET status = target_status,
    completed_at = CASE WHEN target_status = 'completed' THEN now() ELSE NULL END
    WHERE tenant_id = current_tenant AND id = target_callback_id;
  INSERT INTO tenancy.audit_logs (tenant_id, actor_user_id, actor_membership_id, action,
    target_type, target_id, request_id, result, metadata) VALUES (
      current_tenant, NULLIF(current_setting('app.user_id', true), '')::uuid, target_membership_id,
      'callback.status_changed', 'voice_callback_request', target_callback_id::text,
      COALESCE(NULLIF(current_setting('app.request_id', true), ''), 'system'), 'succeeded',
      jsonb_build_object('from', current_status, 'to', target_status));
  RETURN 'accepted';
END;
$$;

ALTER TABLE tenancy.customer_value_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.customer_value_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.customer_value_events
  USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
ALTER TABLE tenancy.voice_callback_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.voice_callback_status_history FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.voice_callback_status_history
  USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON tenancy.customer_value_events, tenancy.voice_callback_status_history FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.record_customer_deal_value(uuid, uuid, uuid, bigint, text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.transition_voice_callback_request(uuid, text, uuid) FROM PUBLIC;
GRANT SELECT ON tenancy.customer_value_events, tenancy.voice_callback_status_history TO djay_runtime;
GRANT SELECT ON tenancy.customer_value_events, tenancy.voice_callback_status_history TO djay_worker;
GRANT EXECUTE ON FUNCTION tenancy.record_customer_deal_value(uuid, uuid, uuid, bigint, text, uuid, uuid) TO djay_runtime;
GRANT EXECUTE ON FUNCTION tenancy.transition_voice_callback_request(uuid, text, uuid) TO djay_runtime;
