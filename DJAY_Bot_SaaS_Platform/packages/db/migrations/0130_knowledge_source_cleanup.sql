CREATE TABLE tenancy.knowledge_source_cleanup_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  source_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'failed', 'dead_letter', 'completed')),
  available_at timestamptz NOT NULL DEFAULT now(),
  purge_by timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 10),
  locked_at timestamptz,
  completed_at timestamptz,
  object_count integer CHECK (object_count IS NULL OR object_count >= 0),
  vector_count integer CHECK (vector_count IS NULL OR vector_count >= 0),
  safe_error_code text CHECK (safe_error_code IS NULL OR safe_error_code ~ '^[a-z0-9_]{2,100}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, source_id),
  FOREIGN KEY (tenant_id, source_id) REFERENCES tenancy.knowledge_sources(tenant_id, id) ON DELETE RESTRICT,
  CHECK ((status = 'completed') = (completed_at IS NOT NULL)),
  CHECK (purge_by >= created_at)
);

ALTER TABLE tenancy.knowledge_source_cleanup_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.knowledge_source_cleanup_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.knowledge_source_cleanup_jobs
  USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY worker_cleanup ON tenancy.knowledge_source_cleanup_jobs TO djay_worker
  USING (current_setting('app.service', true) = 'knowledge_worker');
REVOKE ALL ON tenancy.knowledge_source_cleanup_jobs FROM PUBLIC;
GRANT SELECT ON tenancy.knowledge_source_cleanup_jobs TO djay_runtime;

CREATE OR REPLACE FUNCTION tenancy.queue_knowledge_source_cleanup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE retention_days integer;
BEGIN
  IF NEW.status = 'erased' AND OLD.status IS DISTINCT FROM 'erased' THEN
    SELECT policy.knowledge_days INTO retention_days FROM tenancy.retention_policies policy WHERE policy.tenant_id = NEW.tenant_id;
    IF retention_days IS NULL THEN RAISE EXCEPTION 'knowledge_retention_policy_required'; END IF;
    INSERT INTO tenancy.knowledge_source_cleanup_jobs (tenant_id, source_id, available_at, purge_by)
      VALUES (NEW.tenant_id, NEW.id, now(), now() + make_interval(days => retention_days))
      ON CONFLICT (tenant_id, source_id) DO NOTHING;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER tenancy_queue_knowledge_source_cleanup
AFTER UPDATE OF status ON tenancy.knowledge_sources
FOR EACH ROW EXECUTE FUNCTION tenancy.queue_knowledge_source_cleanup();
REVOKE ALL ON FUNCTION tenancy.queue_knowledge_source_cleanup() FROM PUBLIC;

INSERT INTO tenancy.knowledge_source_cleanup_jobs (tenant_id, source_id, available_at, purge_by)
SELECT source.tenant_id, source.id, now(), GREATEST(now(), source.updated_at + make_interval(days => policy.knowledge_days))
FROM tenancy.knowledge_sources source
JOIN tenancy.retention_policies policy ON policy.tenant_id = source.tenant_id
WHERE source.status = 'erased'
ON CONFLICT (tenant_id, source_id) DO NOTHING;

CREATE OR REPLACE FUNCTION tenancy.claim_knowledge_source_cleanup(claim_time timestamptz, stale_before timestamptz)
RETURNS TABLE (job_id uuid, tenant_id uuid, source_id uuid, purge_by timestamptz, object_keys text[], vector_refs text[], attempt_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
BEGIN
  IF session_user <> 'djay_worker' OR current_setting('app.service', true) IS DISTINCT FROM 'knowledge_worker'
    OR claim_time > now() + interval '1 minute' OR stale_before >= claim_time THEN
    RAISE EXCEPTION 'knowledge_worker_context_required'; END IF;
  RETURN QUERY WITH candidate AS (
    SELECT job.id FROM tenancy.knowledge_source_cleanup_jobs job
    WHERE job.available_at <= claim_time AND job.attempt_count < 10
      AND (job.status IN ('pending', 'failed') OR (job.status = 'processing' AND job.locked_at < stale_before))
      AND EXISTS (SELECT 1 FROM tenancy.knowledge_sources source
        WHERE source.tenant_id = job.tenant_id AND source.id = job.source_id AND source.status = 'erased')
    ORDER BY job.available_at, job.created_at, job.id FOR UPDATE SKIP LOCKED LIMIT 1
  ), claimed AS (
    UPDATE tenancy.knowledge_source_cleanup_jobs job SET status = 'processing', locked_at = claim_time,
      attempt_count = job.attempt_count + 1, safe_error_code = NULL, updated_at = claim_time
    FROM candidate WHERE job.id = candidate.id RETURNING job.*
  ) SELECT claimed.id, claimed.tenant_id, claimed.source_id, claimed.purge_by,
      ARRAY(SELECT object.object_key FROM tenancy.knowledge_objects object
        WHERE object.tenant_id = claimed.tenant_id AND object.source_id = claimed.source_id ORDER BY object.id),
      ARRAY(SELECT DISTINCT chunk.vector_ref FROM tenancy.knowledge_source_revisions revision
        JOIN tenancy.knowledge_chunks chunk ON chunk.tenant_id = revision.tenant_id AND chunk.source_revision_id = revision.id
        WHERE revision.tenant_id = claimed.tenant_id AND revision.source_id = claimed.source_id AND chunk.vector_ref IS NOT NULL
        ORDER BY chunk.vector_ref), claimed.attempt_count
    FROM claimed;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.reject_shared_domain_immutable_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, tenancy AS $$
BEGIN
  IF session_user = 'djay_worker'
     AND nullif(current_setting('app.privacy_erasure_job_id', true), '') IS NOT NULL
     AND TG_TABLE_NAME IN ('messages', 'action_results') THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_TABLE_NAME = 'messages' AND session_user = 'djay_worker'
     AND current_setting('app.service', true) = 'retention_worker'
     AND current_setting('app.retention_sweep', true) = 'true' THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_TABLE_NAME IN ('knowledge_chunks', 'knowledge_source_revisions')
     AND session_user = 'djay_worker'
     AND current_setting('app.service', true) = 'knowledge_worker'
     AND current_setting('app.knowledge_cleanup', true) = 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION '% is immutable', TG_TABLE_NAME;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.complete_knowledge_source_cleanup(target_job_id uuid, target_object_count integer,
  target_vector_count integer, target_completed_at timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE job record; changed integer; expected_objects integer; expected_vectors integer;
  tombstone text := '[knowledge source deleted]';
BEGIN
  IF session_user <> 'djay_worker' OR current_setting('app.service', true) IS DISTINCT FROM 'knowledge_worker'
    OR target_object_count < 0 OR target_vector_count < 0 OR target_completed_at > now() + interval '1 minute' THEN
    RAISE EXCEPTION 'knowledge_worker_context_required'; END IF;
  SELECT item.* INTO job FROM tenancy.knowledge_source_cleanup_jobs item
    WHERE item.id = target_job_id AND item.status = 'processing' FOR UPDATE;
  IF job IS NULL THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM tenancy.knowledge_sources source
    WHERE source.tenant_id = job.tenant_id AND source.id = job.source_id AND source.status = 'erased') THEN
    RAISE EXCEPTION 'knowledge_source_not_erased'; END IF;
  SELECT count(*)::int INTO expected_objects FROM tenancy.knowledge_objects object
    WHERE object.tenant_id = job.tenant_id AND object.source_id = job.source_id;
  SELECT count(DISTINCT chunk.vector_ref)::int INTO expected_vectors
    FROM tenancy.knowledge_source_revisions revision JOIN tenancy.knowledge_chunks chunk
      ON chunk.tenant_id = revision.tenant_id AND chunk.source_revision_id = revision.id
    WHERE revision.tenant_id = job.tenant_id AND revision.source_id = job.source_id AND chunk.vector_ref IS NOT NULL;
  IF target_object_count <> expected_objects OR target_vector_count <> expected_vectors THEN
    RAISE EXCEPTION 'knowledge_cleanup_count_mismatch'; END IF;
  PERFORM set_config('app.knowledge_cleanup', 'true', true);
  DELETE FROM tenancy.knowledge_chunks chunk USING tenancy.knowledge_source_revisions revision
    WHERE revision.tenant_id = job.tenant_id AND revision.source_id = job.source_id
      AND chunk.tenant_id = revision.tenant_id AND chunk.source_revision_id = revision.id;
  UPDATE tenancy.knowledge_source_revisions revision SET content_text = tombstone,
    checksum = public.digest(tombstone, 'sha256'), status = 'superseded',
    provenance_json = jsonb_build_object('kind', 'deleted_tombstone', 'purgedAt', target_completed_at)
    WHERE revision.tenant_id = job.tenant_id AND revision.source_id = job.source_id;
  UPDATE tenancy.knowledge_objects object SET status = 'deleted', safe_error_code = NULL
    WHERE object.tenant_id = job.tenant_id AND object.source_id = job.source_id;
  UPDATE tenancy.knowledge_source_cleanup_jobs item SET status = 'completed', locked_at = NULL,
    completed_at = target_completed_at, object_count = target_object_count, vector_count = target_vector_count,
    safe_error_code = NULL, updated_at = target_completed_at WHERE item.id = job.id;
  GET DIAGNOSTICS changed = ROW_COUNT; RETURN changed = 1;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.fail_knowledge_source_cleanup(target_job_id uuid, target_safe_error_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE changed integer;
BEGIN
  IF session_user <> 'djay_worker' OR current_setting('app.service', true) IS DISTINCT FROM 'knowledge_worker'
    OR target_safe_error_code !~ '^[a-z0-9_]{2,100}$' THEN RAISE EXCEPTION 'knowledge_worker_context_required'; END IF;
  UPDATE tenancy.knowledge_source_cleanup_jobs item SET
    status = CASE WHEN item.attempt_count < 10 THEN 'failed' ELSE 'dead_letter' END,
    available_at = now() + make_interval(secs => LEAST(3600, 30 * (2 ^ LEAST(item.attempt_count, 7)))),
    locked_at = NULL, safe_error_code = target_safe_error_code, updated_at = now()
    WHERE item.id = target_job_id AND item.status = 'processing';
  GET DIAGNOSTICS changed = ROW_COUNT; RETURN changed = 1;
END
$$;

REVOKE ALL ON FUNCTION tenancy.claim_knowledge_source_cleanup(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.complete_knowledge_source_cleanup(uuid, integer, integer, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.fail_knowledge_source_cleanup(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.claim_knowledge_source_cleanup(timestamptz, timestamptz),
  tenancy.complete_knowledge_source_cleanup(uuid, integer, integer, timestamptz),
  tenancy.fail_knowledge_source_cleanup(uuid, text) TO djay_worker;

CREATE OR REPLACE FUNCTION tenancy.protect_completed_knowledge_cleanup()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, tenancy AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.status = 'completed' THEN RAISE EXCEPTION 'knowledge_cleanup_evidence_immutable'; END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER tenancy_completed_knowledge_cleanup_immutable
BEFORE UPDATE OR DELETE ON tenancy.knowledge_source_cleanup_jobs
FOR EACH ROW EXECUTE FUNCTION tenancy.protect_completed_knowledge_cleanup();
REVOKE ALL ON FUNCTION tenancy.protect_completed_knowledge_cleanup() FROM PUBLIC;
