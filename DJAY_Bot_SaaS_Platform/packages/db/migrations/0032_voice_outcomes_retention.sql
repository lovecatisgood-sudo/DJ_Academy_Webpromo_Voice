ALTER TABLE tenancy.voice_turns
  ADD COLUMN redacted_at timestamptz;

CREATE TABLE tenancy.voice_call_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  session_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  final_stage text NOT NULL,
  intent text NOT NULL,
  outcome_code text NOT NULL CHECK (outcome_code IN (
    'engaged', 'lead_captured', 'appointment_requested', 'callback_requested', 'transferred'
  )),
  summary_text text NOT NULL CHECK (char_length(summary_text) BETWEEN 2 AND 500),
  action_types text[] NOT NULL DEFAULT '{}',
  terminal_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, session_id),
  FOREIGN KEY (tenant_id, session_id) REFERENCES tenancy.voice_sessions(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, conversation_id) REFERENCES tenancy.conversations(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.voice_callback_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  session_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  turn_id uuid NOT NULL,
  action_request_id uuid NOT NULL,
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, action_request_id),
  FOREIGN KEY (tenant_id, session_id) REFERENCES tenancy.voice_sessions(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, conversation_id) REFERENCES tenancy.conversations(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, lead_id) REFERENCES tenancy.leads(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, turn_id) REFERENCES tenancy.voice_turns(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, action_request_id) REFERENCES tenancy.action_requests(tenant_id, id) ON DELETE RESTRICT,
  CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);

ALTER TABLE tenancy.voice_call_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.voice_call_outcomes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.voice_call_outcomes
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

ALTER TABLE tenancy.voice_callback_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.voice_callback_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.voice_callback_requests
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON tenancy.voice_call_outcomes, tenancy.voice_callback_requests FROM PUBLIC;
GRANT SELECT ON tenancy.voice_call_outcomes, tenancy.voice_callback_requests TO djay_runtime;
GRANT SELECT ON tenancy.voice_sessions, tenancy.voice_turns,
  tenancy.voice_call_outcomes, tenancy.voice_callback_requests TO djay_worker;

CREATE OR REPLACE FUNCTION tenancy.capture_voice_turn_outcome()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
DECLARE
  action_types text[];
  derived_outcome text;
  derived_summary text;
  callback_action record;
  target_lead_id uuid;
BEGIN
  IF NEW.status <> 'completed' OR NEW.redacted_at IS NOT NULL
     OR NEW.structured_output_json IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(array_agg(item->>'type' ORDER BY ordinal), '{}'::text[])
  INTO action_types
  FROM jsonb_array_elements(COALESCE(NEW.structured_output_json->'proposedActions', '[]'::jsonb))
       WITH ORDINALITY AS action(item, ordinal);

  derived_outcome := CASE
    WHEN 'handover.request' = ANY(action_types) THEN 'transferred'
    WHEN 'follow_up.create' = ANY(action_types) THEN 'callback_requested'
    WHEN 'appointment.request' = ANY(action_types) THEN 'appointment_requested'
    WHEN 'lead.capture' = ANY(action_types) THEN 'lead_captured'
    ELSE 'engaged'
  END;
  derived_summary := CASE derived_outcome
    WHEN 'transferred' THEN 'The call was transferred to a team member.'
    WHEN 'callback_requested' THEN 'The customer requested a callback.'
    WHEN 'appointment_requested' THEN 'Appointment options were captured and await merchant confirmation.'
    WHEN 'lead_captured' THEN 'Customer contact details and sales interest were captured.'
    ELSE 'The customer engaged with the voice sales assistant.'
  END;

  INSERT INTO tenancy.voice_call_outcomes (
    tenant_id, session_id, conversation_id, final_stage, intent,
    outcome_code, summary_text, action_types
  )
  SELECT NEW.tenant_id, NEW.session_id, session.conversation_id,
    COALESCE(NEW.structured_output_json->>'stage', 'S0_GREETING'),
    COALESCE(NEW.structured_output_json->>'intent', 'unknown'),
    derived_outcome, derived_summary, action_types
  FROM tenancy.voice_sessions session
  WHERE session.tenant_id = NEW.tenant_id AND session.id = NEW.session_id
  ON CONFLICT (tenant_id, session_id) DO UPDATE SET
    final_stage = EXCLUDED.final_stage,
    intent = EXCLUDED.intent,
    outcome_code = EXCLUDED.outcome_code,
    summary_text = EXCLUDED.summary_text,
    action_types = EXCLUDED.action_types,
    updated_at = now();

  SELECT conversation.lead_id INTO target_lead_id
  FROM tenancy.voice_sessions session
  JOIN tenancy.conversations conversation
    ON conversation.tenant_id = session.tenant_id AND conversation.id = session.conversation_id
  WHERE session.tenant_id = NEW.tenant_id AND session.id = NEW.session_id;

  IF target_lead_id IS NOT NULL THEN
    FOR callback_action IN
      SELECT request.id, request.input_json,
             session.conversation_id
      FROM tenancy.action_requests request
      JOIN tenancy.voice_sessions session
        ON session.tenant_id = request.tenant_id AND session.conversation_id = request.conversation_id
      WHERE request.tenant_id = NEW.tenant_id
        AND session.id = NEW.session_id
        AND request.action_type = 'follow_up.create'
        AND request.idempotency_key LIKE 'voice:' || NEW.id::text || ':%'
    LOOP
      INSERT INTO tenancy.voice_callback_requests (
        tenant_id, session_id, conversation_id, lead_id, turn_id,
        action_request_id, due_at
      ) VALUES (
        NEW.tenant_id, NEW.session_id, callback_action.conversation_id,
        target_lead_id, NEW.id, callback_action.id,
        (callback_action.input_json->>'dueAt')::timestamptz
      ) ON CONFLICT (tenant_id, action_request_id) DO NOTHING;
    END LOOP;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER tenancy_voice_turn_outcome
AFTER INSERT OR UPDATE OF status, structured_output_json ON tenancy.voice_turns
FOR EACH ROW EXECUTE FUNCTION tenancy.capture_voice_turn_outcome();

CREATE OR REPLACE FUNCTION tenancy.finalize_voice_call_outcome()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
BEGIN
  IF NEW.status IN ('ended', 'failed', 'expired') AND NEW.terminal_reason IS NOT NULL THEN
    UPDATE tenancy.voice_call_outcomes SET
      terminal_reason = NEW.terminal_reason,
      outcome_code = CASE
        WHEN NEW.terminal_reason = 'transferred' THEN 'transferred'
        WHEN NEW.terminal_reason = 'callback_requested' THEN 'callback_requested'
        ELSE outcome_code
      END,
      summary_text = CASE
        WHEN NEW.terminal_reason = 'transferred' THEN 'The call was transferred to a team member.'
        WHEN NEW.terminal_reason = 'callback_requested' THEN 'The customer requested a callback.'
        ELSE summary_text
      END,
      updated_at = now()
    WHERE tenant_id = NEW.tenant_id AND session_id = NEW.id;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER tenancy_voice_session_outcome_finalize
AFTER UPDATE OF status, terminal_reason ON tenancy.voice_sessions
FOR EACH ROW EXECUTE FUNCTION tenancy.finalize_voice_call_outcome();

ALTER FUNCTION tenancy.commit_voice_turn(uuid, uuid, uuid, jsonb, jsonb, bigint, bigint, bigint)
  RENAME TO commit_voice_turn_core;

REVOKE ALL ON FUNCTION tenancy.commit_voice_turn_core(uuid, uuid, uuid, jsonb, jsonb, bigint, bigint, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.commit_voice_turn_core(uuid, uuid, uuid, jsonb, jsonb, bigint, bigint, bigint) FROM djay_voice_runtime;

CREATE FUNCTION tenancy.commit_voice_turn(
  target_session_id uuid, target_connection_id uuid, target_input_id uuid,
  structured_output jsonb, public_response jsonb,
  native_input_units bigint, native_output_units bigint, native_cached_units bigint DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
DECLARE
  result jsonb;
BEGIN
  IF session_user <> 'djay_voice_runtime' THEN RAISE EXCEPTION 'voice_runtime_role_required'; END IF;
  result := tenancy.commit_voice_turn_core(
    target_session_id, target_connection_id, target_input_id,
    structured_output, public_response,
    native_input_units, native_output_units, native_cached_units
  );
  IF EXISTS (
    SELECT 1 FROM tenancy.voice_callback_requests callback
    JOIN tenancy.voice_turns turn
      ON turn.tenant_id = callback.tenant_id AND turn.id = callback.turn_id
    WHERE callback.tenant_id = turn.tenant_id
      AND turn.session_id = target_session_id AND turn.input_id = target_input_id
  ) THEN
    result := result || jsonb_build_object('terminalReason', 'callback_requested');
  END IF;
  RETURN result;
END
$$;

REVOKE ALL ON FUNCTION tenancy.commit_voice_turn(uuid, uuid, uuid, jsonb, jsonb, bigint, bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.commit_voice_turn(uuid, uuid, uuid, jsonb, jsonb, bigint, bigint, bigint) TO djay_voice_runtime;

CREATE OR REPLACE FUNCTION tenancy.ensure_default_retention_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
BEGIN
  IF NEW.role = 'tenant_master_admin' AND NEW.status = 'active' THEN
    INSERT INTO tenancy.retention_policies (tenant_id, updated_by_membership_id)
    VALUES (NEW.tenant_id, NEW.id) ON CONFLICT (tenant_id) DO NOTHING;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER tenancy_default_retention_policy
AFTER INSERT ON tenancy.memberships
FOR EACH ROW EXECUTE FUNCTION tenancy.ensure_default_retention_policy();

INSERT INTO tenancy.retention_policies (tenant_id, updated_by_membership_id)
SELECT membership.tenant_id, membership.id
FROM tenancy.memberships membership
WHERE membership.role = 'tenant_master_admin' AND membership.status = 'active'
ON CONFLICT (tenant_id) DO NOTHING;

CREATE OR REPLACE FUNCTION tenancy.reject_shared_domain_immutable_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, tenancy AS $$
BEGIN
  IF TG_TABLE_NAME = 'messages'
     AND session_user = 'djay_worker'
     AND (
       nullif(current_setting('app.privacy_erasure_job_id', true), '') IS NOT NULL
       OR (
         current_setting('app.service', true) = 'retention_worker'
         AND current_setting('app.retention_sweep', true) = 'true'
       )
     ) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION '% is immutable', TG_TABLE_NAME;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.apply_retention_policies(target_now timestamptz, target_limit integer)
RETURNS TABLE (messages_redacted integer, voice_turns_redacted integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
DECLARE
  changed_messages integer := 0;
  changed_voice_turns integer := 0;
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'retention_worker' THEN
    RAISE EXCEPTION 'retention_worker_context_required';
  END IF;
  IF target_limit NOT BETWEEN 1 AND 5000 OR target_now > now() + interval '1 minute' THEN
    RAISE EXCEPTION 'invalid_retention_request';
  END IF;
  PERFORM set_config('app.retention_sweep', 'true', true);

  WITH expired AS (
    SELECT message.id
    FROM tenancy.messages message
    JOIN tenancy.retention_policies policy ON policy.tenant_id = message.tenant_id
    WHERE message.created_at < target_now - make_interval(days => policy.message_days)
      AND message.content_json->>'type' IS DISTINCT FROM 'retained_tombstone'
    ORDER BY message.created_at, message.id
    LIMIT target_limit
    FOR UPDATE OF message SKIP LOCKED
  )
  UPDATE tenancy.messages message
  SET content_json = '{"type":"retained_tombstone","text":"[transcript expired]"}'::jsonb
  FROM expired WHERE message.id = expired.id;
  GET DIAGNOSTICS changed_messages = ROW_COUNT;

  WITH expired AS (
    SELECT turn.id
    FROM tenancy.voice_turns turn
    JOIN tenancy.retention_policies policy ON policy.tenant_id = turn.tenant_id
    WHERE turn.completed_at < target_now - make_interval(days => policy.message_days)
      AND turn.redacted_at IS NULL
    ORDER BY turn.completed_at, turn.id
    LIMIT target_limit
    FOR UPDATE OF turn SKIP LOCKED
  )
  UPDATE tenancy.voice_turns turn SET
    structured_output_json = '{"schemaVersion":"sales-core.v1","redacted":true}'::jsonb,
    public_response_json = '{"status":"redacted","text":"[transcript expired]"}'::jsonb,
    redacted_at = target_now
  FROM expired WHERE turn.id = expired.id;
  GET DIAGNOSTICS changed_voice_turns = ROW_COUNT;

  RETURN QUERY SELECT changed_messages, changed_voice_turns;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.redact_voice_contact_data()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
BEGIN
  IF NEW.status = 'erased' AND OLD.status IS DISTINCT FROM 'erased' THEN
    UPDATE tenancy.voice_turns turn SET
      structured_output_json = '{"schemaVersion":"sales-core.v1","redacted":true}'::jsonb,
      public_response_json = '{"status":"redacted","text":"[personal data erased]"}'::jsonb,
      redacted_at = now()
    FROM tenancy.voice_sessions session
    WHERE session.tenant_id = NEW.tenant_id AND session.contact_id = NEW.id
      AND turn.tenant_id = session.tenant_id AND turn.session_id = session.id
      AND turn.redacted_at IS NULL;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER tenancy_voice_contact_erasure
AFTER UPDATE OF status ON tenancy.contacts
FOR EACH ROW EXECUTE FUNCTION tenancy.redact_voice_contact_data();

REVOKE ALL ON FUNCTION tenancy.apply_retention_policies(timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.apply_retention_policies(timestamptz, integer) TO djay_worker;
