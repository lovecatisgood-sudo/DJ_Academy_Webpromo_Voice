CREATE OR REPLACE FUNCTION tenancy.claim_ai_social_inbound(
  claim_time timestamptz,
  stale_before timestamptz
)
RETURNS TABLE (
  outbox_id uuid, receipt_id uuid, tenant_id uuid, connection_id uuid,
  channel text, event_type text, external_message_id text, subject_hash bytea,
  occurred_at timestamptz, normalized_json jsonb, credential_ciphertext text,
  credential_key_version integer, attempt_count integer, processing_allowed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy, catalog
AS $$
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'ai_social_worker' THEN
    RAISE EXCEPTION 'AI social worker context required';
  END IF;
  RETURN QUERY
  WITH candidate AS (
    SELECT candidate_outbox.id
    FROM tenancy.outbox candidate_outbox
    JOIN tenancy.ai_social_inbound_receipts candidate_receipt
      ON candidate_receipt.tenant_id = candidate_outbox.tenant_id
     AND candidate_receipt.id = NULLIF(candidate_outbox.payload->>'receiptId', '')::uuid
    WHERE candidate_outbox.topic = 'ai_chat.social.inbound.received'
      AND candidate_outbox.available_at <= claim_time
      AND candidate_outbox.attempt_count < 10
      AND (
        candidate_outbox.status IN ('pending', 'failed')
        OR (candidate_outbox.status = 'processing' AND candidate_outbox.locked_at < stale_before)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM tenancy.outbox earlier_outbox
        JOIN tenancy.ai_social_inbound_receipts earlier_receipt
          ON earlier_receipt.tenant_id = earlier_outbox.tenant_id
         AND earlier_receipt.id = NULLIF(earlier_outbox.payload->>'receiptId', '')::uuid
        WHERE earlier_outbox.topic = 'ai_chat.social.inbound.received'
          AND earlier_outbox.tenant_id = candidate_outbox.tenant_id
          AND earlier_receipt.connection_id = candidate_receipt.connection_id
          AND earlier_receipt.subject_hash = candidate_receipt.subject_hash
          AND earlier_outbox.status IN ('pending', 'processing', 'failed')
          AND (earlier_receipt.occurred_at, earlier_receipt.received_at, earlier_receipt.id)
            < (candidate_receipt.occurred_at, candidate_receipt.received_at, candidate_receipt.id)
      )
    ORDER BY candidate_outbox.available_at, candidate_outbox.created_at, candidate_outbox.id
    FOR UPDATE OF candidate_outbox SKIP LOCKED
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
  SELECT claimed.id, receipt.id, claimed.tenant_id, connection.id, receipt.channel,
         receipt.event_type, receipt.external_message_id, receipt.subject_hash,
         receipt.occurred_at, receipt.normalized_json,
         CASE WHEN connection.status = 'active' THEN connection.credential_ciphertext ELSE NULL END,
         connection.credential_key_version, claimed.attempt_count,
         COALESCE(
           receipt.disposition = 'accepted'
           AND connection.status = 'active' AND deployment.status = 'active'
           AND agent.status = 'active' AND agent.current_published_playbook_version_id IS NOT NULL
           AND receipt.normalized_json->>'subjectCiphertext' IS NOT NULL
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
               AND snapshot.resolved_json->'entitlements'->>('channel.' || receipt.channel) = 'true'
               AND snapshot.resolved_json->'entitlements'->>'sales_core.enabled' = 'true'
           ), false
         )
  FROM claimed
  JOIN tenancy.ai_social_inbound_receipts receipt
    ON receipt.tenant_id = claimed.tenant_id
   AND receipt.id = NULLIF(claimed.payload->>'receiptId', '')::uuid
  JOIN tenancy.ai_social_connections connection
    ON connection.tenant_id = receipt.tenant_id AND connection.id = receipt.connection_id
  JOIN tenancy.ai_deployments deployment
    ON deployment.tenant_id = connection.tenant_id AND deployment.id = connection.deployment_id
  JOIN tenancy.ai_agents agent
    ON agent.tenant_id = connection.tenant_id AND agent.id = connection.agent_id;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.begin_ai_social_turn(
  target_outbox_id uuid,
  target_subject_ciphertext text,
  target_contact_id uuid,
  target_conversation_id uuid,
  target_session_id uuid,
  target_session_hash bytea,
  target_turn_id uuid,
  target_reservation_id uuid,
  customer_message text,
  customer_message_hash bytea
)
RETURNS TABLE (
  session_id uuid, tenant_id uuid, conversation_id uuid, playbook_json jsonb,
  language text, authority_json jsonb, turn_sequence integer,
  recent_messages jsonb, knowledge_chunks jsonb, replay_response_json jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy, catalog
AS $$
DECLARE runtime record; subject_record record; prior record; quota record;
  sequence_value integer; selected_session_id uuid; selected_conversation_id uuid;
  selected_contact_id uuid; selected_turn_sequence integer;
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'ai_social_worker' THEN
    RAISE EXCEPTION 'AI social worker context required';
  END IF;
  IF octet_length(target_session_hash) <> 32 OR octet_length(customer_message_hash) <> 32
     OR char_length(target_subject_ciphertext) NOT BETWEEN 32 AND 16384
     OR char_length(btrim(customer_message)) < 1 OR char_length(customer_message) > 2000 THEN
    RAISE EXCEPTION 'invalid_ai_social_turn_request';
  END IF;

  SELECT outbox.tenant_id, receipt.id AS receipt_id, receipt.connection_id,
         receipt.channel, receipt.subject_hash, receipt.external_message_id,
         connection.deployment_id, connection.agent_id, agent.default_language,
         playbook.id AS playbook_version_id, playbook.playbook_json,
         snapshot.id AS snapshot_id, snapshot.subscription_id,
         snapshot.resolved_json, plan.plan_key
  INTO runtime
  FROM tenancy.outbox outbox
  JOIN tenancy.ai_social_inbound_receipts receipt
    ON receipt.tenant_id = outbox.tenant_id
   AND receipt.id = NULLIF(outbox.payload->>'receiptId', '')::uuid
  JOIN tenancy.ai_social_connections connection
    ON connection.tenant_id = receipt.tenant_id AND connection.id = receipt.connection_id
   AND connection.status = 'active'
  JOIN tenancy.ai_deployments deployment
    ON deployment.tenant_id = connection.tenant_id AND deployment.id = connection.deployment_id
   AND deployment.status = 'active' AND deployment.channel = receipt.channel
  JOIN tenancy.ai_agents agent
    ON agent.tenant_id = connection.tenant_id AND agent.id = connection.agent_id
   AND agent.status = 'active'
  JOIN tenancy.ai_playbook_versions playbook
    ON playbook.tenant_id = agent.tenant_id AND playbook.id = agent.current_published_playbook_version_id
   AND playbook.status = 'published'
  JOIN LATERAL (
    SELECT candidate.* FROM tenancy.entitlement_snapshots candidate
    JOIN tenancy.product_subscriptions subscription
      ON subscription.tenant_id = candidate.tenant_id AND subscription.id = candidate.subscription_id
     AND subscription.status IN ('active', 'trialing', 'scheduled_change')
    JOIN catalog.plan_versions version ON version.id = candidate.plan_version_id
    JOIN catalog.plans selected_plan ON selected_plan.id = version.plan_id
     AND selected_plan.product_key = 'ai_chat' AND selected_plan.plan_key = 'ai_chat_premium'
    WHERE candidate.tenant_id = connection.tenant_id
      AND candidate.product_key = 'ai_chat' AND candidate.access_mode = 'active'
      AND candidate.resolved_json->'entitlements'->>('channel.' || receipt.channel) = 'true'
      AND candidate.resolved_json->'entitlements'->>'ai.text' = 'true'
      AND candidate.resolved_json->'entitlements'->>'sales_core.enabled' = 'true'
    ORDER BY candidate.created_at DESC, candidate.id DESC LIMIT 1
  ) snapshot ON true
  JOIN catalog.plan_versions selected_version ON selected_version.id = snapshot.plan_version_id
  JOIN catalog.plans plan ON plan.id = selected_version.plan_id AND plan.product_key = 'ai_chat'
  WHERE outbox.id = target_outbox_id
    AND outbox.topic = 'ai_chat.social.inbound.received' AND outbox.status = 'processing'
    AND receipt.event_type = 'inbound.message' AND receipt.disposition = 'accepted'
  LIMIT 1;
  IF runtime IS NULL THEN RAISE EXCEPTION 'ai_social_turn_not_available'; END IF;

  SELECT subject.* INTO subject_record
  FROM tenancy.ai_social_subjects subject
  WHERE subject.tenant_id = runtime.tenant_id
    AND subject.connection_id = runtime.connection_id
    AND subject.subject_hash = runtime.subject_hash
  FOR UPDATE;

  IF subject_record IS NULL THEN
    INSERT INTO tenancy.contacts (id, tenant_id, display_name, locale)
    VALUES (target_contact_id, runtime.tenant_id,
      CASE runtime.channel WHEN 'line' THEN 'LINE visitor'
                           WHEN 'whatsapp' THEN 'WhatsApp visitor' ELSE 'Messenger visitor' END,
      runtime.default_language);
    INSERT INTO tenancy.conversations (
      id, tenant_id, contact_id, product_key, public_plan_key,
      entitlement_snapshot_id, channel_kind, automation_mode
    ) VALUES (
      target_conversation_id, runtime.tenant_id, target_contact_id, 'ai_chat',
      runtime.plan_key, runtime.snapshot_id, runtime.channel, 'ai_text'
    );
    INSERT INTO tenancy.ai_sessions (
      id, tenant_id, deployment_id, agent_id, playbook_version_id,
      conversation_id, contact_id, entitlement_snapshot_id,
      session_token_hash, language, expires_at
    ) VALUES (
      target_session_id, runtime.tenant_id, runtime.deployment_id, runtime.agent_id,
      runtime.playbook_version_id, target_conversation_id, target_contact_id,
      runtime.snapshot_id, target_session_hash, runtime.default_language,
      now() + interval '30 days'
    );
    INSERT INTO tenancy.ai_social_subjects (
      tenant_id, connection_id, subject_hash, external_subject_ciphertext,
      contact_id, conversation_id, session_id
    ) VALUES (
      runtime.tenant_id, runtime.connection_id, runtime.subject_hash,
      target_subject_ciphertext, target_contact_id, target_conversation_id, target_session_id
    );
    selected_session_id := target_session_id;
    selected_conversation_id := target_conversation_id;
    selected_contact_id := target_contact_id;
  ELSE
    IF subject_record.status <> 'active' THEN RAISE EXCEPTION 'ai_social_subject_not_active'; END IF;
    selected_session_id := subject_record.session_id;
    selected_conversation_id := subject_record.conversation_id;
    selected_contact_id := subject_record.contact_id;
    UPDATE tenancy.ai_social_subjects target_subject
    SET external_subject_ciphertext = target_subject_ciphertext,
        last_seen_at = now(), updated_at = now()
    WHERE target_subject.tenant_id = runtime.tenant_id AND target_subject.id = subject_record.id;
  END IF;

  SELECT turn.status, turn.public_response_json, turn.customer_message_sha256,
         turn.turn_sequence
  INTO prior
  FROM tenancy.ai_turns turn
  WHERE turn.tenant_id = runtime.tenant_id AND turn.session_id = selected_session_id
    AND turn.input_id = runtime.receipt_id;
  IF prior IS NOT NULL AND prior.customer_message_sha256 IS DISTINCT FROM customer_message_hash THEN
    RAISE EXCEPTION 'ai_social_idempotency_conflict';
  END IF;

  PERFORM 1 FROM tenancy.ai_sessions session
  WHERE session.tenant_id = runtime.tenant_id AND session.id = selected_session_id FOR UPDATE;
  SELECT conversation.next_sequence INTO sequence_value
  FROM tenancy.conversations conversation
  WHERE conversation.tenant_id = runtime.tenant_id AND conversation.id = selected_conversation_id FOR UPDATE;

  IF prior IS NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM tenancy.ai_sessions session
      JOIN tenancy.conversations conversation
        ON conversation.tenant_id = session.tenant_id AND conversation.id = session.conversation_id
      WHERE session.tenant_id = runtime.tenant_id AND session.id = selected_session_id
        AND session.status = 'active' AND session.expires_at > now()
        AND conversation.status = 'open' AND conversation.automation_mode = 'ai_text'
    ) THEN RAISE EXCEPTION 'ai_social_automation_suspended'; END IF;

    SELECT account.id, account.reserved_quantity, account.settled_quantity,
           account.safety_cap_quantity
    INTO quota
    FROM tenancy.quota_accounts account
    WHERE account.tenant_id = runtime.tenant_id
      AND account.subscription_id = runtime.subscription_id
      AND account.product_key = 'ai_chat' AND account.customer_unit = 'ai_response'
      AND now() >= account.period_start AND now() < account.period_end
    ORDER BY account.period_start DESC LIMIT 1 FOR UPDATE;
    IF quota IS NULL THEN RAISE EXCEPTION 'ai_quota_unavailable'; END IF;
    IF quota.safety_cap_quantity IS NOT NULL
       AND quota.reserved_quantity + quota.settled_quantity + 1 > quota.safety_cap_quantity THEN
      RAISE EXCEPTION 'ai_safety_cap';
    END IF;

    UPDATE tenancy.quota_accounts target_account
    SET reserved_quantity = target_account.reserved_quantity + 1, updated_at = now()
    WHERE target_account.tenant_id = runtime.tenant_id AND target_account.id = quota.id;
    INSERT INTO tenancy.usage_reservations (
      id, tenant_id, quota_account_id, entitlement_snapshot_id, operation_id,
      idempotency_key, requested_quantity, reserved_quantity, status
    ) VALUES (
      target_reservation_id, runtime.tenant_id, quota.id, runtime.snapshot_id,
      target_turn_id::text, 'ai:social:turn:' || runtime.receipt_id::text,
      1, 1, 'reserved'
    );
    INSERT INTO tenancy.usage_events (
      tenant_id, subscription_id, entitlement_snapshot_id, reservation_id,
      product_key, operation_id, event_type, customer_unit, customer_quantity,
      idempotency_key, occurred_at
    ) VALUES (
      runtime.tenant_id, runtime.subscription_id, runtime.snapshot_id,
      target_reservation_id, 'ai_chat', target_turn_id::text, 'reserved',
      'ai_response', 1, 'ai:social:turn:' || runtime.receipt_id::text || ':reserved', now()
    );
    INSERT INTO tenancy.messages (
      tenant_id, conversation_id, sequence, actor_type, direction,
      content_json, external_message_id
    ) VALUES (
      runtime.tenant_id, selected_conversation_id, sequence_value, 'customer', 'inbound',
      jsonb_build_object('type', 'text', 'content', jsonb_build_object('text', btrim(customer_message))),
      COALESCE(runtime.external_message_id, 'social:' || runtime.receipt_id::text)
    );
    UPDATE tenancy.conversations target_conversation
    SET next_sequence = target_conversation.next_sequence + 1, updated_at = now()
    WHERE target_conversation.tenant_id = runtime.tenant_id
      AND target_conversation.id = selected_conversation_id;
    SELECT session.next_turn_sequence INTO selected_turn_sequence
    FROM tenancy.ai_sessions session
    WHERE session.tenant_id = runtime.tenant_id AND session.id = selected_session_id;
    INSERT INTO tenancy.ai_turns (
      id, tenant_id, session_id, turn_sequence, input_id,
      usage_reservation_id, customer_message_sha256
    ) VALUES (
      target_turn_id, runtime.tenant_id, selected_session_id, selected_turn_sequence,
      runtime.receipt_id, target_reservation_id, customer_message_hash
    );
    UPDATE tenancy.ai_sessions target_session
    SET status = 'processing', next_turn_sequence = target_session.next_turn_sequence + 1,
        expires_at = now() + interval '30 days', updated_at = now()
    WHERE target_session.tenant_id = runtime.tenant_id AND target_session.id = selected_session_id;
  ELSE
    selected_turn_sequence := prior.turn_sequence;
  END IF;

  RETURN QUERY SELECT selected_session_id, runtime.tenant_id, selected_conversation_id,
    CASE WHEN prior.status = 'completed' THEN NULL::jsonb ELSE runtime.playbook_json END,
    runtime.default_language,
    CASE WHEN prior.status = 'completed' THEN NULL::jsonb ELSE jsonb_build_object(
      'entitlements', COALESCE(runtime.resolved_json->'entitlements', '{}'::jsonb),
      'limits', COALESCE(runtime.resolved_json->'limits', '{}'::jsonb)
    ) END,
    selected_turn_sequence,
    CASE WHEN prior.status = 'completed' THEN '[]'::jsonb ELSE COALESCE((
      SELECT jsonb_agg(item ORDER BY (item->>'sequence')::integer)
      FROM (
        SELECT jsonb_build_object(
          'sequence', message.sequence,
          'role', CASE message.actor_type WHEN 'customer' THEN 'user' ELSE 'assistant' END,
          'content', message.content_json->'content'->>'text'
        ) AS item
        FROM tenancy.messages message
        WHERE message.tenant_id = runtime.tenant_id
          AND message.conversation_id = selected_conversation_id
          AND message.actor_type IN ('customer', 'ai')
        ORDER BY message.sequence DESC LIMIT 19
      ) history
    ), '[]'::jsonb) END,
    CASE WHEN prior.status = 'completed' THEN '[]'::jsonb ELSE COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'sourceRevisionId', chunk.source_revision_id,
        'chunkId', chunk.id, 'content', chunk.content_text
      ) ORDER BY chunk.source_revision_id, chunk.sequence)
      FROM tenancy.ai_playbook_knowledge pin
      JOIN tenancy.knowledge_chunks chunk
        ON chunk.tenant_id = pin.tenant_id AND chunk.source_revision_id = pin.source_revision_id
      WHERE pin.tenant_id = runtime.tenant_id
        AND pin.playbook_version_id = runtime.playbook_version_id
    ), '[]'::jsonb) END,
    CASE WHEN prior.status = 'completed' THEN prior.public_response_json ELSE NULL::jsonb END;
END
$$;

REVOKE ALL ON FUNCTION tenancy.claim_ai_social_inbound(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.begin_ai_social_turn(
  uuid, text, uuid, uuid, uuid, bytea, uuid, uuid, text, bytea
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.claim_ai_social_inbound(timestamptz, timestamptz) TO djay_worker;
GRANT EXECUTE ON FUNCTION tenancy.begin_ai_social_turn(
  uuid, text, uuid, uuid, uuid, bytea, uuid, uuid, text, bytea
) TO djay_worker;
