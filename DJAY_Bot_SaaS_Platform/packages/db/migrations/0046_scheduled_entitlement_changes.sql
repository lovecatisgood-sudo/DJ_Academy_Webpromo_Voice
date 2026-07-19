CREATE OR REPLACE FUNCTION tenancy.apply_next_scheduled_entitlement_change(
  applied_at_value timestamptz DEFAULT now()
)
RETURNS TABLE (change_id uuid, tenant_id uuid, subscription_id uuid, result text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy, catalog
AS $$
#variable_conflict use_column
DECLARE
  selected tenancy.subscription_scheduled_changes%ROWTYPE;
  subscription tenancy.product_subscriptions%ROWTYPE;
  plan_record record;
  snapshot_id uuid := gen_random_uuid();
  resolved jsonb;
  excess_resource jsonb;
BEGIN
  IF session_user <> 'djay_worker' THEN RAISE EXCEPTION 'worker_role_required'; END IF;

  SELECT candidate.* INTO selected
  FROM tenancy.subscription_scheduled_changes candidate
  WHERE candidate.status = 'scheduled' AND candidate.effective_at <= applied_at_value
  ORDER BY candidate.effective_at, candidate.created_at, candidate.id
  FOR UPDATE SKIP LOCKED
  LIMIT 1;
  IF selected.id IS NULL THEN RETURN; END IF;

  UPDATE tenancy.subscription_scheduled_changes
  SET status = 'applying', updated_at = applied_at_value
  WHERE id = selected.id;

  SELECT * INTO subscription
  FROM tenancy.product_subscriptions current_subscription
  WHERE current_subscription.id = selected.subscription_id
    AND current_subscription.tenant_id = selected.tenant_id
  FOR UPDATE;
  IF subscription.id IS NULL OR subscription.plan_version_id <> selected.from_plan_version_id
    OR subscription.status <> 'scheduled_change' THEN
    UPDATE tenancy.subscription_scheduled_changes
    SET status = 'failed', failure_code = 'subscription_authority_changed', updated_at = applied_at_value
    WHERE id = selected.id;
    RETURN QUERY SELECT selected.id, selected.tenant_id, selected.subscription_id,
      'subscription_authority_changed'::text;
    RETURN;
  END IF;

  SELECT version.entitlements, version.allowances, version.overage_rates_minor,
    version.limits, plan.plan_key, plan.product_key
  INTO plan_record
  FROM catalog.plan_versions version
  JOIN catalog.plans plan ON plan.id = version.plan_id
  WHERE version.id = selected.to_plan_version_id AND version.status = 'published'
    AND plan.product_key = subscription.product_key;
  IF plan_record.plan_key IS NULL THEN
    UPDATE tenancy.subscription_scheduled_changes
    SET status = 'failed', failure_code = 'destination_plan_unavailable', updated_at = applied_at_value
    WHERE id = selected.id;
    RETURN QUERY SELECT selected.id, selected.tenant_id, selected.subscription_id,
      'destination_plan_unavailable'::text;
    RETURN;
  END IF;

  resolved := jsonb_build_object(
    'tenantId', selected.tenant_id,
    'subscriptionId', selected.subscription_id,
    'productKey', plan_record.product_key,
    'publicPlanKey', plan_record.plan_key,
    'planVersionId', selected.to_plan_version_id,
    'accessMode', 'active',
    'entitlements', plan_record.entitlements,
    'allowances', plan_record.allowances,
    'overageRatesMinor', plan_record.overage_rates_minor,
    'limits', plan_record.limits,
    'resolvedAt', applied_at_value
  );

  UPDATE tenancy.entitlement_resource_states
  SET state = 'active', source_change_id = selected.id,
    reason_code = 'plan_capacity_restored', disabled_at = NULL,
    restored_at = applied_at_value, updated_at = applied_at_value
  WHERE entitlement_resource_states.tenant_id = selected.tenant_id
    AND product_key = subscription.product_key AND state <> 'active';

  FOR excess_resource IN
    SELECT value FROM jsonb_array_elements(
      COALESCE(selected.retained_resource_selection->'excessResources', '[]'::jsonb)
    )
  LOOP
    INSERT INTO tenancy.entitlement_resource_states (
      tenant_id, product_key, resource_kind, resource_id, state,
      source_change_id, reason_code, disabled_at, restored_at
    ) VALUES (
      selected.tenant_id, subscription.product_key,
      excess_resource->>'resourceKind', (excess_resource->>'resourceId')::uuid,
      excess_resource->>'state', selected.id, 'plan_limit_excess',
      applied_at_value, NULL
    )
    ON CONFLICT (tenant_id, product_key, resource_kind, resource_id) DO UPDATE SET
      state = EXCLUDED.state, source_change_id = EXCLUDED.source_change_id,
      reason_code = EXCLUDED.reason_code, disabled_at = EXCLUDED.disabled_at,
      restored_at = NULL, updated_at = applied_at_value;
  END LOOP;

  UPDATE tenancy.product_subscriptions
  SET plan_version_id = selected.to_plan_version_id, status = 'active', updated_at = applied_at_value
  WHERE id = selected.subscription_id AND tenant_id = selected.tenant_id;
  INSERT INTO tenancy.entitlement_snapshots (
    id, tenant_id, subscription_id, product_key, plan_version_id,
    subscription_status, access_mode, resolved_json, resolution_hash
  ) VALUES (
    snapshot_id, selected.tenant_id, selected.subscription_id, subscription.product_key,
    selected.to_plan_version_id, 'active', 'active', resolved,
    public.digest(convert_to(resolved::text, 'UTF8'), 'sha256')
  );
  UPDATE tenancy.subscription_scheduled_changes
  SET status = 'applied', applied_at = applied_at_value, updated_at = applied_at_value
  WHERE id = selected.id;
  INSERT INTO tenancy.audit_logs (
    tenant_id, actor_user_id, actor_membership_id, action, target_type,
    target_id, request_id, result, metadata
  ) VALUES (
    selected.tenant_id, NULL, NULL, 'subscription.plan_change_applied',
    'subscription', selected.subscription_id::text, selected.request_id, 'succeeded',
    jsonb_build_object('changeId', selected.id, 'fromPlanVersionId', selected.from_plan_version_id,
      'toPlanVersionId', selected.to_plan_version_id, 'snapshotId', snapshot_id)
  );
  RETURN QUERY SELECT selected.id, selected.tenant_id, selected.subscription_id, 'applied'::text;
END
$$;

REVOKE ALL ON FUNCTION tenancy.apply_next_scheduled_entitlement_change(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.apply_next_scheduled_entitlement_change(timestamptz) TO djay_worker;

CREATE OR REPLACE FUNCTION tenancy.entitlement_resource_is_writable(
  product_key_value text,
  resource_kind_value text,
  resource_id_value uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
  SELECT session_user = 'djay_runtime'
    AND NOT EXISTS (
      SELECT 1 FROM tenancy.entitlement_resource_states resource_state
      WHERE resource_state.tenant_id = tenancy.current_tenant_id()
        AND resource_state.product_key = product_key_value
        AND resource_state.resource_kind = resource_kind_value
        AND resource_state.resource_id = resource_id_value
        AND resource_state.state <> 'active'
    )
$$;

REVOKE ALL ON FUNCTION tenancy.entitlement_resource_is_writable(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.entitlement_resource_is_writable(text, text, uuid) TO djay_runtime;

CREATE OR REPLACE FUNCTION tenancy.flowbot_runtime_resource_active(deployment_key_hash_value bytea)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
  SELECT session_user = 'djay_flowbot_runtime' AND EXISTS (
    SELECT 1 FROM tenancy.flow_deployments deployment
    WHERE deployment.deployment_key_hash = deployment_key_hash_value AND deployment.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM tenancy.entitlement_resource_states resource_state
        WHERE resource_state.tenant_id = deployment.tenant_id AND resource_state.product_key = 'flowbot'
          AND resource_state.resource_kind = 'bot' AND resource_state.resource_id = deployment.bot_id
          AND resource_state.state <> 'active'))
$$;

CREATE OR REPLACE FUNCTION tenancy.ai_runtime_resource_active(deployment_key_hash_value bytea)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
  SELECT session_user = 'djay_ai_runtime' AND EXISTS (
    SELECT 1 FROM tenancy.ai_deployments deployment
    WHERE deployment.deployment_key_hash = deployment_key_hash_value AND deployment.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM tenancy.entitlement_resource_states resource_state
        WHERE resource_state.tenant_id = deployment.tenant_id AND resource_state.product_key = 'ai_chat'
          AND resource_state.resource_kind = 'bot' AND resource_state.resource_id = deployment.agent_id
          AND resource_state.state <> 'active'))
$$;

CREATE OR REPLACE FUNCTION tenancy.voice_runtime_resource_active(deployment_key_hash_value bytea)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
  SELECT session_user = 'djay_voice_runtime' AND EXISTS (
    SELECT 1 FROM tenancy.voice_deployments deployment
    WHERE deployment.deployment_key_hash = deployment_key_hash_value AND deployment.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM tenancy.entitlement_resource_states resource_state
        WHERE resource_state.tenant_id = deployment.tenant_id AND resource_state.product_key = 'voice'
          AND resource_state.resource_kind = 'deployment' AND resource_state.resource_id = deployment.id
          AND resource_state.state <> 'active'))
$$;

REVOKE ALL ON FUNCTION tenancy.flowbot_runtime_resource_active(bytea),
  tenancy.ai_runtime_resource_active(bytea), tenancy.voice_runtime_resource_active(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.flowbot_runtime_resource_active(bytea) TO djay_flowbot_runtime;
GRANT EXECUTE ON FUNCTION tenancy.ai_runtime_resource_active(bytea) TO djay_ai_runtime;
GRANT EXECUTE ON FUNCTION tenancy.voice_runtime_resource_active(bytea) TO djay_voice_runtime;
