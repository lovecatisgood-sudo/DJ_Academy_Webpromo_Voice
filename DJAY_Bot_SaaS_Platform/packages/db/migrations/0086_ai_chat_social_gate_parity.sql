-- 0086 -- AI Chat social gate parity with FlowBot.
--
-- ## The defect
--
-- Migration 0082 relaxed FlowBot social authorization from `flowbot_premium`-only to
-- `product_key = 'flowbot' AND (channel.social OR an active additional_social_channel add-on)`.
-- AI Chat was never given the same treatment: five SECURITY DEFINER functions still required
-- `plan.plan_key = 'ai_chat_premium'`.
--
-- Consequence: an AI Chat Starter tenant who buys the `additional_social_channel` add-on is
-- charged for it and then silently refused at the database boundary. That is a paid entitlement
-- that does not work -- a billing-versus-delivery mismatch, not merely a missing feature.
--
-- The five functions, each confirmed to be the LATEST definition of itself before being
-- recreated here (a superseded copy was recreated once before in this repository and would have
-- silently reverted two later migrations):
--
--   ai_social_runtime_connection   latest 0020  (only definition)
--   claim_ai_social_inbound        latest 0022  (0021 superseded)
--   begin_ai_social_turn           latest 0022  (only definition)
--   commit_ai_social_turn          latest 0023  (only definition)
--   claim_ai_social_delivery       latest 0027  (0024 and 0026 superseded)
--
-- ## How this migration was produced
--
-- The bodies were extracted programmatically from those exact source migrations, not retyped.
-- The ONLY edit at each of the five gate sites is:
--
--     -  AND plan.product_key = 'ai_chat' AND plan.plan_key = 'ai_chat_premium'
--     +  AND plan.product_key = 'ai_chat'
--     +  AND tenancy.ai_social_channel_entitled(
--     +        <snapshot>.tenant_id, <snapshot>.subscription_id, <snapshot>.resolved_json)
--
-- Everything else -- SECURITY DEFINER, search_path, session_user guards,
-- current_setting('app.service') guards, RETURNS TABLE column names, interval literals, the
-- Meta 24-hour service window in claim_ai_social_delivery, delivered_part_count -- is byte
-- identical. `packages/db/src/migration-function-lineage.ts` asserts that mechanically, and the
-- generated blocks were diffed against their sources line by line.
--
-- ## Why a helper function
--
-- 0082 inlined the same predicate four times. Repeating it five more times here would leave nine
-- copies of one commercial rule to keep in step. `ai_social_channel_entitled` states it once, so
-- each gate site becomes a two-line call that a reviewer can actually check.

CREATE OR REPLACE FUNCTION tenancy.ai_social_channel_entitled(
  target_tenant_id uuid, target_subscription_id uuid, resolved jsonb
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
BEGIN
  -- SECURITY DEFINER bypasses row-level security on subscription_add_ons, and the tenant is a
  -- PARAMETER rather than being derived from session context. Without this guard the tenant
  -- role could pass any tenant id and learn from the boolean whether that tenant holds a paid
  -- add-on -- a small but real cross-tenant disclosure. The runtime roles are trusted service
  -- identities and are not scoped to a single tenant, so the check applies only to djay_runtime,
  -- matching how tenancy.reserve_customer_usage guards the same situation.
  IF session_user = 'djay_runtime'
     AND nullif(current_setting('app.tenant_id', true), '')::uuid IS DISTINCT FROM target_tenant_id THEN
    RAISE EXCEPTION 'ai_social_entitlement_tenant_context_required';
  END IF;

  -- Entitled when the plan includes social, OR the tenant holds a currently-effective
  -- additional_social_channel add-on. 'scheduled_end' still counts: the merchant has paid
  -- through the end of the term and must not lose service before effective_until.
  RETURN resolved->'entitlements'->>'channel.social' = 'true'
    OR EXISTS (
      SELECT 1 FROM tenancy.subscription_add_ons social_add_on
      WHERE social_add_on.tenant_id = target_tenant_id
        AND social_add_on.subscription_id = target_subscription_id
        AND social_add_on.add_on_key = 'additional_social_channel'
        AND social_add_on.status IN ('active', 'scheduled_end')
        AND social_add_on.effective_from <= now()
        AND (social_add_on.effective_until IS NULL OR social_add_on.effective_until > now()));
END
$$;

REVOKE ALL ON FUNCTION tenancy.ai_social_channel_entitled(uuid, uuid, jsonb) FROM PUBLIC;
-- djay_runtime is included because AiSocialConnectionStore.createChannel calls this directly
-- from a tenant transaction; the tenant-context guard above is what makes that safe.
GRANT EXECUTE ON FUNCTION tenancy.ai_social_channel_entitled(uuid, uuid, jsonb)
  TO djay_runtime, djay_ai_runtime, djay_worker;

-- ai_social_runtime_connection -- body from 0020_ai_chat_social_line.sql, gate relaxed.
CREATE OR REPLACE FUNCTION tenancy.ai_social_runtime_connection(
  target_webhook_key_hash bytea,
  target_channel text
)
RETURNS TABLE (
  connection_id uuid,
  tenant_id uuid,
  channel text,
  credential_ciphertext text,
  credential_key_version integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, tenancy, catalog
AS $$
  SELECT connection.id, connection.tenant_id, connection.channel,
         connection.credential_ciphertext, connection.credential_key_version
  FROM tenancy.ai_social_connections connection
  JOIN tenancy.ai_deployments deployment
    ON deployment.tenant_id = connection.tenant_id AND deployment.id = connection.deployment_id
  JOIN tenancy.ai_agents agent
    ON agent.tenant_id = connection.tenant_id AND agent.id = connection.agent_id
  JOIN LATERAL (
    SELECT snapshot.id
    FROM tenancy.entitlement_snapshots snapshot
    JOIN tenancy.product_subscriptions subscription
      ON subscription.tenant_id = snapshot.tenant_id AND subscription.id = snapshot.subscription_id
      AND subscription.status IN ('active', 'trialing', 'scheduled_change')
    JOIN catalog.plan_versions version ON version.id = snapshot.plan_version_id
    JOIN catalog.plans plan ON plan.id = version.plan_id
      AND plan.product_key = 'ai_chat'
      AND tenancy.ai_social_channel_entitled(
            snapshot.tenant_id, snapshot.subscription_id, snapshot.resolved_json)
    WHERE snapshot.tenant_id = connection.tenant_id
      AND snapshot.product_key = 'ai_chat' AND snapshot.access_mode = 'active'
      AND snapshot.resolved_json->'entitlements'->>('channel.' || target_channel) = 'true'
    ORDER BY snapshot.created_at DESC, snapshot.id DESC LIMIT 1
  ) authority ON true
  WHERE octet_length(target_webhook_key_hash) = 32
    AND target_channel IN ('line', 'whatsapp', 'messenger')
    AND connection.webhook_key_hash = target_webhook_key_hash
    AND connection.channel = target_channel
    AND connection.status = 'active'
    AND deployment.channel = target_channel AND deployment.status = 'active'
    AND agent.status = 'active' AND agent.current_published_playbook_version_id IS NOT NULL
  LIMIT 1
$$;

-- claim_ai_social_inbound -- body from 0022_ai_chat_social_sessions.sql, gate relaxed.
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
              AND plan.product_key = 'ai_chat'
              AND tenancy.ai_social_channel_entitled(
                    snapshot.tenant_id, snapshot.subscription_id, snapshot.resolved_json)
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

-- begin_ai_social_turn -- body from 0022_ai_chat_social_sessions.sql, gate relaxed.
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
     AND selected_plan.product_key = 'ai_chat'
     AND tenancy.ai_social_channel_entitled(
           candidate.tenant_id, candidate.subscription_id, candidate.resolved_json)
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

-- commit_ai_social_turn -- body from 0023_ai_chat_social_commit.sql, gate relaxed.
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
        AND plan.product_key = 'ai_chat'
        AND tenancy.ai_social_channel_entitled(
              current_snapshot.tenant_id, current_snapshot.subscription_id, current_snapshot.resolved_json)
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
      SELECT runtime.tenant_id, runtime.contact_id, 'email', lower(btrim(lead_action->>'email'))
      WHERE NOT EXISTS (
        SELECT 1 FROM tenancy.contact_identities identity
        WHERE identity.tenant_id = runtime.tenant_id AND identity.contact_id = runtime.contact_id
          AND identity.identity_kind = 'email'
          AND identity.normalized_value = lower(btrim(lead_action->>'email'))
          AND identity.revoked_at IS NULL
      );
    END IF;
    IF NULLIF(regexp_replace(btrim(lead_action->>'phone'), '[^0-9+]', '', 'g'), '') IS NOT NULL THEN
      INSERT INTO tenancy.contact_identities (tenant_id, contact_id, identity_kind, normalized_value)
      SELECT runtime.tenant_id, runtime.contact_id, 'phone',
        regexp_replace(btrim(lead_action->>'phone'), '[^0-9+]', '', 'g')
      WHERE NOT EXISTS (
        SELECT 1 FROM tenancy.contact_identities identity
        WHERE identity.tenant_id = runtime.tenant_id AND identity.contact_id = runtime.contact_id
          AND identity.identity_kind = 'phone'
          AND identity.normalized_value = regexp_replace(btrim(lead_action->>'phone'), '[^0-9+]', '', 'g')
          AND identity.revoked_at IS NULL
      );
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
    'ai', 'outbound', jsonb_build_object('type', 'text', 'content', jsonb_build_object(
      'text', structured_output->>'customerResponse', 'quickReplies', COALESCE(public_response->'quickReplies', '[]'::jsonb),
      'actions', COALESCE(public_response->'actions', '[]'::jsonb)))
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

-- claim_ai_social_delivery -- body from 0027_ai_chat_social_delivery_progress.sql, gate relaxed.
-- 0027 used a bare CREATE because it changed the return signature and so had to DROP first.
-- This migration does not change the signature, so CREATE OR REPLACE is both correct and
-- safer: existing grants are preserved and there is no window in which the function is absent
-- while workers are running.
CREATE OR REPLACE FUNCTION tenancy.claim_ai_social_delivery(
  claim_time timestamptz,
  stale_before timestamptz
)
RETURNS TABLE (
  delivery_id uuid, tenant_id uuid, connection_id uuid, message_id uuid,
  channel text, recipient_ciphertext text, reply_token_ciphertext text,
  response_json jsonb, credential_ciphertext text, credential_key_version integer,
  attempt_count integer, delivered_part_count integer,
  service_window_open boolean, delivery_allowed boolean
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
         connection.credential_key_version, claimed.attempt_count, claimed.delivered_part_count,
         claimed.channel = 'line' OR claim_time <= receipt.occurred_at + interval '24 hours',
         COALESCE(
           connection.status = 'active' AND deployment.status = 'active'
           AND subject.status = 'active'
           AND (claimed.channel = 'line' OR claim_time <= receipt.occurred_at + interval '24 hours')
           AND EXISTS (
             SELECT 1 FROM tenancy.entitlement_snapshots snapshot
             JOIN tenancy.product_subscriptions subscription
               ON subscription.tenant_id = snapshot.tenant_id AND subscription.id = snapshot.subscription_id
              AND subscription.status IN ('active', 'trialing', 'scheduled_change')
             JOIN catalog.plan_versions version ON version.id = snapshot.plan_version_id
             JOIN catalog.plans plan ON plan.id = version.plan_id
              AND plan.product_key = 'ai_chat'
              AND tenancy.ai_social_channel_entitled(
                    snapshot.tenant_id, snapshot.subscription_id, snapshot.resolved_json)
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

-- Re-assert privileges for all five recreated functions. CREATE OR REPLACE preserves existing
-- grants, but restating them keeps the migration self-describing and satisfies the lineage
-- guard's re-GRANT assertion. Signatures and grantees copied from the originating migrations.
REVOKE ALL ON FUNCTION tenancy.ai_social_runtime_connection(bytea, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.ai_social_runtime_connection(bytea, text) TO djay_ai_runtime;

REVOKE ALL ON FUNCTION tenancy.claim_ai_social_inbound(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.claim_ai_social_inbound(timestamptz, timestamptz) TO djay_worker;

REVOKE ALL ON FUNCTION tenancy.begin_ai_social_turn(
  uuid, text, uuid, uuid, uuid, bytea, uuid, uuid, text, bytea
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.begin_ai_social_turn(
  uuid, text, uuid, uuid, uuid, bytea, uuid, uuid, text, bytea
) TO djay_worker;

REVOKE ALL ON FUNCTION tenancy.commit_ai_social_turn(uuid, jsonb, jsonb, bigint, bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.commit_ai_social_turn(uuid, jsonb, jsonb, bigint, bigint, bigint) TO djay_worker;

REVOKE ALL ON FUNCTION tenancy.claim_ai_social_delivery(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.claim_ai_social_delivery(timestamptz, timestamptz) TO djay_worker;
