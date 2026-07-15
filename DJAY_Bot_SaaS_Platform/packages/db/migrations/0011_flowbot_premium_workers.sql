CREATE OR REPLACE FUNCTION tenancy.claim_flowbot_timer()
RETURNS TABLE (
  timer_id uuid,
  tenant_id uuid,
  execution_id uuid,
  session_token_hash bytea,
  flow_version_id uuid,
  node_id uuid,
  snapshot_json jsonb,
  state_json jsonb,
  authority_json jsonb,
  next_input_sequence integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy, catalog
AS $$
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'flowbot_worker' THEN
    RAISE EXCEPTION 'flowbot worker context required';
  END IF;
  RETURN QUERY
  WITH candidate AS (
    SELECT timer.id
    FROM tenancy.flow_timers timer
    JOIN tenancy.flow_executions execution
      ON execution.tenant_id = timer.tenant_id AND execution.id = timer.execution_id
    JOIN tenancy.entitlement_snapshots snapshot
      ON snapshot.tenant_id = execution.tenant_id AND snapshot.id = execution.entitlement_snapshot_id
    WHERE timer.due_at <= now()
      AND timer.attempt_count < 10
      AND execution.status = 'waiting' AND execution.expires_at > now()
      AND snapshot.access_mode = 'active'
      AND snapshot.resolved_json->'entitlements'->>'flow.delays' = 'true'
      AND (
        timer.status IN ('scheduled', 'failed')
        OR (timer.status = 'processing' AND timer.locked_at < now() - interval '5 minutes')
      )
    ORDER BY timer.due_at, timer.id
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  ), claimed AS (
    UPDATE tenancy.flow_timers timer
    SET status = 'processing', locked_at = now(),
        attempt_count = timer.attempt_count + 1, last_error_code = NULL
    FROM candidate
    WHERE timer.id = candidate.id
    RETURNING timer.*
  )
  SELECT claimed.id, claimed.tenant_id, execution.id, execution.session_token_hash,
         execution.flow_version_id, claimed.node_id, version.snapshot_json,
         execution.state_json,
         jsonb_build_object(
           'planKey', plan.plan_key,
           'accessMode', snapshot.resolved_json->>'accessMode',
           'entitlements', COALESCE(snapshot.resolved_json->'entitlements', '{}'::jsonb),
           'limits', COALESCE(snapshot.resolved_json->'limits', '{}'::jsonb)
         ), execution.next_input_sequence
  FROM claimed
  JOIN tenancy.flow_executions execution
    ON execution.tenant_id = claimed.tenant_id AND execution.id = claimed.execution_id
  JOIN tenancy.flow_versions version
    ON version.tenant_id = execution.tenant_id AND version.id = execution.flow_version_id
  JOIN tenancy.entitlement_snapshots snapshot
    ON snapshot.tenant_id = execution.tenant_id AND snapshot.id = execution.entitlement_snapshot_id
  JOIN catalog.plan_versions plan_version ON plan_version.id = snapshot.plan_version_id
  JOIN catalog.plans plan ON plan.id = plan_version.plan_id
  WHERE execution.status = 'waiting' AND execution.expires_at > now()
    AND snapshot.access_mode = 'active'
    AND snapshot.resolved_json->'entitlements'->>'flow.delays' = 'true';
END
$$;

CREATE OR REPLACE FUNCTION tenancy.finish_flowbot_timer(target_timer_id uuid, safe_error_code text DEFAULT NULL)
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
  UPDATE tenancy.flow_timers
  SET status = CASE WHEN safe_error_code IS NULL THEN 'fired'
                    WHEN attempt_count >= 10 THEN 'failed' ELSE 'failed' END,
      fired_at = CASE WHEN safe_error_code IS NULL THEN now() ELSE fired_at END,
      due_at = CASE WHEN safe_error_code IS NULL THEN due_at
                    ELSE now() + make_interval(secs => LEAST(3600, attempt_count * attempt_count * 30)) END,
      locked_at = NULL,
      last_error_code = CASE WHEN safe_error_code IS NULL THEN NULL ELSE left(safe_error_code, 100) END
  WHERE id = target_timer_id AND status = 'processing';
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END
$$;

REVOKE ALL ON FUNCTION tenancy.claim_flowbot_timer() FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.finish_flowbot_timer(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.claim_flowbot_timer() TO djay_worker;
GRANT EXECUTE ON FUNCTION tenancy.finish_flowbot_timer(uuid, text) TO djay_worker;
GRANT EXECUTE ON FUNCTION tenancy.commit_flowbot_step(bytea, uuid, integer, jsonb, jsonb, jsonb) TO djay_worker;
