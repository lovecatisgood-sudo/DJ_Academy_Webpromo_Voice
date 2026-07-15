CREATE TABLE tenancy.ai_social_channel_quantity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  delivery_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('line', 'whatsapp', 'messenger')),
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  fee_classification text NOT NULL CHECK (fee_classification IN ('reply', 'push', 'service_window_reply')),
  attempted_quantity integer NOT NULL CHECK (attempted_quantity > 0),
  outcome text NOT NULL CHECK (outcome IN ('succeeded', 'failed')),
  external_message_ids text[] NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, delivery_id, attempt_number),
  FOREIGN KEY (tenant_id, delivery_id) REFERENCES tenancy.ai_social_outbound_deliveries(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, connection_id) REFERENCES tenancy.ai_social_connections(tenant_id, id) ON DELETE RESTRICT
);

ALTER TABLE tenancy.ai_social_channel_quantity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.ai_social_channel_quantity_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.ai_social_channel_quantity_events
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE TRIGGER tenancy_ai_social_quantity_immutable
  BEFORE UPDATE OR DELETE ON tenancy.ai_social_channel_quantity_events
  FOR EACH ROW EXECUTE FUNCTION tenancy.reject_ai_immutable_change();

CREATE OR REPLACE FUNCTION tenancy.claim_ai_social_delivery(
  claim_time timestamptz,
  stale_before timestamptz
)
RETURNS TABLE (
  delivery_id uuid, tenant_id uuid, connection_id uuid, message_id uuid,
  channel text, recipient_ciphertext text, reply_token_ciphertext text,
  response_json jsonb, credential_ciphertext text, credential_key_version integer,
  attempt_count integer, delivery_allowed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy, catalog
AS $$
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'ai_social_delivery_worker' THEN
    RAISE EXCEPTION 'AI social delivery worker context required';
  END IF;
  RETURN QUERY
  WITH candidate AS (
    SELECT candidate_delivery.id
    FROM tenancy.ai_social_outbound_deliveries candidate_delivery
    WHERE candidate_delivery.available_at <= claim_time
      AND candidate_delivery.attempt_count < 10
      AND (
        candidate_delivery.status IN ('pending', 'failed')
        OR (candidate_delivery.status = 'processing' AND candidate_delivery.locked_at < stale_before)
      )
    ORDER BY candidate_delivery.available_at, candidate_delivery.created_at, candidate_delivery.id
    FOR UPDATE SKIP LOCKED LIMIT 1
  ), claimed AS (
    UPDATE tenancy.ai_social_outbound_deliveries target
    SET status = 'processing', locked_at = claim_time,
        attempt_count = target.attempt_count + 1, safe_error_code = NULL
    FROM candidate WHERE target.id = candidate.id
    RETURNING target.*
  )
  SELECT claimed.id, claimed.tenant_id, claimed.connection_id, claimed.message_id,
         claimed.channel, claimed.recipient_ciphertext, claimed.reply_token_ciphertext,
         claimed.response_json,
         CASE WHEN connection.status = 'active' THEN connection.credential_ciphertext ELSE NULL END,
         connection.credential_key_version, claimed.attempt_count,
         COALESCE(
           connection.status = 'active' AND deployment.status = 'active'
           AND subject.status = 'active'
           AND EXISTS (
             SELECT 1 FROM tenancy.entitlement_snapshots snapshot
             JOIN tenancy.product_subscriptions subscription
               ON subscription.tenant_id = snapshot.tenant_id AND subscription.id = snapshot.subscription_id
              AND subscription.status IN ('active', 'trialing', 'scheduled_change')
             JOIN catalog.plan_versions version ON version.id = snapshot.plan_version_id
             JOIN catalog.plans plan ON plan.id = version.plan_id
              AND plan.product_key = 'ai_chat' AND plan.plan_key = 'ai_chat_premium'
             WHERE snapshot.tenant_id = claimed.tenant_id
               AND snapshot.product_key = 'ai_chat' AND snapshot.access_mode = 'active'
               AND snapshot.resolved_json->'entitlements'->>('channel.' || claimed.channel) = 'true'
           ), false
         )
  FROM claimed
  JOIN tenancy.ai_social_connections connection
    ON connection.tenant_id = claimed.tenant_id AND connection.id = claimed.connection_id
  JOIN tenancy.ai_deployments deployment
    ON deployment.tenant_id = connection.tenant_id AND deployment.id = connection.deployment_id
  JOIN tenancy.ai_social_inbound_receipts receipt
    ON receipt.tenant_id = claimed.tenant_id AND receipt.id = claimed.receipt_id
  JOIN tenancy.ai_social_subjects subject
    ON subject.tenant_id = receipt.tenant_id AND subject.connection_id = receipt.connection_id
   AND subject.subject_hash = receipt.subject_hash;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.finish_ai_social_delivery(
  target_delivery_id uuid,
  delivered boolean,
  target_external_message_ids text[],
  fee_classification text,
  attempted_quantity integer,
  target_safe_error_code text DEFAULT NULL,
  dead_letter boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
DECLARE runtime record; final_dead_letter boolean; changed integer;
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'ai_social_delivery_worker' THEN
    RAISE EXCEPTION 'AI social delivery worker context required';
  END IF;
  IF fee_classification NOT IN ('reply', 'push', 'service_window_reply')
     OR attempted_quantity < 0 OR attempted_quantity > 100
     OR cardinality(target_external_message_ids) > 100
     OR EXISTS (
       SELECT 1 FROM unnest(COALESCE(target_external_message_ids, '{}')) external_id
       WHERE char_length(external_id) NOT BETWEEN 1 AND 500
     )
     OR (NOT delivered AND cardinality(COALESCE(target_external_message_ids, '{}')) > 0) THEN
    RAISE EXCEPTION 'invalid_ai_social_delivery_result';
  END IF;
  SELECT delivery.tenant_id, delivery.connection_id, delivery.channel,
         delivery.message_id, delivery.attempt_count
  INTO runtime
  FROM tenancy.ai_social_outbound_deliveries delivery
  WHERE delivery.id = target_delivery_id AND delivery.status = 'processing'
  FOR UPDATE;
  IF runtime IS NULL THEN RETURN false; END IF;
  IF (runtime.channel = 'line' AND fee_classification NOT IN ('reply', 'push'))
     OR (runtime.channel <> 'line' AND fee_classification <> 'service_window_reply') THEN
    RAISE EXCEPTION 'invalid_ai_social_delivery_result';
  END IF;
  final_dead_letter := dead_letter OR runtime.attempt_count >= 10;
  IF attempted_quantity > 0 THEN
    INSERT INTO tenancy.ai_social_channel_quantity_events (
      tenant_id, delivery_id, connection_id, channel, attempt_number,
      fee_classification, attempted_quantity, outcome, external_message_ids
    ) VALUES (
      runtime.tenant_id, target_delivery_id, runtime.connection_id, runtime.channel,
      runtime.attempt_count, fee_classification, attempted_quantity,
      CASE WHEN delivered THEN 'succeeded' ELSE 'failed' END,
      COALESCE(target_external_message_ids, '{}')
    ) ON CONFLICT (tenant_id, delivery_id, attempt_number) DO NOTHING;
  END IF;
  UPDATE tenancy.ai_social_outbound_deliveries delivery
  SET status = CASE WHEN delivered THEN 'succeeded'
                    WHEN final_dead_letter THEN 'dead_letter' ELSE 'failed' END,
      available_at = CASE WHEN delivered OR final_dead_letter THEN delivery.available_at
                          ELSE now() + make_interval(secs => LEAST(3600, 30 * (2 ^ LEAST(delivery.attempt_count, 7)))) END,
      locked_at = NULL,
      external_message_ids = CASE WHEN delivered THEN COALESCE(target_external_message_ids, '{}')
                                  ELSE delivery.external_message_ids END,
      safe_error_code = CASE WHEN delivered THEN NULL
                             ELSE left(COALESCE(target_safe_error_code, 'channel_delivery_failed'), 100) END,
      completed_at = CASE WHEN delivered OR final_dead_letter THEN now() ELSE NULL END
  WHERE delivery.id = target_delivery_id AND delivery.status = 'processing';
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed = 1 AND NOT delivered THEN
    INSERT INTO tenancy.audit_logs (tenant_id, action, target_type, target_id, request_id, result, metadata)
    VALUES (runtime.tenant_id, 'ai_chat.social_delivery_failed', 'ai_social_delivery',
      target_delivery_id::text, COALESCE(current_setting('app.request_id', true), 'ai-social-delivery-worker'),
      'failed', jsonb_build_object(
        'errorCode', left(COALESCE(target_safe_error_code, 'channel_delivery_failed'), 100),
        'deadLetter', final_dead_letter, 'channel', runtime.channel
      ));
  END IF;
  RETURN changed = 1;
END
$$;

REVOKE ALL ON tenancy.ai_social_channel_quantity_events FROM PUBLIC;
GRANT SELECT ON tenancy.ai_social_channel_quantity_events TO djay_runtime;
REVOKE ALL ON FUNCTION tenancy.claim_ai_social_delivery(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.finish_ai_social_delivery(uuid, boolean, text[], text, integer, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.claim_ai_social_delivery(timestamptz, timestamptz) TO djay_worker;
GRANT EXECUTE ON FUNCTION tenancy.finish_ai_social_delivery(uuid, boolean, text[], text, integer, text, boolean) TO djay_worker;
