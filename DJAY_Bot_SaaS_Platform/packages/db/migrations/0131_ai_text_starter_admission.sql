CREATE OR REPLACE FUNCTION tenancy.enforce_ai_text_agent_admission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
DECLARE
  context_tenant_id uuid;
  authority_access_mode text;
  authority_entitlements jsonb;
  authority_limits jsonb;
  active_bot_limit integer;
  occupied_bots integer;
  approved_predeployment_claim boolean;
BEGIN
  -- Administrative migrations and recovery retain their explicit authority. Tenant
  -- runtime writes are independently checked even if an application path regresses.
  IF session_user <> 'djay_runtime'
    OR NEW.product_family <> 'text'
    OR NEW.status = 'archived' THEN
    RETURN NEW;
  END IF;

  context_tenant_id := NULLIF(current_setting('app.tenant_id', true), '')::uuid;
  IF context_tenant_id IS NULL OR context_tenant_id <> NEW.tenant_id THEN
    RAISE EXCEPTION 'ai_text_tenant_context_required';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.tenant_id::text || ':ai_chat:active_bots', 0)
  );

  SELECT snapshot.access_mode,
         snapshot.resolved_json->'entitlements',
         snapshot.resolved_json->'limits'
    INTO authority_access_mode, authority_entitlements, authority_limits
  FROM tenancy.entitlement_snapshots snapshot
  JOIN tenancy.product_subscriptions subscription
    ON subscription.tenant_id = snapshot.tenant_id
   AND subscription.id = snapshot.subscription_id
   AND subscription.status IN ('active', 'trialing', 'scheduled_change')
  WHERE snapshot.tenant_id = NEW.tenant_id
    AND snapshot.product_key = 'ai_chat'
  ORDER BY snapshot.created_at DESC, snapshot.id DESC
  LIMIT 1;

  SELECT EXISTS (
    SELECT 1
    FROM tenancy.builder_draft_claims claim
    WHERE claim.tenant_id = NEW.tenant_id
      AND claim.claimed_by_membership_id = NEW.created_by_membership_id
      AND claim.product_family = 'text'
      AND claim.materialized_ai_agent_id IS NULL
  ) INTO approved_predeployment_claim;

  IF authority_access_mode = 'active'
    AND COALESCE((authority_entitlements->>'ai.text')::boolean, false) IS TRUE
    AND COALESCE((authority_entitlements->>'sales_core.enabled')::boolean, false) IS TRUE THEN
    active_bot_limit := NULLIF(authority_limits->>'active_bots', '')::integer;
  ELSIF approved_predeployment_claim THEN
    -- Claimed Builder configurations intentionally exist before trial/purchase
    -- provisioning, but that continuation may materialize only one Text bot.
    active_bot_limit := 1;
  ELSE
    RAISE EXCEPTION 'ai_text_not_entitled';
  END IF;
  SELECT count(*)::integer INTO occupied_bots
  FROM tenancy.ai_agents agent
  WHERE agent.tenant_id = NEW.tenant_id
    AND agent.product_family = 'text'
    AND agent.status <> 'archived'
    AND agent.id <> NEW.id;

  IF active_bot_limit IS NOT NULL AND occupied_bots >= active_bot_limit THEN
    RAISE EXCEPTION 'ai_text_active_bot_limit_reached';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS tenancy_ai_text_agent_admission ON tenancy.ai_agents;
CREATE TRIGGER tenancy_ai_text_agent_admission
BEFORE INSERT OR UPDATE OF tenant_id, product_family, status ON tenancy.ai_agents
FOR EACH ROW EXECUTE FUNCTION tenancy.enforce_ai_text_agent_admission();

REVOKE ALL ON FUNCTION tenancy.enforce_ai_text_agent_admission() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.enforce_ai_text_agent_admission() TO djay_runtime;
