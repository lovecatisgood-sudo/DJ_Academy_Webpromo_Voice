CREATE TABLE builder.website_import_jobs (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES builder.anonymous_sessions(id) ON DELETE RESTRICT,
  draft_id uuid NOT NULL REFERENCES builder.drafts(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  expected_draft_revision integer NOT NULL CHECK (expected_draft_revision >= 1),
  requested_url text NOT NULL CHECK (length(requested_url) BETWEEN 3 AND 2048),
  normalized_url text NOT NULL CHECK (length(normalized_url) BETWEEN 8 AND 2048),
  status text NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled', 'stale')),
  generation smallint NOT NULL DEFAULT 1 CHECK (generation BETWEEN 1 AND 3),
  profile_json jsonb CHECK (profile_json IS NULL OR jsonb_typeof(profile_json) = 'object'),
  error_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, idempotency_key),
  CHECK (
    (status = 'queued' AND started_at IS NULL AND completed_at IS NULL AND profile_json IS NULL AND error_reason IS NULL)
    OR (status = 'running' AND started_at IS NOT NULL AND completed_at IS NULL AND profile_json IS NULL AND error_reason IS NULL)
    OR (status = 'completed' AND started_at IS NOT NULL AND completed_at IS NOT NULL AND profile_json IS NOT NULL AND error_reason IS NULL)
    OR (status IN ('failed', 'stale') AND started_at IS NOT NULL AND completed_at IS NOT NULL AND profile_json IS NULL AND error_reason IS NOT NULL)
    OR (status = 'cancelled' AND completed_at IS NOT NULL AND profile_json IS NULL)
  )
);

CREATE INDEX builder_website_import_jobs_session_idx
  ON builder.website_import_jobs (session_id, updated_at DESC);
CREATE INDEX builder_website_import_jobs_running_idx
  ON builder.website_import_jobs (started_at)
  WHERE status = 'running';

CREATE TABLE builder.website_import_attempts (
  job_id uuid NOT NULL REFERENCES builder.website_import_jobs(id) ON DELETE RESTRICT,
  generation smallint NOT NULL CHECK (generation BETWEEN 1 AND 3),
  status text NOT NULL CHECK (status IN ('completed', 'failed', 'cancelled', 'stale')),
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  error_reason text,
  page_count smallint CHECK (page_count BETWEEN 0 AND 7),
  warnings_json jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(warnings_json) = 'array'),
  profile_sha256 bytea CHECK (profile_sha256 IS NULL OR octet_length(profile_sha256) = 32),
  provenance_json jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(provenance_json) = 'array'),
  PRIMARY KEY (job_id, generation),
  CHECK (completed_at >= started_at),
  CHECK ((status = 'completed' AND profile_sha256 IS NOT NULL AND error_reason IS NULL)
    OR (status <> 'completed' AND profile_sha256 IS NULL))
);

CREATE FUNCTION builder.reject_website_import_attempt_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'builder_website_import_attempts_are_immutable'; END $$;
CREATE TRIGGER builder_website_import_attempts_immutable
BEFORE UPDATE OR DELETE ON builder.website_import_attempts
FOR EACH ROW EXECUTE FUNCTION builder.reject_website_import_attempt_mutation();

ALTER TABLE builder.website_import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE builder.website_import_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE builder.website_import_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE builder.website_import_attempts FORCE ROW LEVEL SECURITY;

CREATE POLICY builder_auth_website_import_jobs ON builder.website_import_jobs
  TO djay_auth_runtime USING (true) WITH CHECK (true);
CREATE POLICY builder_auth_website_import_attempts ON builder.website_import_attempts
  TO djay_auth_runtime USING (true) WITH CHECK (true);
CREATE POLICY builder_platform_website_import_jobs ON builder.website_import_jobs
  FOR SELECT TO djay_platform USING (true);
CREATE POLICY builder_platform_website_import_attempts ON builder.website_import_attempts
  FOR SELECT TO djay_platform USING (true);

REVOKE ALL ON builder.website_import_jobs, builder.website_import_attempts FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON builder.website_import_jobs TO djay_auth_runtime;
GRANT SELECT, INSERT ON builder.website_import_attempts TO djay_auth_runtime;
GRANT SELECT ON builder.website_import_jobs, builder.website_import_attempts TO djay_platform, djay_readonly_ops;
REVOKE ALL ON FUNCTION builder.reject_website_import_attempt_mutation() FROM PUBLIC;
