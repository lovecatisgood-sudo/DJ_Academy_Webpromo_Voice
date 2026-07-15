CREATE TABLE platform.voice_route_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capability_profile text NOT NULL CHECK (capability_profile = 'voice_gen2'),
  provider_key text NOT NULL CHECK (provider_key ~ '^[a-z0-9][a-z0-9._-]{1,79}$'),
  model_key text NOT NULL CHECK (char_length(model_key) BETWEEN 2 AND 160),
  region_key text NOT NULL CHECK (region_key ~ '^[a-z0-9][a-z0-9._-]{1,79}$'),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'qualified', 'rejected', 'paused')),
  proposed_by_platform_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  reviewed_by_platform_user_id uuid REFERENCES platform.users(id) ON DELETE RESTRICT,
  qualification_evidence_sha256 bytea CHECK (
    qualification_evidence_sha256 IS NULL OR octet_length(qualification_evidence_sha256) = 32
  ),
  proposed_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (capability_profile, provider_key, model_key, region_key),
  CHECK (reviewed_by_platform_user_id IS NULL OR reviewed_by_platform_user_id <> proposed_by_platform_user_id),
  CHECK (
    (status = 'proposed' AND reviewed_by_platform_user_id IS NULL AND qualification_evidence_sha256 IS NULL AND reviewed_at IS NULL)
    OR (status <> 'proposed' AND reviewed_by_platform_user_id IS NOT NULL
      AND qualification_evidence_sha256 IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

CREATE TABLE platform.voice_routing_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capability_profile text NOT NULL CHECK (capability_profile = 'voice_gen2'),
  candidate_id uuid NOT NULL REFERENCES platform.voice_route_candidates(id) ON DELETE RESTRICT,
  previous_candidate_id uuid REFERENCES platform.voice_route_candidates(id) ON DELETE RESTRICT,
  canary_percent smallint NOT NULL CHECK (canary_percent BETWEEN 1 AND 100),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN (
    'requested', 'approved', 'rejected', 'canary', 'active', 'rolled_back'
  )),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 12 AND 500),
  evaluation_evidence_sha256 bytea NOT NULL CHECK (octet_length(evaluation_evidence_sha256) = 32),
  requested_by_platform_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  approved_by_platform_user_id uuid REFERENCES platform.users(id) ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  canary_started_at timestamptz,
  activated_at timestamptz,
  rolled_back_at timestamptz,
  rollback_reason text CHECK (rollback_reason IS NULL OR char_length(rollback_reason) BETWEEN 12 AND 500),
  CHECK (candidate_id <> previous_candidate_id),
  CHECK (approved_by_platform_user_id IS NULL OR approved_by_platform_user_id <> requested_by_platform_user_id),
  CHECK ((status = 'requested') = (approved_by_platform_user_id IS NULL)),
  CHECK (status NOT IN ('approved', 'canary', 'active', 'rolled_back') OR approved_at IS NOT NULL)
);

CREATE TABLE platform.voice_active_routes (
  capability_profile text PRIMARY KEY CHECK (capability_profile = 'voice_gen2'),
  primary_candidate_id uuid REFERENCES platform.voice_route_candidates(id) ON DELETE RESTRICT,
  canary_candidate_id uuid REFERENCES platform.voice_route_candidates(id) ON DELETE RESTRICT,
  canary_percent smallint NOT NULL DEFAULT 0 CHECK (canary_percent BETWEEN 0 AND 100),
  routing_change_id uuid REFERENCES platform.voice_routing_changes(id) ON DELETE RESTRICT,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by_platform_user_id uuid REFERENCES platform.users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((canary_candidate_id IS NULL) = (canary_percent = 0)),
  CHECK (primary_candidate_id IS NULL OR primary_candidate_id <> canary_candidate_id)
);

CREATE TABLE platform.voice_profile_controls (
  capability_profile text PRIMARY KEY CHECK (capability_profile = 'voice_gen2'),
  mode text NOT NULL CHECK (mode IN ('paused', 'canary', 'running', 'degraded')),
  reason_code text NOT NULL CHECK (char_length(reason_code) BETWEEN 3 AND 200),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  changed_by_platform_user_id uuid REFERENCES platform.users(id) ON DELETE RESTRICT,
  changed_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO platform.voice_profile_controls (capability_profile, mode, reason_code)
VALUES ('voice_gen2', 'paused', 'qualification_required');
INSERT INTO platform.voice_active_routes (capability_profile)
VALUES ('voice_gen2');

CREATE TABLE platform.voice_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capability_profile text NOT NULL CHECK (capability_profile = 'voice_gen2'),
  severity text NOT NULL CHECK (severity IN ('minor', 'major', 'critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'monitoring', 'resolved')),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 12 AND 1000),
  resolution text CHECK (resolution IS NULL OR char_length(resolution) BETWEEN 12 AND 2000),
  routing_change_id uuid REFERENCES platform.voice_routing_changes(id) ON DELETE RESTRICT,
  credit_review_status text NOT NULL CHECK (credit_review_status IN ('not_required', 'required', 'approved', 'rejected')),
  opened_by_platform_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  credit_reviewed_by_platform_user_id uuid REFERENCES platform.users(id) ON DELETE RESTRICT,
  resolved_by_platform_user_id uuid REFERENCES platform.users(id) ON DELETE RESTRICT,
  opened_at timestamptz NOT NULL DEFAULT now(),
  credit_reviewed_at timestamptz,
  resolved_at timestamptz,
  CHECK (credit_reviewed_by_platform_user_id IS NULL OR credit_reviewed_by_platform_user_id <> opened_by_platform_user_id),
  CHECK ((credit_review_status IN ('approved', 'rejected')) = (credit_reviewed_at IS NOT NULL)),
  CHECK ((status = 'resolved') = (resolved_at IS NOT NULL))
);

CREATE TABLE operations.voice_session_routes (
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  session_id uuid NOT NULL,
  capability_profile text NOT NULL CHECK (capability_profile = 'voice_gen2'),
  candidate_id uuid NOT NULL REFERENCES platform.voice_route_candidates(id) ON DELETE RESTRICT,
  routing_change_id uuid REFERENCES platform.voice_routing_changes(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, session_id),
  FOREIGN KEY (tenant_id, session_id) REFERENCES tenancy.voice_sessions(tenant_id, id) ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION platform.current_voice_routing_operator()
RETURNS TABLE (actor_id uuid, actor_role text, request_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
BEGIN
  IF session_user <> 'djay_platform' THEN RAISE EXCEPTION 'platform_role_required'; END IF;
  actor_id := NULLIF(current_setting('app.platform_user_id', true), '')::uuid;
  actor_role := NULLIF(current_setting('app.platform_role', true), '');
  request_id := NULLIF(current_setting('app.request_id', true), '');
  IF actor_id IS NULL OR request_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM platform.role_assignments assignment
    WHERE assignment.platform_user_id = actor_id AND assignment.revoked_at IS NULL
      AND assignment.role = actor_role
      AND actor_role IN ('platform_owner', 'platform_ai_operations')
  ) THEN RAISE EXCEPTION 'platform_voice_routing_required'; END IF;
  RETURN NEXT;
END
$$;

CREATE OR REPLACE FUNCTION platform.get_voice_routing_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
DECLARE actor record;
BEGIN
  SELECT * INTO actor FROM platform.current_voice_routing_operator();
  RETURN jsonb_build_object(
    'profiles', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'capabilityProfile', control.capability_profile, 'mode', control.mode,
      'reasonCode', control.reason_code, 'version', control.version,
      'changedAt', control.changed_at, 'primaryCandidateId', route.primary_candidate_id,
      'canaryCandidateId', route.canary_candidate_id, 'canaryPercent', route.canary_percent
    ) ORDER BY control.capability_profile)
    FROM platform.voice_profile_controls control
    JOIN platform.voice_active_routes route USING (capability_profile)), '[]'::jsonb),
    'candidates', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', candidate.id, 'capabilityProfile', candidate.capability_profile,
      'providerKey', candidate.provider_key, 'modelKey', candidate.model_key,
      'regionKey', candidate.region_key, 'status', candidate.status,
      'proposedByPlatformUserId', candidate.proposed_by_platform_user_id,
      'reviewedByPlatformUserId', candidate.reviewed_by_platform_user_id,
      'proposedAt', candidate.proposed_at, 'reviewedAt', candidate.reviewed_at
    ) ORDER BY candidate.proposed_at DESC, candidate.id DESC)
    FROM platform.voice_route_candidates candidate), '[]'::jsonb),
    'changes', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', change.id, 'capabilityProfile', change.capability_profile,
      'candidateId', change.candidate_id, 'previousCandidateId', change.previous_candidate_id,
      'canaryPercent', change.canary_percent, 'status', change.status,
      'reason', change.reason, 'requestedByPlatformUserId', change.requested_by_platform_user_id,
      'approvedByPlatformUserId', change.approved_by_platform_user_id,
      'requestedAt', change.requested_at, 'approvedAt', change.approved_at,
      'canaryStartedAt', change.canary_started_at, 'activatedAt', change.activated_at,
      'rolledBackAt', change.rolled_back_at, 'rollbackReason', change.rollback_reason
    ) ORDER BY change.requested_at DESC, change.id DESC)
    FROM platform.voice_routing_changes change), '[]'::jsonb),
    'incidents', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', incident.id, 'capabilityProfile', incident.capability_profile,
      'severity', incident.severity, 'status', incident.status, 'reason', incident.reason,
      'resolution', incident.resolution, 'routingChangeId', incident.routing_change_id,
      'creditReviewStatus', incident.credit_review_status,
      'openedByPlatformUserId', incident.opened_by_platform_user_id,
      'openedAt', incident.opened_at, 'resolvedAt', incident.resolved_at
    ) ORDER BY incident.opened_at DESC, incident.id DESC)
    FROM platform.voice_incidents incident), '[]'::jsonb)
  );
END
$$;

CREATE OR REPLACE FUNCTION platform.get_voice_incidents()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
DECLARE actor_id uuid; actor_role text;
BEGIN
  IF session_user <> 'djay_platform' THEN RAISE EXCEPTION 'platform_role_required'; END IF;
  actor_id := NULLIF(current_setting('app.platform_user_id', true), '')::uuid;
  actor_role := NULLIF(current_setting('app.platform_role', true), '');
  IF actor_id IS NULL OR actor_role NOT IN ('platform_owner', 'platform_ai_operations', 'platform_finance')
     OR NOT EXISTS (SELECT 1 FROM platform.role_assignments assignment
       WHERE assignment.platform_user_id = actor_id AND assignment.role = actor_role AND assignment.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'platform_voice_incident_read_required';
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id', incident.id, 'capabilityProfile', incident.capability_profile,
    'severity', incident.severity, 'status', incident.status, 'reason', incident.reason,
    'resolution', incident.resolution, 'routingChangeId', incident.routing_change_id,
    'creditReviewStatus', incident.credit_review_status,
    'openedByPlatformUserId', incident.opened_by_platform_user_id,
    'openedAt', incident.opened_at, 'resolvedAt', incident.resolved_at
  ) ORDER BY incident.opened_at DESC, incident.id DESC)
  FROM platform.voice_incidents incident), '[]'::jsonb);
END
$$;

CREATE OR REPLACE FUNCTION platform.propose_voice_route_candidate(
  target_capability_profile text,
  target_provider_key text,
  target_model_key text,
  target_region_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
DECLARE actor record; candidate_id uuid;
BEGIN
  SELECT * INTO actor FROM platform.current_voice_routing_operator();
  IF target_capability_profile <> 'voice_gen2'
     OR btrim(target_provider_key) !~ '^[a-z0-9][a-z0-9._-]{1,79}$'
     OR char_length(btrim(target_model_key)) NOT BETWEEN 2 AND 160
     OR btrim(target_region_key) !~ '^[a-z0-9][a-z0-9._-]{1,79}$' THEN
    RAISE EXCEPTION 'invalid_voice_route_candidate';
  END IF;
  INSERT INTO platform.voice_route_candidates (
    capability_profile, provider_key, model_key, region_key, proposed_by_platform_user_id
  ) VALUES (
    target_capability_profile, btrim(target_provider_key), btrim(target_model_key),
    btrim(target_region_key), actor.actor_id
  ) RETURNING id INTO candidate_id;
  INSERT INTO platform.audit_logs (
    actor_platform_user_id, action, target_type, target_id, request_id, reason, result, metadata
  ) VALUES (
    actor.actor_id, 'voice.route_candidate.proposed', 'voice_route_candidate', candidate_id::text,
    actor.request_id, 'route_qualification', 'succeeded',
    jsonb_build_object('capabilityProfile', target_capability_profile)
  );
  RETURN candidate_id;
END
$$;

CREATE OR REPLACE FUNCTION platform.review_voice_route_candidate(
  target_candidate_id uuid,
  target_decision text,
  target_evidence_sha256 bytea
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
DECLARE actor record; candidate record; next_status text;
BEGIN
  SELECT * INTO actor FROM platform.current_voice_routing_operator();
  IF target_decision NOT IN ('qualify', 'reject') OR octet_length(target_evidence_sha256) <> 32 THEN
    RAISE EXCEPTION 'invalid_voice_route_review';
  END IF;
  SELECT * INTO candidate FROM platform.voice_route_candidates
  WHERE id = target_candidate_id FOR UPDATE;
  IF NOT FOUND OR candidate.status <> 'proposed' OR candidate.proposed_by_platform_user_id = actor.actor_id THEN
    RAISE EXCEPTION 'voice_route_review_not_allowed';
  END IF;
  next_status := CASE target_decision WHEN 'qualify' THEN 'qualified' ELSE 'rejected' END;
  UPDATE platform.voice_route_candidates SET status = next_status,
    reviewed_by_platform_user_id = actor.actor_id,
    qualification_evidence_sha256 = target_evidence_sha256,
    reviewed_at = now(), updated_at = now()
  WHERE id = target_candidate_id;
  INSERT INTO platform.audit_logs (
    actor_platform_user_id, action, target_type, target_id, request_id, reason, result, metadata
  ) VALUES (
    actor.actor_id, 'voice.route_candidate.reviewed', 'voice_route_candidate', target_candidate_id::text,
    actor.request_id, target_decision, 'succeeded', jsonb_build_object('status', next_status)
  );
  RETURN next_status;
END
$$;

CREATE OR REPLACE FUNCTION platform.request_voice_routing_change(
  target_capability_profile text,
  target_candidate_id uuid,
  target_canary_percent integer,
  target_reason text,
  target_evaluation_sha256 bytea
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
DECLARE actor record; candidate record; current_route record; change_id uuid;
BEGIN
  SELECT * INTO actor FROM platform.current_voice_routing_operator();
  SELECT * INTO candidate FROM platform.voice_route_candidates WHERE id = target_candidate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'voice_route_candidate_not_found'; END IF;
  SELECT * INTO current_route FROM platform.voice_active_routes
  WHERE capability_profile = target_capability_profile FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'voice_profile_route_not_found'; END IF;
  IF target_capability_profile <> 'voice_gen2' OR candidate.status <> 'qualified'
     OR candidate.capability_profile <> target_capability_profile
     OR target_canary_percent NOT BETWEEN 1 AND 100
     OR char_length(btrim(target_reason)) NOT BETWEEN 12 AND 500
     OR octet_length(target_evaluation_sha256) <> 32
     OR current_route.primary_candidate_id = target_candidate_id THEN
    RAISE EXCEPTION 'invalid_voice_routing_change';
  END IF;
  INSERT INTO platform.voice_routing_changes (
    capability_profile, candidate_id, previous_candidate_id, canary_percent,
    reason, evaluation_evidence_sha256, requested_by_platform_user_id
  ) VALUES (
    target_capability_profile, target_candidate_id, current_route.primary_candidate_id,
    target_canary_percent, btrim(target_reason), target_evaluation_sha256, actor.actor_id
  ) RETURNING id INTO change_id;
  INSERT INTO platform.audit_logs (
    actor_platform_user_id, action, target_type, target_id, request_id, reason, result, metadata
  ) VALUES (
    actor.actor_id, 'voice.routing_change.requested', 'voice_routing_change', change_id::text,
    actor.request_id, 'routing_change_request', 'succeeded',
    jsonb_build_object('capabilityProfile', target_capability_profile,
      'candidateId', target_candidate_id, 'canaryPercent', target_canary_percent,
      'previousCandidateId', current_route.primary_candidate_id)
  );
  RETURN change_id;
END
$$;

CREATE OR REPLACE FUNCTION platform.review_voice_routing_change(
  target_change_id uuid,
  target_decision text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
DECLARE actor record; change_record record; next_status text;
BEGIN
  SELECT * INTO actor FROM platform.current_voice_routing_operator();
  SELECT * INTO change_record FROM platform.voice_routing_changes
  WHERE id = target_change_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'voice_routing_change_not_found'; END IF;
  IF target_decision NOT IN ('approve', 'reject')
     OR change_record.status <> 'requested'
     OR change_record.requested_by_platform_user_id = actor.actor_id THEN
    RAISE EXCEPTION 'voice_routing_review_not_allowed';
  END IF;
  next_status := CASE target_decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END;
  UPDATE platform.voice_routing_changes SET status = next_status,
    approved_by_platform_user_id = actor.actor_id, approved_at = now()
  WHERE id = target_change_id;
  INSERT INTO platform.audit_logs (
    actor_platform_user_id, action, target_type, target_id, request_id, reason, result, metadata
  ) VALUES (
    actor.actor_id, 'voice.routing_change.reviewed', 'voice_routing_change', target_change_id::text,
    actor.request_id, target_decision, 'succeeded', jsonb_build_object('status', next_status)
  );
  RETURN next_status;
END
$$;

CREATE OR REPLACE FUNCTION platform.apply_voice_routing_change(
  target_change_id uuid,
  target_action text,
  target_reason text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
DECLARE actor record; change_record record; route record; next_mode text;
BEGIN
  SELECT * INTO actor FROM platform.current_voice_routing_operator();
  PERFORM pg_advisory_xact_lock(hashtextextended('voice-routing:voice_gen2', 0));
  SELECT * INTO change_record FROM platform.voice_routing_changes
  WHERE id = target_change_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'voice_routing_change_not_found'; END IF;
  SELECT * INTO route FROM platform.voice_active_routes
  WHERE capability_profile = change_record.capability_profile FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'voice_profile_route_not_found'; END IF;
  IF target_action NOT IN ('start_canary', 'promote', 'rollback')
     OR char_length(btrim(target_reason)) NOT BETWEEN 12 AND 500
     OR change_record.capability_profile <> 'voice_gen2' THEN
    RAISE EXCEPTION 'invalid_voice_routing_action';
  END IF;
  IF target_action = 'start_canary' THEN
    IF change_record.status <> 'approved'
       OR route.primary_candidate_id IS DISTINCT FROM change_record.previous_candidate_id
       OR route.canary_candidate_id IS NOT NULL THEN
      RAISE EXCEPTION 'voice_routing_change_stale';
    END IF;
    UPDATE platform.voice_active_routes SET canary_candidate_id = change_record.candidate_id,
      canary_percent = change_record.canary_percent, routing_change_id = change_record.id,
      version = version + 1, updated_by_platform_user_id = actor.actor_id, updated_at = now()
    WHERE capability_profile = change_record.capability_profile;
    UPDATE platform.voice_profile_controls SET mode = 'canary', reason_code = 'reviewed_canary',
      version = version + 1, changed_by_platform_user_id = actor.actor_id, changed_at = now()
    WHERE capability_profile = change_record.capability_profile;
    UPDATE platform.voice_routing_changes SET status = 'canary', canary_started_at = now()
    WHERE id = target_change_id;
    next_mode := 'canary';
  ELSIF target_action = 'promote' THEN
    IF change_record.status <> 'canary'
       OR route.routing_change_id IS DISTINCT FROM change_record.id
       OR route.canary_candidate_id IS DISTINCT FROM change_record.candidate_id THEN
      RAISE EXCEPTION 'voice_routing_change_not_promotable';
    END IF;
    UPDATE platform.voice_active_routes SET primary_candidate_id = change_record.candidate_id,
      canary_candidate_id = NULL, canary_percent = 0, routing_change_id = change_record.id,
      version = version + 1, updated_by_platform_user_id = actor.actor_id, updated_at = now()
    WHERE capability_profile = change_record.capability_profile;
    UPDATE platform.voice_profile_controls SET mode = 'running', reason_code = 'qualified_route_active',
      version = version + 1, changed_by_platform_user_id = actor.actor_id, changed_at = now()
    WHERE capability_profile = change_record.capability_profile;
    UPDATE platform.voice_routing_changes SET status = 'active', activated_at = now()
    WHERE id = target_change_id;
    next_mode := 'active';
  ELSE
    IF change_record.status NOT IN ('canary', 'active') THEN RAISE EXCEPTION 'voice_routing_change_not_rollbackable'; END IF;
    IF route.routing_change_id IS DISTINCT FROM change_record.id
       OR (change_record.status = 'canary' AND route.canary_candidate_id IS DISTINCT FROM change_record.candidate_id)
       OR (change_record.status = 'active' AND route.primary_candidate_id IS DISTINCT FROM change_record.candidate_id) THEN
      RAISE EXCEPTION 'voice_routing_change_stale';
    END IF;
    UPDATE platform.voice_active_routes SET primary_candidate_id = change_record.previous_candidate_id,
      canary_candidate_id = NULL, canary_percent = 0, routing_change_id = change_record.id,
      version = version + 1, updated_by_platform_user_id = actor.actor_id, updated_at = now()
    WHERE capability_profile = change_record.capability_profile;
    UPDATE platform.voice_profile_controls SET
      mode = CASE WHEN change_record.previous_candidate_id IS NULL THEN 'paused' ELSE 'running' END,
      reason_code = 'routing_change_rolled_back', version = version + 1,
      changed_by_platform_user_id = actor.actor_id, changed_at = now()
    WHERE capability_profile = change_record.capability_profile;
    UPDATE platform.voice_routing_changes SET status = 'rolled_back', rolled_back_at = now(),
      rollback_reason = btrim(target_reason) WHERE id = target_change_id;
    next_mode := 'rolled_back';
  END IF;
  INSERT INTO platform.audit_logs (
    actor_platform_user_id, action, target_type, target_id, request_id, reason, result, metadata
  ) VALUES (
    actor.actor_id, 'voice.routing_change.' || target_action, 'voice_routing_change', target_change_id::text,
    actor.request_id, 'routing_action', 'succeeded', jsonb_build_object('resultingState', next_mode)
  );
  RETURN next_mode;
END
$$;

CREATE OR REPLACE FUNCTION platform.open_voice_incident(
  target_capability_profile text,
  target_severity text,
  target_reason text,
  target_routing_change_id uuid,
  target_credit_review_required boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
DECLARE actor record; incident_id uuid; selected_mode text;
BEGIN
  SELECT * INTO actor FROM platform.current_voice_routing_operator();
  IF target_capability_profile <> 'voice_gen2' OR target_severity NOT IN ('minor', 'major', 'critical')
     OR char_length(btrim(target_reason)) NOT BETWEEN 12 AND 1000 THEN
    RAISE EXCEPTION 'invalid_voice_incident';
  END IF;
  IF target_routing_change_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM platform.voice_routing_changes change_record
    WHERE change_record.id = target_routing_change_id
      AND change_record.capability_profile = target_capability_profile
  ) THEN
    RAISE EXCEPTION 'voice_incident_routing_change_not_found';
  END IF;
  selected_mode := CASE WHEN target_severity = 'minor' THEN 'degraded' ELSE 'paused' END;
  INSERT INTO platform.voice_incidents (
    capability_profile, severity, reason, routing_change_id,
    credit_review_status, opened_by_platform_user_id
  ) VALUES (
    target_capability_profile, target_severity, btrim(target_reason), target_routing_change_id,
    CASE WHEN target_credit_review_required THEN 'required' ELSE 'not_required' END, actor.actor_id
  ) RETURNING id INTO incident_id;
  UPDATE platform.voice_profile_controls SET mode = selected_mode,
    reason_code = 'incident_' || target_severity, version = version + 1,
    changed_by_platform_user_id = actor.actor_id, changed_at = now()
  WHERE capability_profile = target_capability_profile;
  INSERT INTO platform.audit_logs (
    actor_platform_user_id, action, target_type, target_id, request_id, reason, result, metadata
  ) VALUES (
    actor.actor_id, 'voice.incident.opened', 'voice_incident', incident_id::text,
    actor.request_id, 'incident_opened', 'succeeded',
    jsonb_build_object('severity', target_severity, 'profileMode', selected_mode,
      'creditReviewRequired', target_credit_review_required)
  );
  RETURN incident_id;
END
$$;

CREATE OR REPLACE FUNCTION platform.review_voice_incident_credit(
  target_incident_id uuid,
  target_decision text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
DECLARE actor_id uuid; actor_role text; request_value text; incident record; next_status text;
BEGIN
  IF session_user <> 'djay_platform' THEN RAISE EXCEPTION 'platform_role_required'; END IF;
  actor_id := NULLIF(current_setting('app.platform_user_id', true), '')::uuid;
  actor_role := NULLIF(current_setting('app.platform_role', true), '');
  request_value := NULLIF(current_setting('app.request_id', true), '');
  IF actor_id IS NULL OR request_value IS NULL OR actor_role NOT IN ('platform_owner', 'platform_finance')
     OR NOT EXISTS (SELECT 1 FROM platform.role_assignments assignment
       WHERE assignment.platform_user_id = actor_id AND assignment.role = actor_role AND assignment.revoked_at IS NULL)
     OR target_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'platform_voice_credit_review_required';
  END IF;
  SELECT * INTO incident FROM platform.voice_incidents WHERE id = target_incident_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'voice_incident_not_found'; END IF;
  IF incident.credit_review_status <> 'required' OR incident.opened_by_platform_user_id = actor_id THEN
    RAISE EXCEPTION 'voice_incident_credit_not_reviewable';
  END IF;
  next_status := CASE target_decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END;
  UPDATE platform.voice_incidents SET credit_review_status = next_status,
    credit_reviewed_by_platform_user_id = actor_id, credit_reviewed_at = now()
  WHERE id = target_incident_id;
  INSERT INTO platform.audit_logs (
    actor_platform_user_id, action, target_type, target_id, request_id, reason, result, metadata
  ) VALUES (
    actor_id, 'voice.incident.credit_reviewed', 'voice_incident', target_incident_id::text,
    request_value, target_decision, 'succeeded', jsonb_build_object('status', next_status)
  );
  RETURN next_status;
END
$$;

CREATE OR REPLACE FUNCTION platform.resolve_voice_incident(
  target_incident_id uuid,
  target_resolution text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
DECLARE actor record; incident record;
BEGIN
  SELECT * INTO actor FROM platform.current_voice_routing_operator();
  SELECT * INTO incident FROM platform.voice_incidents WHERE id = target_incident_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'voice_incident_not_found'; END IF;
  IF incident.status = 'resolved'
     OR char_length(btrim(target_resolution)) NOT BETWEEN 12 AND 2000 THEN
    RAISE EXCEPTION 'voice_incident_not_resolvable';
  END IF;
  UPDATE platform.voice_incidents SET status = 'resolved', resolution = btrim(target_resolution),
    resolved_by_platform_user_id = actor.actor_id, resolved_at = now()
  WHERE id = target_incident_id;
  INSERT INTO platform.audit_logs (
    actor_platform_user_id, action, target_type, target_id, request_id, reason, result, metadata
  ) VALUES (
    actor.actor_id, 'voice.incident.resolved', 'voice_incident', target_incident_id::text,
    actor.request_id, 'incident_resolved', 'succeeded', '{}'::jsonb
  );
  RETURN 'resolved';
END
$$;

REVOKE ALL ON platform.voice_route_candidates, platform.voice_routing_changes,
  platform.voice_active_routes, platform.voice_profile_controls,
  platform.voice_incidents, operations.voice_session_routes FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.current_voice_routing_operator() FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.get_voice_routing_overview() FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.get_voice_incidents() FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.propose_voice_route_candidate(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.review_voice_route_candidate(uuid, text, bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.request_voice_routing_change(text, uuid, integer, text, bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.review_voice_routing_change(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.apply_voice_routing_change(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.open_voice_incident(text, text, text, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.review_voice_incident_credit(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.resolve_voice_incident(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION platform.get_voice_routing_overview() TO djay_platform;
GRANT EXECUTE ON FUNCTION platform.get_voice_incidents() TO djay_platform;
GRANT EXECUTE ON FUNCTION platform.propose_voice_route_candidate(text, text, text, text) TO djay_platform;
GRANT EXECUTE ON FUNCTION platform.review_voice_route_candidate(uuid, text, bytea) TO djay_platform;
GRANT EXECUTE ON FUNCTION platform.request_voice_routing_change(text, uuid, integer, text, bytea) TO djay_platform;
GRANT EXECUTE ON FUNCTION platform.review_voice_routing_change(uuid, text) TO djay_platform;
GRANT EXECUTE ON FUNCTION platform.apply_voice_routing_change(uuid, text, text) TO djay_platform;
GRANT EXECUTE ON FUNCTION platform.open_voice_incident(text, text, text, uuid, boolean) TO djay_platform;
GRANT EXECUTE ON FUNCTION platform.review_voice_incident_credit(uuid, text) TO djay_platform;
GRANT EXECUTE ON FUNCTION platform.resolve_voice_incident(uuid, text) TO djay_platform;
