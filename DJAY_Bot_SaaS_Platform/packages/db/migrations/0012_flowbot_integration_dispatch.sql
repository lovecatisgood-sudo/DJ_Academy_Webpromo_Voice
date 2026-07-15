CREATE OR REPLACE FUNCTION tenancy.claim_flowbot_dispatch()
RETURNS TABLE (
  dispatch_id uuid,
  tenant_id uuid,
  execution_id uuid,
  session_token_hash bytea,
  flow_version_id uuid,
  node_id uuid,
  snapshot_json jsonb,
  state_json jsonb,
  authority_json jsonb,
  next_input_sequence integer,
  endpoint_ciphertext text,
  payload_ciphertext text,
  template_key text,
  attempt_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'flowbot_worker' THEN
    RAISE EXCEPTION 'flowbot worker context required';
  END IF;
  RETURN QUERY
  WITH candidate AS (
    SELECT dispatch.id
    FROM tenancy.flow_integration_dispatches dispatch
    JOIN tenancy.flow_integration_profiles profile
      ON profile.tenant_id = dispatch.tenant_id AND profile.id = dispatch.integration_profile_id
    JOIN tenancy.flow_executions execution
      ON execution.tenant_id = dispatch.tenant_id AND execution.id = dispatch.execution_id
    JOIN tenancy.entitlement_snapshots snapshot
      ON snapshot.tenant_id = execution.tenant_id AND snapshot.id = execution.entitlement_snapshot_id
    WHERE dispatch.available_at <= now()
      AND dispatch.attempt_count < 10
      AND profile.status = 'approved'
      AND dispatch.template_key = ANY(profile.allowed_template_keys)
      AND execution.status = 'waiting' AND execution.expires_at > now()
      AND snapshot.access_mode = 'active'
      AND snapshot.resolved_json->'entitlements'->>'flow.webhook' = 'approved'
      AND (
        dispatch.status IN ('requested', 'failed')
        OR (dispatch.status = 'processing' AND dispatch.available_at < now() - interval '5 minutes')
      )
    ORDER BY dispatch.available_at, dispatch.id
    FOR UPDATE OF dispatch SKIP LOCKED
    LIMIT 1
  )
  UPDATE tenancy.flow_integration_dispatches dispatch
  SET status = 'processing', attempt_count = dispatch.attempt_count + 1,
      available_at = now() + interval '5 minutes', safe_error_code = NULL
  FROM candidate, tenancy.flow_integration_profiles profile,
       tenancy.flow_executions execution, tenancy.flow_versions version,
       tenancy.entitlement_snapshots snapshot, catalog.plan_versions plan_version,
       catalog.plans plan
  WHERE dispatch.id = candidate.id
    AND profile.tenant_id = dispatch.tenant_id AND profile.id = dispatch.integration_profile_id
    AND execution.tenant_id = dispatch.tenant_id AND execution.id = dispatch.execution_id
    AND version.tenant_id = execution.tenant_id AND version.id = execution.flow_version_id
    AND snapshot.tenant_id = execution.tenant_id AND snapshot.id = execution.entitlement_snapshot_id
    AND plan_version.id = snapshot.plan_version_id AND plan.id = plan_version.plan_id
  RETURNING dispatch.id, dispatch.tenant_id, execution.id, execution.session_token_hash,
            execution.flow_version_id, dispatch.node_id, version.snapshot_json,
            execution.state_json,
            jsonb_build_object(
              'planKey', plan.plan_key,
              'accessMode', snapshot.resolved_json->>'accessMode',
              'entitlements', COALESCE(snapshot.resolved_json->'entitlements', '{}'::jsonb),
              'limits', COALESCE(snapshot.resolved_json->'limits', '{}'::jsonb)
            ), execution.next_input_sequence, profile.endpoint_ciphertext,
            dispatch.payload_ciphertext, dispatch.template_key, dispatch.attempt_count;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.finish_flowbot_dispatch(
  target_dispatch_id uuid,
  delivered boolean,
  target_safe_error_code text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
DECLARE changed integer;
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'flowbot_worker' THEN
    RAISE EXCEPTION 'flowbot worker context required';
  END IF;
  UPDATE tenancy.flow_integration_dispatches
  SET status = CASE WHEN delivered THEN 'succeeded'
                    WHEN attempt_count >= 10 THEN 'dead_letter' ELSE 'failed' END,
      completed_at = CASE WHEN delivered OR attempt_count >= 10 THEN now() ELSE NULL END,
      available_at = CASE WHEN delivered THEN available_at
        ELSE now() + make_interval(secs => LEAST(3600, attempt_count * attempt_count * 30)) END,
      safe_error_code = CASE WHEN delivered THEN NULL ELSE left(COALESCE(target_safe_error_code, 'delivery_failed'), 100) END
  WHERE id = target_dispatch_id AND status = 'processing';
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END
$$;

REVOKE ALL ON FUNCTION tenancy.claim_flowbot_dispatch() FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.finish_flowbot_dispatch(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.claim_flowbot_dispatch() TO djay_worker;
GRANT EXECUTE ON FUNCTION tenancy.finish_flowbot_dispatch(uuid, boolean, text) TO djay_worker;
