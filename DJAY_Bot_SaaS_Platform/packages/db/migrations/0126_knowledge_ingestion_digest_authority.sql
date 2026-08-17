CREATE OR REPLACE FUNCTION tenancy.complete_knowledge_ingestion(target_job_id uuid, extracted_content text,
  chunks_json jsonb, provenance jsonb, target_observed_size bigint DEFAULT NULL, target_content_sha256 bytea DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE job record; next_version integer; revision_id uuid := gen_random_uuid(); chunk record;
BEGIN
  IF session_user <> 'djay_worker' OR current_setting('app.service', true) IS DISTINCT FROM 'knowledge_worker'
    OR char_length(extracted_content) NOT BETWEEN 1 AND 2000000 OR jsonb_typeof(chunks_json) <> 'array'
    OR jsonb_array_length(chunks_json) NOT BETWEEN 1 AND 5000 OR octet_length(provenance::text) > 32768 THEN
    RAISE EXCEPTION 'invalid_knowledge_completion'; END IF;
  SELECT item.* INTO job FROM tenancy.knowledge_ingestion_jobs item
    WHERE item.id = target_job_id AND item.status = 'processing' FOR UPDATE;
  IF job IS NULL THEN RAISE EXCEPTION 'knowledge_job_not_processing'; END IF;
  SELECT COALESCE(max(revision.version), 0) + 1 INTO next_version FROM tenancy.knowledge_source_revisions revision
    WHERE revision.tenant_id = job.tenant_id AND revision.source_id = job.source_id;
  INSERT INTO tenancy.knowledge_source_revisions (id, tenant_id, source_id, version, content_text, checksum, status, provenance_json, created_by_membership_id)
    VALUES (revision_id, job.tenant_id, job.source_id, next_version, extracted_content, public.digest(extracted_content, 'sha256'),
      'ready', provenance, job.requested_by_membership_id);
  FOR chunk IN SELECT * FROM jsonb_to_recordset(chunks_json) AS value(sequence integer, content text) LOOP
    INSERT INTO tenancy.knowledge_chunks (tenant_id, source_revision_id, sequence, content_text, content_hash)
      VALUES (job.tenant_id, revision_id, chunk.sequence, chunk.content, public.digest(chunk.content, 'sha256'));
  END LOOP;
  UPDATE tenancy.knowledge_sources source SET last_refreshed_at = now(), safe_error_code = NULL,
    next_refresh_at = CASE WHEN source.refresh_interval_hours IS NULL THEN NULL ELSE now() + make_interval(hours => source.refresh_interval_hours) END,
    updated_at = now() WHERE source.tenant_id = job.tenant_id AND source.id = job.source_id;
  IF job.object_id IS NOT NULL THEN UPDATE tenancy.knowledge_objects object SET status = 'clean', observed_size = target_observed_size,
    sha256 = target_content_sha256, scanned_at = now() WHERE object.tenant_id = job.tenant_id AND object.id = job.object_id; END IF;
  UPDATE tenancy.knowledge_ingestion_jobs item SET status = 'succeeded', locked_at = NULL, completed_at = now()
    WHERE item.tenant_id = job.tenant_id AND item.id = job.id;
  RETURN revision_id;
END
$$;

REVOKE ALL ON FUNCTION tenancy.complete_knowledge_ingestion(uuid, text, jsonb, jsonb, bigint, bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.complete_knowledge_ingestion(uuid, text, jsonb, jsonb, bigint, bytea) TO djay_worker;
