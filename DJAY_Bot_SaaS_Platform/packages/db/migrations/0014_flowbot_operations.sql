CREATE TABLE tenancy.flow_business_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  schedule_key text NOT NULL CHECK (schedule_key ~ '^[a-z][a-z0-9_-]{0,99}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
  timezone text NOT NULL CHECK (char_length(timezone) BETWEEN 3 AND 64),
  weekly_windows jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(weekly_windows) = 'array'),
  closed_dates text[] NOT NULL DEFAULT '{}',
  created_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, schedule_key),
  FOREIGN KEY (tenant_id, created_by_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.flow_routing_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  team_key text NOT NULL CHECK (team_key ~ '^[a-z][a-z0-9_-]{0,99}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, team_key),
  FOREIGN KEY (tenant_id, created_by_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.flow_routing_team_members (
  tenant_id uuid NOT NULL,
  team_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, team_id, membership_id),
  FOREIGN KEY (tenant_id, team_id) REFERENCES tenancy.flow_routing_teams(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION tenancy.flowbot_runtime_schedules(
  target_session_hash bytea,
  request_origin text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'scheduleKey', schedule.schedule_key,
    'timezone', schedule.timezone,
    'weeklyWindows', schedule.weekly_windows,
    'closedDates', to_jsonb(schedule.closed_dates)
  ) ORDER BY schedule.schedule_key) FILTER (WHERE schedule.id IS NOT NULL), '[]'::jsonb)
  FROM tenancy.flow_executions execution
  JOIN tenancy.flow_deployments deployment
    ON deployment.tenant_id = execution.tenant_id AND deployment.id = execution.deployment_id
  LEFT JOIN tenancy.flow_business_schedules schedule ON schedule.tenant_id = execution.tenant_id
  WHERE execution.session_token_hash = target_session_hash
    AND execution.expires_at > now()
    AND deployment.status = 'active'
    AND tenancy.flowbot_origin_allowed(deployment.allowed_origins, request_origin)
$$;

CREATE OR REPLACE FUNCTION tenancy.assign_flowbot_handover()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
DECLARE
  command jsonb;
  target_team_key text;
  target_strategy text;
  target_membership_id uuid;
  previous_mode text;
BEGIN
  IF NEW.event_type <> 'requested' THEN RETURN NEW; END IF;

  SELECT request.input_json INTO command
  FROM tenancy.action_requests request
  WHERE request.tenant_id = NEW.tenant_id
    AND request.conversation_id = NEW.conversation_id
    AND request.idempotency_key = NEW.idempotency_key
    AND request.action_type = 'handover.request';

  target_team_key := NULLIF(command->'payload'->>'teamKey', '');
  target_strategy := COALESCE(NULLIF(command->'payload'->>'strategy', ''), 'owner');

  IF target_strategy <> 'owner' AND target_team_key IS NOT NULL THEN
    SELECT member.membership_id INTO target_membership_id
    FROM tenancy.flow_routing_teams team
    JOIN tenancy.flow_routing_team_members member
      ON member.tenant_id = team.tenant_id AND member.team_id = team.id
    JOIN tenancy.memberships membership
      ON membership.tenant_id = member.tenant_id AND membership.id = member.membership_id
      AND membership.status = 'active'
    WHERE team.tenant_id = NEW.tenant_id AND team.team_key = target_team_key AND team.status = 'active'
    ORDER BY
      CASE WHEN target_strategy = 'least_active' THEN (
        SELECT count(*) FROM tenancy.conversations conversation
        WHERE conversation.tenant_id = member.tenant_id
          AND conversation.assigned_membership_id = member.membership_id
          AND conversation.status <> 'closed' AND conversation.automation_mode = 'human'
      ) ELSE 0 END,
      CASE WHEN target_strategy = 'round_robin' THEN (
        SELECT count(*) FROM tenancy.handover_events event
        WHERE event.tenant_id = member.tenant_id AND event.assigned_membership_id = member.membership_id
      ) ELSE 0 END,
      member.membership_id
    LIMIT 1;
  END IF;

  IF target_membership_id IS NULL THEN
    SELECT membership.id INTO target_membership_id
    FROM tenancy.memberships membership
    WHERE membership.tenant_id = NEW.tenant_id
      AND membership.role = 'tenant_master_admin' AND membership.status = 'active'
    LIMIT 1;
  END IF;

  SELECT automation_mode INTO previous_mode
  FROM tenancy.conversations
  WHERE tenant_id = NEW.tenant_id AND id = NEW.conversation_id
  FOR UPDATE;

  NEW.assigned_membership_id := target_membership_id;
  UPDATE tenancy.conversations
  SET automation_mode = 'human', assigned_membership_id = target_membership_id, updated_at = now()
  WHERE tenant_id = NEW.tenant_id AND id = NEW.conversation_id AND automation_mode <> 'closed';

  IF previous_mode IS NOT NULL AND previous_mode NOT IN ('human', 'closed') THEN
    INSERT INTO tenancy.conversation_transitions (
      tenant_id, conversation_id, from_mode, to_mode, reason, context_json, request_id
    ) VALUES (
      NEW.tenant_id, NEW.conversation_id, previous_mode, 'human',
      COALESCE(NEW.reason, 'flowbot_handover'),
      jsonb_build_object('teamKey', target_team_key, 'strategy', target_strategy),
      NEW.idempotency_key
    );
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER tenancy_assign_flowbot_handover
  BEFORE INSERT ON tenancy.handover_events
  FOR EACH ROW EXECUTE FUNCTION tenancy.assign_flowbot_handover();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'flow_business_schedules', 'flow_routing_teams', 'flow_routing_team_members'
  ] LOOP
    EXECUTE format('ALTER TABLE tenancy.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE tenancy.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON tenancy.%I USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id())', table_name);
  END LOOP;
END
$$;

CREATE POLICY worker_flow_schedule_access ON tenancy.flow_business_schedules TO djay_worker
  USING (tenant_id = tenancy.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON tenancy.flow_business_schedules,
  tenancy.flow_routing_teams, tenancy.flow_routing_team_members TO djay_runtime;
GRANT SELECT ON tenancy.flow_business_schedules TO djay_worker;
REVOKE ALL ON FUNCTION tenancy.flowbot_runtime_schedules(bytea, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.assign_flowbot_handover() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.flowbot_runtime_schedules(bytea, text) TO djay_flowbot_runtime;
