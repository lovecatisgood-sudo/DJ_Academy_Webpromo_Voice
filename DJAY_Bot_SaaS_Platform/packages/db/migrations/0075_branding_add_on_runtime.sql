CREATE OR REPLACE FUNCTION tenancy.active_branding_removal(target_tenant_id uuid, target_product_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
BEGIN
  IF target_product_key NOT IN ('flowbot', 'ai_chat', 'voice') THEN
    RAISE EXCEPTION 'invalid_product_key';
  END IF;
  IF session_user = 'djay_runtime' AND target_tenant_id <> tenancy.current_tenant_id() THEN
    RAISE EXCEPTION 'tenant_context_mismatch';
  END IF;
  IF session_user NOT IN ('djay_runtime', 'djay_flowbot_runtime', 'djay_ai_runtime', 'djay_voice_runtime') THEN
    RAISE EXCEPTION 'runtime_role_required';
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM tenancy.product_subscriptions subscription
    JOIN LATERAL (
      SELECT snapshot.resolved_json
      FROM tenancy.entitlement_snapshots snapshot
      WHERE snapshot.tenant_id = subscription.tenant_id AND snapshot.subscription_id = subscription.id
        AND snapshot.product_key = target_product_key AND snapshot.access_mode = 'active'
      ORDER BY snapshot.created_at DESC, snapshot.id DESC LIMIT 1
    ) snapshot ON true
    WHERE subscription.tenant_id = target_tenant_id
      AND subscription.product_key = target_product_key
      AND subscription.status IN ('active', 'trialing', 'scheduled_change')
      AND COALESCE((snapshot.resolved_json->'entitlements'->>'branding.remove')::boolean, false)
  ) OR EXISTS (
    SELECT 1 FROM tenancy.subscription_add_ons add_on
    JOIN tenancy.product_subscriptions subscription
      ON subscription.tenant_id = add_on.tenant_id AND subscription.id = add_on.subscription_id
      AND subscription.status IN ('active', 'trialing', 'scheduled_change')
    WHERE add_on.tenant_id = target_tenant_id AND add_on.add_on_key = 'branding_removal'
      AND add_on.status IN ('active', 'scheduled_end') AND add_on.effective_from <= now()
      AND (add_on.effective_until IS NULL OR add_on.effective_until > now())
  );
END
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
    AND bot.status = 'active' AND version.status = 'published'
    AND tenancy.flowbot_origin_allowed(deployment.allowed_origins, request_origin)
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION tenancy.ai_runtime_config(target_key_hash bytea, request_origin text)
RETURNS TABLE (agent_name text, default_language text, branding_removed boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, tenancy, catalog
AS $$
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
    AND deployment.status = 'active' AND agent.status = 'active' AND playbook.status = 'published'
    AND tenancy.ai_origin_allowed(deployment.allowed_origins, request_origin)
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION tenancy.voice_runtime_config(target_key_hash bytea, request_origin text)
RETURNS TABLE (branding_removed boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, tenancy, catalog
AS $$
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
    AND tenancy.ai_origin_allowed(deployment.allowed_origins, request_origin)
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION tenancy.active_branding_removal(uuid, text), tenancy.voice_runtime_config(bytea, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.active_branding_removal(uuid, text) TO djay_runtime, djay_flowbot_runtime, djay_ai_runtime, djay_voice_runtime;
GRANT EXECUTE ON FUNCTION tenancy.voice_runtime_config(bytea, text) TO djay_voice_runtime;
