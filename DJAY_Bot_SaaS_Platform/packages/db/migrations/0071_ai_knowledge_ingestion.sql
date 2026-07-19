CREATE TABLE tenancy.knowledge_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160), description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by_membership_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id), FOREIGN KEY (tenant_id, created_by_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.knowledge_collection_sources (
  tenant_id uuid NOT NULL, collection_id uuid NOT NULL, source_id uuid NOT NULL, attached_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, collection_id, source_id),
  FOREIGN KEY (tenant_id, collection_id) REFERENCES tenancy.knowledge_collections(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, source_id) REFERENCES tenancy.knowledge_sources(tenant_id, id) ON DELETE RESTRICT
);

ALTER TABLE tenancy.knowledge_sources
  ADD COLUMN source_url text,
  ADD COLUMN refresh_interval_hours integer CHECK (refresh_interval_hours IS NULL OR refresh_interval_hours BETWEEN 24 AND 8760),
  ADD COLUMN next_refresh_at timestamptz,
  ADD COLUMN last_refreshed_at timestamptz,
  ADD COLUMN safe_error_code text CHECK (safe_error_code IS NULL OR safe_error_code ~ '^[a-z0-9_]{2,100}$'),
  ADD CONSTRAINT tenancy_knowledge_url_source_contract CHECK (
    (source_kind = 'url' AND source_url IS NOT NULL AND source_url ~ '^https://')
    OR (source_kind <> 'url' AND source_url IS NULL AND refresh_interval_hours IS NULL AND next_refresh_at IS NULL)
  );

CREATE TABLE tenancy.knowledge_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, source_id uuid NOT NULL,
  object_key text NOT NULL CHECK (char_length(object_key) BETWEEN 20 AND 500), original_filename text NOT NULL CHECK (char_length(original_filename) BETWEEN 1 AND 255),
  media_type text NOT NULL CHECK (media_type IN ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain')),
  declared_size bigint NOT NULL CHECK (declared_size BETWEEN 1 AND 10485760), observed_size bigint,
  sha256 bytea CHECK (sha256 IS NULL OR octet_length(sha256) = 32),
  status text NOT NULL DEFAULT 'pending_upload' CHECK (status IN ('pending_upload', 'uploaded', 'scanning', 'clean', 'infected', 'failed', 'deleted')),
  safe_error_code text CHECK (safe_error_code IS NULL OR safe_error_code ~ '^[a-z0-9_]{2,100}$'),
  created_at timestamptz NOT NULL DEFAULT now(), uploaded_at timestamptz, scanned_at timestamptz,
  UNIQUE (tenant_id, id), UNIQUE (object_key),
  FOREIGN KEY (tenant_id, source_id) REFERENCES tenancy.knowledge_sources(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.knowledge_ingestion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, source_id uuid NOT NULL, object_id uuid,
  job_kind text NOT NULL CHECK (job_kind IN ('file_extract', 'url_crawl', 'scheduled_refresh')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('waiting_upload', 'pending', 'processing', 'succeeded', 'failed', 'dead_letter')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 10), available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz, safe_error_code text CHECK (safe_error_code IS NULL OR safe_error_code ~ '^[a-z0-9_]{2,100}$'),
  requested_by_membership_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, source_id) REFERENCES tenancy.knowledge_sources(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, object_id) REFERENCES tenancy.knowledge_objects(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, requested_by_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT,
  CHECK ((job_kind = 'file_extract') = (object_id IS NOT NULL))
);
CREATE INDEX tenancy_knowledge_ingestion_claim ON tenancy.knowledge_ingestion_jobs (available_at, created_at)
  WHERE status IN ('pending', 'processing', 'failed');

CREATE TABLE tenancy.knowledge_catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, collection_id uuid NOT NULL,
  item_kind text NOT NULL CHECK (item_kind IN ('product', 'service')), external_key text NOT NULL CHECK (external_key ~ '^[a-zA-Z0-9_.-]{1,100}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 200), description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 10000),
  price_minor bigint CHECK (price_minor IS NULL OR price_minor >= 0), currency text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object' AND octet_length(attributes::text) <= 32768),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, collection_id, external_key),
  FOREIGN KEY (tenant_id, collection_id) REFERENCES tenancy.knowledge_collections(tenant_id, id) ON DELETE RESTRICT,
  CHECK ((price_minor IS NULL) = (currency IS NULL))
);

CREATE TABLE tenancy.knowledge_catalog_sources (
  tenant_id uuid NOT NULL, collection_id uuid NOT NULL, source_id uuid NOT NULL,
  PRIMARY KEY (tenant_id, collection_id), UNIQUE (tenant_id, source_id),
  FOREIGN KEY (tenant_id, collection_id) REFERENCES tenancy.knowledge_collections(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, source_id) REFERENCES tenancy.knowledge_sources(tenant_id, id) ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION tenancy.claim_knowledge_ingestion(claim_time timestamptz, stale_before timestamptz)
RETURNS TABLE (job_id uuid, tenant_id uuid, source_id uuid, object_id uuid, job_kind text, source_url text,
  object_key text, media_type text, declared_size bigint, attempt_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
BEGIN
  IF session_user <> 'djay_worker' OR current_setting('app.service', true) IS DISTINCT FROM 'knowledge_worker' THEN
    RAISE EXCEPTION 'knowledge_worker_context_required'; END IF;
  RETURN QUERY WITH candidate AS (
    SELECT item.id FROM tenancy.knowledge_ingestion_jobs item
    WHERE item.available_at <= claim_time AND item.attempt_count < 10
      AND (item.status IN ('pending', 'failed') OR (item.status = 'processing' AND item.locked_at < stale_before))
    ORDER BY item.available_at, item.created_at, item.id FOR UPDATE SKIP LOCKED LIMIT 1
  ), claimed AS (
    UPDATE tenancy.knowledge_ingestion_jobs item SET status = 'processing', locked_at = claim_time,
      attempt_count = item.attempt_count + 1, safe_error_code = NULL FROM candidate
    WHERE item.id = candidate.id RETURNING item.*
  ) SELECT claimed.id, claimed.tenant_id, claimed.source_id, claimed.object_id, claimed.job_kind,
      source.source_url, object.object_key, object.media_type, object.declared_size, claimed.attempt_count
    FROM claimed JOIN tenancy.knowledge_sources source ON source.tenant_id = claimed.tenant_id AND source.id = claimed.source_id
    LEFT JOIN tenancy.knowledge_objects object ON object.tenant_id = claimed.tenant_id AND object.id = claimed.object_id;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.enqueue_due_knowledge_refreshes(batch_limit integer DEFAULT 100)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE inserted integer;
BEGIN
  IF session_user <> 'djay_worker' OR current_setting('app.service', true) IS DISTINCT FROM 'knowledge_worker'
    OR batch_limit NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'knowledge_worker_context_required'; END IF;
  WITH due AS (SELECT source.id, source.tenant_id, source.created_by_membership_id
    FROM tenancy.knowledge_sources source WHERE source.source_kind = 'url' AND source.status = 'active'
      AND source.refresh_interval_hours IS NOT NULL AND source.next_refresh_at <= now()
      AND NOT EXISTS (SELECT 1 FROM tenancy.knowledge_ingestion_jobs active
        WHERE active.tenant_id = source.tenant_id AND active.source_id = source.id
          AND active.status IN ('pending', 'processing', 'failed'))
    ORDER BY source.next_refresh_at, source.id FOR UPDATE SKIP LOCKED LIMIT batch_limit)
  INSERT INTO tenancy.knowledge_ingestion_jobs (tenant_id, source_id, job_kind, requested_by_membership_id)
    SELECT due.tenant_id, due.id, 'scheduled_refresh', due.created_by_membership_id FROM due;
  GET DIAGNOSTICS inserted = ROW_COUNT; RETURN inserted;
END
$$;

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
    VALUES (revision_id, job.tenant_id, job.source_id, next_version, extracted_content, digest(extracted_content, 'sha256'),
      'ready', provenance, job.requested_by_membership_id);
  FOR chunk IN SELECT * FROM jsonb_to_recordset(chunks_json) AS value(sequence integer, content text) LOOP
    INSERT INTO tenancy.knowledge_chunks (tenant_id, source_revision_id, sequence, content_text, content_hash)
      VALUES (job.tenant_id, revision_id, chunk.sequence, chunk.content, digest(chunk.content, 'sha256'));
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

CREATE OR REPLACE FUNCTION tenancy.fail_knowledge_ingestion(target_job_id uuid, target_safe_error_code text, retryable boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE changed integer;
BEGIN
  IF session_user <> 'djay_worker' OR current_setting('app.service', true) IS DISTINCT FROM 'knowledge_worker'
    OR target_safe_error_code !~ '^[a-z0-9_]{2,100}$' THEN RAISE EXCEPTION 'knowledge_worker_context_required'; END IF;
  UPDATE tenancy.knowledge_ingestion_jobs item SET
    status = CASE WHEN retryable AND item.attempt_count < 10 THEN 'failed' ELSE 'dead_letter' END,
    available_at = CASE WHEN retryable THEN now() + make_interval(secs => LEAST(3600, 30 * (2 ^ LEAST(item.attempt_count, 7)))) ELSE item.available_at END,
    locked_at = NULL, safe_error_code = target_safe_error_code,
    completed_at = CASE WHEN retryable AND item.attempt_count < 10 THEN NULL ELSE now() END
  WHERE item.id = target_job_id AND item.status = 'processing';
  GET DIAGNOSTICS changed = ROW_COUNT; RETURN changed = 1;
END
$$;

DO $$ DECLARE table_name text; BEGIN FOREACH table_name IN ARRAY ARRAY[
  'knowledge_collections', 'knowledge_collection_sources', 'knowledge_objects', 'knowledge_ingestion_jobs', 'knowledge_catalog_items', 'knowledge_catalog_sources'
] LOOP EXECUTE format('ALTER TABLE tenancy.%I ENABLE ROW LEVEL SECURITY', table_name);
  EXECUTE format('ALTER TABLE tenancy.%I FORCE ROW LEVEL SECURITY', table_name);
  EXECUTE format('CREATE POLICY tenant_isolation ON tenancy.%I USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id())', table_name);
END LOOP; END $$;
CREATE POLICY worker_knowledge_objects ON tenancy.knowledge_objects TO djay_worker USING (current_setting('app.service', true) = 'knowledge_worker');
CREATE POLICY worker_knowledge_jobs ON tenancy.knowledge_ingestion_jobs TO djay_worker USING (current_setting('app.service', true) = 'knowledge_worker');

REVOKE ALL ON tenancy.knowledge_collections, tenancy.knowledge_collection_sources, tenancy.knowledge_objects,
  tenancy.knowledge_ingestion_jobs, tenancy.knowledge_catalog_items, tenancy.knowledge_catalog_sources FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON tenancy.knowledge_collections, tenancy.knowledge_collection_sources,
  tenancy.knowledge_objects, tenancy.knowledge_ingestion_jobs, tenancy.knowledge_catalog_items, tenancy.knowledge_catalog_sources TO djay_runtime;
REVOKE ALL ON FUNCTION tenancy.claim_knowledge_ingestion(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.enqueue_due_knowledge_refreshes(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.complete_knowledge_ingestion(uuid, text, jsonb, jsonb, bigint, bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.fail_knowledge_ingestion(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.claim_knowledge_ingestion(timestamptz, timestamptz),
  tenancy.enqueue_due_knowledge_refreshes(integer),
  tenancy.complete_knowledge_ingestion(uuid, text, jsonb, jsonb, bigint, bytea),
  tenancy.fail_knowledge_ingestion(uuid, text, boolean) TO djay_worker;
