CREATE OR REPLACE FUNCTION tenancy.commit_flow_social_turn(
  target_outbox_id uuid, target_receipt_id uuid, target_session_hash bytea,
  target_input_id uuid, target_sequence integer, input_json jsonb,
  result_json jsonb, response_json jsonb
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE target_tenant_id uuid; target_connection_id uuid; target_execution_id uuid; committed jsonb; changed integer;
BEGIN
  IF session_user <> 'djay_worker' OR current_setting('app.service', true) IS DISTINCT FROM 'flow_social_worker' THEN
    RAISE EXCEPTION 'Flow social worker context required'; END IF;
  SELECT outbox.tenant_id, receipt.connection_id, execution.id
  INTO target_tenant_id, target_connection_id, target_execution_id
  FROM tenancy.outbox outbox
  JOIN tenancy.flow_social_receipts receipt ON receipt.tenant_id = outbox.tenant_id AND receipt.id = target_receipt_id
  JOIN tenancy.flow_social_subjects subject ON subject.tenant_id = receipt.tenant_id
    AND subject.connection_id = receipt.connection_id AND subject.subject_hash = receipt.subject_hash
  JOIN tenancy.flow_executions execution ON execution.tenant_id = subject.tenant_id
    AND execution.id = subject.execution_id AND execution.session_token_hash = target_session_hash
  WHERE outbox.id = target_outbox_id AND outbox.topic = 'flowbot.social.inbound.received'
    AND outbox.status = 'processing' AND receipt.event_type = 'inbound.message' FOR UPDATE OF outbox;
  IF target_tenant_id IS NULL THEN RAISE EXCEPTION 'flow_social_commit_not_available'; END IF;
  committed := tenancy.commit_flowbot_step(target_session_hash, target_input_id, target_sequence,
    input_json, result_json, response_json);
  IF jsonb_array_length(COALESCE(result_json->'messages', '[]'::jsonb)) > 0 THEN
    INSERT INTO tenancy.flow_social_deliveries (tenant_id, connection_id, receipt_id, execution_id, response_json)
    VALUES (target_tenant_id, target_connection_id, target_receipt_id, target_execution_id,
      jsonb_build_object('messages', result_json->'messages', 'status', result_json->'nextState'->>'status'))
    ON CONFLICT (tenant_id, receipt_id) DO NOTHING;
  END IF;
  UPDATE tenancy.outbox SET status = 'sent', locked_at = NULL, processed_at = now(), last_error_code = NULL
  WHERE id = target_outbox_id AND status = 'processing';
  GET DIAGNOSTICS changed = ROW_COUNT; RETURN changed = 1;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.apply_flow_social_control(target_outbox_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE receipt_record record; changed integer;
BEGIN
  IF session_user <> 'djay_worker' OR current_setting('app.service', true) IS DISTINCT FROM 'flow_social_worker' THEN
    RAISE EXCEPTION 'Flow social worker context required'; END IF;
  SELECT receipt.* INTO receipt_record FROM tenancy.outbox outbox
  JOIN tenancy.flow_social_receipts receipt ON receipt.tenant_id = outbox.tenant_id
    AND receipt.id = NULLIF(outbox.payload->>'receiptId', '')::uuid
  WHERE outbox.id = target_outbox_id AND outbox.topic = 'flowbot.social.inbound.received'
    AND outbox.status = 'processing' AND receipt.event_type <> 'inbound.message' FOR UPDATE OF outbox;
  IF receipt_record IS NULL THEN RETURN false; END IF;
  IF receipt_record.event_type = 'subject.opt_out' THEN
    UPDATE tenancy.flow_social_subjects SET status = 'opted_out', updated_at = now()
    WHERE tenant_id = receipt_record.tenant_id AND connection_id = receipt_record.connection_id
      AND subject_hash = receipt_record.subject_hash AND status = 'active';
  END IF;
  UPDATE tenancy.outbox SET status = 'sent', locked_at = NULL, processed_at = now(), last_error_code = NULL
  WHERE id = target_outbox_id AND status = 'processing';
  GET DIAGNOSTICS changed = ROW_COUNT; RETURN changed = 1;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.claim_flow_social_delivery(claim_time timestamptz, stale_before timestamptz)
RETURNS TABLE (delivery_id uuid, tenant_id uuid, channel text, response_json jsonb,
  recipient_ciphertext text, reply_token_ciphertext text, credential_ciphertext text,
  delivered_part_count integer, attempt_count integer, delivery_allowed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy, catalog AS $$
BEGIN
  IF session_user <> 'djay_worker' OR current_setting('app.service', true) IS DISTINCT FROM 'flow_social_worker' THEN
    RAISE EXCEPTION 'Flow social worker context required'; END IF;
  RETURN QUERY WITH candidate AS (
    SELECT item.id FROM tenancy.flow_social_deliveries item WHERE item.available_at <= claim_time
      AND item.attempt_count < 10 AND (item.status IN ('pending', 'failed')
        OR (item.status = 'processing' AND item.locked_at < stale_before))
    ORDER BY item.available_at, item.created_at, item.id FOR UPDATE SKIP LOCKED LIMIT 1
  ), claimed AS (
    UPDATE tenancy.flow_social_deliveries item SET status = 'processing', locked_at = claim_time,
      attempt_count = item.attempt_count + 1, safe_error_code = NULL FROM candidate
    WHERE item.id = candidate.id RETURNING item.*
  )
  SELECT claimed.id, claimed.tenant_id, connection.channel, claimed.response_json,
    subject.external_subject_ciphertext, receipt.normalized_json->>'replyTokenCiphertext',
    connection.credential_ciphertext, claimed.delivered_part_count, claimed.attempt_count,
    COALESCE(connection.status = 'active' AND subject.status = 'active'
      AND execution.status NOT IN ('failed', 'expired') AND EXISTS (
        SELECT 1 FROM tenancy.entitlement_snapshots snapshot
        JOIN tenancy.product_subscriptions subscription ON subscription.tenant_id = snapshot.tenant_id
          AND subscription.id = snapshot.subscription_id AND subscription.status IN ('active', 'trialing', 'scheduled_change')
        WHERE snapshot.tenant_id = claimed.tenant_id AND snapshot.product_key = 'flowbot'
          AND snapshot.access_mode = 'active' AND snapshot.resolved_json->'entitlements'->>'channel.social' = 'true'), false)
  FROM claimed
  JOIN tenancy.flow_social_connections connection ON connection.tenant_id = claimed.tenant_id AND connection.id = claimed.connection_id
  JOIN tenancy.flow_social_receipts receipt ON receipt.tenant_id = claimed.tenant_id AND receipt.id = claimed.receipt_id
  JOIN tenancy.flow_social_subjects subject ON subject.tenant_id = receipt.tenant_id
    AND subject.connection_id = receipt.connection_id AND subject.subject_hash = receipt.subject_hash
  JOIN tenancy.flow_executions execution ON execution.tenant_id = claimed.tenant_id AND execution.id = claimed.execution_id;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.finish_flow_social_delivery(target_delivery_id uuid, delivered boolean,
  target_external_message_ids text[], completed_part_count integer, target_safe_error_code text DEFAULT NULL,
  dead_letter boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE changed integer; final_dead_letter boolean;
BEGIN
  IF session_user <> 'djay_worker' OR current_setting('app.service', true) IS DISTINCT FROM 'flow_social_worker'
    OR completed_part_count < 0 THEN RAISE EXCEPTION 'Flow social worker context required'; END IF;
  SELECT attempt_count >= 10 OR dead_letter INTO final_dead_letter FROM tenancy.flow_social_deliveries
    WHERE id = target_delivery_id AND status = 'processing';
  UPDATE tenancy.flow_social_deliveries SET
    delivered_part_count = delivered_part_count + completed_part_count,
    external_message_ids = external_message_ids || COALESCE(target_external_message_ids, '{}'),
    status = CASE WHEN delivered THEN 'succeeded' WHEN final_dead_letter THEN 'dead_letter' ELSE 'failed' END,
    locked_at = NULL, completed_at = CASE WHEN delivered OR final_dead_letter THEN now() ELSE NULL END,
    available_at = CASE WHEN delivered OR final_dead_letter THEN available_at ELSE now() + make_interval(secs => LEAST(3600, 30 * (2 ^ LEAST(attempt_count, 7)))) END,
    safe_error_code = CASE WHEN delivered THEN NULL ELSE left(COALESCE(target_safe_error_code, 'channel_delivery_failed'), 100) END
  WHERE id = target_delivery_id AND status = 'processing';
  GET DIAGNOSTICS changed = ROW_COUNT; RETURN changed = 1;
END
$$;

REVOKE ALL ON FUNCTION tenancy.commit_flow_social_turn(uuid, uuid, bytea, uuid, integer, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.apply_flow_social_control(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.claim_flow_social_delivery(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.finish_flow_social_delivery(uuid, boolean, text[], integer, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.commit_flow_social_turn(uuid, uuid, bytea, uuid, integer, jsonb, jsonb, jsonb) TO djay_worker;
GRANT EXECUTE ON FUNCTION tenancy.apply_flow_social_control(uuid) TO djay_worker;
GRANT EXECUTE ON FUNCTION tenancy.claim_flow_social_delivery(timestamptz, timestamptz) TO djay_worker;
GRANT EXECUTE ON FUNCTION tenancy.finish_flow_social_delivery(uuid, boolean, text[], integer, text, boolean) TO djay_worker;
