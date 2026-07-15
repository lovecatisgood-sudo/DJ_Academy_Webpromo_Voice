ALTER TABLE tenancy.voice_deployments
  ADD COLUMN capability_profile text NOT NULL DEFAULT 'voice_gen1'
  CHECK (capability_profile IN ('voice_gen1', 'voice_gen2'));

ALTER TABLE tenancy.voice_deployments ALTER COLUMN capability_profile DROP DEFAULT;
ALTER TABLE tenancy.voice_deployments
  ADD CONSTRAINT tenancy_voice_deployment_capability_unique
  UNIQUE (tenant_id, id, capability_profile);
ALTER TABLE tenancy.voice_sessions
  ADD CONSTRAINT tenancy_voice_session_deployment_capability_fk
  FOREIGN KEY (tenant_id, deployment_id, capability_profile)
  REFERENCES tenancy.voice_deployments(tenant_id, id, capability_profile)
  ON DELETE RESTRICT;

ALTER TABLE platform.voice_profile_controls
  ADD COLUMN admission_enabled boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION tenancy.voice_profile_available(target_capability_profile text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy, platform
AS $$
DECLARE tenant_value uuid;
BEGIN
  IF session_user <> 'djay_runtime' THEN RAISE EXCEPTION 'tenant_runtime_role_required'; END IF;
  tenant_value := tenancy.current_tenant_id();
  IF tenant_value IS NULL OR NOT EXISTS (
    SELECT 1 FROM tenancy.tenants tenant WHERE tenant.id = tenant_value
  ) THEN RAISE EXCEPTION 'tenant_context_required'; END IF;
  IF target_capability_profile = 'voice_gen1' THEN
    RETURN EXISTS (
      SELECT 1 FROM platform.voice_runtime_controls control
      WHERE control.singleton = true AND control.mode = 'running'
    );
  ELSIF target_capability_profile = 'voice_gen2' THEN
    RETURN EXISTS (
      SELECT 1
      FROM platform.voice_profile_controls control
      JOIN platform.voice_active_routes route USING (capability_profile)
      JOIN platform.voice_route_candidates candidate
        ON candidate.id = route.primary_candidate_id
        AND candidate.capability_profile = control.capability_profile
        AND candidate.status = 'qualified'
      WHERE control.capability_profile = 'voice_gen2' AND control.mode = 'running'
        AND control.admission_enabled = true
    );
  END IF;
  RETURN false;
END
$$;

REVOKE ALL ON FUNCTION tenancy.voice_profile_available(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.voice_profile_available(text) TO djay_runtime;
