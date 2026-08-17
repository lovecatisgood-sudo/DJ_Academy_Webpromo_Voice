ALTER TABLE tenancy.voice_deployments
  ADD COLUMN traffic_status text NOT NULL DEFAULT 'inactive'
    CHECK (traffic_status IN ('inactive', 'live')),
  ADD COLUMN live_at timestamptz,
  ADD COLUMN live_by_membership_id uuid,
  ADD CONSTRAINT tenancy_voice_deployment_live_actor_fk
    FOREIGN KEY (tenant_id, live_by_membership_id)
    REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT;

UPDATE tenancy.voice_deployments
SET traffic_status = 'live', live_at = created_at;

ALTER TABLE tenancy.voice_deployments
  ADD CONSTRAINT tenancy_voice_deployment_live_time_check
  CHECK (traffic_status <> 'live' OR live_at IS NOT NULL);

CREATE TABLE tenancy.voice_install_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  deployment_id uuid NOT NULL,
  requested_by_membership_id uuid NOT NULL,
  target_origin text NOT NULL,
  status text NOT NULL CHECK (status IN ('requested', 'verified', 'failed')),
  safe_result_code text,
  checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, deployment_id)
    REFERENCES tenancy.voice_deployments(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, requested_by_membership_id)
    REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);

ALTER TABLE tenancy.voice_install_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.voice_install_checks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.voice_install_checks
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
REVOKE ALL ON tenancy.voice_install_checks FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON tenancy.voice_install_checks TO djay_runtime;

CREATE OR REPLACE FUNCTION tenancy.report_voice_install(target_key_hash bytea, request_origin text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE changed integer;
BEGIN
  IF session_user <> 'djay_voice_runtime' THEN RAISE EXCEPTION 'voice_runtime_role_required'; END IF;
  UPDATE tenancy.voice_install_checks check_record
  SET status = 'verified', safe_result_code = 'widget_seen', checked_at = now()
  FROM tenancy.voice_deployments deployment
  WHERE deployment.tenant_id = check_record.tenant_id
    AND deployment.id = check_record.deployment_id
    AND deployment.deployment_key_hash = target_key_hash
    AND deployment.status = 'active'
    AND check_record.status = 'requested'
    AND check_record.target_origin = request_origin
    AND tenancy.ai_origin_allowed(deployment.allowed_origins, request_origin);
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.voice_runtime_resource_active(deployment_key_hash_value bytea)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
  SELECT session_user = 'djay_voice_runtime' AND EXISTS (
    SELECT 1 FROM tenancy.voice_deployments deployment
    WHERE deployment.deployment_key_hash = deployment_key_hash_value
      AND deployment.status = 'active' AND deployment.traffic_status = 'live'
      AND NOT EXISTS (SELECT 1 FROM tenancy.entitlement_resource_states resource_state
        WHERE resource_state.tenant_id = deployment.tenant_id AND resource_state.product_key = 'voice'
          AND resource_state.resource_kind = 'deployment' AND resource_state.resource_id = deployment.id
          AND resource_state.state <> 'active'))
$$;

CREATE OR REPLACE FUNCTION tenancy.voice_runtime_config(target_key_hash bytea, request_origin text)
RETURNS TABLE (branding_removed boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, tenancy, catalog AS $$
  SELECT tenancy.active_branding_removal(deployment.tenant_id, 'voice')
  FROM tenancy.voice_deployments deployment
  JOIN LATERAL (
    SELECT candidate.id FROM tenancy.entitlement_snapshots candidate
    JOIN tenancy.product_subscriptions subscription ON subscription.tenant_id = candidate.tenant_id
      AND subscription.id = candidate.subscription_id AND subscription.status IN ('active','trialing','scheduled_change')
    WHERE candidate.tenant_id = deployment.tenant_id AND candidate.product_key = 'voice' AND candidate.access_mode = 'active'
      AND candidate.resolved_json->'entitlements'->>'voice.enabled' = 'true'
    ORDER BY candidate.created_at DESC, candidate.id DESC LIMIT 1
  ) snapshot ON true
  WHERE deployment.deployment_key_hash = target_key_hash AND deployment.status = 'active'
    AND deployment.traffic_status = 'live'
    AND tenancy.ai_origin_allowed(deployment.allowed_origins, request_origin)
  LIMIT 1
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
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy, catalog, platform AS $$
DECLARE resolved record; selected_greeting text; selected_disclosure text; global_mode text;
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
         snapshot.id AS snapshot_id, snapshot.access_mode, snapshot.resolved_json, plan.plan_key
  INTO resolved
  FROM tenancy.voice_deployments deployment
  JOIN tenancy.ai_agents agent ON agent.tenant_id = deployment.tenant_id AND agent.id = deployment.agent_id
    AND agent.status = 'active' AND agent.current_published_playbook_version_id IS NOT NULL
  JOIN LATERAL (
    SELECT candidate.* FROM tenancy.entitlement_snapshots candidate
    JOIN tenancy.product_subscriptions subscription ON subscription.tenant_id = candidate.tenant_id
      AND subscription.id = candidate.subscription_id
      AND subscription.status IN ('active', 'trialing', 'scheduled_change')
    WHERE candidate.tenant_id = deployment.tenant_id AND candidate.product_key = 'voice'
    ORDER BY candidate.created_at DESC, candidate.id DESC LIMIT 1
  ) snapshot ON true
  JOIN catalog.plan_versions version ON version.id = snapshot.plan_version_id
  JOIN catalog.plans plan ON plan.id = version.plan_id AND plan.product_key = 'voice'
  WHERE deployment.deployment_key_hash = target_key_hash AND deployment.status = 'active'
    AND deployment.traffic_status = 'live'
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
    JOIN platform.voice_route_candidates candidate ON candidate.id = route.primary_candidate_id
      AND candidate.capability_profile = control.capability_profile AND candidate.status = 'qualified'
    WHERE control.capability_profile = 'voice_gen2' AND control.mode = 'running'
      AND control.admission_enabled = true FOR SHARE OF control, route, candidate;
    IF NOT FOUND THEN RAISE EXCEPTION 'voice_profile_not_available'; END IF;
  END IF;

  selected_greeting := CASE target_locale WHEN 'th' THEN resolved.greeting_th ELSE resolved.greeting_en END;
  selected_disclosure := CASE target_locale WHEN 'th' THEN resolved.automated_disclosure_th ELSE resolved.automated_disclosure_en END;
  INSERT INTO tenancy.contacts (id, tenant_id, display_name, locale)
  VALUES (target_contact_id, resolved.tenant_id, 'Voice visitor', target_locale);
  INSERT INTO tenancy.conversations (id, tenant_id, contact_id, product_key, public_plan_key,
    entitlement_snapshot_id, channel_kind, automation_mode)
  VALUES (target_conversation_id, resolved.tenant_id, target_contact_id, 'voice', resolved.plan_key,
    resolved.snapshot_id, 'voice', 'voice');
  INSERT INTO tenancy.voice_sessions (id, tenant_id, deployment_id, agent_id, playbook_version_id, contact_id,
    conversation_id, entitlement_snapshot_id, capability_profile, public_label, locale, grant_hash,
    grant_expires_at, max_call_seconds, reconnect_window_seconds)
  VALUES (target_session_id, resolved.tenant_id, resolved.id, resolved.agent_id,
    resolved.current_published_playbook_version_id, target_contact_id, target_conversation_id,
    resolved.snapshot_id, resolved.capability_profile,
    CASE resolved.capability_profile WHEN 'voice_gen1' THEN 'First-Generation Voice Engine'
      ELSE 'Second-Generation Voice Engine' END, target_locale, target_grant_hash, target_expires_at,
    resolved.max_call_seconds, resolved.reconnect_window_seconds);
  RETURN QUERY SELECT target_session_id, resolved.capability_profile,
    CASE resolved.capability_profile WHEN 'voice_gen1' THEN 'First-Generation Voice Engine'::text
      ELSE 'Second-Generation Voice Engine'::text END, target_locale, selected_greeting, selected_disclosure,
    resolved.max_call_seconds, resolved.reconnect_window_seconds, target_expires_at;
END
$$;

REVOKE ALL ON FUNCTION tenancy.report_voice_install(bytea, text),
  tenancy.voice_runtime_resource_active(bytea), tenancy.voice_runtime_config(bytea, text),
  tenancy.issue_voice_session_grant(bytea, bytea, text, uuid, uuid, uuid, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.report_voice_install(bytea, text),
  tenancy.voice_runtime_resource_active(bytea), tenancy.voice_runtime_config(bytea, text),
  tenancy.issue_voice_session_grant(bytea, bytea, text, uuid, uuid, uuid, timestamptz, text) TO djay_voice_runtime;
