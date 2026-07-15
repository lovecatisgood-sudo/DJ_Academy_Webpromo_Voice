CREATE TABLE tenancy.ai_social_outbound_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  receipt_id uuid NOT NULL,
  turn_id uuid NOT NULL,
  message_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('line', 'whatsapp', 'messenger')),
  recipient_ciphertext text NOT NULL CHECK (char_length(recipient_ciphertext) BETWEEN 32 AND 16384),
  reply_token_ciphertext text CHECK (reply_token_ciphertext IS NULL OR char_length(reply_token_ciphertext) BETWEEN 32 AND 16384),
  response_json jsonb NOT NULL CHECK (octet_length(response_json::text) <= 65536),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'dead_letter', 'cancelled')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  external_message_ids text[] NOT NULL DEFAULT '{}',
  safe_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, receipt_id),
  UNIQUE (tenant_id, turn_id),
  FOREIGN KEY (tenant_id, connection_id) REFERENCES tenancy.ai_social_connections(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, receipt_id) REFERENCES tenancy.ai_social_inbound_receipts(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, turn_id) REFERENCES tenancy.ai_turns(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, message_id) REFERENCES tenancy.messages(tenant_id, id) ON DELETE RESTRICT
);

ALTER TABLE tenancy.ai_social_outbound_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.ai_social_outbound_deliveries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.ai_social_outbound_deliveries
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

CREATE OR REPLACE FUNCTION tenancy.commit_ai_social_turn(
  target_outbox_id uuid,
  structured_output jsonb,
  public_response jsonb,
  native_input_units bigint,
  native_output_units bigint,
  native_cached_units bigint DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy, operations, catalog
AS $$
DECLARE runtime record; turn_record record; action jsonb; action_type text;
  action_index integer := 0; lead_action jsonb; target_lead_id uuid;
  action_id uuid; appointment_id uuid; ai_message_id uuid; delivery_id uuid;
  option jsonb; option_index integer; final_status text := 'active'; profile_id uuid;
  changed integer;
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'ai_social_worker' THEN
    RAISE EXCEPTION 'AI social worker context required';
  END IF;
  IF structured_output->>'schemaVersion' <> 'sales-core.v1'
     OR structured_output->>'customerResponse' IS NULL
     OR public_response->>'text' IS DISTINCT FROM structured_output->>'customerResponse'
     OR native_input_units < 0 OR native_output_units < 0 OR native_cached_units < 0 THEN
    RAISE EXCEPTION 'invalid_ai_structured_output';
  END IF;

  SELECT outbox.tenant_id, outbox.status AS outbox_status, receipt.id AS receipt_id,
         receipt.channel, receipt.normalized_json, connection.id AS connection_id,
         connection.status AS connection_status, deployment.status AS deployment_status,
         subject.contact_id, subject.conversation_id, subject.session_id,
         subject.status AS subject_status, session.entitlement_snapshot_id,
         session.playbook_version_id, session.status AS session_status,
         conversation.automation_mode, conversation.status AS conversation_status,
         conversation.lead_id, playbook.playbook_json, snapshot.resolved_json,
         snapshot.subscription_id
  INTO runtime
  FROM tenancy.outbox outbox
  JOIN tenancy.ai_social_inbound_receipts receipt
    ON receipt.tenant_id = outbox.tenant_id
   AND receipt.id = NULLIF(outbox.payload->>'receiptId', '')::uuid
  JOIN tenancy.ai_social_connections connection
    ON connection.tenant_id = receipt.tenant_id AND connection.id = receipt.connection_id
  JOIN tenancy.ai_deployments deployment
    ON deployment.tenant_id = connection.tenant_id AND deployment.id = connection.deployment_id
  JOIN tenancy.ai_social_subjects subject
    ON subject.tenant_id = connection.tenant_id AND subject.connection_id = connection.id
   AND subject.subject_hash = receipt.subject_hash
  JOIN tenancy.ai_sessions session
    ON session.tenant_id = subject.tenant_id AND session.id = subject.session_id
  JOIN tenancy.conversations conversation
    ON conversation.tenant_id = session.tenant_id AND conversation.id = session.conversation_id
  JOIN tenancy.ai_playbook_versions playbook
    ON playbook.tenant_id = session.tenant_id AND playbook.id = session.playbook_version_id
  JOIN tenancy.entitlement_snapshots snapshot
    ON snapshot.tenant_id = session.tenant_id AND snapshot.id = session.entitlement_snapshot_id
  WHERE outbox.id = target_outbox_id AND outbox.topic = 'ai_chat.social.inbound.received'
    AND outbox.status IN ('processing', 'sent')
  LIMIT 1;
  IF runtime IS NULL THEN RAISE EXCEPTION 'ai_social_turn_not_available'; END IF;

  SELECT turn.* INTO turn_record
  FROM tenancy.ai_turns turn
  WHERE turn.tenant_id = runtime.tenant_id AND turn.session_id = runtime.session_id
    AND turn.input_id = runtime.receipt_id
  FOR UPDATE;
  IF turn_record IS NULL THEN RAISE EXCEPTION 'ai_social_turn_not_found'; END IF;
  IF turn_record.status = 'completed' THEN
    UPDATE tenancy.outbox SET status = 'sent', locked_at = NULL, processed_at = COALESCE(processed_at, now())
    WHERE id = target_outbox_id AND topic = 'ai_chat.social.inbound.received';
    RETURN turn_record.public_response_json;
  END IF;
  IF turn_record.status <> 'processing' THEN RAISE EXCEPTION 'ai_social_turn_not_committable'; END IF;

  IF runtime.connection_status <> 'active' OR runtime.deployment_status <> 'active'
     OR runtime.subject_status <> 'active'
     OR runtime.automation_mode <> 'ai_text' OR runtime.conversation_status <> 'open'
     OR NOT EXISTS (
       SELECT 1 FROM tenancy.entitlement_snapshots current_snapshot
       JOIN tenancy.product_subscriptions subscription
         ON subscription.tenant_id = current_snapshot.tenant_id
        AND subscription.id = current_snapshot.subscription_id
        AND subscription.status IN ('active', 'trialing', 'scheduled_change')
       JOIN catalog.plan_versions version ON version.id = current_snapshot.plan_version_id
       JOIN catalog.plans plan ON plan.id = version.plan_id
        AND plan.product_key = 'ai_chat' AND plan.plan_key = 'ai_chat_premium'
       WHERE current_snapshot.tenant_id = runtime.tenant_id
         AND current_snapshot.product_key = 'ai_chat' AND current_snapshot.access_mode = 'active'
         AND current_snapshot.resolved_json->'entitlements'->>('channel.' || runtime.channel) = 'true'
     ) THEN
    UPDATE tenancy.quota_accounts account
    SET reserved_quantity = account.reserved_quantity - 1, updated_at = now()
    FROM tenancy.usage_reservations reservation
    WHERE reservation.tenant_id = runtime.tenant_id AND reservation.id = turn_record.usage_reservation_id
      AND reservation.status = 'reserved' AND account.tenant_id = reservation.tenant_id
      AND account.id = reservation.quota_account_id;
    UPDATE tenancy.usage_reservations SET status = 'released', settled_quantity = 0,
      settled_at = now(), reason_code = 'social_automation_suspended'
    WHERE tenant_id = runtime.tenant_id AND id = turn_record.usage_reservation_id AND status = 'reserved';
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed = 1 THEN
      INSERT INTO tenancy.usage_events (
        tenant_id, subscription_id, entitlement_snapshot_id, reservation_id, product_key,
        operation_id, event_type, customer_unit, customer_quantity, idempotency_key, occurred_at
      ) VALUES (
        runtime.tenant_id, runtime.subscription_id, runtime.entitlement_snapshot_id,
        turn_record.usage_reservation_id, 'ai_chat', turn_record.id::text, 'released',
        'ai_response', 0, 'ai:social:turn:' || runtime.receipt_id::text || ':released', now()
      ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
    END IF;
    UPDATE tenancy.ai_turns SET status = 'failed', safe_error_code = 'social_automation_suspended', completed_at = now()
    WHERE tenant_id = runtime.tenant_id AND id = turn_record.id;
    UPDATE tenancy.ai_sessions SET status = 'handover', updated_at = now()
    WHERE tenant_id = runtime.tenant_id AND id = runtime.session_id;
    UPDATE tenancy.outbox SET status = 'sent', locked_at = NULL, processed_at = now()
    WHERE id = target_outbox_id AND topic = 'ai_chat.social.inbound.received';
    RETURN jsonb_build_object('status', 'handover');
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(structured_output->'proposedActions', '[]'::jsonb)) item
    WHERE item->>'type' NOT IN ('lead.capture', 'sales_fact.record', 'appointment.request',
      'follow_up.create', 'handover.request', 'merchant_email.send')
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
     AND runtime.resolved_json->'entitlements'->>'lead_capture.enabled' IS DISTINCT FROM 'true'
    THEN RAISE EXCEPTION 'ai_action_not_entitled'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(structured_output->'proposedActions', '[]'::jsonb)) item
      WHERE item->>'type' = 'appointment.request')
     AND runtime.resolved_json->'entitlements'->>'appointment_request.enabled' IS DISTINCT FROM 'true'
    THEN RAISE EXCEPTION 'ai_action_not_entitled'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(structured_output->'proposedActions', '[]'::jsonb)) item
      WHERE item->>'type' = 'merchant_email.send')
     AND runtime.resolved_json->'entitlements'->>'sales_email_action.enabled' IS DISTINCT FROM 'true'
    THEN RAISE EXCEPTION 'ai_action_not_entitled'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(structured_output->'proposedActions', '[]'::jsonb)) item
      WHERE item->>'type' = 'handover.request')
     AND runtime.resolved_json->'entitlements'->>'human_handover.enabled' IS DISTINCT FROM 'true'
    THEN RAISE EXCEPTION 'ai_action_not_entitled'; END IF;

  SELECT value INTO lead_action
  FROM jsonb_array_elements(COALESCE(structured_output->'proposedActions', '[]'::jsonb))
  WHERE value->>'type' = 'lead.capture' LIMIT 1;
  target_lead_id := runtime.lead_id;
  IF lead_action IS NOT NULL THEN
    IF target_lead_id IS NULL THEN
      target_lead_id := gen_random_uuid();
      UPDATE tenancy.contacts SET display_name = left(lead_action->>'name', 200), updated_at = now()
      WHERE tenant_id = runtime.tenant_id AND id = runtime.contact_id;
      INSERT INTO tenancy.leads (id, tenant_id, contact_id, title, source)
      VALUES (target_lead_id, runtime.tenant_id, runtime.contact_id,
        'AI ' || upper(runtime.channel) || ' lead', 'ai_chat_' || runtime.channel);
      INSERT INTO tenancy.lead_status_history (tenant_id, lead_id, from_status, to_status, source_action, request_id)
      VALUES (runtime.tenant_id, target_lead_id, NULL, 'new', 'ai_chat.lead.capture', runtime.receipt_id::text);
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
    INSERT INTO tenancy.action_requests (id, tenant_id, conversation_id, entitlement_snapshot_id,
      action_type, input_json, idempotency_key, status, completed_at)
    VALUES (action_id, runtime.tenant_id, runtime.conversation_id, runtime.entitlement_snapshot_id,
      'lead.create', lead_action, 'ai:' || turn_record.id::text || ':lead', 'succeeded', now());
    INSERT INTO tenancy.action_results (tenant_id, action_request_id, success, result_json)
    VALUES (runtime.tenant_id, action_id, true, jsonb_build_object('leadId', target_lead_id));
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
        jsonb_build_object('summary', action->>'summary'), runtime.receipt_id::text);
      INSERT INTO tenancy.handover_events (tenant_id, conversation_id, event_type, reason, summary, idempotency_key)
      VALUES (runtime.tenant_id, runtime.conversation_id, 'requested', action->>'reason', action->>'summary',
        'ai:' || turn_record.id::text || ':handover');
      INSERT INTO tenancy.action_results (tenant_id, action_request_id, success, result_json)
      VALUES (runtime.tenant_id, action_id, true, jsonb_build_object('status', 'requested'));
      final_status := 'handover';
    ELSIF action_type = 'merchant_email.send' AND target_lead_id IS NOT NULL THEN
      profile_id := NULLIF(runtime.playbook_json->>'notificationProfileId', '')::uuid;
      IF profile_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM tenancy.notification_profiles profile
        WHERE profile.tenant_id = runtime.tenant_id AND profile.id = profile_id
          AND profile.status = 'active' AND 'ai_chat.lead_qualified' = ANY(profile.allowed_template_keys)
      ) THEN RAISE EXCEPTION 'ai_notification_profile_unavailable'; END IF;
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
  END LOOP;

  ai_message_id := gen_random_uuid(); delivery_id := gen_random_uuid();
  INSERT INTO tenancy.messages (id, tenant_id, conversation_id, sequence, actor_type, direction, content_json)
  SELECT ai_message_id, runtime.tenant_id, runtime.conversation_id, conversation.next_sequence,
    'ai', 'outbound', jsonb_build_object('type', 'text', 'content', jsonb_build_object('text', structured_output->>'customerResponse'))
  FROM tenancy.conversations conversation
  WHERE conversation.tenant_id = runtime.tenant_id AND conversation.id = runtime.conversation_id;
  UPDATE tenancy.conversations SET next_sequence = next_sequence + 1, updated_at = now()
  WHERE tenant_id = runtime.tenant_id AND id = runtime.conversation_id;
  INSERT INTO tenancy.ai_social_outbound_deliveries (
    id, tenant_id, connection_id, receipt_id, turn_id, message_id, channel,
    recipient_ciphertext, reply_token_ciphertext, response_json
  ) VALUES (
    delivery_id, runtime.tenant_id, runtime.connection_id, runtime.receipt_id,
    turn_record.id, ai_message_id, runtime.channel,
    runtime.normalized_json->>'subjectCiphertext',
    NULLIF(runtime.normalized_json->>'replyTokenCiphertext', ''), public_response
  );
  UPDATE tenancy.ai_turns SET status = 'completed', structured_output_json = structured_output,
    public_response_json = public_response, completed_at = now()
  WHERE tenant_id = runtime.tenant_id AND id = turn_record.id;
  UPDATE tenancy.ai_sessions SET status = final_status, updated_at = now()
  WHERE tenant_id = runtime.tenant_id AND id = runtime.session_id;
  INSERT INTO operations.ai_native_usage (tenant_id, turn_id, input_units, output_units, cached_units)
  VALUES (runtime.tenant_id, turn_record.id, native_input_units, native_output_units, native_cached_units)
  ON CONFLICT (tenant_id, turn_id) DO NOTHING;
  UPDATE tenancy.quota_accounts account
  SET reserved_quantity = account.reserved_quantity - 1,
      settled_quantity = account.settled_quantity + 1, updated_at = now()
  FROM tenancy.usage_reservations reservation
  WHERE reservation.tenant_id = runtime.tenant_id AND reservation.id = turn_record.usage_reservation_id
    AND reservation.status = 'reserved' AND account.tenant_id = reservation.tenant_id
    AND account.id = reservation.quota_account_id;
  UPDATE tenancy.usage_reservations SET status = 'settled', settled_quantity = 1, settled_at = now()
  WHERE tenant_id = runtime.tenant_id AND id = turn_record.usage_reservation_id AND status = 'reserved';
  INSERT INTO tenancy.usage_events (
    tenant_id, subscription_id, entitlement_snapshot_id, reservation_id, product_key,
    operation_id, event_type, customer_unit, customer_quantity, idempotency_key, occurred_at
  ) VALUES (
    runtime.tenant_id, runtime.subscription_id, runtime.entitlement_snapshot_id,
    turn_record.usage_reservation_id, 'ai_chat', turn_record.id::text, 'settled',
    'ai_response', 1, 'ai:social:turn:' || runtime.receipt_id::text || ':settled', now()
  ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
  UPDATE tenancy.outbox SET status = 'sent', locked_at = NULL, processed_at = now(), last_error_code = NULL
  WHERE id = target_outbox_id AND topic = 'ai_chat.social.inbound.received' AND status = 'processing';
  RETURN public_response;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.fail_ai_social_turn(
  target_outbox_id uuid,
  target_safe_error_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
DECLARE runtime record; changed integer;
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'ai_social_worker' THEN
    RAISE EXCEPTION 'AI social worker context required';
  END IF;
  SELECT outbox.tenant_id, turn.id AS turn_id, turn.usage_reservation_id,
         session.id AS session_id, session.entitlement_snapshot_id,
         snapshot.subscription_id, receipt.id AS receipt_id
  INTO runtime
  FROM tenancy.outbox outbox
  JOIN tenancy.ai_social_inbound_receipts receipt
    ON receipt.tenant_id = outbox.tenant_id AND receipt.id = NULLIF(outbox.payload->>'receiptId', '')::uuid
  JOIN tenancy.ai_social_subjects subject
    ON subject.tenant_id = receipt.tenant_id AND subject.connection_id = receipt.connection_id
   AND subject.subject_hash = receipt.subject_hash
  JOIN tenancy.ai_sessions session ON session.tenant_id = subject.tenant_id AND session.id = subject.session_id
  JOIN tenancy.ai_turns turn
    ON turn.tenant_id = session.tenant_id AND turn.session_id = session.id AND turn.input_id = receipt.id
  JOIN tenancy.entitlement_snapshots snapshot
    ON snapshot.tenant_id = session.tenant_id AND snapshot.id = session.entitlement_snapshot_id
  WHERE outbox.id = target_outbox_id AND outbox.topic = 'ai_chat.social.inbound.received'
    AND outbox.status = 'processing' AND turn.status = 'processing'
  FOR UPDATE OF turn;
  IF runtime IS NULL THEN RETURN false; END IF;
  UPDATE tenancy.quota_accounts account SET reserved_quantity = account.reserved_quantity - 1, updated_at = now()
  FROM tenancy.usage_reservations reservation
  WHERE reservation.tenant_id = runtime.tenant_id AND reservation.id = runtime.usage_reservation_id
    AND reservation.status = 'reserved' AND account.tenant_id = reservation.tenant_id
    AND account.id = reservation.quota_account_id;
  UPDATE tenancy.usage_reservations SET status = 'released', settled_quantity = 0,
    settled_at = now(), reason_code = left(COALESCE(target_safe_error_code, 'generation_failed'), 100)
  WHERE tenant_id = runtime.tenant_id AND id = runtime.usage_reservation_id AND status = 'reserved';
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed = 1 THEN
    INSERT INTO tenancy.usage_events (
      tenant_id, subscription_id, entitlement_snapshot_id, reservation_id, product_key,
      operation_id, event_type, customer_unit, customer_quantity, idempotency_key, occurred_at
    ) VALUES (
      runtime.tenant_id, runtime.subscription_id, runtime.entitlement_snapshot_id,
      runtime.usage_reservation_id, 'ai_chat', runtime.turn_id::text, 'released',
      'ai_response', 0, 'ai:social:turn:' || runtime.receipt_id::text || ':released', now()
    ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
  END IF;
  UPDATE tenancy.ai_turns SET status = 'failed',
    safe_error_code = left(COALESCE(target_safe_error_code, 'generation_failed'), 100), completed_at = now()
  WHERE tenant_id = runtime.tenant_id AND id = runtime.turn_id;
  UPDATE tenancy.ai_sessions SET status = 'active', updated_at = now()
  WHERE tenant_id = runtime.tenant_id AND id = runtime.session_id;
  RETURN true;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.apply_ai_social_control_event(target_outbox_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
DECLARE runtime record; changed integer;
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'ai_social_worker' THEN
    RAISE EXCEPTION 'AI social worker context required';
  END IF;
  SELECT outbox.tenant_id, receipt.*, connection.status AS connection_status
  INTO runtime
  FROM tenancy.outbox outbox
  JOIN tenancy.ai_social_inbound_receipts receipt
    ON receipt.tenant_id = outbox.tenant_id
   AND receipt.id = NULLIF(outbox.payload->>'receiptId', '')::uuid
  JOIN tenancy.ai_social_connections connection
    ON connection.tenant_id = receipt.tenant_id AND connection.id = receipt.connection_id
  WHERE outbox.id = target_outbox_id
    AND outbox.topic = 'ai_chat.social.inbound.received' AND outbox.status = 'processing'
    AND receipt.event_type IN ('subject.opt_out', 'delivery.status')
  LIMIT 1;
  IF runtime IS NULL THEN RETURN false; END IF;
  IF runtime.event_type = 'subject.opt_out' THEN
    INSERT INTO tenancy.ai_social_subjects (
      tenant_id, connection_id, subject_hash, external_subject_ciphertext, status
    ) VALUES (
      runtime.tenant_id, runtime.connection_id, runtime.subject_hash,
      runtime.normalized_json->>'subjectCiphertext', 'opted_out'
    )
    ON CONFLICT (tenant_id, connection_id, subject_hash) DO UPDATE
    SET status = 'opted_out', last_seen_at = now(), updated_at = now();
    UPDATE tenancy.conversations conversation
    SET automation_mode = 'closed', status = 'closed', closed_at = now(), updated_at = now()
    FROM tenancy.ai_social_subjects subject
    WHERE subject.tenant_id = runtime.tenant_id
      AND subject.connection_id = runtime.connection_id AND subject.subject_hash = runtime.subject_hash
      AND subject.conversation_id IS NOT NULL
      AND conversation.tenant_id = subject.tenant_id AND conversation.id = subject.conversation_id
      AND conversation.status <> 'closed';
    UPDATE tenancy.ai_sessions session
    SET status = 'completed', completed_at = now(), updated_at = now()
    FROM tenancy.ai_social_subjects subject
    WHERE subject.tenant_id = runtime.tenant_id
      AND subject.connection_id = runtime.connection_id AND subject.subject_hash = runtime.subject_hash
      AND subject.session_id IS NOT NULL
      AND session.tenant_id = subject.tenant_id AND session.id = subject.session_id
      AND session.status NOT IN ('completed', 'expired');
  ELSIF runtime.external_message_id IS NOT NULL THEN
    UPDATE tenancy.ai_social_outbound_deliveries
    SET status = CASE WHEN runtime.normalized_json->>'deliveryStatus' = 'failed'
                      THEN 'dead_letter' ELSE status END,
        safe_error_code = CASE WHEN runtime.normalized_json->>'deliveryStatus' = 'failed'
                               THEN 'channel_reported_failed' ELSE safe_error_code END,
        completed_at = CASE WHEN runtime.normalized_json->>'deliveryStatus' = 'failed'
                            THEN COALESCE(completed_at, now()) ELSE completed_at END
    WHERE tenant_id = runtime.tenant_id
      AND runtime.external_message_id = ANY(external_message_ids);
  END IF;
  UPDATE tenancy.outbox SET status = 'sent', locked_at = NULL, processed_at = now(), last_error_code = NULL
  WHERE id = target_outbox_id AND topic = 'ai_chat.social.inbound.received' AND status = 'processing';
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END
$$;

REVOKE ALL ON tenancy.ai_social_outbound_deliveries FROM PUBLIC;
GRANT SELECT ON tenancy.ai_social_outbound_deliveries TO djay_runtime;
REVOKE ALL ON FUNCTION tenancy.commit_ai_social_turn(uuid, jsonb, jsonb, bigint, bigint, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.fail_ai_social_turn(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.apply_ai_social_control_event(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.commit_ai_social_turn(uuid, jsonb, jsonb, bigint, bigint, bigint) TO djay_worker;
GRANT EXECUTE ON FUNCTION tenancy.fail_ai_social_turn(uuid, text) TO djay_worker;
GRANT EXECUTE ON FUNCTION tenancy.apply_ai_social_control_event(uuid) TO djay_worker;
