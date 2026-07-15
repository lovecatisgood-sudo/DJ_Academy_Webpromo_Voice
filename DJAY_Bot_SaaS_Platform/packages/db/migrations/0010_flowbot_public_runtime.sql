DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'djay_flowbot_runtime') THEN
    CREATE ROLE djay_flowbot_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;

ALTER TABLE tenancy.flow_executions
  ADD COLUMN session_token_hash bytea NOT NULL UNIQUE
    CHECK (octet_length(session_token_hash) = 32);

CREATE OR REPLACE FUNCTION tenancy.flowbot_origin_allowed(allowed_origins text[], request_origin text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT request_origin IS NOT NULL
    AND request_origin ~ '^https?://[^/]+$'
    AND request_origin = ANY(allowed_origins)
$$;

CREATE OR REPLACE FUNCTION tenancy.flowbot_runtime_config(
  target_key_hash bytea,
  request_origin text
)
RETURNS TABLE (
  bot_name text,
  default_language text,
  branding_removed boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, tenancy, catalog
AS $$
  SELECT bot.name, bot.default_language,
         bot.branding_removed AND COALESCE((snapshot.resolved_json->'entitlements'->>'branding.remove')::boolean, false)
  FROM tenancy.flow_deployments deployment
  JOIN tenancy.flow_bots bot
    ON bot.tenant_id = deployment.tenant_id AND bot.id = deployment.bot_id
  JOIN tenancy.flow_versions version
    ON version.tenant_id = bot.tenant_id AND version.id = bot.current_published_version_id
  JOIN LATERAL (
    SELECT candidate.*
    FROM tenancy.entitlement_snapshots candidate
    JOIN tenancy.product_subscriptions subscription
      ON subscription.tenant_id = candidate.tenant_id
      AND subscription.id = candidate.subscription_id
      AND subscription.status IN ('active', 'trialing', 'scheduled_change')
    WHERE candidate.tenant_id = bot.tenant_id
      AND candidate.product_key = 'flowbot'
      AND candidate.access_mode = 'active'
      AND candidate.resolved_json->'entitlements'->>'ai.enabled' = 'false'
    ORDER BY candidate.created_at DESC, candidate.id DESC
    LIMIT 1
  ) snapshot ON true
  WHERE deployment.deployment_key_hash = target_key_hash
    AND deployment.status = 'active'
    AND bot.status = 'active'
    AND version.status = 'published'
    AND tenancy.flowbot_origin_allowed(deployment.allowed_origins, request_origin)
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION tenancy.start_flowbot_execution(
  target_key_hash bytea,
  target_session_hash bytea,
  request_origin text,
  target_execution_id uuid,
  target_contact_id uuid,
  target_conversation_id uuid,
  target_reservation_id uuid,
  target_expires_at timestamptz,
  target_language text
)
RETURNS TABLE (
  execution_id uuid,
  flow_version_id uuid,
  snapshot_json jsonb,
  state_json jsonb,
  authority_json jsonb,
  next_input_sequence integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy, catalog
AS $$
DECLARE
  resolved record;
  quota record;
  initial_state jsonb;
BEGIN
  IF octet_length(target_key_hash) <> 32 OR octet_length(target_session_hash) <> 32 THEN
    RAISE EXCEPTION 'invalid_runtime_credential';
  END IF;
  IF target_language NOT IN ('th', 'en') OR target_expires_at <= now()
     OR target_expires_at > now() + interval '24 hours' THEN
    RAISE EXCEPTION 'invalid_runtime_request';
  END IF;

  SELECT deployment.tenant_id, deployment.id AS deployment_id, bot.id AS bot_id,
         version.id AS version_id, version.snapshot_json, snapshot.id AS snapshot_id,
         snapshot.subscription_id, snapshot.resolved_json,
         plan.plan_key
  INTO resolved
  FROM tenancy.flow_deployments deployment
  JOIN tenancy.flow_bots bot
    ON bot.tenant_id = deployment.tenant_id AND bot.id = deployment.bot_id
  JOIN tenancy.flow_versions version
    ON version.tenant_id = bot.tenant_id AND version.id = bot.current_published_version_id
  JOIN LATERAL (
    SELECT candidate.*
    FROM tenancy.entitlement_snapshots candidate
    JOIN tenancy.product_subscriptions subscription
      ON subscription.tenant_id = candidate.tenant_id
      AND subscription.id = candidate.subscription_id
      AND subscription.status IN ('active', 'trialing', 'scheduled_change')
    WHERE candidate.tenant_id = bot.tenant_id
      AND candidate.product_key = 'flowbot'
      AND candidate.access_mode = 'active'
      AND candidate.resolved_json->'entitlements'->>'ai.enabled' = 'false'
    ORDER BY candidate.created_at DESC, candidate.id DESC
    LIMIT 1
  ) snapshot ON true
  JOIN catalog.plan_versions plan_version ON plan_version.id = snapshot.plan_version_id
  JOIN catalog.plans plan ON plan.id = plan_version.plan_id AND plan.product_key = 'flowbot'
  WHERE deployment.deployment_key_hash = target_key_hash
    AND deployment.status = 'active'
    AND bot.status = 'active'
    AND version.status = 'published'
    AND tenancy.flowbot_origin_allowed(deployment.allowed_origins, request_origin)
  LIMIT 1;

  IF resolved IS NULL THEN RAISE EXCEPTION 'deployment_not_available'; END IF;

  SELECT account.id, account.reserved_quantity, account.settled_quantity,
         account.safety_cap_quantity
  INTO quota
  FROM tenancy.quota_accounts account
  WHERE account.tenant_id = resolved.tenant_id
    AND account.subscription_id = resolved.subscription_id
    AND account.product_key = 'flowbot'
    AND account.customer_unit = 'flow_execution'
    AND now() >= account.period_start AND now() < account.period_end
  ORDER BY account.period_start DESC
  LIMIT 1
  FOR UPDATE;

  IF quota IS NULL THEN RAISE EXCEPTION 'flowbot_quota_unavailable'; END IF;
  IF quota.safety_cap_quantity IS NOT NULL
     AND quota.reserved_quantity + quota.settled_quantity + 1 > quota.safety_cap_quantity THEN
    RAISE EXCEPTION 'flowbot_safety_cap';
  END IF;

  INSERT INTO tenancy.contacts (id, tenant_id, display_name, locale)
  VALUES (target_contact_id, resolved.tenant_id, 'Website visitor', target_language);

  INSERT INTO tenancy.conversations (
    id, tenant_id, contact_id, product_key, public_plan_key,
    entitlement_snapshot_id, channel_kind, automation_mode
  ) VALUES (
    target_conversation_id, resolved.tenant_id, target_contact_id, 'flowbot', resolved.plan_key,
    resolved.snapshot_id, 'web', 'flowbot'
  );

  UPDATE tenancy.quota_accounts
  SET reserved_quantity = reserved_quantity + 1, updated_at = now()
  WHERE tenant_id = resolved.tenant_id AND id = quota.id;

  INSERT INTO tenancy.usage_reservations (
    id, tenant_id, quota_account_id, entitlement_snapshot_id, operation_id,
    idempotency_key, requested_quantity, reserved_quantity, status
  ) VALUES (
    target_reservation_id, resolved.tenant_id, quota.id, resolved.snapshot_id,
    target_execution_id::text, 'flowbot:start:' || target_execution_id::text, 1, 1, 'reserved'
  );

  INSERT INTO tenancy.usage_events (
    tenant_id, subscription_id, entitlement_snapshot_id, reservation_id,
    product_key, operation_id, event_type, customer_unit, customer_quantity,
    idempotency_key, occurred_at
  ) VALUES (
    resolved.tenant_id, resolved.subscription_id, resolved.snapshot_id, target_reservation_id,
    'flowbot', target_execution_id::text, 'reserved', 'flow_execution', 1,
    'flowbot:start:' || target_execution_id::text || ':reserved', now()
  );

  initial_state := jsonb_build_object(
    'currentNodeId', null, 'status', 'active', 'lang', target_language,
    'variables', '{}'::jsonb, 'subflowStack', '[]'::jsonb
  );
  INSERT INTO tenancy.flow_executions (
    id, tenant_id, deployment_id, bot_id, flow_version_id, conversation_id,
    entitlement_snapshot_id, usage_reservation_id, session_token_hash,
    state_json, expires_at
  ) VALUES (
    target_execution_id, resolved.tenant_id, resolved.deployment_id, resolved.bot_id,
    resolved.version_id, target_conversation_id, resolved.snapshot_id,
    target_reservation_id, target_session_hash, initial_state, target_expires_at
  );

  RETURN QUERY SELECT target_execution_id, resolved.version_id, resolved.snapshot_json,
    initial_state,
    jsonb_build_object(
      'planKey', resolved.plan_key,
      'accessMode', resolved.resolved_json->>'accessMode',
      'entitlements', COALESCE(resolved.resolved_json->'entitlements', '{}'::jsonb),
      'limits', COALESCE(resolved.resolved_json->'limits', '{}'::jsonb)
    ), 1;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.lock_flowbot_execution(
  target_session_hash bytea,
  request_origin text,
  target_input_id uuid
)
RETURNS TABLE (
  execution_id uuid,
  tenant_id uuid,
  flow_version_id uuid,
  snapshot_json jsonb,
  state_json jsonb,
  authority_json jsonb,
  next_input_sequence integer,
  replay_response_json jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy, catalog
AS $$
BEGIN
  IF octet_length(target_session_hash) <> 32 THEN RAISE EXCEPTION 'invalid_runtime_credential'; END IF;
  RETURN QUERY
  SELECT execution.id, execution.tenant_id, execution.flow_version_id,
         version.snapshot_json, execution.state_json,
         jsonb_build_object(
           'planKey', plan.plan_key,
           'accessMode', snapshot.resolved_json->>'accessMode',
           'entitlements', COALESCE(snapshot.resolved_json->'entitlements', '{}'::jsonb),
           'limits', COALESCE(snapshot.resolved_json->'limits', '{}'::jsonb)
         ), execution.next_input_sequence, processed.response_json
  FROM tenancy.flow_executions execution
  JOIN tenancy.flow_deployments deployment
    ON deployment.tenant_id = execution.tenant_id AND deployment.id = execution.deployment_id
  JOIN tenancy.flow_versions version
    ON version.tenant_id = execution.tenant_id AND version.id = execution.flow_version_id
  JOIN tenancy.entitlement_snapshots snapshot
    ON snapshot.tenant_id = execution.tenant_id AND snapshot.id = execution.entitlement_snapshot_id
  JOIN catalog.plan_versions plan_version ON plan_version.id = snapshot.plan_version_id
  JOIN catalog.plans plan ON plan.id = plan_version.plan_id AND plan.product_key = 'flowbot'
  LEFT JOIN tenancy.flow_processed_inputs processed
    ON processed.tenant_id = execution.tenant_id
    AND processed.execution_id = execution.id AND processed.input_id = target_input_id
  WHERE execution.session_token_hash = target_session_hash
    AND execution.expires_at > now()
    AND execution.status NOT IN ('failed', 'expired')
    AND deployment.status = 'active'
    AND tenancy.flowbot_origin_allowed(deployment.allowed_origins, request_origin)
  FOR UPDATE OF execution;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.commit_flowbot_step(
  target_session_hash bytea,
  target_input_id uuid,
  target_sequence integer,
  input_json jsonb,
  result_json jsonb,
  response_json jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy, catalog
AS $$
DECLARE
  execution record;
  replay jsonb;
  message jsonb;
  event jsonb;
  command jsonb;
  next_message_sequence integer;
  action_id uuid;
  target_lead_id uuid;
  command_type text;
  form_data jsonb;
BEGIN
  SELECT processed.response_json INTO replay
  FROM tenancy.flow_executions candidate
  JOIN tenancy.flow_processed_inputs processed
    ON processed.tenant_id = candidate.tenant_id AND processed.execution_id = candidate.id
  WHERE candidate.session_token_hash = target_session_hash AND processed.input_id = target_input_id;
  IF replay IS NOT NULL THEN RETURN replay; END IF;

  SELECT candidate.*, conversation.contact_id INTO execution
  FROM tenancy.flow_executions candidate
  JOIN tenancy.conversations conversation
    ON conversation.tenant_id = candidate.tenant_id AND conversation.id = candidate.conversation_id
  WHERE candidate.session_token_hash = target_session_hash
    AND candidate.expires_at > now()
  FOR UPDATE;
  IF execution IS NULL THEN RAISE EXCEPTION 'flowbot_session_not_available'; END IF;
  IF target_sequence <> execution.next_input_sequence THEN RAISE EXCEPTION 'flowbot_sequence_conflict'; END IF;
  IF jsonb_typeof(result_json->'messages') <> 'array'
     OR jsonb_typeof(result_json->'events') <> 'array'
     OR jsonb_typeof(result_json->'commands') <> 'array'
     OR jsonb_typeof(result_json->'nextState') <> 'object' THEN
    RAISE EXCEPTION 'invalid_flowbot_result';
  END IF;

  SELECT next_sequence INTO next_message_sequence
  FROM tenancy.conversations
  WHERE tenant_id = execution.tenant_id AND id = execution.conversation_id
  FOR UPDATE;

  IF input_json->>'type' <> 'start' THEN
    INSERT INTO tenancy.messages (
      tenant_id, conversation_id, sequence, actor_type, direction,
      content_json, external_message_id
    ) VALUES (
      execution.tenant_id, execution.conversation_id, next_message_sequence,
      'customer', 'inbound', input_json, target_input_id::text
    );
    next_message_sequence := next_message_sequence + 1;
  END IF;

  FOR message IN SELECT value FROM jsonb_array_elements(result_json->'messages') LOOP
    INSERT INTO tenancy.messages (
      tenant_id, conversation_id, sequence, actor_type, direction, content_json
    ) VALUES (
      execution.tenant_id, execution.conversation_id, next_message_sequence,
      'flowbot', 'outbound', message
    );
    next_message_sequence := next_message_sequence + 1;
  END LOOP;

  UPDATE tenancy.conversations
  SET next_sequence = next_message_sequence, updated_at = now()
  WHERE tenant_id = execution.tenant_id AND id = execution.conversation_id;

  FOR event IN SELECT value FROM jsonb_array_elements(result_json->'events') LOOP
    INSERT INTO tenancy.flow_events (
      tenant_id, bot_id, execution_id, flow_version_id,
      event_type, node_id, detail_json
    ) VALUES (
      execution.tenant_id, execution.bot_id, execution.id, execution.flow_version_id,
      left(event->>'type', 100), NULLIF(event->>'nodeId', '')::uuid,
      COALESCE(event->'detail', '{}'::jsonb)
    );
  END LOOP;

  FOR command IN SELECT value FROM jsonb_array_elements(result_json->'commands') LOOP
    command_type := command->>'type';
    IF command_type = 'lead.create' THEN
      action_id := gen_random_uuid();
      INSERT INTO tenancy.action_requests (
        id, tenant_id, conversation_id, entitlement_snapshot_id,
        action_type, input_json, idempotency_key, status, completed_at
      ) VALUES (
        action_id, execution.tenant_id, execution.conversation_id,
        execution.entitlement_snapshot_id, 'lead.create', command,
        command->>'idempotencyKey', 'succeeded', now()
      ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;

      SELECT conversations.lead_id INTO target_lead_id
      FROM tenancy.conversations
      WHERE tenant_id = execution.tenant_id AND id = execution.conversation_id
      FOR UPDATE;
      form_data := COALESCE(command->'payload'->'data', '{}'::jsonb);
      IF target_lead_id IS NULL THEN
        target_lead_id := gen_random_uuid();
        UPDATE tenancy.contacts
        SET display_name = left(COALESCE(NULLIF(form_data->>'name', ''), display_name), 200), updated_at = now()
        WHERE tenant_id = execution.tenant_id AND id = execution.contact_id;
        INSERT INTO tenancy.leads (id, tenant_id, contact_id, title, source)
        VALUES (target_lead_id, execution.tenant_id, execution.contact_id, 'Website FlowBot lead', 'flowbot_web');
        INSERT INTO tenancy.lead_status_history (
          tenant_id, lead_id, from_status, to_status, source_action, request_id
        ) VALUES (
          execution.tenant_id, target_lead_id, NULL, 'new', 'flowbot.lead.create',
          command->>'idempotencyKey'
        );
        UPDATE tenancy.conversations SET lead_id = target_lead_id
        WHERE tenant_id = execution.tenant_id AND id = execution.conversation_id;
      END IF;
      IF NULLIF(lower(btrim(form_data->>'email')), '') IS NOT NULL THEN
        INSERT INTO tenancy.contact_identities (
          tenant_id, contact_id, identity_kind, normalized_value
        ) VALUES (
          execution.tenant_id, execution.contact_id, 'email', lower(btrim(form_data->>'email'))
        );
      END IF;
      IF NULLIF(lower(btrim(form_data->>'phone')), '') IS NOT NULL THEN
        INSERT INTO tenancy.contact_identities (
          tenant_id, contact_id, identity_kind, normalized_value
        ) VALUES (
          execution.tenant_id, execution.contact_id, 'phone', lower(btrim(form_data->>'phone'))
        );
      END IF;
      INSERT INTO tenancy.action_results (tenant_id, action_request_id, success, result_json)
      SELECT execution.tenant_id, action_id, true, jsonb_build_object('leadId', target_lead_id)
      WHERE EXISTS (SELECT 1 FROM tenancy.action_requests WHERE tenant_id = execution.tenant_id AND id = action_id);
    ELSIF command_type = 'handover.request' THEN
      action_id := gen_random_uuid();
      INSERT INTO tenancy.action_requests (
        id, tenant_id, conversation_id, entitlement_snapshot_id,
        action_type, input_json, idempotency_key, status, completed_at
      ) VALUES (
        action_id, execution.tenant_id, execution.conversation_id,
        execution.entitlement_snapshot_id, 'handover.request', command,
        command->>'idempotencyKey', 'succeeded', now()
      ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
      INSERT INTO tenancy.handover_events (
        tenant_id, conversation_id, event_type, reason, idempotency_key
      ) VALUES (
        execution.tenant_id, execution.conversation_id, 'requested',
        COALESCE(command->'payload'->>'reason', 'flowbot_team_route'),
        command->>'idempotencyKey'
      ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
      UPDATE tenancy.conversations
      SET automation_mode = 'human', updated_at = now()
      WHERE tenant_id = execution.tenant_id AND id = execution.conversation_id
        AND automation_mode = 'flowbot';
      INSERT INTO tenancy.action_results (tenant_id, action_request_id, success, result_json)
      SELECT execution.tenant_id, action_id, true, '{"handover":"requested"}'::jsonb
      WHERE EXISTS (SELECT 1 FROM tenancy.action_requests WHERE tenant_id = execution.tenant_id AND id = action_id);
    ELSIF command_type = 'timer.schedule' THEN
      INSERT INTO tenancy.flow_timers (
        tenant_id, execution_id, flow_version_id, node_id,
        due_at, idempotency_key
      ) VALUES (
        execution.tenant_id, execution.id, execution.flow_version_id,
        (command->'payload'->>'nodeId')::uuid,
        now() + make_interval(secs => (command->'payload'->>'delaySeconds')::integer),
        command->>'idempotencyKey'
      ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
    ELSIF command_type = 'integration.dispatch' THEN
      INSERT INTO tenancy.flow_integration_dispatches (
        tenant_id, execution_id, node_id, integration_profile_id, template_key,
        payload_ciphertext, idempotency_key
      )
      SELECT execution.tenant_id, execution.id, (command->'payload'->>'nodeId')::uuid,
        (command->'payload'->>'integrationProfileId')::uuid,
        command->'payload'->>'templateKey', command->'payload'->>'payloadCiphertext',
        command->>'idempotencyKey'
      FROM tenancy.flow_integration_profiles profile
      WHERE profile.tenant_id = execution.tenant_id
        AND profile.id = (command->'payload'->>'integrationProfileId')::uuid
        AND profile.status = 'approved'
        AND command->'payload'->>'templateKey' = ANY(profile.allowed_template_keys)
      ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
    ELSIF command_type <> 'subflow.enter' THEN
      RAISE EXCEPTION 'unsupported_flowbot_command';
    END IF;
  END LOOP;

  UPDATE tenancy.flow_executions
  SET state_json = result_json->'nextState',
      status = CASE result_json->'nextState'->>'status'
        WHEN 'waiting' THEN 'waiting'
        WHEN 'handover' THEN 'handover'
        WHEN 'completed' THEN 'completed'
        ELSE 'active'
      END,
      next_input_sequence = next_input_sequence + 1,
      updated_at = now(),
      completed_at = CASE WHEN result_json->'nextState'->>'status' = 'completed' THEN now() ELSE completed_at END
  WHERE tenant_id = execution.tenant_id AND id = execution.id;

  IF target_sequence = 1 THEN
    UPDATE tenancy.quota_accounts account
    SET reserved_quantity = account.reserved_quantity - 1,
        settled_quantity = account.settled_quantity + 1,
        updated_at = now()
    FROM tenancy.usage_reservations reservation
    WHERE reservation.tenant_id = execution.tenant_id
      AND reservation.id = execution.usage_reservation_id
      AND account.tenant_id = reservation.tenant_id
      AND account.id = reservation.quota_account_id
      AND reservation.status = 'reserved';
    UPDATE tenancy.usage_reservations
    SET status = 'settled', settled_quantity = 1, settled_at = now()
    WHERE tenant_id = execution.tenant_id AND id = execution.usage_reservation_id
      AND status = 'reserved';
    INSERT INTO tenancy.usage_events (
      tenant_id, subscription_id, entitlement_snapshot_id, reservation_id,
      product_key, operation_id, event_type, customer_unit, customer_quantity,
      idempotency_key, occurred_at
    )
    SELECT execution.tenant_id, account.subscription_id, execution.entitlement_snapshot_id,
      execution.usage_reservation_id, 'flowbot', execution.id::text, 'settled',
      'flow_execution', 1, 'flowbot:start:' || execution.id::text || ':settled', now()
    FROM tenancy.usage_reservations reservation
    JOIN tenancy.quota_accounts account
      ON account.tenant_id = reservation.tenant_id AND account.id = reservation.quota_account_id
    WHERE reservation.tenant_id = execution.tenant_id
      AND reservation.id = execution.usage_reservation_id
    ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
  END IF;

  INSERT INTO tenancy.flow_processed_inputs (
    tenant_id, execution_id, input_id, input_sequence, response_json
  ) VALUES (
    execution.tenant_id, execution.id, target_input_id, target_sequence, response_json
  );
  RETURN response_json;
END
$$;

REVOKE ALL ON FUNCTION tenancy.flowbot_origin_allowed(text[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.flowbot_runtime_config(bytea, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.start_flowbot_execution(bytea, bytea, text, uuid, uuid, uuid, uuid, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.lock_flowbot_execution(bytea, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.commit_flowbot_step(bytea, uuid, integer, jsonb, jsonb, jsonb) FROM PUBLIC;

GRANT USAGE ON SCHEMA tenancy TO djay_flowbot_runtime;
GRANT EXECUTE ON FUNCTION tenancy.flowbot_runtime_config(bytea, text) TO djay_flowbot_runtime;
GRANT EXECUTE ON FUNCTION tenancy.start_flowbot_execution(bytea, bytea, text, uuid, uuid, uuid, uuid, timestamptz, text) TO djay_flowbot_runtime;
GRANT EXECUTE ON FUNCTION tenancy.lock_flowbot_execution(bytea, text, uuid) TO djay_flowbot_runtime;
GRANT EXECUTE ON FUNCTION tenancy.commit_flowbot_step(bytea, uuid, integer, jsonb, jsonb, jsonb) TO djay_flowbot_runtime;
