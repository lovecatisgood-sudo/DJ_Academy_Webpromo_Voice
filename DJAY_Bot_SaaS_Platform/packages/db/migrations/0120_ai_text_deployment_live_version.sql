ALTER TABLE tenancy.ai_deployments ADD COLUMN live_playbook_version_id uuid;

UPDATE tenancy.ai_deployments deployment
SET live_playbook_version_id = agent.current_published_playbook_version_id
FROM tenancy.ai_agents agent
WHERE agent.tenant_id = deployment.tenant_id AND agent.id = deployment.agent_id
  AND deployment.channel = 'web' AND deployment.traffic_status = 'live';

ALTER TABLE tenancy.ai_deployments
  ADD CONSTRAINT tenancy_ai_deployment_live_playbook_fk
    FOREIGN KEY (tenant_id, agent_id, live_playbook_version_id)
    REFERENCES tenancy.ai_playbook_versions(tenant_id, agent_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT tenancy_ai_deployment_live_playbook_required
    CHECK (channel <> 'web' OR traffic_status <> 'live' OR live_playbook_version_id IS NOT NULL);

CREATE OR REPLACE FUNCTION tenancy.ai_runtime_config(target_key_hash bytea, request_origin text)
RETURNS TABLE (agent_name text, default_language text, branding_removed boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, tenancy, catalog AS $$
  SELECT agent.name, agent.default_language, tenancy.active_branding_removal(agent.tenant_id, 'ai_chat')
  FROM tenancy.ai_deployments deployment
  JOIN tenancy.ai_agents agent ON agent.tenant_id = deployment.tenant_id AND agent.id = deployment.agent_id
  JOIN tenancy.ai_playbook_versions playbook ON playbook.tenant_id = deployment.tenant_id
    AND playbook.agent_id = deployment.agent_id AND playbook.id = deployment.live_playbook_version_id
  JOIN LATERAL (
    SELECT candidate.* FROM tenancy.entitlement_snapshots candidate
    JOIN tenancy.product_subscriptions subscription ON subscription.tenant_id = candidate.tenant_id
      AND subscription.id = candidate.subscription_id
      AND subscription.status IN ('active','trialing','scheduled_change')
    WHERE candidate.tenant_id = agent.tenant_id AND candidate.product_key = 'ai_chat'
      AND candidate.access_mode = 'active'
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

CREATE OR REPLACE FUNCTION tenancy.start_ai_session(
  target_key_hash bytea, target_session_hash bytea, request_origin text,
  target_session_id uuid, target_contact_id uuid, target_conversation_id uuid,
  target_expires_at timestamptz, target_language text
)
RETURNS TABLE (session_id uuid, conversation_id uuid, greeting text, next_message_sequence integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy, catalog AS $$
DECLARE resolved record; selected_greeting text;
BEGIN
  IF octet_length(target_key_hash) <> 32 OR octet_length(target_session_hash) <> 32
     OR target_language NOT IN ('th', 'en') OR target_expires_at <= now()
     OR target_expires_at > now() + interval '24 hours' THEN
    RAISE EXCEPTION 'invalid_ai_session_request';
  END IF;
  SELECT deployment.tenant_id, deployment.id AS deployment_id, agent.id AS agent_id,
         playbook.id AS playbook_version_id, playbook.playbook_json,
         snapshot.id AS snapshot_id, snapshot.subscription_id, plan.plan_key
  INTO resolved
  FROM tenancy.ai_deployments deployment
  JOIN tenancy.ai_agents agent ON agent.tenant_id = deployment.tenant_id AND agent.id = deployment.agent_id
  JOIN tenancy.ai_playbook_versions playbook ON playbook.tenant_id = deployment.tenant_id
    AND playbook.agent_id = deployment.agent_id AND playbook.id = deployment.live_playbook_version_id
  JOIN LATERAL (
    SELECT candidate.* FROM tenancy.entitlement_snapshots candidate
    JOIN tenancy.product_subscriptions subscription ON subscription.tenant_id = candidate.tenant_id
      AND subscription.id = candidate.subscription_id
      AND subscription.status IN ('active', 'trialing', 'scheduled_change')
    WHERE candidate.tenant_id = agent.tenant_id AND candidate.product_key = 'ai_chat'
      AND candidate.access_mode = 'active'
      AND candidate.resolved_json->'entitlements'->>'ai.text' = 'true'
      AND candidate.resolved_json->'entitlements'->>'sales_core.enabled' = 'true'
      AND candidate.resolved_json->'entitlements'->>'channel.web' = 'true'
    ORDER BY candidate.created_at DESC, candidate.id DESC LIMIT 1
  ) snapshot ON true
  JOIN catalog.plan_versions plan_version ON plan_version.id = snapshot.plan_version_id
  JOIN catalog.plans plan ON plan.id = plan_version.plan_id AND plan.product_key = 'ai_chat'
  WHERE deployment.deployment_key_hash = target_key_hash AND deployment.channel = 'web'
    AND deployment.status = 'active' AND deployment.traffic_status = 'live'
    AND agent.status = 'active' AND playbook.status = 'published'
    AND tenancy.ai_origin_allowed(deployment.allowed_origins, request_origin)
  LIMIT 1;
  IF resolved IS NULL THEN RAISE EXCEPTION 'ai_deployment_not_available'; END IF;
  selected_greeting := COALESCE(resolved.playbook_json->'greeting'->>target_language,
    CASE target_language WHEN 'th' THEN 'สวัสดีครับ มีอะไรให้ช่วยได้บ้าง?' ELSE 'Hello. How can I help?' END);
  INSERT INTO tenancy.contacts (id, tenant_id, display_name, locale)
  VALUES (target_contact_id, resolved.tenant_id, 'Website visitor', target_language);
  INSERT INTO tenancy.conversations (id, tenant_id, contact_id, product_key, public_plan_key,
    entitlement_snapshot_id, channel_kind, automation_mode, next_sequence)
  VALUES (target_conversation_id, resolved.tenant_id, target_contact_id, 'ai_chat', resolved.plan_key,
    resolved.snapshot_id, 'web', 'ai_text', 2);
  INSERT INTO tenancy.messages (tenant_id, conversation_id, sequence, actor_type, direction, content_json)
  VALUES (resolved.tenant_id, target_conversation_id, 1, 'ai', 'outbound',
    jsonb_build_object('type', 'text', 'content', jsonb_build_object('text', selected_greeting)));
  INSERT INTO tenancy.ai_sessions (id, tenant_id, deployment_id, agent_id, playbook_version_id,
    conversation_id, contact_id, entitlement_snapshot_id, session_token_hash, language, expires_at)
  VALUES (target_session_id, resolved.tenant_id, resolved.deployment_id, resolved.agent_id,
    resolved.playbook_version_id, target_conversation_id, target_contact_id, resolved.snapshot_id,
    target_session_hash, target_language, target_expires_at);
  RETURN QUERY SELECT target_session_id, target_conversation_id, selected_greeting, 2;
END
$$;

REVOKE ALL ON FUNCTION tenancy.ai_runtime_config(bytea, text),
  tenancy.start_ai_session(bytea, bytea, text, uuid, uuid, uuid, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.ai_runtime_config(bytea, text),
  tenancy.start_ai_session(bytea, bytea, text, uuid, uuid, uuid, timestamptz, text) TO djay_ai_runtime;
