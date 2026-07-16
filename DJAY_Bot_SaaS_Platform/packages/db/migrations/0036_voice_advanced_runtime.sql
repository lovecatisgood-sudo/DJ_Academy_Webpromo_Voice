CREATE TABLE platform.voice_admission_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capability_profile text NOT NULL CHECK (capability_profile = 'voice_gen2'),
  target_enabled boolean NOT NULL,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'approved', 'rejected', 'applied')),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 12 AND 500),
  evidence_sha256 bytea NOT NULL CHECK (octet_length(evidence_sha256) = 32),
  requested_by_platform_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  approved_by_platform_user_id uuid REFERENCES platform.users(id) ON DELETE RESTRICT,
  applied_by_platform_user_id uuid REFERENCES platform.users(id) ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  applied_at timestamptz,
  CHECK (approved_by_platform_user_id IS NULL OR approved_by_platform_user_id <> requested_by_platform_user_id),
  CHECK ((status IN ('approved', 'applied')) = (approved_at IS NOT NULL)),
  CHECK ((status = 'applied') = (applied_at IS NOT NULL))
);

CREATE UNIQUE INDEX platform_voice_one_pending_admission_change
  ON platform.voice_admission_changes(capability_profile)
  WHERE status IN ('requested', 'approved');

CREATE OR REPLACE FUNCTION platform.disable_voice_admission_outside_running()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, platform
AS $$
BEGIN
  IF NEW.mode <> 'running' THEN NEW.admission_enabled := false; END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER platform_voice_profile_fail_closed_admission
BEFORE INSERT OR UPDATE OF mode ON platform.voice_profile_controls
FOR EACH ROW EXECUTE FUNCTION platform.disable_voice_admission_outside_running();

CREATE OR REPLACE FUNCTION platform.get_voice_admission_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
DECLARE actor record;
BEGIN
  SELECT * INTO actor FROM platform.current_voice_routing_operator();
  RETURN jsonb_build_object(
    'admissionEnabled', COALESCE((SELECT control.admission_enabled
      FROM platform.voice_profile_controls control
      WHERE control.capability_profile = 'voice_gen2'), false),
    'changes', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', change.id, 'capabilityProfile', change.capability_profile,
      'targetEnabled', change.target_enabled, 'status', change.status,
      'reason', change.reason,
      'requestedByPlatformUserId', change.requested_by_platform_user_id,
      'approvedByPlatformUserId', change.approved_by_platform_user_id,
      'requestedAt', change.requested_at, 'approvedAt', change.approved_at,
      'appliedAt', change.applied_at
    ) ORDER BY change.requested_at DESC, change.id DESC)
    FROM platform.voice_admission_changes change), '[]'::jsonb)
  );
END
$$;

CREATE OR REPLACE FUNCTION platform.request_voice_admission_change(
  target_enabled boolean,
  target_reason text,
  target_evidence_sha256 bytea
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
DECLARE actor record; change_id uuid; control record;
BEGIN
  SELECT * INTO actor FROM platform.current_voice_routing_operator();
  IF char_length(btrim(target_reason)) NOT BETWEEN 12 AND 500
     OR octet_length(target_evidence_sha256) <> 32 THEN
    RAISE EXCEPTION 'invalid_voice_admission_change';
  END IF;
  SELECT * INTO control FROM platform.voice_profile_controls
  WHERE capability_profile = 'voice_gen2' FOR UPDATE;
  IF control.admission_enabled = target_enabled THEN
    RAISE EXCEPTION 'voice_admission_state_unchanged';
  END IF;
  IF target_enabled AND (
    control.mode <> 'running' OR NOT EXISTS (
      SELECT 1 FROM platform.voice_active_routes route
      JOIN platform.voice_route_candidates candidate
        ON candidate.id = route.primary_candidate_id
        AND candidate.capability_profile = route.capability_profile
        AND candidate.status = 'qualified'
      WHERE route.capability_profile = 'voice_gen2'
    )
  ) THEN RAISE EXCEPTION 'voice_admission_route_unavailable'; END IF;
  INSERT INTO platform.voice_admission_changes (
    capability_profile, target_enabled, reason, evidence_sha256,
    requested_by_platform_user_id
  ) VALUES (
    'voice_gen2', target_enabled, btrim(target_reason), target_evidence_sha256,
    actor.actor_id
  ) RETURNING id INTO change_id;
  INSERT INTO platform.audit_logs (
    actor_platform_user_id, action, target_type, target_id, request_id,
    reason, result, metadata
  ) VALUES (
    actor.actor_id, 'voice.admission.requested', 'voice_admission_change',
    change_id::text, actor.request_id, 'admission_change_requested', 'succeeded',
    jsonb_build_object('targetEnabled', target_enabled)
  );
  RETURN change_id;
END
$$;

CREATE OR REPLACE FUNCTION platform.review_voice_admission_change(
  target_change_id uuid,
  target_decision text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
DECLARE actor record; change_record record; next_status text;
BEGIN
  SELECT * INTO actor FROM platform.current_voice_routing_operator();
  SELECT * INTO change_record FROM platform.voice_admission_changes
  WHERE id = target_change_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'voice_admission_change_not_found'; END IF;
  IF target_decision NOT IN ('approve', 'reject')
     OR change_record.status <> 'requested'
     OR change_record.requested_by_platform_user_id = actor.actor_id THEN
    RAISE EXCEPTION 'voice_admission_independent_review_required';
  END IF;
  next_status := CASE target_decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END;
  UPDATE platform.voice_admission_changes
  SET status = next_status, approved_by_platform_user_id = actor.actor_id,
      approved_at = CASE WHEN next_status = 'approved' THEN now() ELSE NULL END
  WHERE id = target_change_id;
  INSERT INTO platform.audit_logs (
    actor_platform_user_id, action, target_type, target_id, request_id,
    reason, result, metadata
  ) VALUES (
    actor.actor_id, 'voice.admission.reviewed', 'voice_admission_change',
    target_change_id::text, actor.request_id, target_decision, 'succeeded',
    jsonb_build_object('status', next_status)
  );
  RETURN next_status;
END
$$;

CREATE OR REPLACE FUNCTION platform.apply_voice_admission_change(target_change_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
DECLARE actor record; change_record record; control record;
BEGIN
  SELECT * INTO actor FROM platform.current_voice_routing_operator();
  PERFORM pg_advisory_xact_lock(hashtextextended('voice-admission:voice_gen2', 0));
  SELECT * INTO change_record FROM platform.voice_admission_changes
  WHERE id = target_change_id FOR UPDATE;
  IF NOT FOUND OR change_record.status <> 'approved' THEN
    RAISE EXCEPTION 'voice_admission_change_not_applicable';
  END IF;
  SELECT * INTO control FROM platform.voice_profile_controls
  WHERE capability_profile = change_record.capability_profile FOR UPDATE;
  IF control.admission_enabled = change_record.target_enabled THEN
    RAISE EXCEPTION 'voice_admission_state_unchanged';
  END IF;
  IF change_record.target_enabled AND (
    control.mode <> 'running' OR NOT EXISTS (
      SELECT 1 FROM platform.voice_active_routes route
      JOIN platform.voice_route_candidates candidate
        ON candidate.id = route.primary_candidate_id
        AND candidate.capability_profile = route.capability_profile
        AND candidate.status = 'qualified'
      WHERE route.capability_profile = change_record.capability_profile
    )
  ) THEN RAISE EXCEPTION 'voice_admission_route_unavailable'; END IF;
  UPDATE platform.voice_profile_controls
  SET admission_enabled = change_record.target_enabled,
      version = version + 1, changed_by_platform_user_id = actor.actor_id,
      changed_at = now(),
      reason_code = CASE WHEN change_record.target_enabled
        THEN 'reviewed_admission_enabled' ELSE 'reviewed_admission_disabled' END
  WHERE capability_profile = change_record.capability_profile;
  UPDATE platform.voice_admission_changes
  SET status = 'applied', applied_by_platform_user_id = actor.actor_id,
      applied_at = now()
  WHERE id = target_change_id;
  INSERT INTO platform.audit_logs (
    actor_platform_user_id, action, target_type, target_id, request_id,
    reason, result, metadata
  ) VALUES (
    actor.actor_id, 'voice.admission.applied', 'voice_admission_change',
    target_change_id::text, actor.request_id, 'reviewed_admission_change', 'succeeded',
    jsonb_build_object('enabled', change_record.target_enabled)
  );
  RETURN change_record.target_enabled;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.issue_voice_session_grant(
  target_key_hash bytea, target_grant_hash bytea, request_origin text,
  target_session_id uuid, target_contact_id uuid, target_conversation_id uuid,
  target_expires_at timestamptz, target_locale text
)
RETURNS TABLE (
  session_id uuid, capability_profile text, public_label text, locale text,
  greeting text, automated_disclosure text, max_call_seconds integer,
  reconnect_window_seconds integer, expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy, catalog, platform
AS $$
DECLARE resolved record; selected_greeting text; selected_disclosure text;
  global_mode text;
BEGIN
  IF session_user <> 'djay_voice_runtime' THEN RAISE EXCEPTION 'voice_runtime_role_required'; END IF;
  IF octet_length(target_key_hash) <> 32 OR octet_length(target_grant_hash) <> 32
     OR target_locale NOT IN ('th', 'en') OR target_expires_at <= now()
     OR target_expires_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'invalid_voice_grant_request';
  END IF;
  SELECT control.mode INTO global_mode FROM platform.voice_runtime_controls control
  WHERE control.singleton = true FOR SHARE;
  IF global_mode <> 'running' THEN RAISE EXCEPTION 'voice_runtime_not_accepting_new_sessions'; END IF;

  SELECT deployment.*, agent.current_published_playbook_version_id,
         snapshot.id AS snapshot_id, snapshot.access_mode, snapshot.resolved_json,
         plan.plan_key
  INTO resolved
  FROM tenancy.voice_deployments deployment
  JOIN tenancy.ai_agents agent
    ON agent.tenant_id = deployment.tenant_id AND agent.id = deployment.agent_id
    AND agent.status = 'active' AND agent.current_published_playbook_version_id IS NOT NULL
  JOIN LATERAL (
    SELECT candidate.* FROM tenancy.entitlement_snapshots candidate
    JOIN tenancy.product_subscriptions subscription
      ON subscription.tenant_id = candidate.tenant_id
      AND subscription.id = candidate.subscription_id
      AND subscription.status IN ('active', 'trialing', 'scheduled_change')
    WHERE candidate.tenant_id = deployment.tenant_id AND candidate.product_key = 'voice'
    ORDER BY candidate.created_at DESC, candidate.id DESC LIMIT 1
  ) snapshot ON true
  JOIN catalog.plan_versions version ON version.id = snapshot.plan_version_id
  JOIN catalog.plans plan ON plan.id = version.plan_id AND plan.product_key = 'voice'
  WHERE deployment.deployment_key_hash = target_key_hash AND deployment.status = 'active'
    AND tenancy.ai_origin_allowed(deployment.allowed_origins, request_origin)
    AND snapshot.access_mode = 'active'
    AND snapshot.resolved_json->'entitlements'->>'voice.enabled' = 'true'
    AND snapshot.resolved_json->'entitlements'->>'voice.capability_profile' = deployment.capability_profile
    AND ((deployment.capability_profile = 'voice_gen1' AND plan.plan_key = 'voice_basic_gen1')
      OR (deployment.capability_profile = 'voice_gen2' AND plan.plan_key = 'voice_advanced_gen2'))
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'voice_deployment_not_available'; END IF;

  IF resolved.capability_profile = 'voice_gen2' THEN
    PERFORM 1 FROM platform.voice_profile_controls control
    JOIN platform.voice_active_routes route USING (capability_profile)
    JOIN platform.voice_route_candidates candidate
      ON candidate.id = route.primary_candidate_id
      AND candidate.capability_profile = control.capability_profile
      AND candidate.status = 'qualified'
    WHERE control.capability_profile = 'voice_gen2' AND control.mode = 'running'
      AND control.admission_enabled = true
    FOR SHARE OF control, route, candidate;
    IF NOT FOUND THEN RAISE EXCEPTION 'voice_profile_not_available'; END IF;
  END IF;

  selected_greeting := CASE target_locale WHEN 'th' THEN resolved.greeting_th ELSE resolved.greeting_en END;
  selected_disclosure := CASE target_locale WHEN 'th' THEN resolved.automated_disclosure_th ELSE resolved.automated_disclosure_en END;
  INSERT INTO tenancy.contacts (id, tenant_id, display_name, locale)
  VALUES (target_contact_id, resolved.tenant_id, 'Voice visitor', target_locale);
  INSERT INTO tenancy.conversations (
    id, tenant_id, contact_id, product_key, public_plan_key,
    entitlement_snapshot_id, channel_kind, automation_mode
  ) VALUES (
    target_conversation_id, resolved.tenant_id, target_contact_id, 'voice',
    resolved.plan_key, resolved.snapshot_id, 'voice', 'voice'
  );
  INSERT INTO tenancy.voice_sessions (
    id, tenant_id, deployment_id, agent_id, playbook_version_id, contact_id,
    conversation_id, entitlement_snapshot_id, capability_profile, public_label,
    locale, grant_hash, grant_expires_at, max_call_seconds, reconnect_window_seconds
  ) VALUES (
    target_session_id, resolved.tenant_id, resolved.id, resolved.agent_id,
    resolved.current_published_playbook_version_id, target_contact_id,
    target_conversation_id, resolved.snapshot_id, resolved.capability_profile,
    CASE resolved.capability_profile WHEN 'voice_gen1' THEN 'First-Generation Voice Engine'
      ELSE 'Second-Generation Voice Engine' END,
    target_locale, target_grant_hash, target_expires_at,
    resolved.max_call_seconds, resolved.reconnect_window_seconds
  );
  RETURN QUERY SELECT target_session_id, resolved.capability_profile,
    CASE resolved.capability_profile WHEN 'voice_gen1' THEN 'First-Generation Voice Engine'::text
      ELSE 'Second-Generation Voice Engine'::text END,
    target_locale, selected_greeting, selected_disclosure,
    resolved.max_call_seconds, resolved.reconnect_window_seconds, target_expires_at;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.authorize_voice_session(
  target_grant_hash bytea, target_session_id uuid, request_origin text,
  target_protocol_version text, target_connection_id uuid,
  target_reservation_id uuid, target_lease_id uuid
)
RETURNS TABLE (
  session_id uuid, capability_profile text, locale text, max_call_seconds integer,
  reconnect_window_seconds integer, replayed boolean,
  route_provider_key text, route_model_key text, route_region_key text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy, catalog, platform, operations
AS $$
DECLARE runtime record; connection_record record; quota record; route_candidate record;
  active_count integer; concurrency_limit integer; reserve_minutes integer;
  profile_control record;
BEGIN
  IF session_user <> 'djay_voice_runtime' THEN RAISE EXCEPTION 'voice_runtime_role_required'; END IF;
  IF octet_length(target_grant_hash) <> 32 OR target_protocol_version <> 'djay.voice.v1' THEN
    RAISE EXCEPTION 'invalid_voice_authorization_request';
  END IF;
  SELECT NULL::uuid AS id, NULL::text AS provider_key, NULL::text AS model_key,
         NULL::text AS region_key
  INTO route_candidate;
  SELECT NULL::text AS mode, NULL::boolean AS admission_enabled
  INTO profile_control;

  SELECT session.*, deployment.allowed_origins, snapshot.subscription_id,
         snapshot.access_mode, snapshot.resolved_json
  INTO runtime
  FROM tenancy.voice_sessions session
  JOIN tenancy.voice_deployments deployment
    ON deployment.tenant_id = session.tenant_id AND deployment.id = session.deployment_id
    AND deployment.capability_profile = session.capability_profile
  JOIN tenancy.entitlement_snapshots snapshot
    ON snapshot.tenant_id = session.tenant_id AND snapshot.id = session.entitlement_snapshot_id
  JOIN tenancy.product_subscriptions subscription
    ON subscription.tenant_id = snapshot.tenant_id AND subscription.id = snapshot.subscription_id
    AND subscription.status IN ('active', 'trialing', 'scheduled_change')
  JOIN LATERAL (
    SELECT candidate.id FROM tenancy.entitlement_snapshots candidate
    JOIN tenancy.product_subscriptions current_subscription
      ON current_subscription.tenant_id = candidate.tenant_id
      AND current_subscription.id = candidate.subscription_id
      AND current_subscription.status IN ('active', 'trialing', 'scheduled_change')
    WHERE candidate.tenant_id = session.tenant_id AND candidate.product_key = 'voice'
    ORDER BY candidate.created_at DESC, candidate.id DESC LIMIT 1
  ) latest ON latest.id = snapshot.id
  WHERE session.id = target_session_id AND session.grant_hash = target_grant_hash
    AND deployment.status = 'active' AND snapshot.access_mode = 'active'
    AND snapshot.resolved_json->'entitlements'->>'voice.enabled' = 'true'
    AND snapshot.resolved_json->'entitlements'->>'voice.capability_profile' = session.capability_profile
    AND tenancy.ai_origin_allowed(deployment.allowed_origins, request_origin)
  LIMIT 1 FOR UPDATE OF session;
  IF NOT FOUND THEN RAISE EXCEPTION 'voice_session_not_available'; END IF;
  IF runtime.status IN ('ended', 'failed', 'expired') THEN RAISE EXCEPTION 'voice_session_not_connectable'; END IF;

  IF runtime.capability_profile = 'voice_gen2' THEN
    SELECT * INTO profile_control FROM platform.voice_profile_controls control
    WHERE control.capability_profile = 'voice_gen2' FOR SHARE;
    SELECT candidate.* INTO route_candidate
    FROM operations.voice_session_routes assignment
    JOIN platform.voice_route_candidates candidate
      ON candidate.id = assignment.candidate_id
      AND candidate.capability_profile = assignment.capability_profile
      AND candidate.status = 'qualified'
    WHERE assignment.tenant_id = runtime.tenant_id AND assignment.session_id = runtime.id;
  END IF;

  SELECT * INTO connection_record FROM tenancy.voice_session_connections connection
  WHERE connection.tenant_id = runtime.tenant_id AND connection.session_id = runtime.id
    AND connection.id = target_connection_id;
  IF FOUND THEN
    IF connection_record.status <> 'connected' OR runtime.status <> 'connected'
       OR (runtime.capability_profile = 'voice_gen2'
         AND (profile_control.mode = 'paused' OR route_candidate.id IS NULL)) THEN
      RAISE EXCEPTION 'voice_connection_not_connectable';
    END IF;
    RETURN QUERY SELECT runtime.id, runtime.capability_profile, runtime.locale,
      runtime.max_call_seconds, runtime.reconnect_window_seconds, true,
      route_candidate.provider_key, route_candidate.model_key, route_candidate.region_key;
    RETURN;
  END IF;

  IF runtime.status = 'issued' AND runtime.grant_expires_at <= now() THEN RAISE EXCEPTION 'voice_grant_expired'; END IF;
  IF runtime.status = 'reconnecting' AND (runtime.reconnect_deadline IS NULL OR runtime.reconnect_deadline < now()) THEN
    RAISE EXCEPTION 'voice_reconnect_expired';
  END IF;
  IF runtime.status NOT IN ('issued', 'reconnecting') THEN RAISE EXCEPTION 'voice_session_not_connectable'; END IF;

  IF runtime.capability_profile = 'voice_gen2' THEN
    IF runtime.status = 'issued' THEN
      IF profile_control.mode <> 'running' OR profile_control.admission_enabled <> true THEN
        RAISE EXCEPTION 'voice_profile_not_available';
      END IF;
      SELECT candidate.* INTO route_candidate
      FROM platform.voice_active_routes route
      JOIN platform.voice_route_candidates candidate
        ON candidate.id = route.primary_candidate_id
        AND candidate.capability_profile = route.capability_profile
        AND candidate.status = 'qualified'
      WHERE route.capability_profile = 'voice_gen2' FOR SHARE OF route, candidate;
    END IF;
    IF route_candidate.id IS NULL THEN RAISE EXCEPTION 'voice_profile_not_available'; END IF;
  END IF;

  IF runtime.status = 'issued' THEN
    concurrency_limit := NULLIF(runtime.resolved_json->'limits'->>'concurrent_calls', '')::integer;
    IF concurrency_limit IS NULL OR concurrency_limit < 1 THEN RAISE EXCEPTION 'voice_concurrency_unconfigured'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(runtime.tenant_id::text || ':voice-concurrency', 0));
    SELECT count(*)::integer INTO active_count
    FROM tenancy.voice_concurrency_leases lease
    WHERE lease.tenant_id = runtime.tenant_id AND lease.released_at IS NULL
      AND lease.expires_at > now();
    IF active_count >= concurrency_limit THEN RAISE EXCEPTION 'voice_concurrency_exhausted'; END IF;

    reserve_minutes := ceil(runtime.max_call_seconds::numeric / 60)::integer;
    SELECT account.* INTO quota FROM tenancy.quota_accounts account
    WHERE account.tenant_id = runtime.tenant_id
      AND account.subscription_id = runtime.subscription_id
      AND account.product_key = 'voice' AND account.customer_unit = 'voice_minute'
      AND now() >= account.period_start AND now() < account.period_end
    ORDER BY account.period_start DESC LIMIT 1 FOR UPDATE;
    IF quota IS NULL THEN RAISE EXCEPTION 'voice_quota_unavailable'; END IF;
    IF quota.safety_cap_quantity IS NOT NULL
       AND quota.reserved_quantity + quota.settled_quantity + reserve_minutes > quota.safety_cap_quantity THEN
      RAISE EXCEPTION 'voice_safety_cap';
    END IF;
    UPDATE tenancy.quota_accounts
    SET reserved_quantity = reserved_quantity + reserve_minutes, updated_at = now()
    WHERE tenant_id = runtime.tenant_id AND id = quota.id;
    INSERT INTO tenancy.usage_reservations (
      id, tenant_id, quota_account_id, entitlement_snapshot_id, operation_id,
      idempotency_key, requested_quantity, reserved_quantity, status
    ) VALUES (
      target_reservation_id, runtime.tenant_id, quota.id,
      runtime.entitlement_snapshot_id, runtime.id::text,
      'voice:session:' || runtime.id::text, reserve_minutes, reserve_minutes, 'reserved'
    );
    INSERT INTO tenancy.usage_events (
      tenant_id, subscription_id, entitlement_snapshot_id, reservation_id,
      product_key, operation_id, event_type, customer_unit,
      customer_quantity, idempotency_key, occurred_at
    ) VALUES (
      runtime.tenant_id, runtime.subscription_id, runtime.entitlement_snapshot_id,
      target_reservation_id, 'voice', runtime.id::text, 'reserved',
      'voice_minute', reserve_minutes,
      'voice:session:' || runtime.id::text || ':reserved', now()
    );
    INSERT INTO tenancy.voice_concurrency_leases (
      id, tenant_id, session_id, acquired_at, expires_at
    ) VALUES (
      target_lease_id, runtime.tenant_id, runtime.id, now(),
      now() + make_interval(secs => runtime.max_call_seconds + runtime.reconnect_window_seconds)
    );
    IF runtime.capability_profile = 'voice_gen2' THEN
      INSERT INTO operations.voice_session_routes (
        tenant_id, session_id, capability_profile, candidate_id, routing_change_id
      ) SELECT runtime.tenant_id, runtime.id, 'voice_gen2', route_candidate.id,
          route.routing_change_id
        FROM platform.voice_active_routes route
        WHERE route.capability_profile = 'voice_gen2';
    END IF;
    UPDATE tenancy.voice_sessions
    SET usage_reservation_id = target_reservation_id, reserved_minutes = reserve_minutes,
        connected_at = now(), status = 'connected', updated_at = now()
    WHERE tenant_id = runtime.tenant_id AND id = runtime.id;
  ELSE
    UPDATE tenancy.voice_sessions
    SET status = 'connected', reconnect_deadline = NULL, updated_at = now()
    WHERE tenant_id = runtime.tenant_id AND id = runtime.id;
  END IF;

  INSERT INTO tenancy.voice_session_connections (
    id, tenant_id, session_id, connected_at, status
  ) VALUES (target_connection_id, runtime.tenant_id, runtime.id, now(), 'connected');
  RETURN QUERY SELECT runtime.id, runtime.capability_profile, runtime.locale,
    runtime.max_call_seconds, runtime.reconnect_window_seconds, false,
    route_candidate.provider_key, route_candidate.model_key, route_candidate.region_key;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.heartbeat_voice_session(
  target_session_id uuid,
  target_connection_id uuid
)
RETURNS TABLE (alive boolean, runtime_mode text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy, platform, operations
AS $$
DECLARE global_mode text; runtime record; profile_mode text; route_available boolean := true;
BEGIN
  IF session_user <> 'djay_voice_runtime' THEN RAISE EXCEPTION 'voice_runtime_role_required'; END IF;
  SELECT control.mode INTO global_mode FROM platform.voice_runtime_controls control
  WHERE control.singleton = true;
  SELECT session.tenant_id, session.capability_profile INTO runtime
  FROM tenancy.voice_sessions session
  JOIN tenancy.voice_session_connections connection
    ON connection.tenant_id = session.tenant_id AND connection.session_id = session.id
    AND connection.id = target_connection_id AND connection.status = 'connected'
  JOIN tenancy.voice_deployments deployment
    ON deployment.tenant_id = session.tenant_id AND deployment.id = session.deployment_id
    AND deployment.status = 'active'
    AND deployment.capability_profile = session.capability_profile
  JOIN tenancy.entitlement_snapshots snapshot
    ON snapshot.tenant_id = session.tenant_id AND snapshot.id = session.entitlement_snapshot_id
    AND snapshot.access_mode = 'active'
    AND snapshot.resolved_json->'entitlements'->>'voice.enabled' = 'true'
    AND snapshot.resolved_json->'entitlements'->>'voice.capability_profile' = session.capability_profile
  JOIN tenancy.product_subscriptions subscription
    ON subscription.tenant_id = snapshot.tenant_id AND subscription.id = snapshot.subscription_id
    AND subscription.status IN ('active', 'trialing', 'scheduled_change')
  JOIN LATERAL (
    SELECT candidate.id FROM tenancy.entitlement_snapshots candidate
    JOIN tenancy.product_subscriptions current_subscription
      ON current_subscription.tenant_id = candidate.tenant_id
      AND current_subscription.id = candidate.subscription_id
      AND current_subscription.status IN ('active', 'trialing', 'scheduled_change')
    WHERE candidate.tenant_id = session.tenant_id AND candidate.product_key = 'voice'
    ORDER BY candidate.created_at DESC, candidate.id DESC LIMIT 1
  ) latest ON latest.id = snapshot.id
  WHERE session.id = target_session_id AND session.status = 'connected';
  IF NOT FOUND THEN RETURN QUERY SELECT false, global_mode; RETURN; END IF;
  IF runtime.capability_profile = 'voice_gen2' THEN
    SELECT control.mode INTO profile_mode FROM platform.voice_profile_controls control
    WHERE control.capability_profile = 'voice_gen2';
    route_available := EXISTS (
      SELECT 1 FROM operations.voice_session_routes assignment
      JOIN platform.voice_route_candidates candidate
        ON candidate.id = assignment.candidate_id
        AND candidate.capability_profile = assignment.capability_profile
        AND candidate.status = 'qualified'
      WHERE assignment.tenant_id = runtime.tenant_id
        AND assignment.session_id = target_session_id
    );
  END IF;
  UPDATE tenancy.voice_session_connections connection SET heartbeat_at = now()
  WHERE connection.session_id = target_session_id AND connection.id = target_connection_id
    AND connection.status = 'connected';
  IF global_mode = 'emergency_stop'
     OR runtime.capability_profile = 'voice_gen2'
       AND (profile_mode = 'paused' OR NOT route_available) THEN
    RETURN QUERY SELECT false, 'emergency_stop'::text;
  ELSE
    RETURN QUERY SELECT true, global_mode;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.disconnect_voice_session(
  target_session_id uuid, target_connection_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$ SELECT tenancy.disconnect_voice_basic_session(target_session_id, target_connection_id) $$;

CREATE OR REPLACE FUNCTION tenancy.finish_voice_session(
  target_session_id uuid, target_connection_id uuid,
  elapsed_seconds integer, target_terminal_reason text
)
RETURNS TABLE (status text, customer_minutes integer, replayed boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
  SELECT * FROM tenancy.finish_voice_basic_session(
    target_session_id, target_connection_id, elapsed_seconds, target_terminal_reason
  )
$$;

REVOKE ALL ON platform.voice_admission_changes FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.disable_voice_admission_outside_running() FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.get_voice_admission_overview() FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.request_voice_admission_change(boolean, text, bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.review_voice_admission_change(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.apply_voice_admission_change(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.issue_voice_session_grant(bytea, bytea, text, uuid, uuid, uuid, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.authorize_voice_session(bytea, uuid, text, text, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.heartbeat_voice_session(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.disconnect_voice_session(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.finish_voice_session(uuid, uuid, integer, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION platform.get_voice_admission_overview() TO djay_platform;
GRANT EXECUTE ON FUNCTION platform.request_voice_admission_change(boolean, text, bytea) TO djay_platform;
GRANT EXECUTE ON FUNCTION platform.review_voice_admission_change(uuid, text) TO djay_platform;
GRANT EXECUTE ON FUNCTION platform.apply_voice_admission_change(uuid) TO djay_platform;
GRANT EXECUTE ON FUNCTION tenancy.issue_voice_session_grant(bytea, bytea, text, uuid, uuid, uuid, timestamptz, text) TO djay_voice_runtime;
GRANT EXECUTE ON FUNCTION tenancy.authorize_voice_session(bytea, uuid, text, text, uuid, uuid, uuid) TO djay_voice_runtime;
GRANT EXECUTE ON FUNCTION tenancy.heartbeat_voice_session(uuid, uuid) TO djay_voice_runtime;
GRANT EXECUTE ON FUNCTION tenancy.disconnect_voice_session(uuid, uuid) TO djay_voice_runtime;
GRANT EXECUTE ON FUNCTION tenancy.finish_voice_session(uuid, uuid, integer, text) TO djay_voice_runtime;
