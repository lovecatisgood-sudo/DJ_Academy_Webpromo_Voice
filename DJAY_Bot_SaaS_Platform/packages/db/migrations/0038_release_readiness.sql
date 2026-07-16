CREATE TABLE platform.service_objectives (
  service_key text PRIMARY KEY CHECK (service_key IN (
    'public_site', 'tenant_api', 'flowbot_runtime', 'ai_chat_runtime',
    'social_delivery', 'voice_gateway', 'worker'
  )),
  public_label text NOT NULL CHECK (char_length(public_label) BETWEEN 3 AND 80),
  availability_target_basis_points integer NOT NULL CHECK (
    availability_target_basis_points BETWEEN 9000 AND 10000
  ),
  latency_p95_target_ms integer NOT NULL CHECK (latency_p95_target_ms BETWEEN 100 AND 30000),
  max_queue_age_seconds integer CHECK (max_queue_age_seconds BETWEEN 0 AND 86400),
  max_dead_letters integer NOT NULL DEFAULT 0 CHECK (max_dead_letters BETWEEN 0 AND 1000000),
  minimum_sample_count integer NOT NULL CHECK (minimum_sample_count BETWEEN 1 AND 1000000000),
  minimum_window_minutes integer NOT NULL DEFAULT 1440 CHECK (minimum_window_minutes BETWEEN 60 AND 43200),
  maximum_age_minutes integer NOT NULL DEFAULT 30 CHECK (maximum_age_minutes BETWEEN 5 AND 1440),
  display_order smallint NOT NULL UNIQUE CHECK (display_order BETWEEN 1 AND 20),
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO platform.service_objectives (
  service_key, public_label, availability_target_basis_points,
  latency_p95_target_ms, max_queue_age_seconds, max_dead_letters,
  minimum_sample_count, display_order
) VALUES
  ('public_site', 'Website and signup', 9990, 1000, NULL, 0, 1000, 1),
  ('tenant_api', 'Workspace and API', 9990, 1500, NULL, 0, 1000, 2),
  ('flowbot_runtime', 'Flow automation', 9950, 2000, 60, 0, 500, 3),
  ('ai_chat_runtime', 'AI conversations', 9950, 8000, 120, 0, 200, 4),
  ('social_delivery', 'Messaging channels', 9900, 5000, 120, 0, 200, 5),
  ('voice_gateway', 'Voice conversations', 9900, 1500, NULL, 0, 100, 6),
  ('worker', 'Background processing', 9900, 5000, 120, 0, 200, 7);

CREATE TABLE platform.service_level_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL CHECK (environment IN ('staging', 'production')),
  service_key text NOT NULL REFERENCES platform.service_objectives(service_key) ON DELETE RESTRICT,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  sample_count bigint NOT NULL CHECK (sample_count > 0),
  successful_count bigint NOT NULL CHECK (successful_count BETWEEN 0 AND sample_count),
  availability_basis_points integer GENERATED ALWAYS AS (
    floor(successful_count::numeric * 10000 / sample_count)::integer
  ) STORED,
  latency_p95_ms integer NOT NULL CHECK (latency_p95_ms BETWEEN 0 AND 300000),
  queue_age_seconds integer CHECK (queue_age_seconds BETWEEN 0 AND 604800),
  dead_letter_count integer NOT NULL DEFAULT 0 CHECK (dead_letter_count BETWEEN 0 AND 1000000000),
  evidence_sha256 bytea NOT NULL CHECK (octet_length(evidence_sha256) = 32),
  source_reference text NOT NULL CHECK (char_length(source_reference) BETWEEN 8 AND 200),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (environment, service_key, evidence_sha256),
  CHECK (window_end > window_start),
  CHECK (window_end <= recorded_at + interval '5 minutes')
);

CREATE INDEX platform_service_observations_latest
  ON platform.service_level_observations(environment, service_key, window_end DESC, id DESC);

CREATE TABLE platform.operational_attestations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL CHECK (environment IN ('staging', 'production')),
  attestation_kind text NOT NULL CHECK (attestation_kind IN (
    'on_call', 'restore', 'support_runbook', 'security_review', 'privacy_review'
  )),
  status text NOT NULL CHECK (status IN ('passed', 'failed')),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  evidence_sha256 bytea NOT NULL CHECK (octet_length(evidence_sha256) = 32),
  source_reference text NOT NULL CHECK (char_length(source_reference) BETWEEN 8 AND 200),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (environment, attestation_kind, evidence_sha256),
  CHECK (valid_until > valid_from),
  CHECK (valid_until <= valid_from + interval '90 days'),
  CHECK (valid_from <= recorded_at + interval '5 minutes')
);

CREATE INDEX platform_operational_attestations_latest
  ON platform.operational_attestations(environment, attestation_kind, valid_until DESC, id DESC);

CREATE OR REPLACE FUNCTION platform.reject_operational_evidence_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, platform
AS $$
BEGIN
  RAISE EXCEPTION '% is immutable', TG_TABLE_NAME;
END
$$;

CREATE TRIGGER platform_service_objectives_immutable
BEFORE UPDATE OR DELETE ON platform.service_objectives
FOR EACH ROW EXECUTE FUNCTION platform.reject_operational_evidence_change();

CREATE TRIGGER platform_service_observations_immutable
BEFORE UPDATE OR DELETE ON platform.service_level_observations
FOR EACH ROW EXECUTE FUNCTION platform.reject_operational_evidence_change();

CREATE TRIGGER platform_operational_attestations_immutable
BEFORE UPDATE OR DELETE ON platform.operational_attestations
FOR EACH ROW EXECUTE FUNCTION platform.reject_operational_evidence_change();

CREATE OR REPLACE FUNCTION platform.blocking_incident_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
BEGIN
  IF session_user <> 'djay_platform' THEN
    RAISE EXCEPTION 'platform_role_required';
  END IF;
  RETURN jsonb_build_object(
    'blocking', (SELECT count(*)::int FROM platform.voice_incidents
      WHERE status <> 'resolved' AND severity IN ('major', 'critical')),
    'oldestOpenedAt', (SELECT min(opened_at) FROM platform.voice_incidents
      WHERE status <> 'resolved' AND severity IN ('major', 'critical'))
  );
END
$$;

REVOKE ALL ON platform.service_objectives,
  platform.service_level_observations, platform.operational_attestations FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.reject_operational_evidence_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.blocking_incident_summary() FROM PUBLIC;

GRANT SELECT ON platform.service_objectives,
  platform.service_level_observations, platform.operational_attestations TO djay_platform;
GRANT INSERT ON platform.service_level_observations,
  platform.operational_attestations TO djay_platform;
GRANT EXECUTE ON FUNCTION platform.blocking_incident_summary() TO djay_platform;
