CREATE SCHEMA IF NOT EXISTS migration;
REVOKE ALL ON SCHEMA migration FROM PUBLIC;

CREATE TABLE migration.runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system text NOT NULL,
  source_version text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'validated', 'failed', 'rolled_back')),
  operator_reference text NOT NULL,
  source_checksum bytea NOT NULL,
  accepted_count integer NOT NULL DEFAULT 0 CHECK (accepted_count >= 0),
  rejected_count integer NOT NULL DEFAULT 0 CHECK (rejected_count >= 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (tenant_id, source_system, source_checksum)
);

CREATE TABLE migration.legacy_id_map (
  run_id uuid NOT NULL REFERENCES migration.runs(id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  source_entity_type text NOT NULL,
  source_id text NOT NULL,
  target_entity_type text NOT NULL,
  target_id uuid NOT NULL,
  source_checksum bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, source_entity_type, source_id),
  UNIQUE (tenant_id, source_entity_type, source_id)
);

CREATE TABLE migration.rejects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES migration.runs(id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  source_entity_type text NOT NULL,
  redacted_locator text NOT NULL,
  reason_code text NOT NULL,
  remediation_status text NOT NULL DEFAULT 'open' CHECK (remediation_status IN ('open', 'resolved', 'ignored')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE migration.checkpoints (
  run_id uuid NOT NULL REFERENCES migration.runs(id) ON DELETE RESTRICT,
  stream_key text NOT NULL,
  high_water_mark text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, stream_key)
);

CREATE TABLE migration.validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES migration.runs(id) ON DELETE RESTRICT,
  validation_key text NOT NULL,
  expected_json jsonb NOT NULL,
  actual_json jsonb NOT NULL,
  passed boolean NOT NULL,
  evidence_sha256 bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, validation_key)
);

CREATE OR REPLACE FUNCTION tenancy.report_flowbot_install(
  target_key_hash bytea,
  request_origin text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
DECLARE changed integer;
BEGIN
  UPDATE tenancy.flow_install_checks check_record
  SET status = 'verified', safe_result_code = 'widget_seen', checked_at = now()
  FROM tenancy.flow_deployments deployment
  WHERE deployment.tenant_id = check_record.tenant_id
    AND deployment.id = check_record.deployment_id
    AND deployment.deployment_key_hash = target_key_hash
    AND deployment.status = 'active'
    AND check_record.status = 'requested'
    AND check_record.target_origin = request_origin
    AND tenancy.flowbot_origin_allowed(deployment.allowed_origins, request_origin);
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END
$$;

REVOKE SELECT, INSERT ON tenancy.flow_legacy_mappings FROM djay_runtime;
REVOKE SELECT, INSERT, UPDATE ON tenancy.flow_migration_quarantine FROM djay_runtime;
REVOKE ALL ON ALL TABLES IN SCHEMA migration FROM PUBLIC;
GRANT USAGE ON SCHEMA migration TO djay_migrator, djay_platform;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA migration TO djay_migrator, djay_platform;
REVOKE ALL ON FUNCTION tenancy.report_flowbot_install(bytea, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.report_flowbot_install(bytea, text) TO djay_flowbot_runtime;
