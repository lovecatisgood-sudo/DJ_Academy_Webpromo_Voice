ALTER TABLE tenancy.voice_deployments ADD COLUMN agent_id uuid;

DO $$
DECLARE deployment record; generated_agent_id uuid; generated_version_id uuid; generated_playbook jsonb;
BEGIN
  FOR deployment IN SELECT * FROM tenancy.voice_deployments LOOP
    generated_agent_id := gen_random_uuid(); generated_version_id := gen_random_uuid();
    generated_playbook := jsonb_build_object(
      'schemaVersion', 1, 'playbookVersionId', generated_version_id::text,
      'businessName', deployment.name, 'agentName', deployment.name,
      'languages', jsonb_build_array('th', 'en'), 'tone', 'Warm, concise, and professional',
      'salesGoal', 'Understand the customer need and offer an appropriate next step',
      'approvedClaims', '[]'::jsonb,
      'prohibitedClaims', jsonb_build_array('Unsupported guarantees', 'Unconfirmed availability'),
      'discoveryQuestions', jsonb_build_array('What are you trying to improve?', 'What is the biggest obstacle today?'),
      'ctaPolicy', jsonb_build_array('Offer a merchant-confirmed consultation when the customer is ready'),
      'requiredContactFields', jsonb_build_array('name', 'email'),
      'greeting', jsonb_build_object('th', deployment.greeting_th, 'en', deployment.greeting_en),
      'offlineMessage', jsonb_build_object('th', 'ทีมงานจะติดต่อกลับในเวลาทำการ', 'en', 'Our team will follow up during business hours.'),
      'timezone', 'Asia/Bangkok',
      'weeklyWindows', jsonb_build_array(
        jsonb_build_object('dayOfWeek', 1, 'startMinute', 540, 'endMinute', 1020),
        jsonb_build_object('dayOfWeek', 2, 'startMinute', 540, 'endMinute', 1020),
        jsonb_build_object('dayOfWeek', 3, 'startMinute', 540, 'endMinute', 1020),
        jsonb_build_object('dayOfWeek', 4, 'startMinute', 540, 'endMinute', 1020),
        jsonb_build_object('dayOfWeek', 5, 'startMinute', 540, 'endMinute', 1020)
      )
    );
    INSERT INTO tenancy.ai_agents (id, tenant_id, name, status, default_language, created_by_membership_id)
    VALUES (generated_agent_id, deployment.tenant_id, deployment.name, 'active', deployment.default_locale, deployment.created_by_membership_id);
    INSERT INTO tenancy.ai_playbook_versions (
      id, tenant_id, agent_id, version, status, playbook_json, playbook_sha256, published_by_membership_id
    ) VALUES (
      generated_version_id, deployment.tenant_id, generated_agent_id, 1, 'published', generated_playbook,
      digest(convert_to(generated_playbook::text, 'UTF8'), 'sha256'), deployment.created_by_membership_id
    );
    UPDATE tenancy.ai_agents SET current_published_playbook_version_id = generated_version_id
    WHERE tenant_id = deployment.tenant_id AND id = generated_agent_id;
    INSERT INTO tenancy.ai_playbook_drafts (
      tenant_id, agent_id, based_on_version_id, definition_json, updated_by_membership_id
    ) VALUES (
      deployment.tenant_id, generated_agent_id, generated_version_id, generated_playbook, deployment.created_by_membership_id
    );
    UPDATE tenancy.voice_deployments SET agent_id = generated_agent_id
    WHERE tenant_id = deployment.tenant_id AND id = deployment.id;
  END LOOP;
END
$$;

ALTER TABLE tenancy.voice_deployments ALTER COLUMN agent_id SET NOT NULL;
ALTER TABLE tenancy.voice_deployments ADD CONSTRAINT tenancy_voice_deployment_agent_fk
  FOREIGN KEY (tenant_id, agent_id) REFERENCES tenancy.ai_agents(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE tenancy.voice_deployments ADD CONSTRAINT tenancy_voice_deployment_agent_unique UNIQUE (tenant_id, id, agent_id);

ALTER TABLE tenancy.voice_sessions ADD COLUMN agent_id uuid;
ALTER TABLE tenancy.voice_sessions ADD COLUMN playbook_version_id uuid;
UPDATE tenancy.voice_sessions session SET
  agent_id = deployment.agent_id,
  playbook_version_id = agent.current_published_playbook_version_id
FROM tenancy.voice_deployments deployment
JOIN tenancy.ai_agents agent ON agent.tenant_id = deployment.tenant_id AND agent.id = deployment.agent_id
WHERE deployment.tenant_id = session.tenant_id AND deployment.id = session.deployment_id;
ALTER TABLE tenancy.voice_sessions ALTER COLUMN agent_id SET NOT NULL;
ALTER TABLE tenancy.voice_sessions ALTER COLUMN playbook_version_id SET NOT NULL;
ALTER TABLE tenancy.voice_sessions ADD CONSTRAINT tenancy_voice_session_deployment_agent_fk
  FOREIGN KEY (tenant_id, deployment_id, agent_id)
  REFERENCES tenancy.voice_deployments(tenant_id, id, agent_id) ON DELETE RESTRICT;
ALTER TABLE tenancy.voice_sessions ADD CONSTRAINT tenancy_voice_session_playbook_fk
  FOREIGN KEY (tenant_id, agent_id, playbook_version_id)
  REFERENCES tenancy.ai_playbook_versions(tenant_id, agent_id, id) ON DELETE RESTRICT;

CREATE TABLE tenancy.voice_turns (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  session_id uuid NOT NULL,
  turn_sequence integer NOT NULL CHECK (turn_sequence > 0),
  input_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  customer_message_sha256 bytea NOT NULL CHECK (octet_length(customer_message_sha256) = 32),
  structured_output_json jsonb,
  public_response_json jsonb,
  safe_error_code text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, session_id, input_id),
  UNIQUE (tenant_id, session_id, turn_sequence),
  FOREIGN KEY (tenant_id, session_id) REFERENCES tenancy.voice_sessions(tenant_id, id) ON DELETE RESTRICT,
  CHECK ((status = 'completed' AND structured_output_json IS NOT NULL AND public_response_json IS NOT NULL AND completed_at IS NOT NULL) OR status <> 'completed')
);

CREATE TABLE operations.voice_native_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  turn_id uuid NOT NULL,
  input_units bigint NOT NULL CHECK (input_units >= 0),
  output_units bigint NOT NULL CHECK (output_units >= 0),
  cached_units bigint NOT NULL DEFAULT 0 CHECK (cached_units >= 0),
  observed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, turn_id),
  FOREIGN KEY (tenant_id, turn_id) REFERENCES tenancy.voice_turns(tenant_id, id) ON DELETE RESTRICT
);

ALTER TABLE tenancy.voice_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.voice_turns FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.voice_turns
  USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
REVOKE ALL ON tenancy.voice_turns, operations.voice_native_usage FROM PUBLIC;
GRANT SELECT ON tenancy.voice_turns TO djay_runtime;

CREATE OR REPLACE FUNCTION tenancy.issue_voice_basic_grant(
  target_key_hash bytea, target_grant_hash bytea, request_origin text,
  target_session_id uuid, target_contact_id uuid, target_conversation_id uuid,
  target_expires_at timestamptz, target_locale text
)
RETURNS TABLE (
  session_id uuid, capability_profile text, public_label text, locale text,
  greeting text, automated_disclosure text, max_call_seconds integer,
  reconnect_window_seconds integer, expires_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy, catalog AS $$
DECLARE resolved record; selected_greeting text; selected_disclosure text;
BEGIN
  IF session_user <> 'djay_voice_runtime' THEN RAISE EXCEPTION 'voice_runtime_role_required'; END IF;
  IF octet_length(target_key_hash) <> 32 OR octet_length(target_grant_hash) <> 32
     OR target_locale NOT IN ('th', 'en') OR target_expires_at <= now()
     OR target_expires_at > now() + interval '5 minutes' THEN RAISE EXCEPTION 'invalid_voice_grant_request'; END IF;
  SELECT deployment.*, agent.current_published_playbook_version_id, snapshot.id AS snapshot_id, plan.plan_key
  INTO resolved
  FROM tenancy.voice_deployments deployment
  JOIN tenancy.ai_agents agent ON agent.tenant_id = deployment.tenant_id AND agent.id = deployment.agent_id
    AND agent.status = 'active' AND agent.current_published_playbook_version_id IS NOT NULL
  JOIN LATERAL (
    SELECT candidate.* FROM tenancy.entitlement_snapshots candidate
    JOIN tenancy.product_subscriptions subscription
      ON subscription.tenant_id = candidate.tenant_id AND subscription.id = candidate.subscription_id
      AND subscription.status IN ('active', 'trialing', 'scheduled_change')
    WHERE candidate.tenant_id = deployment.tenant_id AND candidate.product_key = 'voice'
      AND candidate.access_mode = 'active'
      AND candidate.resolved_json->'entitlements'->>'voice.enabled' = 'true'
      AND candidate.resolved_json->'entitlements'->>'voice.capability_profile' = 'voice_gen1'
    ORDER BY candidate.created_at DESC, candidate.id DESC LIMIT 1
  ) snapshot ON true
  JOIN catalog.plan_versions version ON version.id = snapshot.plan_version_id
  JOIN catalog.plans plan ON plan.id = version.plan_id AND plan.product_key = 'voice' AND plan.plan_key = 'voice_basic_gen1'
  WHERE deployment.deployment_key_hash = target_key_hash AND deployment.status = 'active'
    AND tenancy.ai_origin_allowed(deployment.allowed_origins, request_origin)
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'voice_deployment_not_available'; END IF;
  selected_greeting := CASE target_locale WHEN 'th' THEN resolved.greeting_th ELSE resolved.greeting_en END;
  selected_disclosure := CASE target_locale WHEN 'th' THEN resolved.automated_disclosure_th ELSE resolved.automated_disclosure_en END;
  INSERT INTO tenancy.contacts (id, tenant_id, display_name, locale)
  VALUES (target_contact_id, resolved.tenant_id, 'Voice visitor', target_locale);
  INSERT INTO tenancy.conversations (
    id, tenant_id, contact_id, product_key, public_plan_key, entitlement_snapshot_id, channel_kind, automation_mode
  ) VALUES (
    target_conversation_id, resolved.tenant_id, target_contact_id, 'voice', resolved.plan_key,
    resolved.snapshot_id, 'voice', 'voice'
  );
  INSERT INTO tenancy.voice_sessions (
    id, tenant_id, deployment_id, agent_id, playbook_version_id, contact_id, conversation_id,
    entitlement_snapshot_id, capability_profile, public_label, locale, grant_hash, grant_expires_at,
    max_call_seconds, reconnect_window_seconds
  ) VALUES (
    target_session_id, resolved.tenant_id, resolved.id, resolved.agent_id, resolved.current_published_playbook_version_id,
    target_contact_id, target_conversation_id, resolved.snapshot_id, 'voice_gen1', 'First-Generation Voice Engine',
    target_locale, target_grant_hash, target_expires_at, resolved.max_call_seconds, resolved.reconnect_window_seconds
  );
  RETURN QUERY SELECT target_session_id, 'voice_gen1'::text, 'First-Generation Voice Engine'::text,
    target_locale, selected_greeting, selected_disclosure, resolved.max_call_seconds,
    resolved.reconnect_window_seconds, target_expires_at;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.get_voice_media_context(target_session_id uuid, target_connection_id uuid)
RETURNS TABLE (greeting text, automated_disclosure text, agent_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
BEGIN
  IF session_user <> 'djay_voice_runtime' THEN RAISE EXCEPTION 'voice_runtime_role_required'; END IF;
  RETURN QUERY
  SELECT CASE session.locale WHEN 'th' THEN deployment.greeting_th ELSE deployment.greeting_en END,
         CASE session.locale WHEN 'th' THEN deployment.automated_disclosure_th ELSE deployment.automated_disclosure_en END,
         agent.name
  FROM tenancy.voice_sessions session
  JOIN tenancy.voice_session_connections connection
    ON connection.tenant_id = session.tenant_id AND connection.session_id = session.id
    AND connection.id = target_connection_id AND connection.status = 'connected'
  JOIN tenancy.voice_deployments deployment
    ON deployment.tenant_id = session.tenant_id AND deployment.id = session.deployment_id AND deployment.status = 'active'
  JOIN tenancy.ai_agents agent ON agent.tenant_id = session.tenant_id AND agent.id = session.agent_id
  WHERE session.id = target_session_id AND session.status = 'connected';
END
$$;

CREATE OR REPLACE FUNCTION tenancy.begin_voice_turn(
  target_session_id uuid, target_connection_id uuid, target_input_id uuid,
  target_turn_id uuid, customer_message text, customer_message_hash bytea
)
RETURNS TABLE (
  session_id uuid, tenant_id uuid, conversation_id uuid, playbook_json jsonb,
  language text, authority_json jsonb, turn_sequence integer, recent_messages jsonb,
  knowledge_chunks jsonb, replay_response_json jsonb
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE runtime record; prior record; sequence_value integer; next_turn integer;
BEGIN
  IF session_user <> 'djay_voice_runtime' THEN RAISE EXCEPTION 'voice_runtime_role_required'; END IF;
  IF octet_length(customer_message_hash) <> 32 OR char_length(btrim(customer_message)) < 1
     OR char_length(customer_message) > 2000 THEN RAISE EXCEPTION 'invalid_voice_turn_request'; END IF;
  SELECT session.*, conversation.automation_mode, conversation.status AS conversation_status,
         snapshot.resolved_json, playbook.playbook_json
  INTO runtime
  FROM tenancy.voice_sessions session
  JOIN tenancy.voice_session_connections connection
    ON connection.tenant_id = session.tenant_id AND connection.session_id = session.id
    AND connection.id = target_connection_id AND connection.status = 'connected'
  JOIN tenancy.conversations conversation
    ON conversation.tenant_id = session.tenant_id AND conversation.id = session.conversation_id
  JOIN tenancy.entitlement_snapshots snapshot
    ON snapshot.tenant_id = session.tenant_id AND snapshot.id = session.entitlement_snapshot_id
    AND snapshot.access_mode = 'active'
  JOIN tenancy.product_subscriptions subscription
    ON subscription.tenant_id = snapshot.tenant_id AND subscription.id = snapshot.subscription_id
    AND subscription.status IN ('active', 'trialing', 'scheduled_change')
  JOIN tenancy.ai_playbook_versions playbook
    ON playbook.tenant_id = session.tenant_id AND playbook.id = session.playbook_version_id
  WHERE session.id = target_session_id AND session.status = 'connected'
    AND snapshot.resolved_json->'entitlements'->>'voice.enabled' = 'true'
    AND snapshot.resolved_json->'entitlements'->>'sales_core.enabled' = 'true'
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'voice_turn_not_available'; END IF;
  SELECT turn.status, turn.public_response_json, turn.customer_message_sha256 INTO prior
  FROM tenancy.voice_turns turn
  WHERE turn.tenant_id = runtime.tenant_id AND turn.session_id = runtime.id AND turn.input_id = target_input_id;
  IF prior IS NOT NULL THEN
    IF prior.customer_message_sha256 IS DISTINCT FROM customer_message_hash THEN RAISE EXCEPTION 'voice_idempotency_conflict'; END IF;
    RETURN QUERY SELECT runtime.id, runtime.tenant_id, runtime.conversation_id, NULL::jsonb, runtime.locale,
      NULL::jsonb, 0, '[]'::jsonb, '[]'::jsonb,
      CASE prior.status WHEN 'completed' THEN prior.public_response_json ELSE NULL END;
    RETURN;
  END IF;
  PERFORM 1 FROM tenancy.voice_sessions session
  WHERE session.tenant_id = runtime.tenant_id AND session.id = runtime.id FOR UPDATE;
  SELECT conversation.next_sequence INTO sequence_value FROM tenancy.conversations conversation
  WHERE conversation.tenant_id = runtime.tenant_id AND conversation.id = runtime.conversation_id FOR UPDATE;
  IF runtime.automation_mode <> 'voice' OR runtime.conversation_status <> 'open' THEN RAISE EXCEPTION 'voice_automation_suspended'; END IF;
  IF EXISTS (SELECT 1 FROM tenancy.voice_turns turn WHERE turn.tenant_id = runtime.tenant_id
    AND turn.session_id = runtime.id AND turn.status = 'processing') THEN RAISE EXCEPTION 'voice_turn_busy'; END IF;
  SELECT COALESCE(max(turn.turn_sequence), 0)::integer + 1 INTO next_turn
  FROM tenancy.voice_turns turn WHERE turn.tenant_id = runtime.tenant_id AND turn.session_id = runtime.id;
  INSERT INTO tenancy.messages (tenant_id, conversation_id, sequence, actor_type, direction, content_json, external_message_id)
  VALUES (runtime.tenant_id, runtime.conversation_id, sequence_value, 'customer', 'inbound',
    jsonb_build_object('type', 'text', 'content', jsonb_build_object('text', btrim(customer_message))), target_input_id::text);
  UPDATE tenancy.conversations conversation SET next_sequence = conversation.next_sequence + 1, updated_at = now()
  WHERE conversation.tenant_id = runtime.tenant_id AND conversation.id = runtime.conversation_id;
  INSERT INTO tenancy.voice_turns (id, tenant_id, session_id, turn_sequence, input_id, customer_message_sha256)
  VALUES (target_turn_id, runtime.tenant_id, runtime.id, next_turn, target_input_id, customer_message_hash);
  RETURN QUERY SELECT runtime.id, runtime.tenant_id, runtime.conversation_id, runtime.playbook_json, runtime.locale,
    jsonb_build_object('entitlements', runtime.resolved_json->'entitlements', 'limits', runtime.resolved_json->'limits'),
    next_turn,
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'sequence', message.sequence,
      'role', CASE message.actor_type WHEN 'customer' THEN 'user' ELSE 'assistant' END,
      'content', message.content_json->'content'->>'text'
    ) ORDER BY message.sequence) FROM (
      SELECT item.* FROM tenancy.messages item
      WHERE item.tenant_id = runtime.tenant_id AND item.conversation_id = runtime.conversation_id
        AND item.content_json->>'type' = 'text' ORDER BY item.sequence DESC LIMIT 19
    ) message), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'sourceRevisionId', chunk.source_revision_id, 'chunkId', chunk.id, 'content', chunk.content_text
    ) ORDER BY chunk.source_revision_id, chunk.sequence)
    FROM tenancy.ai_playbook_knowledge pin JOIN tenancy.knowledge_chunks chunk
      ON chunk.tenant_id = pin.tenant_id AND chunk.source_revision_id = pin.source_revision_id
    WHERE pin.tenant_id = runtime.tenant_id AND pin.playbook_version_id = runtime.playbook_version_id), '[]'::jsonb),
    NULL::jsonb;
END
$$;

REVOKE ALL ON FUNCTION tenancy.get_voice_media_context(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.begin_voice_turn(uuid, uuid, uuid, uuid, text, bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.get_voice_media_context(uuid, uuid) TO djay_voice_runtime;
GRANT EXECUTE ON FUNCTION tenancy.begin_voice_turn(uuid, uuid, uuid, uuid, text, bytea) TO djay_voice_runtime;

CREATE OR REPLACE FUNCTION tenancy.commit_voice_turn(
  target_session_id uuid, target_connection_id uuid, target_input_id uuid,
  structured_output jsonb, public_response jsonb,
  native_input_units bigint, native_output_units bigint, native_cached_units bigint DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy, operations AS $$
DECLARE runtime record; turn_record record; action jsonb; action_type text; action_index integer := 0;
  lead_action jsonb; target_lead_id uuid; action_id uuid; appointment_id uuid; voice_message_id uuid;
  option jsonb; option_index integer; profile_id uuid; action_statuses jsonb := '[]'::jsonb;
  terminal_reason text := NULL;
BEGIN
  IF session_user <> 'djay_voice_runtime' THEN RAISE EXCEPTION 'voice_runtime_role_required'; END IF;
  IF structured_output->>'schemaVersion' <> 'sales-core.v1'
     OR structured_output->>'customerResponse' IS NULL
     OR public_response->>'text' IS DISTINCT FROM structured_output->>'customerResponse'
     OR native_input_units < 0 OR native_output_units < 0 OR native_cached_units < 0 THEN
    RAISE EXCEPTION 'invalid_voice_structured_output';
  END IF;
  SELECT session.*, conversation.automation_mode, conversation.status AS conversation_status,
         playbook.playbook_json, snapshot.resolved_json
  INTO runtime
  FROM tenancy.voice_sessions session
  JOIN tenancy.voice_session_connections connection
    ON connection.tenant_id = session.tenant_id AND connection.session_id = session.id
    AND connection.id = target_connection_id AND connection.status = 'connected'
  JOIN tenancy.conversations conversation
    ON conversation.tenant_id = session.tenant_id AND conversation.id = session.conversation_id
  JOIN tenancy.ai_playbook_versions playbook
    ON playbook.tenant_id = session.tenant_id AND playbook.id = session.playbook_version_id
  JOIN tenancy.entitlement_snapshots snapshot
    ON snapshot.tenant_id = session.tenant_id AND snapshot.id = session.entitlement_snapshot_id
    AND snapshot.access_mode = 'active'
  WHERE session.id = target_session_id AND session.status = 'connected'
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'voice_turn_not_available'; END IF;
  SELECT turn.* INTO turn_record FROM tenancy.voice_turns turn
  WHERE turn.tenant_id = runtime.tenant_id AND turn.session_id = runtime.id AND turn.input_id = target_input_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'voice_turn_not_found'; END IF;
  IF turn_record.status = 'completed' THEN RETURN turn_record.public_response_json; END IF;
  IF turn_record.status <> 'processing' THEN RAISE EXCEPTION 'voice_turn_not_committable'; END IF;
  IF runtime.automation_mode <> 'voice' OR runtime.conversation_status <> 'open' THEN
    UPDATE tenancy.voice_turns SET status = 'failed', safe_error_code = 'handover_active', completed_at = now()
    WHERE tenant_id = runtime.tenant_id AND id = turn_record.id;
    RETURN jsonb_build_object('status', 'handover', 'inputId', target_input_id, 'text', '',
      'quickReplies', '[]'::jsonb, 'nextTurnSequence', turn_record.turn_sequence + 1,
      'actionStatuses', '[]'::jsonb, 'terminalReason', 'transferred');
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(structured_output->'proposedActions', '[]'::jsonb)) item
    WHERE item->>'type' NOT IN ('lead.capture', 'sales_fact.record', 'appointment.request',
      'follow_up.create', 'handover.request', 'merchant_email.send')
  ) THEN RAISE EXCEPTION 'voice_action_not_allowed'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(structured_output->'proposedActions', '[]'::jsonb)) item
    WHERE item->>'type' IN ('sales_fact.record', 'appointment.request', 'follow_up.create', 'merchant_email.send')
  ) AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(structured_output->'proposedActions', '[]'::jsonb)) item
    WHERE item->>'type' = 'lead.capture'
  ) THEN RAISE EXCEPTION 'voice_lead_action_required'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(structured_output->'proposedActions', '[]'::jsonb)) item
      WHERE item->>'type' IN ('lead.capture', 'sales_fact.record', 'follow_up.create'))
     AND runtime.resolved_json->'entitlements'->>'lead_capture.enabled' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'voice_action_not_entitled';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(structured_output->'proposedActions', '[]'::jsonb)) item
      WHERE item->>'type' = 'appointment.request')
     AND runtime.resolved_json->'entitlements'->>'appointment_request.enabled' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'voice_action_not_entitled';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(structured_output->'proposedActions', '[]'::jsonb)) item
      WHERE item->>'type' = 'handover.request')
     AND runtime.resolved_json->'entitlements'->>'human_handover.enabled' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'voice_action_not_entitled';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(structured_output->'proposedActions', '[]'::jsonb)) item
      WHERE item->>'type' = 'merchant_email.send') THEN
    IF runtime.resolved_json->'entitlements'->>'sales_email_action.enabled' IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'voice_action_not_entitled';
    END IF;
    profile_id := NULLIF(runtime.playbook_json->>'notificationProfileId', '')::uuid;
    IF profile_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM tenancy.notification_profiles profile
      WHERE profile.tenant_id = runtime.tenant_id AND profile.id = profile_id
        AND profile.status = 'active' AND 'ai_chat.lead_qualified' = ANY(profile.allowed_template_keys)
    ) THEN RAISE EXCEPTION 'voice_notification_profile_unavailable'; END IF;
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
      VALUES (target_lead_id, runtime.tenant_id, runtime.contact_id, 'Voice lead', 'voice_web');
      INSERT INTO tenancy.lead_status_history (tenant_id, lead_id, from_status, to_status, source_action, request_id)
      VALUES (runtime.tenant_id, target_lead_id, NULL, 'new', 'voice.lead.capture', target_input_id::text);
      UPDATE tenancy.conversations SET lead_id = target_lead_id
      WHERE tenant_id = runtime.tenant_id AND id = runtime.conversation_id;
    END IF;
    IF NULLIF(lower(btrim(lead_action->>'email')), '') IS NOT NULL THEN
      INSERT INTO tenancy.contact_identities (tenant_id, contact_id, identity_kind, normalized_value)
      VALUES (runtime.tenant_id, runtime.contact_id, 'email', lower(btrim(lead_action->>'email'))) ON CONFLICT DO NOTHING;
    END IF;
    IF NULLIF(lower(btrim(lead_action->>'phone')), '') IS NOT NULL THEN
      INSERT INTO tenancy.contact_identities (tenant_id, contact_id, identity_kind, normalized_value)
      VALUES (runtime.tenant_id, runtime.contact_id, 'phone', lower(btrim(lead_action->>'phone'))) ON CONFLICT DO NOTHING;
    END IF;
    action_id := gen_random_uuid();
    INSERT INTO tenancy.action_requests (id, tenant_id, conversation_id, entitlement_snapshot_id, action_type, input_json, idempotency_key, status, completed_at)
    VALUES (action_id, runtime.tenant_id, runtime.conversation_id, runtime.entitlement_snapshot_id,
      'lead.create', lead_action, 'voice:' || turn_record.id::text || ':lead', 'succeeded', now());
    INSERT INTO tenancy.action_results (tenant_id, action_request_id, success, result_json)
    VALUES (runtime.tenant_id, action_id, true, jsonb_build_object('leadId', target_lead_id));
    action_statuses := action_statuses || jsonb_build_array(jsonb_build_object('actionId', action_id, 'status', 'succeeded'));
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
        'sales_fact.record', action, 'voice:' || turn_record.id::text || ':' || action_index, 'succeeded', now());
      INSERT INTO tenancy.sales_facts (tenant_id, lead_id, fact_type, value_json, confidence)
      VALUES (runtime.tenant_id, target_lead_id, action->>'factType', jsonb_build_object('value', action->>'value'), 'customer_stated');
      INSERT INTO tenancy.action_results (tenant_id, action_request_id, success, result_json)
      VALUES (runtime.tenant_id, action_id, true, jsonb_build_object('recorded', true));
    ELSIF action_type = 'appointment.request' AND target_lead_id IS NOT NULL THEN
      appointment_id := gen_random_uuid();
      INSERT INTO tenancy.action_requests (id, tenant_id, conversation_id, entitlement_snapshot_id, action_type, input_json, idempotency_key, status, completed_at)
      VALUES (action_id, runtime.tenant_id, runtime.conversation_id, runtime.entitlement_snapshot_id,
        'appointment.request', action, 'voice:' || turn_record.id::text || ':' || action_index, 'succeeded', now());
      INSERT INTO tenancy.appointment_requests (id, tenant_id, lead_id, conversation_id, status, timezone, idempotency_key)
      VALUES (appointment_id, runtime.tenant_id, target_lead_id, runtime.conversation_id,
        'requested', action->>'timezone', 'voice:' || turn_record.id::text || ':appointment');
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
        'follow_up.create', action, 'voice:' || turn_record.id::text || ':' || action_index, 'succeeded', now());
      INSERT INTO tenancy.follow_up_tasks (tenant_id, lead_id, note, due_at)
      VALUES (runtime.tenant_id, target_lead_id, action->>'note', (action->>'dueAt')::timestamptz);
      INSERT INTO tenancy.action_results (tenant_id, action_request_id, success, result_json)
      VALUES (runtime.tenant_id, action_id, true, jsonb_build_object('created', true));
    ELSIF action_type = 'handover.request' THEN
      INSERT INTO tenancy.action_requests (id, tenant_id, conversation_id, entitlement_snapshot_id, action_type, input_json, idempotency_key, status, completed_at)
      VALUES (action_id, runtime.tenant_id, runtime.conversation_id, runtime.entitlement_snapshot_id,
        'handover.request', action, 'voice:' || turn_record.id::text || ':' || action_index, 'succeeded', now());
      UPDATE tenancy.conversations SET automation_mode = 'human', updated_at = now()
      WHERE tenant_id = runtime.tenant_id AND id = runtime.conversation_id;
      INSERT INTO tenancy.conversation_transitions (tenant_id, conversation_id, from_mode, to_mode, reason, context_json, request_id)
      VALUES (runtime.tenant_id, runtime.conversation_id, 'voice', 'human', action->>'reason',
        jsonb_build_object('summary', action->>'summary'), target_input_id::text);
      INSERT INTO tenancy.handover_events (tenant_id, conversation_id, event_type, reason, summary, idempotency_key)
      VALUES (runtime.tenant_id, runtime.conversation_id, 'requested', action->>'reason', action->>'summary',
        'voice:' || turn_record.id::text || ':handover');
      INSERT INTO tenancy.action_results (tenant_id, action_request_id, success, result_json)
      VALUES (runtime.tenant_id, action_id, true, jsonb_build_object('status', 'requested'));
      terminal_reason := 'transferred';
    ELSIF action_type = 'merchant_email.send' AND target_lead_id IS NOT NULL THEN
      INSERT INTO tenancy.action_requests (id, tenant_id, conversation_id, entitlement_snapshot_id, action_type, input_json, idempotency_key, status, completed_at)
      VALUES (action_id, runtime.tenant_id, runtime.conversation_id, runtime.entitlement_snapshot_id,
        'merchant_email.send', action, 'voice:' || turn_record.id::text || ':' || action_index, 'succeeded', now());
      INSERT INTO tenancy.outbox (tenant_id, topic, payload, idempotency_key)
      VALUES (runtime.tenant_id, 'ai_chat.merchant_email.requested', jsonb_build_object(
        'notificationProfileId', profile_id, 'templateKey', 'ai_chat.lead_qualified',
        'leadId', target_lead_id, 'contactId', runtime.contact_id, 'turnId', turn_record.id
      ), 'voice:' || turn_record.id::text || ':email') ON CONFLICT DO NOTHING;
      INSERT INTO tenancy.action_results (tenant_id, action_request_id, success, result_json)
      VALUES (runtime.tenant_id, action_id, true, jsonb_build_object('queued', true));
    ELSE
      RAISE EXCEPTION 'voice_action_precondition_failed';
    END IF;
    action_statuses := action_statuses || jsonb_build_array(jsonb_build_object('actionId', action_id, 'status', 'succeeded'));
  END LOOP;

  voice_message_id := gen_random_uuid();
  INSERT INTO tenancy.messages (id, tenant_id, conversation_id, sequence, actor_type, direction, content_json)
  SELECT voice_message_id, runtime.tenant_id, runtime.conversation_id, conversation.next_sequence,
    'ai', 'outbound', jsonb_build_object('type', 'text', 'content', jsonb_build_object('text', structured_output->>'customerResponse'))
  FROM tenancy.conversations conversation
  WHERE conversation.tenant_id = runtime.tenant_id AND conversation.id = runtime.conversation_id;
  UPDATE tenancy.conversations SET next_sequence = next_sequence + 1, updated_at = now()
  WHERE tenant_id = runtime.tenant_id AND id = runtime.conversation_id;
  public_response := public_response || jsonb_build_object(
    'actionStatuses', action_statuses, 'terminalReason', terminal_reason
  );
  UPDATE tenancy.voice_turns SET status = 'completed', structured_output_json = structured_output,
    public_response_json = public_response, completed_at = now()
  WHERE tenant_id = runtime.tenant_id AND id = turn_record.id;
  INSERT INTO operations.voice_native_usage (tenant_id, turn_id, input_units, output_units, cached_units)
  VALUES (runtime.tenant_id, turn_record.id, native_input_units, native_output_units, native_cached_units)
  ON CONFLICT (tenant_id, turn_id) DO NOTHING;
  RETURN public_response;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.fail_voice_turn(
  target_session_id uuid, target_connection_id uuid, target_input_id uuid, target_safe_error_code text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE changed integer;
BEGIN
  IF session_user <> 'djay_voice_runtime' THEN RAISE EXCEPTION 'voice_runtime_role_required'; END IF;
  IF target_safe_error_code !~ '^[a-z][a-z0-9_]{1,79}$' THEN RAISE EXCEPTION 'invalid_voice_error_code'; END IF;
  UPDATE tenancy.voice_turns turn SET status = 'failed', safe_error_code = target_safe_error_code,
    completed_at = now()
  FROM tenancy.voice_sessions session, tenancy.voice_session_connections connection
  WHERE session.id = target_session_id AND session.tenant_id = turn.tenant_id AND session.id = turn.session_id
    AND connection.tenant_id = session.tenant_id AND connection.session_id = session.id
    AND connection.id = target_connection_id AND turn.input_id = target_input_id AND turn.status = 'processing';
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END
$$;

REVOKE ALL ON FUNCTION tenancy.commit_voice_turn(uuid, uuid, uuid, jsonb, jsonb, bigint, bigint, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.fail_voice_turn(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.commit_voice_turn(uuid, uuid, uuid, jsonb, jsonb, bigint, bigint, bigint) TO djay_voice_runtime;
GRANT EXECUTE ON FUNCTION tenancy.fail_voice_turn(uuid, uuid, uuid, text) TO djay_voice_runtime;
