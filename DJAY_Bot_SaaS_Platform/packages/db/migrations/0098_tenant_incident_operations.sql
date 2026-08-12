CREATE TABLE platform.tenant_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  category text NOT NULL CHECK (category IN ('provisioning','onboarding','deployment','usage','billing','provider','queue','support','privacy','security','other')),
  severity text NOT NULL CHECK (severity IN ('minor','major','critical')),
  affected_product text NOT NULL CHECK (affected_product IN ('platform','flowbot','ai_chat','voice')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','monitoring','resolved')),
  summary text NOT NULL CHECK (char_length(summary) BETWEEN 12 AND 500),
  idempotency_key uuid NOT NULL,
  owner_platform_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  opened_by_platform_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  resolved_by_platform_user_id uuid REFERENCES platform.users(id) ON DELETE RESTRICT,
  opened_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CHECK ((status = 'resolved') = (resolved_at IS NOT NULL))
);

CREATE UNIQUE INDEX platform_tenant_incidents_idempotency_idx
  ON platform.tenant_incidents (opened_by_platform_user_id, idempotency_key);

CREATE INDEX platform_tenant_incidents_queue_idx
  ON platform.tenant_incidents (status, severity, updated_at DESC, id DESC);
CREATE INDEX platform_tenant_incidents_tenant_idx
  ON platform.tenant_incidents (tenant_id, updated_at DESC, id DESC);

CREATE TABLE platform.tenant_incident_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES platform.tenant_incidents(id) ON DELETE RESTRICT,
  event_kind text NOT NULL CHECK (event_kind IN ('opened','status_changed','assigned')),
  from_status text CHECK (from_status IS NULL OR from_status IN ('open','investigating','monitoring','resolved')),
  to_status text NOT NULL CHECK (to_status IN ('open','investigating','monitoring','resolved')),
  note text NOT NULL CHECK (char_length(note) BETWEEN 12 AND 1000),
  changed_by_platform_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX platform_tenant_incident_history_idx
  ON platform.tenant_incident_history (incident_id, changed_at, id);

CREATE TRIGGER platform_tenant_incident_history_immutable
  BEFORE UPDATE OR DELETE ON platform.tenant_incident_history
  FOR EACH ROW EXECUTE FUNCTION tenancy.reject_immutable_change();

CREATE OR REPLACE FUNCTION platform.assert_tenant_incident_actor(require_manage boolean)
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
  IF actor_id IS NULL OR request_id IS NULL
    OR actor_role NOT IN ('platform_owner','platform_support','platform_ai_operations')
    OR NOT EXISTS (SELECT 1 FROM platform.role_assignments assignment
      WHERE assignment.platform_user_id = actor_id AND assignment.role = actor_role
        AND assignment.revoked_at IS NULL)
    OR NOT EXISTS (SELECT 1 FROM platform.users app_user
      WHERE app_user.id = actor_id AND app_user.status = 'active') THEN
    IF require_manage THEN
      RAISE EXCEPTION 'platform_incident_manage_required';
    ELSE
      RAISE EXCEPTION 'platform_incident_read_required';
    END IF;
  END IF;
  RETURN NEXT;
END
$$;

CREATE OR REPLACE FUNCTION platform.get_incident_tenants()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform, tenancy
AS $$
BEGIN
  PERFORM * FROM platform.assert_tenant_incident_actor(false);
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id', tenant.id, 'businessName', tenant.business_name)
    ORDER BY tenant.business_name, tenant.id) FROM tenancy.tenants tenant WHERE tenant.status = 'active'), '[]'::jsonb);
END
$$;

CREATE OR REPLACE FUNCTION platform.get_incident_operators()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
BEGIN
  PERFORM * FROM platform.assert_tenant_incident_actor(false);
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id', app_user.id, 'displayName', app_user.display_name, 'role', assignment.role
  ) ORDER BY app_user.display_name, app_user.id)
    FROM platform.users app_user JOIN platform.role_assignments assignment ON assignment.platform_user_id = app_user.id
    WHERE app_user.status = 'active' AND assignment.revoked_at IS NULL
      AND assignment.role IN ('platform_owner','platform_support','platform_ai_operations')), '[]'::jsonb);
END
$$;

CREATE OR REPLACE FUNCTION platform.get_tenant_incidents(target_tenant_id uuid DEFAULT NULL, target_status text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform, tenancy
AS $$
BEGIN
  PERFORM * FROM platform.assert_tenant_incident_actor(false);
  IF target_status IS NOT NULL AND target_status NOT IN ('open','investigating','monitoring','resolved') THEN
    RAISE EXCEPTION 'invalid_tenant_incident_status';
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id', incident.id, 'tenantId', incident.tenant_id, 'businessName', tenant.business_name,
    'category', incident.category, 'severity', incident.severity, 'affectedProduct', incident.affected_product,
    'status', incident.status, 'summary', incident.summary,
    'ownerPlatformUserId', incident.owner_platform_user_id,
    'openedByPlatformUserId', incident.opened_by_platform_user_id,
    'openedAt', incident.opened_at, 'updatedAt', incident.updated_at, 'resolvedAt', incident.resolved_at,
    'history', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', history.id, 'eventKind', history.event_kind,
      'fromStatus', history.from_status, 'toStatus', history.to_status,
      'note', history.note, 'changedByPlatformUserId', history.changed_by_platform_user_id,
      'changedAt', history.changed_at) ORDER BY history.changed_at, history.id)
      FROM platform.tenant_incident_history history WHERE history.incident_id = incident.id), '[]'::jsonb)
  ) ORDER BY CASE incident.severity WHEN 'critical' THEN 0 WHEN 'major' THEN 1 ELSE 2 END,
      incident.updated_at DESC, incident.id DESC)
    FROM platform.tenant_incidents incident JOIN tenancy.tenants tenant ON tenant.id = incident.tenant_id
    WHERE incident.id IN (SELECT candidate.id FROM platform.tenant_incidents candidate
      WHERE (target_tenant_id IS NULL OR candidate.tenant_id = target_tenant_id)
        AND (target_status IS NULL OR candidate.status = target_status)
      ORDER BY CASE candidate.severity WHEN 'critical' THEN 0 WHEN 'major' THEN 1 ELSE 2 END,
        candidate.updated_at DESC, candidate.id DESC LIMIT 500)), '[]'::jsonb);
END
$$;

CREATE OR REPLACE FUNCTION platform.open_tenant_incident(
  target_tenant_id uuid, target_category text, target_severity text,
  target_affected_product text, target_summary text, target_idempotency_key uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform, tenancy
AS $$
DECLARE actor record; incident_id uuid; existing record;
BEGIN
  SELECT * INTO actor FROM platform.assert_tenant_incident_actor(true);
  IF target_category NOT IN ('provisioning','onboarding','deployment','usage','billing','provider','queue','support','privacy','security','other')
    OR target_severity NOT IN ('minor','major','critical')
    OR target_affected_product NOT IN ('platform','flowbot','ai_chat','voice')
    OR char_length(btrim(target_summary)) NOT BETWEEN 12 AND 500 OR target_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'invalid_tenant_incident';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tenancy.tenants tenant WHERE tenant.id = target_tenant_id AND tenant.status = 'active') THEN
    RAISE EXCEPTION 'tenant_incident_tenant_not_found';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor.actor_id::text || ':' || target_idempotency_key::text, 0));
  SELECT * INTO existing FROM platform.tenant_incidents
    WHERE opened_by_platform_user_id = actor.actor_id AND idempotency_key = target_idempotency_key;
  IF FOUND THEN
    IF existing.tenant_id <> target_tenant_id OR existing.category <> target_category
      OR existing.severity <> target_severity OR existing.affected_product <> target_affected_product
      OR existing.summary <> btrim(target_summary) THEN
      RAISE EXCEPTION 'tenant_incident_idempotency_conflict';
    END IF;
    RETURN existing.id;
  END IF;
  INSERT INTO platform.tenant_incidents (
    tenant_id, category, severity, affected_product, summary,
    idempotency_key, owner_platform_user_id, opened_by_platform_user_id
  ) VALUES (target_tenant_id, target_category, target_severity, target_affected_product,
    btrim(target_summary), target_idempotency_key, actor.actor_id, actor.actor_id) RETURNING id INTO incident_id;
  INSERT INTO platform.tenant_incident_history (
    incident_id, event_kind, from_status, to_status, note, changed_by_platform_user_id
  ) VALUES (incident_id, 'opened', NULL, 'open', btrim(target_summary), actor.actor_id);
  INSERT INTO platform.audit_logs (actor_platform_user_id, action, target_type, target_id, request_id, result, metadata)
  VALUES (actor.actor_id, 'tenant_incident.opened', 'tenant_incident', incident_id::text,
    actor.request_id, 'succeeded', jsonb_build_object('tenantId', target_tenant_id, 'category', target_category,
      'severity', target_severity, 'affectedProduct', target_affected_product));
  RETURN incident_id;
END
$$;

CREATE OR REPLACE FUNCTION platform.transition_tenant_incident(
  target_incident_id uuid, target_status text, target_note text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
DECLARE actor record; incident record;
BEGIN
  SELECT * INTO actor FROM platform.assert_tenant_incident_actor(true);
  IF target_status NOT IN ('investigating','monitoring','resolved')
    OR char_length(btrim(target_note)) NOT BETWEEN 12 AND 1000 THEN
    RAISE EXCEPTION 'invalid_tenant_incident_transition';
  END IF;
  SELECT * INTO incident FROM platform.tenant_incidents WHERE id = target_incident_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tenant_incident_not_found'; END IF;
  IF incident.status = 'resolved' OR incident.status = target_status
    OR (incident.status = 'open' AND target_status <> 'investigating')
    OR (incident.status = 'monitoring' AND target_status NOT IN ('investigating','resolved')) THEN
    RAISE EXCEPTION 'tenant_incident_transition_not_allowed';
  END IF;
  UPDATE platform.tenant_incidents SET status = target_status, updated_at = now(),
    resolved_by_platform_user_id = CASE WHEN target_status = 'resolved' THEN actor.actor_id ELSE NULL END,
    resolved_at = CASE WHEN target_status = 'resolved' THEN now() ELSE NULL END
  WHERE id = target_incident_id;
  INSERT INTO platform.tenant_incident_history (
    incident_id, event_kind, from_status, to_status, note, changed_by_platform_user_id
  ) VALUES (target_incident_id, 'status_changed', incident.status, target_status, btrim(target_note), actor.actor_id);
  INSERT INTO platform.audit_logs (actor_platform_user_id, action, target_type, target_id, request_id, result, metadata)
  VALUES (actor.actor_id, 'tenant_incident.transitioned', 'tenant_incident', target_incident_id::text,
    actor.request_id, 'succeeded', jsonb_build_object('tenantId', incident.tenant_id,
      'fromStatus', incident.status, 'toStatus', target_status));
  RETURN target_status;
END
$$;

CREATE OR REPLACE FUNCTION platform.assign_tenant_incident(
  target_incident_id uuid, target_owner_platform_user_id uuid, target_note text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
DECLARE actor record; incident record;
BEGIN
  SELECT * INTO actor FROM platform.assert_tenant_incident_actor(true);
  IF target_owner_platform_user_id IS NULL OR char_length(btrim(target_note)) NOT BETWEEN 12 AND 1000 THEN
    RAISE EXCEPTION 'invalid_tenant_incident_assignment';
  END IF;
  SELECT * INTO incident FROM platform.tenant_incidents WHERE id = target_incident_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tenant_incident_not_found'; END IF;
  IF incident.status = 'resolved' OR incident.owner_platform_user_id = target_owner_platform_user_id
    OR NOT EXISTS (SELECT 1 FROM platform.users app_user JOIN platform.role_assignments assignment
      ON assignment.platform_user_id = app_user.id
      WHERE app_user.id = target_owner_platform_user_id AND app_user.status = 'active'
        AND assignment.revoked_at IS NULL
        AND assignment.role IN ('platform_owner','platform_support','platform_ai_operations')) THEN
    RAISE EXCEPTION 'tenant_incident_assignment_not_allowed';
  END IF;
  UPDATE platform.tenant_incidents SET owner_platform_user_id = target_owner_platform_user_id,
    updated_at = now() WHERE id = target_incident_id;
  INSERT INTO platform.tenant_incident_history (
    incident_id, event_kind, from_status, to_status, note, changed_by_platform_user_id
  ) VALUES (target_incident_id, 'assigned', incident.status, incident.status, btrim(target_note), actor.actor_id);
  INSERT INTO platform.audit_logs (actor_platform_user_id, action, target_type, target_id, request_id, result, metadata)
  VALUES (actor.actor_id, 'tenant_incident.assigned', 'tenant_incident', target_incident_id::text,
    actor.request_id, 'succeeded', jsonb_build_object('tenantId', incident.tenant_id,
      'previousOwnerPlatformUserId', incident.owner_platform_user_id,
      'ownerPlatformUserId', target_owner_platform_user_id));
  RETURN target_owner_platform_user_id;
END
$$;

REVOKE ALL ON platform.tenant_incidents, platform.tenant_incident_history FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.assert_tenant_incident_actor(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.get_incident_tenants() FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.get_incident_operators() FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.get_tenant_incidents(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.open_tenant_incident(uuid, text, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.transition_tenant_incident(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.assign_tenant_incident(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.get_incident_tenants() TO djay_platform;
GRANT EXECUTE ON FUNCTION platform.get_incident_operators() TO djay_platform;
GRANT EXECUTE ON FUNCTION platform.get_tenant_incidents(uuid, text) TO djay_platform;
GRANT EXECUTE ON FUNCTION platform.open_tenant_incident(uuid, text, text, text, text, uuid) TO djay_platform;
GRANT EXECUTE ON FUNCTION platform.transition_tenant_incident(uuid, text, text) TO djay_platform;
GRANT EXECUTE ON FUNCTION platform.assign_tenant_incident(uuid, uuid, text) TO djay_platform;
