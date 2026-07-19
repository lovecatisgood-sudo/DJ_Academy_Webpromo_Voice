CREATE OR REPLACE FUNCTION tenancy.claim_flow_social_inbound(claim_time timestamptz, stale_before timestamptz)
RETURNS TABLE (outbox_id uuid, receipt_id uuid, tenant_id uuid, connection_id uuid, channel text,
  event_type text, subject_hash bytea, normalized_json jsonb, credential_ciphertext text,
  attempt_count integer, processing_allowed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy, catalog AS $$
BEGIN
  IF session_user <> 'djay_worker' OR current_setting('app.service', true) IS DISTINCT FROM 'flow_social_worker' THEN
    RAISE EXCEPTION 'Flow social worker context required'; END IF;
  RETURN QUERY WITH candidate AS (
    SELECT candidate_outbox.id FROM tenancy.outbox candidate_outbox
    WHERE candidate_outbox.topic = 'flowbot.social.inbound.received' AND candidate_outbox.available_at <= claim_time
      AND candidate_outbox.attempt_count < 10 AND (candidate_outbox.status IN ('pending', 'failed')
        OR (candidate_outbox.status = 'processing' AND candidate_outbox.locked_at < stale_before))
    ORDER BY candidate_outbox.available_at, candidate_outbox.created_at, candidate_outbox.id
    FOR UPDATE SKIP LOCKED LIMIT 1
  ), claimed AS (
    UPDATE tenancy.outbox target SET status = 'processing', locked_at = claim_time,
      attempt_count = target.attempt_count + 1, last_error_code = NULL FROM candidate
    WHERE target.id = candidate.id RETURNING target.*
  )
  SELECT claimed.id, receipt.id, claimed.tenant_id, connection.id, receipt.channel,
    receipt.event_type, receipt.subject_hash, receipt.normalized_json,
    CASE WHEN connection.status = 'active' THEN connection.credential_ciphertext ELSE NULL END,
    claimed.attempt_count,
    COALESCE(receipt.disposition = 'accepted' AND connection.status = 'active'
      AND deployment.status = 'active' AND bot.status = 'active' AND bot.current_published_version_id IS NOT NULL
      AND receipt.normalized_json->>'subjectCiphertext' IS NOT NULL
      AND EXISTS (SELECT 1 FROM tenancy.entitlement_snapshots snapshot
        JOIN tenancy.product_subscriptions subscription ON subscription.tenant_id = snapshot.tenant_id
          AND subscription.id = snapshot.subscription_id AND subscription.status IN ('active', 'trialing', 'scheduled_change')
        JOIN catalog.plan_versions version ON version.id = snapshot.plan_version_id
        JOIN catalog.plans plan ON plan.id = version.plan_id AND plan.plan_key = 'flowbot_premium'
        WHERE snapshot.tenant_id = claimed.tenant_id AND snapshot.product_key = 'flowbot'
          AND snapshot.access_mode = 'active' AND snapshot.resolved_json->'entitlements'->>'channel.social' = 'true'), false)
  FROM claimed
  JOIN tenancy.flow_social_receipts receipt ON receipt.tenant_id = claimed.tenant_id
    AND receipt.id = NULLIF(claimed.payload->>'receiptId', '')::uuid
  JOIN tenancy.flow_social_connections connection ON connection.tenant_id = receipt.tenant_id AND connection.id = receipt.connection_id
  JOIN tenancy.flow_deployments deployment ON deployment.tenant_id = connection.tenant_id AND deployment.id = connection.deployment_id
  JOIN tenancy.flow_bots bot ON bot.tenant_id = connection.tenant_id AND bot.id = connection.bot_id;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.prepare_flow_social_turn(
  target_outbox_id uuid, target_contact_id uuid, target_conversation_id uuid,
  target_execution_id uuid, target_reservation_id uuid, target_session_hash bytea,
  target_subject_ciphertext text
)
RETURNS TABLE (tenant_id uuid, deployment_id uuid, execution_id uuid, flow_version_id uuid,
  snapshot_json jsonb, state_json jsonb, authority_json jsonb, next_input_sequence integer,
  session_token_hash bytea, is_new boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy, catalog AS $$
DECLARE runtime record; subject_record record; quota record; initial_state jsonb; create_execution boolean;
BEGIN
  IF session_user <> 'djay_worker' OR current_setting('app.service', true) IS DISTINCT FROM 'flow_social_worker'
    OR octet_length(target_session_hash) <> 32 OR char_length(target_subject_ciphertext) NOT BETWEEN 32 AND 16384 THEN
    RAISE EXCEPTION 'Flow social worker context required'; END IF;
  SELECT outbox.tenant_id, receipt.id AS receipt_id, receipt.connection_id, receipt.channel,
    receipt.subject_hash, connection.deployment_id, connection.bot_id, bot.default_language,
    version.id AS version_id, version.snapshot_json, snapshot.id AS snapshot_id,
    snapshot.subscription_id, snapshot.resolved_json, plan.plan_key
  INTO runtime FROM tenancy.outbox outbox
  JOIN tenancy.flow_social_receipts receipt ON receipt.tenant_id = outbox.tenant_id
    AND receipt.id = NULLIF(outbox.payload->>'receiptId', '')::uuid
  JOIN tenancy.flow_social_connections connection ON connection.tenant_id = receipt.tenant_id
    AND connection.id = receipt.connection_id AND connection.status = 'active'
  JOIN tenancy.flow_deployments deployment ON deployment.tenant_id = connection.tenant_id
    AND deployment.id = connection.deployment_id AND deployment.status = 'active'
  JOIN tenancy.flow_bots bot ON bot.tenant_id = connection.tenant_id AND bot.id = connection.bot_id AND bot.status = 'active'
  JOIN tenancy.flow_versions version ON version.tenant_id = bot.tenant_id
    AND version.id = bot.current_published_version_id AND version.status = 'published'
  JOIN LATERAL (SELECT candidate.* FROM tenancy.entitlement_snapshots candidate
    JOIN tenancy.product_subscriptions subscription ON subscription.tenant_id = candidate.tenant_id
      AND subscription.id = candidate.subscription_id AND subscription.status IN ('active', 'trialing', 'scheduled_change')
    WHERE candidate.tenant_id = connection.tenant_id AND candidate.product_key = 'flowbot'
      AND candidate.access_mode = 'active' AND candidate.resolved_json->'entitlements'->>'channel.social' = 'true'
      AND candidate.resolved_json->'entitlements'->>'ai.enabled' = 'false'
    ORDER BY candidate.created_at DESC, candidate.id DESC LIMIT 1) snapshot ON true
  JOIN catalog.plan_versions plan_version ON plan_version.id = snapshot.plan_version_id
  JOIN catalog.plans plan ON plan.id = plan_version.plan_id AND plan.plan_key = 'flowbot_premium'
  WHERE outbox.id = target_outbox_id AND outbox.topic = 'flowbot.social.inbound.received'
    AND outbox.status = 'processing' AND receipt.event_type = 'inbound.message'
    AND receipt.disposition = 'accepted' LIMIT 1;
  IF runtime IS NULL THEN RAISE EXCEPTION 'flow_social_turn_not_available'; END IF;
  SELECT subject.* INTO subject_record FROM tenancy.flow_social_subjects subject
    WHERE subject.tenant_id = runtime.tenant_id AND subject.connection_id = runtime.connection_id
      AND subject.subject_hash = runtime.subject_hash FOR UPDATE;
  create_execution := subject_record IS NULL OR NOT EXISTS (
    SELECT 1 FROM tenancy.flow_executions execution WHERE execution.tenant_id = runtime.tenant_id
      AND execution.id = subject_record.execution_id AND execution.status NOT IN ('completed', 'failed', 'expired')
      AND execution.expires_at > now());
  IF subject_record IS NOT NULL AND subject_record.status <> 'active' THEN RAISE EXCEPTION 'flow_social_subject_not_active'; END IF;
  IF create_execution THEN
    SELECT account.id, account.reserved_quantity, account.settled_quantity, account.safety_cap_quantity
    INTO quota FROM tenancy.quota_accounts account WHERE account.tenant_id = runtime.tenant_id
      AND account.subscription_id = runtime.subscription_id AND account.product_key = 'flowbot'
      AND account.customer_unit = 'flow_execution' AND now() >= account.period_start AND now() < account.period_end
    ORDER BY account.period_start DESC LIMIT 1 FOR UPDATE;
    IF quota IS NULL THEN RAISE EXCEPTION 'flowbot_quota_unavailable'; END IF;
    IF quota.safety_cap_quantity IS NOT NULL AND quota.reserved_quantity + quota.settled_quantity + 1 > quota.safety_cap_quantity THEN
      RAISE EXCEPTION 'flowbot_safety_cap'; END IF;
    IF subject_record IS NULL THEN
      INSERT INTO tenancy.contacts (id, tenant_id, display_name, locale) VALUES (target_contact_id, runtime.tenant_id,
        CASE runtime.channel WHEN 'line' THEN 'LINE visitor' ELSE 'Messenger visitor' END, runtime.default_language);
    ELSE target_contact_id := subject_record.contact_id; END IF;
    INSERT INTO tenancy.conversations (id, tenant_id, contact_id, product_key, public_plan_key,
      entitlement_snapshot_id, channel_kind, automation_mode) VALUES (target_conversation_id, runtime.tenant_id,
      target_contact_id, 'flowbot', runtime.plan_key, runtime.snapshot_id, runtime.channel, 'flowbot');
    UPDATE tenancy.quota_accounts account
    SET reserved_quantity = account.reserved_quantity + 1, updated_at = now()
    WHERE account.tenant_id = runtime.tenant_id AND account.id = quota.id;
    INSERT INTO tenancy.usage_reservations (id, tenant_id, quota_account_id, entitlement_snapshot_id,
      operation_id, idempotency_key, requested_quantity, reserved_quantity, status)
    VALUES (target_reservation_id, runtime.tenant_id, quota.id, runtime.snapshot_id, target_execution_id::text,
      'flowbot:social:start:' || target_execution_id::text, 1, 1, 'reserved');
    INSERT INTO tenancy.usage_events (tenant_id, subscription_id, entitlement_snapshot_id, reservation_id,
      product_key, operation_id, event_type, customer_unit, customer_quantity, idempotency_key, occurred_at)
    VALUES (runtime.tenant_id, runtime.subscription_id, runtime.snapshot_id, target_reservation_id, 'flowbot',
      target_execution_id::text, 'reserved', 'flow_execution', 1,
      'flowbot:social:start:' || target_execution_id::text || ':reserved', now());
    initial_state := jsonb_build_object('currentNodeId', null, 'status', 'active', 'lang', runtime.default_language,
      'variables', '{}'::jsonb, 'subflowStack', '[]'::jsonb);
    INSERT INTO tenancy.flow_executions (id, tenant_id, deployment_id, bot_id, flow_version_id,
      conversation_id, entitlement_snapshot_id, usage_reservation_id, session_token_hash, state_json, expires_at)
    VALUES (target_execution_id, runtime.tenant_id, runtime.deployment_id, runtime.bot_id, runtime.version_id,
      target_conversation_id, runtime.snapshot_id, target_reservation_id, target_session_hash, initial_state, now() + interval '30 days');
    IF subject_record IS NULL THEN
      INSERT INTO tenancy.flow_social_subjects (tenant_id, connection_id, subject_hash,
        external_subject_ciphertext, contact_id, conversation_id, execution_id)
      VALUES (runtime.tenant_id, runtime.connection_id, runtime.subject_hash, target_subject_ciphertext,
        target_contact_id, target_conversation_id, target_execution_id);
    ELSE
      UPDATE tenancy.flow_social_subjects SET external_subject_ciphertext = target_subject_ciphertext,
        conversation_id = target_conversation_id, execution_id = target_execution_id,
        last_seen_at = now(), updated_at = now() WHERE id = subject_record.id;
    END IF;
  ELSE
    target_execution_id := subject_record.execution_id;
    UPDATE tenancy.flow_social_subjects SET external_subject_ciphertext = target_subject_ciphertext,
      last_seen_at = now(), updated_at = now() WHERE id = subject_record.id;
  END IF;
  RETURN QUERY SELECT runtime.tenant_id, runtime.deployment_id, execution.id, execution.flow_version_id,
    runtime.snapshot_json, execution.state_json,
    jsonb_build_object('planKey', runtime.plan_key, 'accessMode', runtime.resolved_json->>'accessMode',
      'entitlements', COALESCE(runtime.resolved_json->'entitlements', '{}'::jsonb),
      'limits', COALESCE(runtime.resolved_json->'limits', '{}'::jsonb)), execution.next_input_sequence,
    execution.session_token_hash, create_execution
  FROM tenancy.flow_executions execution WHERE execution.tenant_id = runtime.tenant_id AND execution.id = target_execution_id;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.finish_flow_social_inbound(target_outbox_id uuid, processed boolean,
  safe_error_code text DEFAULT NULL, dead_letter boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE changed integer; final_dead_letter boolean;
BEGIN
  IF session_user <> 'djay_worker' OR current_setting('app.service', true) IS DISTINCT FROM 'flow_social_worker' THEN
    RAISE EXCEPTION 'Flow social worker context required'; END IF;
  SELECT attempt_count >= 10 OR dead_letter INTO final_dead_letter FROM tenancy.outbox
    WHERE id = target_outbox_id AND topic = 'flowbot.social.inbound.received' AND status = 'processing';
  UPDATE tenancy.outbox SET status = CASE WHEN processed THEN 'sent' WHEN final_dead_letter THEN 'dead_letter' ELSE 'failed' END,
    available_at = CASE WHEN processed OR final_dead_letter THEN available_at ELSE now() + make_interval(secs => LEAST(3600, 30 * (2 ^ LEAST(attempt_count, 7)))) END,
    locked_at = NULL, processed_at = CASE WHEN processed OR final_dead_letter THEN now() ELSE NULL END,
    last_error_code = CASE WHEN processed THEN NULL ELSE left(COALESCE(safe_error_code, 'social_processing_failed'), 100) END
  WHERE id = target_outbox_id AND topic = 'flowbot.social.inbound.received' AND status = 'processing';
  GET DIAGNOSTICS changed = ROW_COUNT; RETURN changed = 1;
END
$$;

REVOKE ALL ON FUNCTION tenancy.claim_flow_social_inbound(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.prepare_flow_social_turn(uuid, uuid, uuid, uuid, uuid, bytea, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.finish_flow_social_inbound(uuid, boolean, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.claim_flow_social_inbound(timestamptz, timestamptz) TO djay_worker;
GRANT EXECUTE ON FUNCTION tenancy.prepare_flow_social_turn(uuid, uuid, uuid, uuid, uuid, bytea, text) TO djay_worker;
GRANT EXECUTE ON FUNCTION tenancy.finish_flow_social_inbound(uuid, boolean, text, boolean) TO djay_worker;
