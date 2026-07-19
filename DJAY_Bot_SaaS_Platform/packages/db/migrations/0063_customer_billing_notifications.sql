CREATE TABLE tenancy.billing_notification_preferences (
  tenant_id uuid PRIMARY KEY REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  recipient_ciphertext text,
  email_enabled boolean NOT NULL DEFAULT false,
  locale text NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'th')),
  event_keys text[] NOT NULL DEFAULT ARRAY[
    'subscription.active', 'subscription.past_due', 'subscription.grace_period',
    'subscription.restricted', 'subscription.cancelled',
    'cancellation.scheduled', 'cancellation.revoked', 'cancellation.failed',
    'payment.succeeded', 'payment.failed', 'refund.updated', 'credit_note.issued'
  ]::text[],
  updated_by_user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  updated_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, updated_by_membership_id)
    REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT,
  CHECK (NOT email_enabled OR recipient_ciphertext IS NOT NULL),
  CHECK (event_keys <@ ARRAY[
    'subscription.active', 'subscription.past_due', 'subscription.grace_period',
    'subscription.restricted', 'subscription.cancelled',
    'cancellation.scheduled', 'cancellation.revoked', 'cancellation.failed',
    'payment.succeeded', 'payment.failed', 'refund.updated', 'credit_note.issued'
  ]::text[])
);

CREATE TABLE tenancy.customer_billing_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  subscription_id uuid,
  event_key text NOT NULL CHECK (event_key IN (
    'subscription.active', 'subscription.past_due', 'subscription.grace_period',
    'subscription.restricted', 'subscription.cancelled',
    'cancellation.scheduled', 'cancellation.revoked', 'cancellation.failed',
    'payment.succeeded', 'payment.failed', 'refund.updated', 'credit_note.issued'
  )),
  source_kind text NOT NULL CHECK (source_kind IN (
    'subscription_lifecycle', 'subscription_cancellation', 'payment', 'refund', 'credit_note'
  )),
  source_id uuid NOT NULL,
  safe_facts jsonb NOT NULL DEFAULT '{}'::jsonb,
  effective_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (source_kind, source_id, event_key),
  FOREIGN KEY (tenant_id, subscription_id)
    REFERENCES tenancy.product_subscriptions(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX tenancy_customer_billing_notifications_recent
  ON tenancy.customer_billing_notifications(tenant_id, effective_at DESC, id DESC);

CREATE TABLE tenancy.customer_billing_notification_receipts (
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  notification_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  read_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, notification_id, user_id),
  FOREIGN KEY (tenant_id, notification_id)
    REFERENCES tenancy.customer_billing_notifications(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.billing_notification_delivery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  notification_id uuid NOT NULL,
  tenant_outbox_id uuid NOT NULL,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  outcome text NOT NULL CHECK (outcome IN ('sent', 'failed', 'dead_letter', 'suppressed')),
  safe_error_code text,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, tenant_outbox_id, attempt_number),
  FOREIGN KEY (tenant_id, notification_id)
    REFERENCES tenancy.customer_billing_notifications(tenant_id, id) ON DELETE RESTRICT
);

CREATE TRIGGER tenancy_customer_billing_notification_immutable
BEFORE UPDATE OR DELETE ON tenancy.customer_billing_notifications
FOR EACH ROW EXECUTE FUNCTION tenancy.reject_immutable_change();
CREATE TRIGGER tenancy_billing_notification_attempt_immutable
BEFORE UPDATE OR DELETE ON tenancy.billing_notification_delivery_attempts
FOR EACH ROW EXECUTE FUNCTION tenancy.reject_immutable_change();

CREATE OR REPLACE FUNCTION tenancy.queue_customer_billing_notification(
  target_tenant_id uuid, target_subscription_id uuid, event_key_value text,
  source_kind_value text, source_id_value uuid, safe_facts_value jsonb,
  effective_at_value timestamptz
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, tenancy AS $$
DECLARE notification_id_value uuid; preference tenancy.billing_notification_preferences%ROWTYPE;
BEGIN
  INSERT INTO tenancy.customer_billing_notifications (
    tenant_id, subscription_id, event_key, source_kind, source_id,
    safe_facts, effective_at, recorded_at
  ) VALUES (target_tenant_id, target_subscription_id, event_key_value,
    source_kind_value, source_id_value, COALESCE(safe_facts_value, '{}'::jsonb),
    effective_at_value, now())
  ON CONFLICT (source_kind, source_id, event_key) DO NOTHING
  RETURNING id INTO notification_id_value;
  IF notification_id_value IS NULL THEN
    SELECT id INTO notification_id_value FROM tenancy.customer_billing_notifications
    WHERE source_kind = source_kind_value AND source_id = source_id_value
      AND event_key = event_key_value;
    RETURN notification_id_value;
  END IF;
  SELECT * INTO preference FROM tenancy.billing_notification_preferences
  WHERE tenant_id = target_tenant_id;
  IF preference.email_enabled AND event_key_value = ANY(preference.event_keys) THEN
    INSERT INTO tenancy.outbox (tenant_id, topic, payload, idempotency_key)
    VALUES (target_tenant_id, 'billing.customer_email.requested', jsonb_build_object(
      'notificationId', notification_id_value, 'templateKey', event_key_value,
      'subscriptionId', target_subscription_id, 'facts', COALESCE(safe_facts_value, '{}'::jsonb),
      'locale', preference.locale
    ), 'billing-customer-email:' || notification_id_value::text)
    ON CONFLICT (tenant_id, topic, idempotency_key) DO NOTHING;
  END IF;
  RETURN notification_id_value;
END
$$;

CREATE OR REPLACE FUNCTION billing.notify_customer_subscription_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, billing, tenancy AS $$
DECLARE event_key_value text;
BEGIN
  event_key_value := CASE NEW.next_status
    WHEN 'active' THEN 'subscription.active'
    WHEN 'past_due' THEN 'subscription.past_due'
    WHEN 'grace_period' THEN 'subscription.grace_period'
    WHEN 'restricted' THEN 'subscription.restricted'
    WHEN 'cancelled' THEN 'subscription.cancelled'
    ELSE NULL END;
  IF event_key_value IS NOT NULL THEN
    PERFORM tenancy.queue_customer_billing_notification(
      NEW.tenant_id, NEW.subscription_id, event_key_value,
      'subscription_lifecycle', NEW.id,
      jsonb_build_object('previousStatus', NEW.previous_status, 'nextStatus', NEW.next_status),
      NEW.effective_at);
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER billing_notify_customer_subscription_lifecycle
AFTER INSERT ON billing.subscription_lifecycle_events
FOR EACH ROW EXECUTE FUNCTION billing.notify_customer_subscription_lifecycle();

CREATE OR REPLACE FUNCTION billing.notify_customer_cancellation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, billing, tenancy AS $$
DECLARE event_key_value text;
BEGIN
  event_key_value := CASE NEW.event_type
    WHEN 'provider_scheduled' THEN 'cancellation.scheduled'
    WHEN 'provider_revoked' THEN 'cancellation.revoked'
    WHEN 'provider_failed' THEN 'cancellation.failed'
    ELSE NULL END;
  IF event_key_value IS NOT NULL THEN
    PERFORM tenancy.queue_customer_billing_notification(
      NEW.tenant_id, NEW.subscription_id, event_key_value,
      'subscription_cancellation', NEW.id,
      jsonb_build_object('effectiveAt', NEW.effective_at), NEW.recorded_at);
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER billing_notify_customer_cancellation
AFTER INSERT ON billing.subscription_cancellation_events
FOR EACH ROW EXECUTE FUNCTION billing.notify_customer_cancellation();

CREATE OR REPLACE FUNCTION billing.notify_customer_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, billing, tenancy AS $$
BEGIN
  IF NEW.subscription_id IS NOT NULL AND NEW.event_type IN ('succeeded', 'failed') THEN
    PERFORM tenancy.queue_customer_billing_notification(
      NEW.tenant_id, NEW.subscription_id,
      CASE NEW.event_type WHEN 'succeeded' THEN 'payment.succeeded' ELSE 'payment.failed' END,
      'payment', NEW.id,
      jsonb_build_object('amountMinor', NEW.amount_minor, 'currency', NEW.currency), NEW.occurred_at);
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER billing_notify_customer_payment
AFTER INSERT ON billing.payment_events
FOR EACH ROW EXECUTE FUNCTION billing.notify_customer_payment();

CREATE OR REPLACE FUNCTION billing.notify_customer_refund()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, billing, tenancy AS $$
BEGIN
  IF NEW.subscription_id IS NOT NULL THEN
    PERFORM tenancy.queue_customer_billing_notification(
      NEW.tenant_id, NEW.subscription_id, 'refund.updated', 'refund', NEW.id,
      jsonb_build_object('status', NEW.status, 'amountMinor', NEW.amount_minor,
        'currency', NEW.currency), NEW.occurred_at);
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER billing_notify_customer_refund
AFTER INSERT ON billing.refund_events
FOR EACH ROW EXECUTE FUNCTION billing.notify_customer_refund();

CREATE OR REPLACE FUNCTION billing.notify_customer_credit_note()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, billing, tenancy AS $$
BEGIN
  IF NEW.subscription_id IS NOT NULL THEN
    PERFORM tenancy.queue_customer_billing_notification(
      NEW.tenant_id, NEW.subscription_id, 'credit_note.issued', 'credit_note', NEW.id,
      jsonb_build_object('status', NEW.status, 'totalMinor', NEW.total_minor,
        'currency', NEW.currency), COALESCE(NEW.issued_at, NEW.recorded_at));
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER billing_notify_customer_credit_note
AFTER INSERT ON billing.credit_note_documents
FOR EACH ROW EXECUTE FUNCTION billing.notify_customer_credit_note();

CREATE OR REPLACE FUNCTION tenancy.claim_customer_billing_email(
  claim_time timestamptz, stale_before timestamptz
)
RETURNS TABLE (
  outbox_id uuid, recipient_ciphertext text, payload jsonb,
  attempt_count integer, delivery_allowed boolean
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, tenancy AS $$
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'billing_notification_worker' THEN
    RAISE EXCEPTION 'billing notification worker context required';
  END IF;
  RETURN QUERY WITH candidate AS (
    SELECT candidate_outbox.id FROM tenancy.outbox candidate_outbox
    WHERE candidate_outbox.topic = 'billing.customer_email.requested'
      AND candidate_outbox.available_at <= claim_time
      AND (candidate_outbox.status IN ('pending', 'failed')
        OR (candidate_outbox.status = 'processing' AND candidate_outbox.locked_at < stale_before))
    ORDER BY candidate_outbox.available_at, candidate_outbox.created_at, candidate_outbox.id
    FOR UPDATE SKIP LOCKED LIMIT 1
  ), claimed AS (
    UPDATE tenancy.outbox claimed_outbox SET status = 'processing', locked_at = claim_time,
      attempt_count = claimed_outbox.attempt_count + 1, last_error_code = NULL
    FROM candidate WHERE claimed_outbox.id = candidate.id RETURNING claimed_outbox.*
  ) SELECT claimed.id,
    CASE WHEN preference.email_enabled
      AND claimed.payload->>'templateKey' = ANY(preference.event_keys)
      THEN preference.recipient_ciphertext ELSE NULL END,
    claimed.payload, claimed.attempt_count,
    COALESCE(preference.email_enabled AND preference.recipient_ciphertext IS NOT NULL
      AND claimed.payload->>'templateKey' = ANY(preference.event_keys), false)
  FROM claimed LEFT JOIN tenancy.billing_notification_preferences preference
    ON preference.tenant_id = claimed.tenant_id;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.finish_customer_billing_email(
  target_outbox_id uuid, delivered boolean,
  safe_error_code text DEFAULT NULL, dead_letter boolean DEFAULT false
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, tenancy AS $$
DECLARE target tenancy.outbox%ROWTYPE; outcome_value text; notification_id_value uuid;
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'billing_notification_worker' THEN
    RAISE EXCEPTION 'billing notification worker context required';
  END IF;
  SELECT * INTO target FROM tenancy.outbox
  WHERE id = target_outbox_id AND topic = 'billing.customer_email.requested'
    AND status = 'processing' FOR UPDATE;
  IF target.id IS NULL THEN RETURN false; END IF;
  notification_id_value := NULLIF(target.payload->>'notificationId', '')::uuid;
  outcome_value := CASE WHEN delivered THEN 'sent'
    WHEN dead_letter OR target.attempt_count >= 8 THEN 'dead_letter' ELSE 'failed' END;
  UPDATE tenancy.outbox SET status = outcome_value,
    available_at = CASE WHEN outcome_value = 'failed'
      THEN now() + make_interval(secs => LEAST(3600, 30 * power(2, LEAST(target.attempt_count, 7))::integer))
      ELSE available_at END,
    locked_at = NULL, processed_at = CASE WHEN outcome_value IN ('sent', 'dead_letter') THEN now() ELSE NULL END,
    last_error_code = CASE WHEN delivered THEN NULL ELSE left(COALESCE(safe_error_code, 'delivery_failed'), 100) END
  WHERE id = target.id;
  INSERT INTO tenancy.billing_notification_delivery_attempts (
    tenant_id, notification_id, tenant_outbox_id, attempt_number,
    outcome, safe_error_code, attempted_at
  ) VALUES (target.tenant_id, notification_id_value, target.id, target.attempt_count,
    outcome_value, CASE WHEN delivered THEN NULL ELSE left(COALESCE(safe_error_code, 'delivery_failed'), 100) END, now());
  RETURN true;
END
$$;

ALTER TABLE tenancy.billing_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.billing_notification_preferences FORCE ROW LEVEL SECURITY;
ALTER TABLE tenancy.customer_billing_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.customer_billing_notifications FORCE ROW LEVEL SECURITY;
ALTER TABLE tenancy.customer_billing_notification_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.customer_billing_notification_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE tenancy.billing_notification_delivery_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.billing_notification_delivery_attempts FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_billing_notification_preferences ON tenancy.billing_notification_preferences
  TO djay_runtime USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY worker_billing_notification_preferences ON tenancy.billing_notification_preferences
  FOR SELECT TO djay_worker USING (session_user = 'djay_worker');
CREATE POLICY tenant_customer_billing_notifications ON tenancy.customer_billing_notifications
  FOR SELECT TO djay_runtime USING (tenant_id = tenancy.current_tenant_id());
CREATE POLICY worker_customer_billing_notifications ON tenancy.customer_billing_notifications
  TO djay_worker USING (session_user = 'djay_worker') WITH CHECK (session_user = 'djay_worker');
CREATE POLICY tenant_customer_billing_receipts ON tenancy.customer_billing_notification_receipts
  TO djay_runtime USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY worker_billing_notification_attempts ON tenancy.billing_notification_delivery_attempts
  TO djay_worker USING (session_user = 'djay_worker') WITH CHECK (session_user = 'djay_worker');

REVOKE ALL ON tenancy.billing_notification_preferences,
  tenancy.customer_billing_notifications,
  tenancy.customer_billing_notification_receipts,
  tenancy.billing_notification_delivery_attempts FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.queue_customer_billing_notification(uuid, uuid, text, text, uuid, jsonb, timestamptz),
  tenancy.claim_customer_billing_email(timestamptz, timestamptz),
  tenancy.finish_customer_billing_email(uuid, boolean, text, boolean) FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE ON tenancy.billing_notification_preferences TO djay_runtime;
GRANT SELECT ON tenancy.customer_billing_notifications TO djay_runtime;
GRANT SELECT, INSERT, UPDATE ON tenancy.customer_billing_notification_receipts TO djay_runtime;
GRANT SELECT ON tenancy.billing_notification_preferences TO djay_worker;
GRANT SELECT, INSERT ON tenancy.customer_billing_notifications,
  tenancy.billing_notification_delivery_attempts TO djay_worker;
GRANT EXECUTE ON FUNCTION tenancy.claim_customer_billing_email(timestamptz, timestamptz),
  tenancy.finish_customer_billing_email(uuid, boolean, text, boolean) TO djay_worker;
