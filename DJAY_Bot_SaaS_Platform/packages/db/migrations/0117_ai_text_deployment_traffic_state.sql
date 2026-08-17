ALTER TABLE tenancy.ai_deployments
  ADD COLUMN traffic_status text NOT NULL DEFAULT 'inactive'
    CHECK (traffic_status IN ('inactive', 'live')),
  ADD COLUMN live_at timestamptz,
  ADD COLUMN live_by_membership_id uuid,
  ADD CONSTRAINT tenancy_ai_deployment_live_actor_fk
    FOREIGN KEY (tenant_id, live_by_membership_id)
    REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT;

UPDATE tenancy.ai_deployments
SET traffic_status = 'live', live_at = created_at;

ALTER TABLE tenancy.ai_deployments
  ADD CONSTRAINT tenancy_ai_deployment_live_time_check
  CHECK (traffic_status <> 'live' OR live_at IS NOT NULL);

CREATE TABLE tenancy.ai_install_checks (
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
    REFERENCES tenancy.ai_deployments(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, requested_by_membership_id)
    REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);

ALTER TABLE tenancy.ai_install_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.ai_install_checks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.ai_install_checks
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
REVOKE ALL ON tenancy.ai_install_checks FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON tenancy.ai_install_checks TO djay_runtime;

CREATE OR REPLACE FUNCTION tenancy.report_ai_chat_install(target_key_hash bytea, request_origin text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE changed integer;
BEGIN
  IF session_user <> 'djay_ai_runtime' THEN RAISE EXCEPTION 'ai_runtime_role_required'; END IF;
  UPDATE tenancy.ai_install_checks check_record
  SET status = 'verified', safe_result_code = 'widget_seen', checked_at = now()
  FROM tenancy.ai_deployments deployment
  WHERE deployment.tenant_id = check_record.tenant_id
    AND deployment.id = check_record.deployment_id
    AND deployment.deployment_key_hash = target_key_hash
    AND deployment.channel = 'web' AND deployment.status = 'active'
    AND check_record.status = 'requested'
    AND check_record.target_origin = request_origin
    AND tenancy.ai_origin_allowed(deployment.allowed_origins, request_origin);
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.ai_runtime_resource_active(deployment_key_hash_value bytea)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
  SELECT session_user = 'djay_ai_runtime' AND EXISTS (
    SELECT 1 FROM tenancy.ai_deployments deployment
    WHERE deployment.deployment_key_hash = deployment_key_hash_value
      AND deployment.channel = 'web' AND deployment.status = 'active' AND deployment.traffic_status = 'live'
      AND NOT EXISTS (SELECT 1 FROM tenancy.entitlement_resource_states resource_state
        WHERE resource_state.tenant_id = deployment.tenant_id AND resource_state.product_key = 'ai_chat'
          AND resource_state.resource_kind = 'bot' AND resource_state.resource_id = deployment.agent_id
          AND resource_state.state <> 'active'))
$$;

CREATE OR REPLACE FUNCTION tenancy.ai_runtime_config(target_key_hash bytea, request_origin text)
RETURNS TABLE (agent_name text, default_language text, branding_removed boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, tenancy, catalog AS $$
  SELECT agent.name, agent.default_language, tenancy.active_branding_removal(agent.tenant_id, 'ai_chat')
  FROM tenancy.ai_deployments deployment
  JOIN tenancy.ai_agents agent ON agent.tenant_id = deployment.tenant_id AND agent.id = deployment.agent_id
  JOIN tenancy.ai_playbook_versions playbook ON playbook.tenant_id = agent.tenant_id AND playbook.id = agent.current_published_playbook_version_id
  JOIN LATERAL (
    SELECT candidate.* FROM tenancy.entitlement_snapshots candidate
    JOIN tenancy.product_subscriptions subscription ON subscription.tenant_id = candidate.tenant_id
      AND subscription.id = candidate.subscription_id AND subscription.status IN ('active','trialing','scheduled_change')
    WHERE candidate.tenant_id = agent.tenant_id AND candidate.product_key = 'ai_chat' AND candidate.access_mode = 'active'
      AND candidate.resolved_json->'entitlements'->>'ai.text' = 'true'
      AND candidate.resolved_json->'entitlements'->>'channel.web' = 'true'
    ORDER BY candidate.created_at DESC, candidate.id DESC LIMIT 1
  ) snapshot ON true
  WHERE deployment.deployment_key_hash = target_key_hash AND deployment.channel = 'web'
    AND deployment.status = 'active' AND deployment.traffic_status = 'live'
    AND agent.status = 'active' AND playbook.status = 'published'
    AND tenancy.ai_origin_allowed(deployment.allowed_origins, request_origin)
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION tenancy.report_ai_chat_install(bytea, text),
  tenancy.ai_runtime_resource_active(bytea), tenancy.ai_runtime_config(bytea, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.report_ai_chat_install(bytea, text),
  tenancy.ai_runtime_resource_active(bytea), tenancy.ai_runtime_config(bytea, text) TO djay_ai_runtime;
