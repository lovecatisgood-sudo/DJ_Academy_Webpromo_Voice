ALTER TABLE tenancy.flow_deployments
  ADD COLUMN traffic_status text NOT NULL DEFAULT 'inactive'
    CHECK (traffic_status IN ('inactive', 'live')),
  ADD COLUMN live_at timestamptz,
  ADD COLUMN live_by_membership_id uuid,
  ADD CONSTRAINT tenancy_flow_deployment_live_actor_fk
    FOREIGN KEY (tenant_id, live_by_membership_id)
    REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT;

UPDATE tenancy.flow_deployments
SET traffic_status = 'live', live_at = created_at;

ALTER TABLE tenancy.flow_deployments
  ADD CONSTRAINT tenancy_flow_deployment_live_time_check
  CHECK (traffic_status <> 'live' OR live_at IS NOT NULL);

CREATE OR REPLACE FUNCTION tenancy.resolve_flowbot_deployment(target_key_hash bytea)
RETURNS TABLE (
  tenant_id uuid, deployment_id uuid, bot_id uuid, flow_version_id uuid,
  entitlement_snapshot_id uuid, allowed_origins text[], branding_removed boolean,
  bot_name text, default_language text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, tenancy, catalog AS $$
  SELECT deployment.tenant_id, deployment.id, bot.id, version.id, snapshot.id,
         deployment.allowed_origins, bot.branding_removed, bot.name, bot.default_language
  FROM tenancy.flow_deployments deployment
  JOIN tenancy.flow_bots bot ON bot.tenant_id = deployment.tenant_id AND bot.id = deployment.bot_id
  JOIN tenancy.flow_versions version ON version.tenant_id = bot.tenant_id AND version.id = bot.current_published_version_id
  JOIN tenancy.entitlement_snapshots snapshot ON snapshot.tenant_id = bot.tenant_id
    AND snapshot.product_key = 'flowbot' AND snapshot.access_mode = 'active'
  JOIN tenancy.product_subscriptions subscription ON subscription.tenant_id = snapshot.tenant_id
    AND subscription.id = snapshot.subscription_id AND subscription.status IN ('active', 'trialing', 'scheduled_change')
  WHERE deployment.deployment_key_hash = target_key_hash AND deployment.status = 'active'
    AND deployment.traffic_status = 'live'
    AND bot.status = 'active' AND version.status = 'published'
  ORDER BY snapshot.created_at DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION tenancy.flowbot_runtime_resource_active(deployment_key_hash_value bytea)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
  SELECT session_user = 'djay_flowbot_runtime' AND EXISTS (
    SELECT 1 FROM tenancy.flow_deployments deployment
    WHERE deployment.deployment_key_hash = deployment_key_hash_value
      AND deployment.status = 'active' AND deployment.traffic_status = 'live'
      AND NOT EXISTS (SELECT 1 FROM tenancy.entitlement_resource_states resource_state
        WHERE resource_state.tenant_id = deployment.tenant_id AND resource_state.product_key = 'flowbot'
          AND resource_state.resource_kind = 'bot' AND resource_state.resource_id = deployment.bot_id
          AND resource_state.state <> 'active'))
$$;

CREATE OR REPLACE FUNCTION tenancy.flowbot_runtime_config(target_key_hash bytea, request_origin text)
RETURNS TABLE (bot_name text, default_language text, branding_removed boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, tenancy, catalog
AS $$
  SELECT bot.name, bot.default_language, tenancy.active_branding_removal(bot.tenant_id, 'flowbot')
  FROM tenancy.flow_deployments deployment
  JOIN tenancy.flow_bots bot ON bot.tenant_id = deployment.tenant_id AND bot.id = deployment.bot_id
  JOIN tenancy.flow_versions version ON version.tenant_id = bot.tenant_id AND version.id = bot.current_published_version_id
  JOIN LATERAL (
    SELECT candidate.* FROM tenancy.entitlement_snapshots candidate
    JOIN tenancy.product_subscriptions subscription ON subscription.tenant_id = candidate.tenant_id
      AND subscription.id = candidate.subscription_id AND subscription.status IN ('active','trialing','scheduled_change')
    WHERE candidate.tenant_id = bot.tenant_id AND candidate.product_key = 'flowbot' AND candidate.access_mode = 'active'
      AND candidate.resolved_json->'entitlements'->>'ai.enabled' = 'false'
    ORDER BY candidate.created_at DESC, candidate.id DESC LIMIT 1
  ) snapshot ON true
  WHERE deployment.deployment_key_hash = target_key_hash AND deployment.status = 'active'
    AND deployment.traffic_status = 'live'
    AND bot.status = 'active' AND version.status = 'published'
    AND tenancy.flowbot_origin_allowed(deployment.allowed_origins, request_origin)
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION tenancy.resolve_flowbot_deployment(bytea),
  tenancy.flowbot_runtime_resource_active(bytea), tenancy.flowbot_runtime_config(bytea, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.resolve_flowbot_deployment(bytea) TO djay_runtime;
GRANT EXECUTE ON FUNCTION tenancy.flowbot_runtime_resource_active(bytea),
  tenancy.flowbot_runtime_config(bytea, text) TO djay_flowbot_runtime;
