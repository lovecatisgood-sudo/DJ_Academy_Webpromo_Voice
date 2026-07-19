CREATE OR REPLACE FUNCTION tenancy.ai_origin_allowed(allowed_origins text[], request_origin text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT request_origin IS NOT NULL
    AND request_origin ~ '^https?://[^/]+$'
    AND request_origin = ANY(allowed_origins)
$$;

CREATE OR REPLACE FUNCTION tenancy.ai_runtime_config(target_key_hash bytea, request_origin text)
RETURNS TABLE (agent_name text, default_language text, branding_removed boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, tenancy, catalog
AS $$
  SELECT agent.name, agent.default_language,
         agent.branding_removed AND COALESCE((snapshot.resolved_json->'entitlements'->>'branding.remove')::boolean, false)
  FROM tenancy.ai_deployments deployment
  JOIN tenancy.ai_agents agent ON agent.tenant_id = deployment.tenant_id AND agent.id = deployment.agent_id
  JOIN tenancy.ai_playbook_versions playbook
    ON playbook.tenant_id = agent.tenant_id AND playbook.id = agent.current_published_playbook_version_id
  JOIN LATERAL (
    SELECT candidate.*
    FROM tenancy.entitlement_snapshots candidate
    JOIN tenancy.product_subscriptions subscription
      ON subscription.tenant_id = candidate.tenant_id AND subscription.id = candidate.subscription_id
      AND subscription.status IN ('active', 'trialing', 'scheduled_change')
    WHERE candidate.tenant_id = agent.tenant_id AND candidate.product_key = 'ai_chat'
      AND candidate.access_mode = 'active'
      AND candidate.resolved_json->'entitlements'->>'ai.text' = 'true'
      AND candidate.resolved_json->'entitlements'->>'channel.web' = 'true'
    ORDER BY candidate.created_at DESC, candidate.id DESC LIMIT 1
  ) snapshot ON true
  WHERE deployment.deployment_key_hash = target_key_hash AND deployment.channel = 'web'
    AND deployment.status = 'active' AND agent.status = 'active' AND playbook.status = 'published'
    AND tenancy.ai_origin_allowed(deployment.allowed_origins, request_origin)
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION tenancy.start_ai_session(
  target_key_hash bytea,
  target_session_hash bytea,
  request_origin text,
  target_session_id uuid,
  target_contact_id uuid,
  target_conversation_id uuid,
  target_expires_at timestamptz,
  target_language text
)
RETURNS TABLE (session_id uuid, conversation_id uuid, greeting text, next_message_sequence integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy, catalog
AS $$
DECLARE resolved record; selected_greeting text;
BEGIN
  IF octet_length(target_key_hash) <> 32 OR octet_length(target_session_hash) <> 32
     OR target_language NOT IN ('th', 'en') OR target_expires_at <= now()
     OR target_expires_at > now() + interval '24 hours' THEN
    RAISE EXCEPTION 'invalid_ai_session_request';
  END IF;

  SELECT deployment.tenant_id, deployment.id AS deployment_id, agent.id AS agent_id,
         playbook.id AS playbook_version_id, playbook.playbook_json,
         snapshot.id AS snapshot_id, snapshot.subscription_id, plan.plan_key
  INTO resolved
  FROM tenancy.ai_deployments deployment
  JOIN tenancy.ai_agents agent ON agent.tenant_id = deployment.tenant_id AND agent.id = deployment.agent_id
  JOIN tenancy.ai_playbook_versions playbook
    ON playbook.tenant_id = agent.tenant_id AND playbook.id = agent.current_published_playbook_version_id
  JOIN LATERAL (
    SELECT candidate.*
    FROM tenancy.entitlement_snapshots candidate
    JOIN tenancy.product_subscriptions subscription
      ON subscription.tenant_id = candidate.tenant_id AND subscription.id = candidate.subscription_id
      AND subscription.status IN ('active', 'trialing', 'scheduled_change')
    WHERE candidate.tenant_id = agent.tenant_id AND candidate.product_key = 'ai_chat'
      AND candidate.access_mode = 'active'
      AND candidate.resolved_json->'entitlements'->>'ai.text' = 'true'
      AND candidate.resolved_json->'entitlements'->>'sales_core.enabled' = 'true'
      AND candidate.resolved_json->'entitlements'->>'channel.web' = 'true'
    ORDER BY candidate.created_at DESC, candidate.id DESC LIMIT 1
  ) snapshot ON true
  JOIN catalog.plan_versions plan_version ON plan_version.id = snapshot.plan_version_id
  JOIN catalog.plans plan ON plan.id = plan_version.plan_id AND plan.product_key = 'ai_chat'
  WHERE deployment.deployment_key_hash = target_key_hash AND deployment.channel = 'web'
    AND deployment.status = 'active' AND agent.status = 'active' AND playbook.status = 'published'
    AND tenancy.ai_origin_allowed(deployment.allowed_origins, request_origin)
  LIMIT 1;
  IF resolved IS NULL THEN RAISE EXCEPTION 'ai_deployment_not_available'; END IF;

  selected_greeting := COALESCE(resolved.playbook_json->'greeting'->>target_language,
    CASE target_language WHEN 'th' THEN 'สวัสดีครับ มีอะไรให้ช่วยได้บ้าง?' ELSE 'Hello. How can I help?' END);
  INSERT INTO tenancy.contacts (id, tenant_id, display_name, locale)
  VALUES (target_contact_id, resolved.tenant_id, 'Website visitor', target_language);
  INSERT INTO tenancy.conversations (
    id, tenant_id, contact_id, product_key, public_plan_key, entitlement_snapshot_id,
    channel_kind, automation_mode, next_sequence
  ) VALUES (
    target_conversation_id, resolved.tenant_id, target_contact_id, 'ai_chat', resolved.plan_key,
    resolved.snapshot_id, 'web', 'ai_text', 2
  );
  INSERT INTO tenancy.messages (tenant_id, conversation_id, sequence, actor_type, direction, content_json)
  VALUES (resolved.tenant_id, target_conversation_id, 1, 'ai', 'outbound',
    jsonb_build_object('type', 'text', 'content', jsonb_build_object('text', selected_greeting)));
  INSERT INTO tenancy.ai_sessions (
    id, tenant_id, deployment_id, agent_id, playbook_version_id, conversation_id,
    contact_id, entitlement_snapshot_id, session_token_hash, language, expires_at
  ) VALUES (
    target_session_id, resolved.tenant_id, resolved.deployment_id, resolved.agent_id,
    resolved.playbook_version_id, target_conversation_id, target_contact_id,
    resolved.snapshot_id, target_session_hash, target_language, target_expires_at
  );
  RETURN QUERY SELECT target_session_id, target_conversation_id, selected_greeting, 2;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.begin_ai_turn(
  target_key_hash bytea,
  target_session_hash bytea,
  request_origin text,
  target_input_id uuid,
  target_turn_id uuid,
  target_reservation_id uuid,
  customer_message text,
  customer_message_hash bytea
)
RETURNS TABLE (
  session_id uuid, tenant_id uuid, conversation_id uuid, playbook_json jsonb,
  language text, authority_json jsonb, turn_sequence integer, recent_messages jsonb, knowledge_chunks jsonb,
  replay_response_json jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy, catalog
AS $$
DECLARE runtime record; prior record; quota record; sequence_value integer;
BEGIN
  IF octet_length(target_key_hash) <> 32 OR octet_length(target_session_hash) <> 32
     OR octet_length(customer_message_hash) <> 32
     OR char_length(btrim(customer_message)) < 1 OR char_length(customer_message) > 2000 THEN
    RAISE EXCEPTION 'invalid_ai_turn_request';
  END IF;
  SELECT session.*, deployment.allowed_origins, deployment.status AS deployment_status,
         conversation.automation_mode, conversation.status AS conversation_status,
         snapshot.subscription_id, snapshot.resolved_json, playbook.playbook_json
  INTO runtime
  FROM tenancy.ai_sessions session
  JOIN tenancy.ai_deployments deployment
    ON deployment.tenant_id = session.tenant_id AND deployment.id = session.deployment_id
  JOIN tenancy.conversations conversation
    ON conversation.tenant_id = session.tenant_id AND conversation.id = session.conversation_id
  JOIN tenancy.entitlement_snapshots snapshot
    ON snapshot.tenant_id = session.tenant_id AND snapshot.id = session.entitlement_snapshot_id
  JOIN tenancy.product_subscriptions subscription
    ON subscription.tenant_id = snapshot.tenant_id AND subscription.id = snapshot.subscription_id
    AND subscription.status IN ('active', 'trialing', 'scheduled_change')
  JOIN tenancy.ai_playbook_versions playbook
    ON playbook.tenant_id = session.tenant_id AND playbook.id = session.playbook_version_id
  WHERE deployment.deployment_key_hash = target_key_hash
    AND session.session_token_hash = target_session_hash AND session.expires_at > now()
    AND deployment.channel = 'web' AND deployment.status = 'active'
    AND tenancy.ai_origin_allowed(deployment.allowed_origins, request_origin)
    AND snapshot.access_mode = 'active'
    AND snapshot.resolved_json->'entitlements'->>'ai.text' = 'true'
    AND snapshot.resolved_json->'entitlements'->>'channel.web' = 'true'
  LIMIT 1;
  IF runtime IS NULL THEN RAISE EXCEPTION 'ai_session_not_available'; END IF;

  SELECT turn.status, turn.public_response_json, turn.customer_message_sha256 INTO prior
  FROM tenancy.ai_turns turn
  WHERE turn.tenant_id = runtime.tenant_id AND turn.session_id = runtime.id AND turn.input_id = target_input_id;
  IF prior IS NOT NULL THEN
    IF prior.customer_message_sha256 IS DISTINCT FROM customer_message_hash THEN
      RAISE EXCEPTION 'ai_idempotency_conflict';
    END IF;
    RETURN QUERY SELECT runtime.id, runtime.tenant_id, runtime.conversation_id,
      NULL::jsonb, runtime.language, NULL::jsonb, 0, '[]'::jsonb, '[]'::jsonb,
      CASE prior.status WHEN 'completed' THEN prior.public_response_json ELSE NULL END;
    RETURN;
  END IF;

  PERFORM 1 FROM tenancy.ai_sessions session
  WHERE session.tenant_id = runtime.tenant_id AND session.id = runtime.id FOR UPDATE;
  SELECT conversation.next_sequence INTO sequence_value
  FROM tenancy.conversations conversation
  WHERE conversation.tenant_id = runtime.tenant_id AND conversation.id = runtime.conversation_id FOR UPDATE;
  IF runtime.status <> 'active' OR runtime.automation_mode <> 'ai_text' OR runtime.conversation_status <> 'open' THEN
    RAISE EXCEPTION 'ai_automation_suspended';
  END IF;

  SELECT account.id, account.reserved_quantity, account.settled_quantity, account.safety_cap_quantity
  INTO quota
  FROM tenancy.quota_accounts account
  WHERE account.tenant_id = runtime.tenant_id AND account.subscription_id = runtime.subscription_id
    AND account.product_key = 'ai_chat' AND account.customer_unit = 'ai_response'
    AND now() >= account.period_start AND now() < account.period_end
  ORDER BY account.period_start DESC LIMIT 1 FOR UPDATE;
  IF quota IS NULL THEN RAISE EXCEPTION 'ai_quota_unavailable'; END IF;
  IF quota.safety_cap_quantity IS NOT NULL
     AND quota.reserved_quantity + quota.settled_quantity + 1 > quota.safety_cap_quantity THEN
    RAISE EXCEPTION 'ai_safety_cap';
  END IF;

  UPDATE tenancy.quota_accounts account
  SET reserved_quantity = account.reserved_quantity + 1, updated_at = now()
  WHERE account.tenant_id = runtime.tenant_id AND account.id = quota.id;
  INSERT INTO tenancy.usage_reservations (
    id, tenant_id, quota_account_id, entitlement_snapshot_id, operation_id,
    idempotency_key, requested_quantity, reserved_quantity, status
  ) VALUES (
    target_reservation_id, runtime.tenant_id, quota.id, runtime.entitlement_snapshot_id,
    target_turn_id::text, 'ai:turn:' || target_input_id::text, 1, 1, 'reserved'
  );
  INSERT INTO tenancy.usage_events (
    tenant_id, subscription_id, entitlement_snapshot_id, reservation_id, product_key,
    operation_id, event_type, customer_unit, customer_quantity, idempotency_key, occurred_at
  ) VALUES (
    runtime.tenant_id, runtime.subscription_id, runtime.entitlement_snapshot_id,
    target_reservation_id, 'ai_chat', target_turn_id::text, 'reserved', 'ai_response', 1,
    'ai:turn:' || target_input_id::text || ':reserved', now()
  );
  INSERT INTO tenancy.messages (
    tenant_id, conversation_id, sequence, actor_type, direction, content_json, external_message_id
  ) VALUES (
    runtime.tenant_id, runtime.conversation_id, sequence_value, 'customer', 'inbound',
    jsonb_build_object('type', 'text', 'content', jsonb_build_object('text', btrim(customer_message))),
    target_input_id::text
  );
  UPDATE tenancy.conversations conversation
  SET next_sequence = conversation.next_sequence + 1, updated_at = now()
  WHERE conversation.tenant_id = runtime.tenant_id AND conversation.id = runtime.conversation_id;
  INSERT INTO tenancy.ai_turns (
    id, tenant_id, session_id, turn_sequence, input_id, usage_reservation_id, customer_message_sha256
  ) VALUES (
    target_turn_id, runtime.tenant_id, runtime.id, runtime.next_turn_sequence,
    target_input_id, target_reservation_id, customer_message_hash
  );
  UPDATE tenancy.ai_sessions session
  SET status = 'processing', next_turn_sequence = session.next_turn_sequence + 1, updated_at = now()
  WHERE session.tenant_id = runtime.tenant_id AND session.id = runtime.id;

  RETURN QUERY SELECT runtime.id, runtime.tenant_id, runtime.conversation_id,
    runtime.playbook_json, runtime.language,
    jsonb_build_object(
      'entitlements', COALESCE(runtime.resolved_json->'entitlements', '{}'::jsonb),
      'limits', COALESCE(runtime.resolved_json->'limits', '{}'::jsonb)
    ), runtime.next_turn_sequence,
    COALESCE((
      SELECT jsonb_agg(item ORDER BY (item->>'sequence')::integer)
      FROM (
        SELECT jsonb_build_object(
          'sequence', message.sequence,
          'role', CASE message.actor_type WHEN 'customer' THEN 'user' ELSE 'assistant' END,
          'content', message.content_json->'content'->>'text'
        ) AS item
        FROM tenancy.messages message
        WHERE message.tenant_id = runtime.tenant_id AND message.conversation_id = runtime.conversation_id
          AND message.actor_type IN ('customer', 'ai')
        ORDER BY message.sequence DESC LIMIT 19
      ) history
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'sourceRevisionId', chunk.source_revision_id, 'chunkId', chunk.id, 'content', chunk.content_text
      ) ORDER BY chunk.source_revision_id, chunk.sequence)
      FROM tenancy.ai_playbook_knowledge pin
      JOIN tenancy.knowledge_chunks chunk
        ON chunk.tenant_id = pin.tenant_id AND chunk.source_revision_id = pin.source_revision_id
      WHERE pin.tenant_id = runtime.tenant_id AND pin.playbook_version_id = runtime.playbook_version_id
    ), '[]'::jsonb), NULL::jsonb;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.commit_ai_turn(
  target_key_hash bytea,
  target_session_hash bytea,
  request_origin text,
  target_input_id uuid,
  structured_output jsonb,
  public_response jsonb,
  native_input_units bigint,
  native_output_units bigint,
  native_cached_units bigint DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy, operations
AS $$
DECLARE runtime record; turn_record record; action jsonb; action_type text; action_index integer := 0;
  lead_action jsonb; target_lead_id uuid; action_id uuid; appointment_id uuid; ai_message_id uuid;
  option jsonb; option_index integer; final_status text := 'active'; profile_id uuid;
BEGIN
  IF structured_output->>'schemaVersion' <> 'sales-core.v1'
     OR structured_output->>'customerResponse' IS NULL
     OR public_response->>'text' IS DISTINCT FROM structured_output->>'customerResponse'
     OR native_input_units < 0 OR native_output_units < 0 OR native_cached_units < 0 THEN
    RAISE EXCEPTION 'invalid_ai_structured_output';
  END IF;
  SELECT session.*, deployment.allowed_origins, conversation.automation_mode,
         conversation.status AS conversation_status, playbook.playbook_json, snapshot.resolved_json,
         snapshot.subscription_id
  INTO runtime
  FROM tenancy.ai_sessions session
  JOIN tenancy.ai_deployments deployment
    ON deployment.tenant_id = session.tenant_id AND deployment.id = session.deployment_id
  JOIN tenancy.conversations conversation
    ON conversation.tenant_id = session.tenant_id AND conversation.id = session.conversation_id
  JOIN tenancy.ai_playbook_versions playbook
    ON playbook.tenant_id = session.tenant_id AND playbook.id = session.playbook_version_id
  JOIN tenancy.entitlement_snapshots snapshot
    ON snapshot.tenant_id = session.tenant_id AND snapshot.id = session.entitlement_snapshot_id
  WHERE deployment.deployment_key_hash = target_key_hash
    AND session.session_token_hash = target_session_hash AND session.expires_at > now()
    AND deployment.status = 'active' AND tenancy.ai_origin_allowed(deployment.allowed_origins, request_origin)
  LIMIT 1;
  IF runtime IS NULL THEN RAISE EXCEPTION 'ai_session_not_available'; END IF;
  SELECT turn.* INTO turn_record FROM tenancy.ai_turns turn
  WHERE turn.tenant_id = runtime.tenant_id AND turn.session_id = runtime.id AND turn.input_id = target_input_id
  FOR UPDATE;
  IF turn_record IS NULL THEN RAISE EXCEPTION 'ai_turn_not_found'; END IF;
  IF turn_record.status = 'completed' THEN RETURN turn_record.public_response_json; END IF;
  IF turn_record.status <> 'processing' THEN RAISE EXCEPTION 'ai_turn_not_committable'; END IF;

  IF runtime.automation_mode <> 'ai_text' OR runtime.conversation_status <> 'open' THEN
    UPDATE tenancy.ai_turns SET status = 'failed', safe_error_code = 'handover_active', completed_at = now()
    WHERE tenant_id = runtime.tenant_id AND id = turn_record.id;
    UPDATE tenancy.ai_sessions SET status = 'handover', updated_at = now()
    WHERE tenant_id = runtime.tenant_id AND id = runtime.id;
    UPDATE tenancy.quota_accounts account SET reserved_quantity = account.reserved_quantity - 1, updated_at = now()
    FROM tenancy.usage_reservations reservation
    WHERE reservation.tenant_id = runtime.tenant_id AND reservation.id = turn_record.usage_reservation_id
      AND reservation.status = 'reserved' AND account.tenant_id = reservation.tenant_id AND account.id = reservation.quota_account_id;
    UPDATE tenancy.usage_reservations SET status = 'released', settled_quantity = 0, settled_at = now(), reason_code = 'handover_active'
    WHERE tenant_id = runtime.tenant_id AND id = turn_record.usage_reservation_id AND status = 'reserved';
    GET DIAGNOSTICS action_index = ROW_COUNT;
    IF action_index = 1 THEN
      INSERT INTO tenancy.usage_events (
        tenant_id, subscription_id, entitlement_snapshot_id, reservation_id, product_key,
        operation_id, event_type, customer_unit, customer_quantity, idempotency_key, occurred_at
      ) VALUES (
        runtime.tenant_id, runtime.subscription_id, runtime.entitlement_snapshot_id,
        turn_record.usage_reservation_id, 'ai_chat', turn_record.id::text, 'released', 'ai_response', 0,
        'ai:turn:' || target_input_id::text || ':released', now()
      ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
    END IF;
    RETURN jsonb_build_object('status', 'handover');
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(structured_output->'proposedActions', '[]'::jsonb)) item
    WHERE item->>'type' NOT IN (
      'lead.capture', 'sales_fact.record', 'appointment.request', 'follow_up.create',
      'handover.request', 'merchant_email.send'
    )
  ) THEN RAISE EXCEPTION 'ai_action_not_allowed'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(structured_output->'proposedActions', '[]'::jsonb)) item
    WHERE item->>'type' IN ('sales_fact.record', 'appointment.request', 'follow_up.create', 'merchant_email.send')
  ) AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(structured_output->'proposedActions', '[]'::jsonb)) item
    WHERE item->>'type' = 'lead.capture'
  ) THEN RAISE EXCEPTION 'ai_lead_action_required'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(structured_output->'proposedActions', '[]'::jsonb)) item
      WHERE item->>'type' IN ('lead.capture', 'sales_fact.record', 'follow_up.create'))
     AND runtime.resolved_json->'entitlements'->>'lead_capture.enabled' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'ai_action_not_entitled';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(structured_output->'proposedActions', '[]'::jsonb)) item
      WHERE item->>'type' = 'appointment.request')
     AND runtime.resolved_json->'entitlements'->>'appointment_request.enabled' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'ai_action_not_entitled';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(structured_output->'proposedActions', '[]'::jsonb)) item
      WHERE item->>'type' = 'merchant_email.send')
     AND runtime.resolved_json->'entitlements'->>'sales_email_action.enabled' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'ai_action_not_entitled';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(structured_output->'proposedActions', '[]'::jsonb)) item
      WHERE item->>'type' = 'handover.request')
     AND runtime.resolved_json->'entitlements'->>'human_handover.enabled' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'ai_action_not_entitled';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(structured_output->'proposedActions', '[]'::jsonb)) item
      WHERE item->>'type' = 'merchant_email.send') THEN
    profile_id := NULLIF(runtime.playbook_json->>'notificationProfileId', '')::uuid;
    IF profile_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM tenancy.notification_profiles profile
      WHERE profile.tenant_id = runtime.tenant_id AND profile.id = profile_id
        AND profile.status = 'active' AND 'ai_chat.lead_qualified' = ANY(profile.allowed_template_keys)
    ) THEN RAISE EXCEPTION 'ai_notification_profile_unavailable'; END IF;
  END IF;

  SELECT value INTO lead_action FROM jsonb_array_elements(COALESCE(structured_output->'proposedActions', '[]'::jsonb))
  WHERE value->>'type' = 'lead.capture' LIMIT 1;
  IF lead_action IS NOT NULL THEN
    SELECT conversation.lead_id INTO target_lead_id FROM tenancy.conversations conversation
    WHERE conversation.tenant_id = runtime.tenant_id AND conversation.id = runtime.conversation_id FOR UPDATE;
    IF target_lead_id IS NULL THEN
      target_lead_id := gen_random_uuid();
      UPDATE tenancy.contacts SET display_name = left(lead_action->>'name', 200), updated_at = now()
      WHERE tenant_id = runtime.tenant_id AND id = runtime.contact_id;
      INSERT INTO tenancy.leads (id, tenant_id, contact_id, title, source)
      VALUES (target_lead_id, runtime.tenant_id, runtime.contact_id, 'AI website lead', 'ai_chat_web');
      INSERT INTO tenancy.lead_status_history (tenant_id, lead_id, from_status, to_status, source_action, request_id)
      VALUES (runtime.tenant_id, target_lead_id, NULL, 'new', 'ai_chat.lead.capture', target_input_id::text);
      UPDATE tenancy.conversations SET lead_id = target_lead_id
      WHERE tenant_id = runtime.tenant_id AND id = runtime.conversation_id;
    END IF;
    IF NULLIF(lower(btrim(lead_action->>'email')), '') IS NOT NULL THEN
      INSERT INTO tenancy.contact_identities (tenant_id, contact_id, identity_kind, normalized_value)
      VALUES (runtime.tenant_id, runtime.contact_id, 'email', lower(btrim(lead_action->>'email')))
      ON CONFLICT DO NOTHING;
    END IF;
    IF NULLIF(btrim(lead_action->>'phone'), '') IS NOT NULL THEN
      INSERT INTO tenancy.contact_identities (tenant_id, contact_id, identity_kind, normalized_value)
      VALUES (runtime.tenant_id, runtime.contact_id, 'phone', btrim(lead_action->>'phone'))
      ON CONFLICT DO NOTHING;
    END IF;
    action_id := gen_random_uuid();
    INSERT INTO tenancy.action_requests (id, tenant_id, conversation_id, entitlement_snapshot_id, action_type, input_json, idempotency_key, status, completed_at)
    VALUES (action_id, runtime.tenant_id, runtime.conversation_id, runtime.entitlement_snapshot_id,
      'lead.create', lead_action, 'ai:' || turn_record.id::text || ':lead', 'succeeded', now());
    INSERT INTO tenancy.action_results (tenant_id, action_request_id, success, result_json)
    VALUES (runtime.tenant_id, action_id, true, jsonb_build_object('leadId', target_lead_id));
  ELSE
    SELECT conversation.lead_id INTO target_lead_id FROM tenancy.conversations conversation
    WHERE conversation.tenant_id = runtime.tenant_id AND conversation.id = runtime.conversation_id;
  END IF;

  FOR action IN SELECT value FROM jsonb_array_elements(COALESCE(structured_output->'proposedActions', '[]'::jsonb)) LOOP
    action_type := action->>'type'; action_index := action_index + 1;
    IF action_type = 'lead.capture' THEN CONTINUE; END IF;
    action_id := gen_random_uuid();
    IF action_type = 'sales_fact.record' AND target_lead_id IS NOT NULL THEN
      INSERT INTO tenancy.action_requests (id, tenant_id, conversation_id, entitlement_snapshot_id, action_type, input_json, idempotency_key, status, completed_at)
      VALUES (action_id, runtime.tenant_id, runtime.conversation_id, runtime.entitlement_snapshot_id,
        'sales_fact.record', action, 'ai:' || turn_record.id::text || ':' || action_index, 'succeeded', now());
      INSERT INTO tenancy.sales_facts (tenant_id, lead_id, fact_type, value_json, confidence)
      VALUES (runtime.tenant_id, target_lead_id, action->>'factType', jsonb_build_object('value', action->>'value'), 'customer_stated');
      INSERT INTO tenancy.action_results (tenant_id, action_request_id, success, result_json)
      VALUES (runtime.tenant_id, action_id, true, jsonb_build_object('recorded', true));
    ELSIF action_type = 'appointment.request' AND target_lead_id IS NOT NULL THEN
      appointment_id := gen_random_uuid();
      INSERT INTO tenancy.action_requests (id, tenant_id, conversation_id, entitlement_snapshot_id, action_type, input_json, idempotency_key, status, completed_at)
      VALUES (action_id, runtime.tenant_id, runtime.conversation_id, runtime.entitlement_snapshot_id,
        'appointment.request', action, 'ai:' || turn_record.id::text || ':' || action_index, 'succeeded', now());
      INSERT INTO tenancy.appointment_requests (id, tenant_id, lead_id, conversation_id, status, timezone, idempotency_key)
      VALUES (appointment_id, runtime.tenant_id, target_lead_id, runtime.conversation_id,
        'requested', action->>'timezone', 'ai:' || turn_record.id::text || ':appointment');
      option_index := 0;
      FOR option IN SELECT value FROM jsonb_array_elements(action->'options') LOOP
        option_index := option_index + 1;
        INSERT INTO tenancy.appointment_time_options (tenant_id, appointment_request_id, start_at, end_at, preference_order, source)
        VALUES (runtime.tenant_id, appointment_id, (option->>'startAt')::timestamptz,
          (option->>'endAt')::timestamptz, option_index, 'customer_request');
      END LOOP;
      INSERT INTO tenancy.action_results (tenant_id, action_request_id, success, result_json)
      VALUES (runtime.tenant_id, action_id, true, jsonb_build_object('appointmentRequestId', appointment_id, 'status', 'requested'));
    ELSIF action_type = 'follow_up.create' AND target_lead_id IS NOT NULL THEN
      INSERT INTO tenancy.action_requests (id, tenant_id, conversation_id, entitlement_snapshot_id, action_type, input_json, idempotency_key, status, completed_at)
      VALUES (action_id, runtime.tenant_id, runtime.conversation_id, runtime.entitlement_snapshot_id,
        'follow_up.create', action, 'ai:' || turn_record.id::text || ':' || action_index, 'succeeded', now());
      INSERT INTO tenancy.follow_up_tasks (tenant_id, lead_id, note, due_at)
      VALUES (runtime.tenant_id, target_lead_id, action->>'note', (action->>'dueAt')::timestamptz);
      INSERT INTO tenancy.action_results (tenant_id, action_request_id, success, result_json)
      VALUES (runtime.tenant_id, action_id, true, jsonb_build_object('created', true));
    ELSIF action_type = 'handover.request' THEN
      INSERT INTO tenancy.action_requests (id, tenant_id, conversation_id, entitlement_snapshot_id, action_type, input_json, idempotency_key, status, completed_at)
      VALUES (action_id, runtime.tenant_id, runtime.conversation_id, runtime.entitlement_snapshot_id,
        'handover.request', action, 'ai:' || turn_record.id::text || ':' || action_index, 'succeeded', now());
      UPDATE tenancy.conversations SET automation_mode = 'human', updated_at = now()
      WHERE tenant_id = runtime.tenant_id AND id = runtime.conversation_id;
      INSERT INTO tenancy.conversation_transitions (tenant_id, conversation_id, from_mode, to_mode, reason, context_json, request_id)
      VALUES (runtime.tenant_id, runtime.conversation_id, 'ai_text', 'human', action->>'reason',
        jsonb_build_object('summary', action->>'summary'), target_input_id::text);
      INSERT INTO tenancy.handover_events (tenant_id, conversation_id, event_type, reason, summary, idempotency_key)
      VALUES (runtime.tenant_id, runtime.conversation_id, 'requested', action->>'reason', action->>'summary',
        'ai:' || turn_record.id::text || ':handover');
      INSERT INTO tenancy.action_results (tenant_id, action_request_id, success, result_json)
      VALUES (runtime.tenant_id, action_id, true, jsonb_build_object('status', 'requested'));
      final_status := 'handover';
    ELSIF action_type = 'merchant_email.send' AND target_lead_id IS NOT NULL THEN
      profile_id := NULLIF(runtime.playbook_json->>'notificationProfileId', '')::uuid;
      IF profile_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM tenancy.notification_profiles profile
        WHERE profile.tenant_id = runtime.tenant_id AND profile.id = profile_id
          AND profile.status = 'active' AND 'ai_chat.lead_qualified' = ANY(profile.allowed_template_keys)
      ) THEN
        INSERT INTO tenancy.action_requests (id, tenant_id, conversation_id, entitlement_snapshot_id, action_type, input_json, idempotency_key, status, completed_at)
        VALUES (action_id, runtime.tenant_id, runtime.conversation_id, runtime.entitlement_snapshot_id,
          'merchant_email.send', action, 'ai:' || turn_record.id::text || ':' || action_index, 'succeeded', now());
        INSERT INTO tenancy.outbox (tenant_id, topic, payload, idempotency_key)
        VALUES (runtime.tenant_id, 'ai_chat.merchant_email.requested', jsonb_build_object(
          'notificationProfileId', profile_id, 'templateKey', 'ai_chat.lead_qualified',
          'leadId', target_lead_id, 'contactId', runtime.contact_id, 'turnId', turn_record.id
        ), 'ai:' || turn_record.id::text || ':email') ON CONFLICT DO NOTHING;
        INSERT INTO tenancy.action_results (tenant_id, action_request_id, success, result_json)
        VALUES (runtime.tenant_id, action_id, true, jsonb_build_object('queued', true));
      END IF;
    END IF;
  END LOOP;

  SELECT gen_random_uuid() INTO ai_message_id;
  INSERT INTO tenancy.messages (id, tenant_id, conversation_id, sequence, actor_type, direction, content_json)
  SELECT ai_message_id, runtime.tenant_id, runtime.conversation_id, conversation.next_sequence,
    'ai', 'outbound', jsonb_build_object('type', 'text', 'content', jsonb_build_object(
      'text', structured_output->>'customerResponse', 'quickReplies', COALESCE(public_response->'quickReplies', '[]'::jsonb),
      'actions', COALESCE(public_response->'actions', '[]'::jsonb)))
  FROM tenancy.conversations conversation
  WHERE conversation.tenant_id = runtime.tenant_id AND conversation.id = runtime.conversation_id;
  UPDATE tenancy.conversations SET next_sequence = next_sequence + 1, updated_at = now()
  WHERE tenant_id = runtime.tenant_id AND id = runtime.conversation_id;
  UPDATE tenancy.ai_turns SET status = 'completed', structured_output_json = structured_output,
    public_response_json = public_response, completed_at = now()
  WHERE tenant_id = runtime.tenant_id AND id = turn_record.id;
  UPDATE tenancy.ai_sessions SET status = final_status, updated_at = now()
  WHERE tenant_id = runtime.tenant_id AND id = runtime.id;
  INSERT INTO operations.ai_native_usage (tenant_id, turn_id, input_units, output_units, cached_units)
  VALUES (runtime.tenant_id, turn_record.id, native_input_units, native_output_units, native_cached_units)
  ON CONFLICT (tenant_id, turn_id) DO NOTHING;
  UPDATE tenancy.quota_accounts account
  SET reserved_quantity = account.reserved_quantity - 1, settled_quantity = account.settled_quantity + 1, updated_at = now()
  FROM tenancy.usage_reservations reservation
  WHERE reservation.tenant_id = runtime.tenant_id AND reservation.id = turn_record.usage_reservation_id
    AND reservation.status = 'reserved' AND account.tenant_id = reservation.tenant_id AND account.id = reservation.quota_account_id;
  UPDATE tenancy.usage_reservations SET status = 'settled', settled_quantity = 1, settled_at = now()
  WHERE tenant_id = runtime.tenant_id AND id = turn_record.usage_reservation_id AND status = 'reserved';
  INSERT INTO tenancy.usage_events (
    tenant_id, subscription_id, entitlement_snapshot_id, reservation_id, product_key,
    operation_id, event_type, customer_unit, customer_quantity, idempotency_key, occurred_at
  )
  SELECT runtime.tenant_id, account.subscription_id, runtime.entitlement_snapshot_id,
    turn_record.usage_reservation_id, 'ai_chat', turn_record.id::text, 'settled', 'ai_response', 1,
    'ai:turn:' || target_input_id::text || ':settled', now()
  FROM tenancy.usage_reservations reservation
  JOIN tenancy.quota_accounts account ON account.tenant_id = reservation.tenant_id AND account.id = reservation.quota_account_id
  WHERE reservation.tenant_id = runtime.tenant_id AND reservation.id = turn_record.usage_reservation_id
  ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
  RETURN public_response;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.fail_ai_turn(
  target_key_hash bytea, target_session_hash bytea, request_origin text,
  target_input_id uuid, safe_error_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
DECLARE runtime record; turn_record record; changed integer;
BEGIN
  SELECT session.*, deployment.allowed_origins, conversation.automation_mode INTO runtime
  FROM tenancy.ai_sessions session
  JOIN tenancy.ai_deployments deployment ON deployment.tenant_id = session.tenant_id AND deployment.id = session.deployment_id
  JOIN tenancy.conversations conversation ON conversation.tenant_id = session.tenant_id AND conversation.id = session.conversation_id
  WHERE deployment.deployment_key_hash = target_key_hash
    AND session.session_token_hash = target_session_hash AND session.expires_at > now()
    AND deployment.status = 'active' AND tenancy.ai_origin_allowed(deployment.allowed_origins, request_origin)
  LIMIT 1;
  IF runtime IS NULL THEN RETURN false; END IF;
  SELECT turn.* INTO turn_record FROM tenancy.ai_turns turn
  WHERE turn.tenant_id = runtime.tenant_id AND turn.session_id = runtime.id AND turn.input_id = target_input_id FOR UPDATE;
  IF turn_record IS NULL OR turn_record.status = 'completed' THEN RETURN false; END IF;
  IF turn_record.status = 'failed' THEN RETURN true; END IF;
  UPDATE tenancy.quota_accounts account SET reserved_quantity = account.reserved_quantity - 1, updated_at = now()
  FROM tenancy.usage_reservations reservation
  WHERE reservation.tenant_id = runtime.tenant_id AND reservation.id = turn_record.usage_reservation_id
    AND reservation.status = 'reserved' AND account.tenant_id = reservation.tenant_id AND account.id = reservation.quota_account_id;
  UPDATE tenancy.usage_reservations SET status = 'released', settled_quantity = 0, settled_at = now(),
    reason_code = left(COALESCE(safe_error_code, 'generation_failed'), 100)
  WHERE tenant_id = runtime.tenant_id AND id = turn_record.usage_reservation_id AND status = 'reserved';
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed = 1 THEN
    INSERT INTO tenancy.usage_events (
      tenant_id, subscription_id, entitlement_snapshot_id, reservation_id, product_key,
      operation_id, event_type, customer_unit, customer_quantity, idempotency_key, occurred_at
    )
    SELECT runtime.tenant_id, account.subscription_id, runtime.entitlement_snapshot_id,
      turn_record.usage_reservation_id, 'ai_chat', turn_record.id::text, 'released', 'ai_response', 0,
      'ai:turn:' || target_input_id::text || ':released', now()
    FROM tenancy.usage_reservations reservation
    JOIN tenancy.quota_accounts account ON account.tenant_id = reservation.tenant_id AND account.id = reservation.quota_account_id
    WHERE reservation.tenant_id = runtime.tenant_id AND reservation.id = turn_record.usage_reservation_id
    ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
  END IF;
  UPDATE tenancy.ai_turns SET status = 'failed', safe_error_code = left(COALESCE(safe_error_code, 'generation_failed'), 100), completed_at = now()
  WHERE tenant_id = runtime.tenant_id AND id = turn_record.id;
  UPDATE tenancy.ai_sessions SET status = CASE WHEN runtime.automation_mode = 'human' THEN 'handover' ELSE 'active' END, updated_at = now()
  WHERE tenant_id = runtime.tenant_id AND id = runtime.id;
  RETURN true;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.sync_ai_session(
  target_key_hash bytea, target_session_hash bytea, request_origin text, after_sequence integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
  SELECT jsonb_build_object(
    'status', CASE conversation.automation_mode WHEN 'human' THEN 'handover' ELSE session.status END,
    'lastMessageSequence', conversation.next_sequence - 1,
    'messages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'sequence', message.sequence,
        'message', jsonb_build_object('type', 'text', 'content', message.content_json->'content')
      ) ORDER BY message.sequence)
      FROM tenancy.messages message
      WHERE message.tenant_id = session.tenant_id AND message.conversation_id = session.conversation_id
        AND message.sequence > after_sequence AND message.direction = 'outbound'
        AND message.actor_type IN ('ai', 'human')
    ), '[]'::jsonb)
  )
  FROM tenancy.ai_sessions session
  JOIN tenancy.ai_deployments deployment ON deployment.tenant_id = session.tenant_id AND deployment.id = session.deployment_id
  JOIN tenancy.conversations conversation ON conversation.tenant_id = session.tenant_id AND conversation.id = session.conversation_id
  WHERE deployment.deployment_key_hash = target_key_hash AND session.session_token_hash = target_session_hash
    AND deployment.status = 'active' AND session.expires_at > now()
    AND after_sequence >= 0 AND tenancy.ai_origin_allowed(deployment.allowed_origins, request_origin)
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION tenancy.ai_origin_allowed(text[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.ai_runtime_config(bytea, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.start_ai_session(bytea, bytea, text, uuid, uuid, uuid, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.begin_ai_turn(bytea, bytea, text, uuid, uuid, uuid, text, bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.commit_ai_turn(bytea, bytea, text, uuid, jsonb, jsonb, bigint, bigint, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.fail_ai_turn(bytea, bytea, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.sync_ai_session(bytea, bytea, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.ai_runtime_config(bytea, text) TO djay_ai_runtime;
GRANT EXECUTE ON FUNCTION tenancy.start_ai_session(bytea, bytea, text, uuid, uuid, uuid, timestamptz, text) TO djay_ai_runtime;
GRANT EXECUTE ON FUNCTION tenancy.begin_ai_turn(bytea, bytea, text, uuid, uuid, uuid, text, bytea) TO djay_ai_runtime;
GRANT EXECUTE ON FUNCTION tenancy.commit_ai_turn(bytea, bytea, text, uuid, jsonb, jsonb, bigint, bigint, bigint) TO djay_ai_runtime;
GRANT EXECUTE ON FUNCTION tenancy.fail_ai_turn(bytea, bytea, text, uuid, text) TO djay_ai_runtime;
GRANT EXECUTE ON FUNCTION tenancy.sync_ai_session(bytea, bytea, text, integer) TO djay_ai_runtime;
