CREATE OR REPLACE FUNCTION tenancy.queue_flowbot_lead_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
BEGIN
  IF NEW.source <> 'flowbot_web' THEN
    RETURN NEW;
  END IF;

  INSERT INTO tenancy.outbox (tenant_id, topic, payload, idempotency_key)
  SELECT NEW.tenant_id, 'flowbot.merchant_email.requested',
         jsonb_build_object(
           'notificationProfileId', profile.id,
           'templateKey', 'flowbot.lead_captured',
           'leadId', NEW.id,
           'contactId', NEW.contact_id
         ),
         'flowbot-lead:' || NEW.id::text || ':profile:' || profile.id::text
  FROM tenancy.notification_profiles profile
  WHERE profile.tenant_id = NEW.tenant_id
    AND profile.status = 'active'
    AND 'flowbot.lead_captured' = ANY(profile.allowed_template_keys)
    AND EXISTS (
      SELECT 1
      FROM tenancy.entitlement_snapshots snapshot
      JOIN tenancy.product_subscriptions subscription
        ON subscription.tenant_id = snapshot.tenant_id
       AND subscription.id = snapshot.subscription_id
      WHERE snapshot.tenant_id = NEW.tenant_id
        AND snapshot.product_key = 'flowbot'
        AND snapshot.access_mode = 'active'
        AND subscription.status IN ('active', 'trialing', 'scheduled_change')
        AND snapshot.resolved_json->'entitlements'->>'flow.email_notification' = 'true'
    )
  ON CONFLICT (tenant_id, topic, idempotency_key) DO NOTHING;
  RETURN NEW;
END
$$;

CREATE TRIGGER tenancy_queue_flowbot_lead_notifications
AFTER INSERT ON tenancy.leads
FOR EACH ROW EXECUTE FUNCTION tenancy.queue_flowbot_lead_notifications();

CREATE OR REPLACE FUNCTION tenancy.claim_flowbot_notification(
  claim_time timestamptz,
  stale_before timestamptz
)
RETURNS TABLE (
  outbox_id uuid,
  recipient_ciphertext text,
  payload jsonb,
  attempt_count integer,
  delivery_allowed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'flowbot_notification_worker' THEN
    RAISE EXCEPTION 'flowbot notification worker context required';
  END IF;
  RETURN QUERY
  WITH candidate AS (
    SELECT candidate_outbox.id
    FROM tenancy.outbox candidate_outbox
    WHERE candidate_outbox.topic = 'flowbot.merchant_email.requested'
      AND candidate_outbox.available_at <= claim_time
      AND (
        candidate_outbox.status IN ('pending', 'failed')
        OR (candidate_outbox.status = 'processing' AND candidate_outbox.locked_at < stale_before)
      )
    ORDER BY candidate_outbox.available_at, candidate_outbox.created_at, candidate_outbox.id
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  ), claimed AS (
    UPDATE tenancy.outbox claimed_outbox
    SET status = 'processing', locked_at = claim_time,
        attempt_count = claimed_outbox.attempt_count + 1,
        last_error_code = NULL
    FROM candidate
    WHERE claimed_outbox.id = candidate.id
    RETURNING claimed_outbox.*
  )
  SELECT claimed.id,
         CASE WHEN profile.status = 'active'
                    AND claimed.payload->>'templateKey' = ANY(profile.allowed_template_keys)
              THEN profile.recipient_ciphertext ELSE NULL END,
         claimed.payload,
         claimed.attempt_count,
         COALESCE(
           profile.status = 'active'
           AND claimed.payload->>'templateKey' = 'flowbot.lead_captured'
           AND claimed.payload->>'templateKey' = ANY(profile.allowed_template_keys),
           false
         )
  FROM claimed
  LEFT JOIN tenancy.notification_profiles profile
    ON profile.tenant_id = claimed.tenant_id
   AND profile.id = NULLIF(claimed.payload->>'notificationProfileId', '')::uuid;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.finish_flowbot_notification(
  target_outbox_id uuid,
  delivered boolean,
  safe_error_code text DEFAULT NULL,
  dead_letter boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
DECLARE
  changed integer;
  target_tenant_id uuid;
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'flowbot_notification_worker' THEN
    RAISE EXCEPTION 'flowbot notification worker context required';
  END IF;

  UPDATE tenancy.outbox target
  SET status = CASE WHEN delivered THEN 'sent'
                    WHEN dead_letter OR target.attempt_count >= 8 THEN 'dead_letter'
                    ELSE 'failed' END,
      available_at = CASE WHEN delivered OR dead_letter OR target.attempt_count >= 8
                          THEN target.available_at
                          ELSE now() + make_interval(secs => LEAST(3600, 30 * (2 ^ LEAST(target.attempt_count, 7)))) END,
      locked_at = NULL,
      processed_at = CASE WHEN delivered OR dead_letter OR target.attempt_count >= 8 THEN now() ELSE NULL END,
      last_error_code = CASE WHEN delivered THEN NULL ELSE left(COALESCE(safe_error_code, 'delivery_failed'), 100) END
  WHERE target.id = target_outbox_id
    AND target.topic = 'flowbot.merchant_email.requested'
    AND target.status = 'processing'
  RETURNING target.tenant_id INTO target_tenant_id;
  GET DIAGNOSTICS changed = ROW_COUNT;

  IF changed = 1 AND NOT delivered THEN
    INSERT INTO tenancy.audit_logs (
      tenant_id, action, target_type, target_id, request_id, result, metadata
    ) VALUES (
      target_tenant_id, 'flowbot.notification_delivery_failed', 'tenant_outbox',
      target_outbox_id::text, COALESCE(current_setting('app.request_id', true), 'flowbot-notification-worker'),
      'failed', jsonb_build_object(
        'errorCode', left(COALESCE(safe_error_code, 'delivery_failed'), 100),
        'deadLetter', dead_letter
      )
    );
  END IF;
  RETURN changed = 1;
END
$$;

REVOKE ALL ON FUNCTION tenancy.queue_flowbot_lead_notifications() FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.claim_flowbot_notification(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.finish_flowbot_notification(uuid, boolean, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.claim_flowbot_notification(timestamptz, timestamptz) TO djay_worker;
GRANT EXECUTE ON FUNCTION tenancy.finish_flowbot_notification(uuid, boolean, text, boolean) TO djay_worker;
