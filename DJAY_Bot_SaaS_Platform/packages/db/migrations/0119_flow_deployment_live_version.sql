ALTER TABLE tenancy.flow_deployments
  ADD COLUMN live_version_id uuid;

UPDATE tenancy.flow_deployments deployment
SET live_version_id = bot.current_published_version_id
FROM tenancy.flow_bots bot
WHERE bot.tenant_id = deployment.tenant_id AND bot.id = deployment.bot_id
  AND deployment.traffic_status = 'live';

ALTER TABLE tenancy.flow_deployments
  ADD CONSTRAINT tenancy_flow_deployment_live_version_fk
    FOREIGN KEY (tenant_id, bot_id, live_version_id)
    REFERENCES tenancy.flow_versions(tenant_id, bot_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT tenancy_flow_deployment_live_version_required
    CHECK (traffic_status <> 'live' OR live_version_id IS NOT NULL);

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
  JOIN tenancy.flow_versions version ON version.tenant_id = deployment.tenant_id
    AND version.bot_id = deployment.bot_id AND version.id = deployment.live_version_id
  JOIN tenancy.entitlement_snapshots snapshot ON snapshot.tenant_id = bot.tenant_id
    AND snapshot.product_key = 'flowbot' AND snapshot.access_mode = 'active'
  JOIN tenancy.product_subscriptions subscription ON subscription.tenant_id = snapshot.tenant_id
    AND subscription.id = snapshot.subscription_id
    AND subscription.status IN ('active', 'trialing', 'scheduled_change')
  WHERE deployment.deployment_key_hash = target_key_hash AND deployment.status = 'active'
    AND deployment.traffic_status = 'live'
    AND bot.status = 'active' AND version.status = 'published'
  ORDER BY snapshot.created_at DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION tenancy.flowbot_runtime_config(target_key_hash bytea, request_origin text)
RETURNS TABLE (bot_name text, default_language text, branding_removed boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, tenancy, catalog AS $$
  SELECT bot.name, bot.default_language, tenancy.active_branding_removal(bot.tenant_id, 'flowbot')
  FROM tenancy.flow_deployments deployment
  JOIN tenancy.flow_bots bot ON bot.tenant_id = deployment.tenant_id AND bot.id = deployment.bot_id
  JOIN tenancy.flow_versions version ON version.tenant_id = deployment.tenant_id
    AND version.bot_id = deployment.bot_id AND version.id = deployment.live_version_id
  JOIN LATERAL (
    SELECT candidate.* FROM tenancy.entitlement_snapshots candidate
    JOIN tenancy.product_subscriptions subscription ON subscription.tenant_id = candidate.tenant_id
      AND subscription.id = candidate.subscription_id
      AND subscription.status IN ('active','trialing','scheduled_change')
    WHERE candidate.tenant_id = bot.tenant_id AND candidate.product_key = 'flowbot'
      AND candidate.access_mode = 'active'
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
  tenancy.flowbot_runtime_config(bytea, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.resolve_flowbot_deployment(bytea) TO djay_runtime;
GRANT EXECUTE ON FUNCTION tenancy.flowbot_runtime_config(bytea, text) TO djay_flowbot_runtime;
