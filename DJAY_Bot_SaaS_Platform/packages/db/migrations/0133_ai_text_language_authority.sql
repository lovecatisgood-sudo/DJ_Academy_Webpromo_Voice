ALTER TABLE tenancy.ai_sessions
  ADD COLUMN language_override text CHECK (language_override IS NULL OR language_override IN ('th', 'en'));

CREATE OR REPLACE FUNCTION tenancy.detect_ai_text_language(
  customer_message text,
  fallback_language text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN customer_message ~ '[ก-๛]' THEN 'th'
    WHEN customer_message ~ '[A-Za-z]' THEN 'en'
    ELSE fallback_language
  END
$$;

CREATE OR REPLACE FUNCTION tenancy.start_ai_session_localized(
  target_key_hash bytea,
  target_session_hash bytea,
  request_origin text,
  target_session_id uuid,
  target_contact_id uuid,
  target_conversation_id uuid,
  target_expires_at timestamptz,
  target_language text,
  target_language_override text
)
RETURNS TABLE (session_id uuid, conversation_id uuid, greeting text, next_message_sequence integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
BEGIN
  IF target_language NOT IN ('th', 'en')
    OR (target_language_override IS NOT NULL AND target_language_override NOT IN ('th', 'en')) THEN
    RAISE EXCEPTION 'invalid_ai_session_language';
  END IF;

  RETURN QUERY SELECT started.session_id, started.conversation_id, started.greeting,
    started.next_message_sequence
  FROM tenancy.start_ai_session(
    target_key_hash, target_session_hash, request_origin, target_session_id,
    target_contact_id, target_conversation_id, target_expires_at,
    COALESCE(target_language_override, target_language)
  ) started;

  UPDATE tenancy.ai_sessions session
  SET language_override = target_language_override
  WHERE session.id = target_session_id
    AND session.session_token_hash = target_session_hash;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.begin_ai_turn_localized(
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
  language text, authority_json jsonb, turn_sequence integer,
  recent_messages jsonb, knowledge_chunks jsonb, replay_response_json jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
DECLARE
  base record;
  stored_language text;
  fixed_language text;
  effective_language text;
BEGIN
  FOR base IN SELECT * FROM tenancy.begin_ai_turn(
    target_key_hash, target_session_hash, request_origin, target_input_id,
    target_turn_id, target_reservation_id, customer_message, customer_message_hash
  ) LOOP
    SELECT session.language, session.language_override
    INTO stored_language, fixed_language
    FROM tenancy.ai_sessions session
    WHERE session.id = base.session_id AND session.tenant_id = base.tenant_id;

    effective_language := COALESCE(
      fixed_language,
      tenancy.detect_ai_text_language(customer_message, stored_language)
    );

    IF fixed_language IS NULL AND effective_language <> stored_language THEN
      UPDATE tenancy.ai_sessions session
      SET language = effective_language
      WHERE session.id = base.session_id AND session.tenant_id = base.tenant_id;
      UPDATE tenancy.contacts contact
      SET locale = effective_language, updated_at = now()
      FROM tenancy.ai_sessions session
      WHERE session.id = base.session_id AND session.tenant_id = base.tenant_id
        AND contact.tenant_id = session.tenant_id AND contact.id = session.contact_id;
    END IF;

    RETURN QUERY SELECT base.session_id, base.tenant_id, base.conversation_id,
      base.playbook_json, effective_language, base.authority_json,
      base.turn_sequence, base.recent_messages, base.knowledge_chunks,
      base.replay_response_json;
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.fail_ai_turn_safe(
  target_key_hash bytea,
  target_session_hash bytea,
  request_origin text,
  target_input_id uuid,
  target_safe_error_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
DECLARE
  runtime record;
  turn_record record;
  changed integer;
BEGIN
  SELECT session.*, deployment.allowed_origins, conversation.automation_mode INTO runtime
  FROM tenancy.ai_sessions session
  JOIN tenancy.ai_deployments deployment
    ON deployment.tenant_id = session.tenant_id AND deployment.id = session.deployment_id
  JOIN tenancy.conversations conversation
    ON conversation.tenant_id = session.tenant_id AND conversation.id = session.conversation_id
  WHERE deployment.deployment_key_hash = target_key_hash
    AND session.session_token_hash = target_session_hash AND session.expires_at > now()
    AND deployment.status = 'active'
    AND tenancy.ai_origin_allowed(deployment.allowed_origins, request_origin)
  LIMIT 1;
  IF runtime IS NULL THEN RETURN false; END IF;

  SELECT turn.* INTO turn_record FROM tenancy.ai_turns turn
  WHERE turn.tenant_id = runtime.tenant_id AND turn.session_id = runtime.id
    AND turn.input_id = target_input_id
  FOR UPDATE;
  IF turn_record IS NULL OR turn_record.status = 'completed' THEN RETURN false; END IF;
  IF turn_record.status = 'failed' THEN RETURN true; END IF;

  UPDATE tenancy.quota_accounts account
  SET reserved_quantity = account.reserved_quantity - 1, updated_at = now()
  FROM tenancy.usage_reservations reservation
  WHERE reservation.tenant_id = runtime.tenant_id
    AND reservation.id = turn_record.usage_reservation_id
    AND reservation.status = 'reserved'
    AND account.tenant_id = reservation.tenant_id AND account.id = reservation.quota_account_id;

  UPDATE tenancy.usage_reservations reservation_target
  SET status = 'released', settled_quantity = 0, settled_at = now(),
    reason_code = left(COALESCE(target_safe_error_code, 'generation_failed'), 100)
  WHERE reservation_target.tenant_id = runtime.tenant_id
    AND reservation_target.id = turn_record.usage_reservation_id
    AND reservation_target.status = 'reserved';
  GET DIAGNOSTICS changed = ROW_COUNT;

  IF changed = 1 THEN
    INSERT INTO tenancy.usage_events (
      tenant_id, subscription_id, entitlement_snapshot_id, reservation_id, product_key,
      operation_id, event_type, customer_unit, customer_quantity, idempotency_key, occurred_at
    )
    SELECT runtime.tenant_id, account.subscription_id, runtime.entitlement_snapshot_id,
      turn_record.usage_reservation_id, 'ai_chat', turn_record.id::text, 'released',
      'ai_response', 0, 'ai:turn:' || target_input_id::text || ':released', now()
    FROM tenancy.usage_reservations reservation
    JOIN tenancy.quota_accounts account
      ON account.tenant_id = reservation.tenant_id AND account.id = reservation.quota_account_id
    WHERE reservation.tenant_id = runtime.tenant_id
      AND reservation.id = turn_record.usage_reservation_id
    ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
  END IF;

  UPDATE tenancy.ai_turns turn_target
  SET status = 'failed',
    safe_error_code = left(COALESCE(target_safe_error_code, 'generation_failed'), 100),
    completed_at = now()
  WHERE turn_target.tenant_id = runtime.tenant_id AND turn_target.id = turn_record.id;
  UPDATE tenancy.ai_sessions session_target
  SET status = CASE WHEN runtime.automation_mode = 'human' THEN 'handover' ELSE 'active' END,
    updated_at = now()
  WHERE session_target.tenant_id = runtime.tenant_id AND session_target.id = runtime.id;
  RETURN true;
END
$$;

REVOKE ALL ON FUNCTION tenancy.detect_ai_text_language(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.start_ai_session_localized(bytea, bytea, text, uuid, uuid, uuid, timestamptz, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.begin_ai_turn_localized(bytea, bytea, text, uuid, uuid, uuid, text, bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.fail_ai_turn_safe(bytea, bytea, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.start_ai_session_localized(bytea, bytea, text, uuid, uuid, uuid, timestamptz, text, text) TO djay_ai_runtime;
GRANT EXECUTE ON FUNCTION tenancy.begin_ai_turn_localized(bytea, bytea, text, uuid, uuid, uuid, text, bytea) TO djay_ai_runtime;
GRANT EXECUTE ON FUNCTION tenancy.fail_ai_turn_safe(bytea, bytea, text, uuid, text) TO djay_ai_runtime;
