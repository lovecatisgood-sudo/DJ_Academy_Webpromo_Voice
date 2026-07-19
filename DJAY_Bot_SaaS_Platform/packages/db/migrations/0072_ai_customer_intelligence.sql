CREATE TABLE tenancy.tenant_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  team_key text NOT NULL CHECK (team_key ~ '^[a-z][a-z0-9_-]{1,63}$'), name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by_membership_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, team_key),
  FOREIGN KEY (tenant_id, created_by_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.tenant_team_members (
  tenant_id uuid NOT NULL, team_id uuid NOT NULL, membership_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, team_id, membership_id),
  FOREIGN KEY (tenant_id, team_id) REFERENCES tenancy.tenant_teams(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE tenancy.ai_conversation_insights (
  tenant_id uuid NOT NULL, conversation_id uuid NOT NULL, last_turn_id uuid NOT NULL,
  summary_text text NOT NULL CHECK (char_length(summary_text) BETWEEN 1 AND 2000), latest_intent text NOT NULL CHECK (latest_intent ~ '^[a-z][a-z0-9_.-]{1,99}$'),
  unanswered_count integer NOT NULL DEFAULT 0 CHECK (unanswered_count >= 0), lead_score smallint NOT NULL DEFAULT 0 CHECK (lead_score BETWEEN 0 AND 100),
  segment text NOT NULL DEFAULT 'new' CHECK (segment IN ('new', 'engaged', 'warm', 'hot')),
  routing_team_key text CHECK (routing_team_key IS NULL OR routing_team_key ~ '^[a-z][a-z0-9_-]{1,63}$'), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, conversation_id),
  FOREIGN KEY (tenant_id, conversation_id) REFERENCES tenancy.conversations(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, last_turn_id) REFERENCES tenancy.ai_turns(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.ai_contact_insights (
  tenant_id uuid NOT NULL, contact_id uuid NOT NULL, last_conversation_id uuid NOT NULL,
  summary_text text NOT NULL CHECK (char_length(summary_text) BETWEEN 1 AND 2000), lead_score smallint NOT NULL DEFAULT 0 CHECK (lead_score BETWEEN 0 AND 100),
  segment text NOT NULL DEFAULT 'new' CHECK (segment IN ('new', 'engaged', 'warm', 'hot')), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, contact_id),
  FOREIGN KEY (tenant_id, contact_id) REFERENCES tenancy.contacts(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, last_conversation_id) REFERENCES tenancy.conversations(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.ai_department_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, conversation_id uuid NOT NULL, team_id uuid,
  requested_team_key text NOT NULL CHECK (requested_team_key ~ '^[a-z][a-z0-9_-]{1,63}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'accepted', 'closed')),
  assigned_membership_id uuid, created_at timestamptz NOT NULL DEFAULT now(), accepted_at timestamptz, closed_at timestamptz,
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, conversation_id),
  FOREIGN KEY (tenant_id, conversation_id) REFERENCES tenancy.conversations(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, team_id) REFERENCES tenancy.tenant_teams(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, assigned_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.ai_integration_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
  integration_kind text NOT NULL CHECK (integration_kind IN ('google_sheets', 'webhook', 'crm')),
  config_ciphertext text NOT NULL CHECK (char_length(config_ciphertext) BETWEEN 20 AND 20000),
  event_types text[] NOT NULL CHECK (cardinality(event_types) BETWEEN 1 AND 4 AND event_types <@ ARRAY['conversation_updated','lead_qualified','handover_requested','appointment_requested']::text[]),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'revoked')),
  created_by_membership_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id), FOREIGN KEY (tenant_id, created_by_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.ai_integration_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, integration_profile_id uuid NOT NULL,
  conversation_id uuid NOT NULL, turn_id uuid NOT NULL, event_type text NOT NULL CHECK (event_type IN ('conversation_updated','lead_qualified','handover_requested','appointment_requested')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'dead_letter')),
  idempotency_key text NOT NULL, attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 10),
  available_at timestamptz NOT NULL DEFAULT now(), locked_at timestamptz, safe_error_code text CHECK (safe_error_code IS NULL OR safe_error_code ~ '^[a-z0-9_]{2,100}$'),
  created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, integration_profile_id) REFERENCES tenancy.ai_integration_profiles(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, conversation_id) REFERENCES tenancy.conversations(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, turn_id) REFERENCES tenancy.ai_turns(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX tenancy_ai_integration_claim ON tenancy.ai_integration_jobs (available_at, created_at) WHERE status IN ('pending', 'processing', 'failed');

CREATE OR REPLACE FUNCTION tenancy.derive_ai_customer_intelligence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE runtime record; definition jsonb; score_delta integer; next_score integer; next_segment text; summary_value text; unanswered integer; route_key text; event_name text;
BEGIN
  IF NEW.status <> 'completed' OR OLD.status = 'completed' THEN RETURN NEW; END IF;
  SELECT session.conversation_id, session.contact_id, version.playbook_json INTO runtime
  FROM tenancy.ai_sessions session JOIN tenancy.ai_playbook_versions version
    ON version.tenant_id = session.tenant_id AND version.id = session.playbook_version_id
  WHERE session.tenant_id = NEW.tenant_id AND session.id = NEW.session_id;
  definition := runtime.playbook_json;
  unanswered := CASE WHEN COALESCE(NEW.structured_output_json->'handover'->>'reason', '') LIKE 'confidence_below_threshold:%' THEN 1 ELSE 0 END;
  score_delta := LEAST(35, jsonb_array_length(COALESCE(NEW.structured_output_json->'facts', '[]'::jsonb)) * 3)
    + CASE WHEN NEW.structured_output_json->'proposedActions' @> '[{"type":"lead.capture"}]'::jsonb THEN 25 ELSE 0 END
    + CASE WHEN NEW.structured_output_json->'proposedActions' @> '[{"type":"appointment.request"}]'::jsonb THEN 20 ELSE 0 END;
  SELECT LEAST(100, COALESCE(insight.lead_score, 0) + score_delta) INTO next_score FROM (SELECT 1) seed
    LEFT JOIN tenancy.ai_conversation_insights insight ON insight.tenant_id = NEW.tenant_id AND insight.conversation_id = runtime.conversation_id;
  next_segment := CASE WHEN next_score >= 70 THEN 'hot' WHEN next_score >= 40 THEN 'warm' WHEN next_score >= 10 THEN 'engaged' ELSE 'new' END;
  summary_value := left(COALESCE(NULLIF(NEW.structured_output_json->'handover'->>'summary', ''), NEW.structured_output_json->>'customerResponse', 'Conversation updated.'), 2000);
  route_key := NULLIF(definition->>'routingTeamKey', '');
  INSERT INTO tenancy.ai_conversation_insights (tenant_id, conversation_id, last_turn_id, summary_text, latest_intent, unanswered_count, lead_score, segment, routing_team_key)
  VALUES (NEW.tenant_id, runtime.conversation_id, NEW.id, summary_value, NEW.structured_output_json->>'intent', unanswered, next_score, next_segment, route_key)
  ON CONFLICT (tenant_id, conversation_id) DO UPDATE SET last_turn_id = EXCLUDED.last_turn_id, summary_text = EXCLUDED.summary_text,
    latest_intent = EXCLUDED.latest_intent, unanswered_count = tenancy.ai_conversation_insights.unanswered_count + unanswered,
    lead_score = EXCLUDED.lead_score, segment = EXCLUDED.segment, routing_team_key = EXCLUDED.routing_team_key, updated_at = now();
  INSERT INTO tenancy.ai_contact_insights (tenant_id, contact_id, last_conversation_id, summary_text, lead_score, segment)
  VALUES (NEW.tenant_id, runtime.contact_id, runtime.conversation_id, summary_value, next_score, next_segment)
  ON CONFLICT (tenant_id, contact_id) DO UPDATE SET last_conversation_id = EXCLUDED.last_conversation_id, summary_text = EXCLUDED.summary_text,
    lead_score = GREATEST(tenancy.ai_contact_insights.lead_score, EXCLUDED.lead_score),
    segment = CASE WHEN GREATEST(tenancy.ai_contact_insights.lead_score, EXCLUDED.lead_score) >= 70 THEN 'hot'
      WHEN GREATEST(tenancy.ai_contact_insights.lead_score, EXCLUDED.lead_score) >= 40 THEN 'warm'
      WHEN GREATEST(tenancy.ai_contact_insights.lead_score, EXCLUDED.lead_score) >= 10 THEN 'engaged' ELSE 'new' END, updated_at = now();
  IF route_key IS NOT NULL AND NEW.structured_output_json->'handover' IS NOT NULL AND NEW.structured_output_json->'handover' <> 'null'::jsonb THEN
    INSERT INTO tenancy.ai_department_assignments (tenant_id, conversation_id, team_id, requested_team_key, status)
    SELECT NEW.tenant_id, runtime.conversation_id, team.id, route_key, CASE WHEN team.id IS NULL THEN 'pending' ELSE 'assigned' END
    FROM (SELECT 1) seed LEFT JOIN tenancy.tenant_teams team ON team.tenant_id = NEW.tenant_id AND team.team_key = route_key AND team.status = 'active'
    ON CONFLICT (tenant_id, conversation_id) DO NOTHING;
  END IF;
  event_name := CASE WHEN NEW.structured_output_json->'handover' IS NOT NULL AND NEW.structured_output_json->'handover' <> 'null'::jsonb THEN 'handover_requested'
    WHEN NEW.structured_output_json->'proposedActions' @> '[{"type":"appointment.request"}]'::jsonb THEN 'appointment_requested'
    WHEN next_score >= 40 THEN 'lead_qualified' ELSE 'conversation_updated' END;
  INSERT INTO tenancy.ai_integration_jobs (tenant_id, integration_profile_id, conversation_id, turn_id, event_type, idempotency_key)
  SELECT NEW.tenant_id, profile.id, runtime.conversation_id, NEW.id, event_name, 'ai:' || NEW.id::text || ':' || profile.id::text || ':' || event_name
  FROM tenancy.ai_integration_profiles profile WHERE profile.tenant_id = NEW.tenant_id AND profile.status = 'active' AND event_name = ANY(profile.event_types)
  ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
  RETURN NEW;
END
$$;
CREATE TRIGGER tenancy_ai_customer_intelligence AFTER UPDATE ON tenancy.ai_turns FOR EACH ROW EXECUTE FUNCTION tenancy.derive_ai_customer_intelligence();

CREATE OR REPLACE FUNCTION tenancy.claim_ai_integration_job(claim_time timestamptz, stale_before timestamptz)
RETURNS TABLE (job_id uuid, tenant_id uuid, integration_kind text, config_ciphertext text, event_type text, conversation_id uuid, contact_id uuid,
  summary_text text, lead_score smallint, segment text, attempt_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
BEGIN
  IF session_user <> 'djay_worker' OR current_setting('app.service', true) IS DISTINCT FROM 'ai_integration_worker' THEN RAISE EXCEPTION 'ai_integration_worker_context_required'; END IF;
  RETURN QUERY WITH candidate AS (SELECT job.id FROM tenancy.ai_integration_jobs job WHERE job.available_at <= claim_time AND job.attempt_count < 10
    AND (job.status IN ('pending','failed') OR (job.status = 'processing' AND job.locked_at < stale_before))
    ORDER BY job.available_at, job.created_at, job.id FOR UPDATE SKIP LOCKED LIMIT 1),
  claimed AS (UPDATE tenancy.ai_integration_jobs job SET status = 'processing', attempt_count = job.attempt_count + 1, locked_at = claim_time, safe_error_code = NULL
    FROM candidate WHERE job.id = candidate.id RETURNING job.*)
  SELECT claimed.id, claimed.tenant_id, profile.integration_kind, profile.config_ciphertext, claimed.event_type, claimed.conversation_id,
    conversation.contact_id, insight.summary_text, insight.lead_score, insight.segment, claimed.attempt_count
  FROM claimed JOIN tenancy.ai_integration_profiles profile ON profile.tenant_id = claimed.tenant_id AND profile.id = claimed.integration_profile_id
  JOIN tenancy.conversations conversation ON conversation.tenant_id = claimed.tenant_id AND conversation.id = claimed.conversation_id
  JOIN tenancy.ai_conversation_insights insight ON insight.tenant_id = claimed.tenant_id AND insight.conversation_id = claimed.conversation_id
  WHERE profile.status = 'active';
END
$$;

CREATE OR REPLACE FUNCTION tenancy.finish_ai_integration_job(target_job_id uuid, delivered boolean, target_safe_error_code text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE changed integer;
BEGIN
  IF session_user <> 'djay_worker' OR current_setting('app.service', true) IS DISTINCT FROM 'ai_integration_worker' THEN RAISE EXCEPTION 'ai_integration_worker_context_required'; END IF;
  UPDATE tenancy.ai_integration_jobs job SET status = CASE WHEN delivered THEN 'succeeded' WHEN job.attempt_count >= 10 THEN 'dead_letter' ELSE 'failed' END,
    completed_at = CASE WHEN delivered OR job.attempt_count >= 10 THEN now() ELSE NULL END, locked_at = NULL,
    available_at = CASE WHEN delivered THEN job.available_at ELSE now() + make_interval(secs => LEAST(3600, 30 * (2 ^ LEAST(job.attempt_count, 7)))) END,
    safe_error_code = CASE WHEN delivered THEN NULL ELSE left(COALESCE(target_safe_error_code, 'delivery_failed'), 100) END
  WHERE job.id = target_job_id AND job.status = 'processing';
  GET DIAGNOSTICS changed = ROW_COUNT; RETURN changed = 1;
END
$$;

DO $$ DECLARE table_name text; BEGIN FOREACH table_name IN ARRAY ARRAY['tenant_teams','tenant_team_members','ai_conversation_insights','ai_contact_insights','ai_department_assignments','ai_integration_profiles','ai_integration_jobs']
LOOP EXECUTE format('ALTER TABLE tenancy.%I ENABLE ROW LEVEL SECURITY', table_name); EXECUTE format('ALTER TABLE tenancy.%I FORCE ROW LEVEL SECURITY', table_name);
  EXECUTE format('CREATE POLICY tenant_isolation ON tenancy.%I USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id())', table_name); END LOOP; END $$;
CREATE POLICY worker_ai_integration_profiles ON tenancy.ai_integration_profiles TO djay_worker USING (current_setting('app.service', true) = 'ai_integration_worker');
CREATE POLICY worker_ai_integration_jobs ON tenancy.ai_integration_jobs TO djay_worker USING (current_setting('app.service', true) = 'ai_integration_worker');

REVOKE ALL ON tenancy.tenant_teams, tenancy.tenant_team_members, tenancy.ai_conversation_insights, tenancy.ai_contact_insights,
  tenancy.ai_department_assignments, tenancy.ai_integration_profiles, tenancy.ai_integration_jobs FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON tenancy.tenant_teams, tenancy.tenant_team_members, tenancy.ai_department_assignments, tenancy.ai_integration_profiles TO djay_runtime;
GRANT SELECT ON tenancy.ai_conversation_insights, tenancy.ai_contact_insights, tenancy.ai_integration_jobs TO djay_runtime;
REVOKE ALL ON FUNCTION tenancy.claim_ai_integration_job(timestamptz, timestamptz), tenancy.finish_ai_integration_job(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.claim_ai_integration_job(timestamptz, timestamptz), tenancy.finish_ai_integration_job(uuid, boolean, text) TO djay_worker;
