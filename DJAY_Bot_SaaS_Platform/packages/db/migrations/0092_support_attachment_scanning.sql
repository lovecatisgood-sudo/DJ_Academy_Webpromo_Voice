-- Quarantined support attachments. Files are never considered downloadable until a worker records
-- a clean malware scan and validates the declared file signature and size.
CREATE TABLE tenancy.support_ticket_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  ticket_id uuid NOT NULL,
  uploaded_by_membership_id uuid NOT NULL,
  object_key text NOT NULL UNIQUE CHECK (object_key ~ '^support/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}$'),
  original_filename text NOT NULL CHECK (char_length(original_filename) BETWEEN 1 AND 255),
  media_type text NOT NULL CHECK (media_type IN ('application/pdf','image/png','image/jpeg','text/plain')),
  declared_size integer NOT NULL CHECK (declared_size BETWEEN 1 AND 10485760),
  observed_size integer,
  sha256 bytea,
  status text NOT NULL DEFAULT 'pending_upload' CHECK (status IN (
    'pending_upload','uploaded','scanning','clean','infected','failed'
  )),
  safe_error_code text CHECK (safe_error_code IS NULL OR safe_error_code ~ '^[a-z0-9_]{2,100}$'),
  idempotency_key uuid NOT NULL,
  uploaded_at timestamptz,
  scanned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, ticket_id) REFERENCES tenancy.support_tickets(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, uploaded_by_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT,
  CHECK ((status = 'clean') = (sha256 IS NOT NULL AND scanned_at IS NOT NULL))
);

CREATE TABLE tenancy.support_attachment_scan_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  attachment_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'waiting_upload' CHECK (status IN ('waiting_upload','pending','processing','completed','dead_letter')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  safe_error_code text CHECK (safe_error_code IS NULL OR safe_error_code ~ '^[a-z0-9_]{2,100}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, attachment_id),
  FOREIGN KEY (tenant_id, attachment_id) REFERENCES tenancy.support_ticket_attachments(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX tenancy_support_attachment_scan_queue_idx
  ON tenancy.support_attachment_scan_jobs (status, available_at, id);
CREATE INDEX tenancy_support_ticket_attachment_timeline_idx
  ON tenancy.support_ticket_attachments (tenant_id, ticket_id, created_at, id);

ALTER TABLE tenancy.support_ticket_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.support_ticket_attachments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.support_ticket_attachments
  USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY platform_support_attachments ON tenancy.support_ticket_attachments TO djay_platform
  USING (true) WITH CHECK (true);

ALTER TABLE tenancy.support_attachment_scan_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.support_attachment_scan_jobs FORCE ROW LEVEL SECURITY;

CREATE FUNCTION tenancy.create_support_ticket_attachment(
  target_ticket_id uuid, target_membership_id uuid, target_filename text,
  target_media_type text, target_size integer, target_idempotency_key uuid
) RETURNS TABLE (attachment_id uuid, job_id uuid, object_key text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE current_tenant uuid := tenancy.current_tenant_id(); created_attachment_id uuid := gen_random_uuid(); created_job_id uuid := gen_random_uuid(); created_key text;
BEGIN
  IF current_tenant IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM tenancy.support_tickets ticket WHERE ticket.tenant_id = current_tenant AND ticket.id = target_ticket_id
  ) THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM tenancy.memberships membership WHERE membership.tenant_id = current_tenant
      AND membership.id = target_membership_id AND membership.status = 'active'
  ) THEN RETURN; END IF;
  created_key := 'support/' || current_tenant::text || '/' || target_ticket_id::text || '/' || created_attachment_id::text;
  INSERT INTO tenancy.support_ticket_attachments (
    id, tenant_id, ticket_id, uploaded_by_membership_id, object_key, original_filename,
    media_type, declared_size, idempotency_key
  ) VALUES (
    created_attachment_id, current_tenant, target_ticket_id, target_membership_id, created_key,
    target_filename, target_media_type, target_size, target_idempotency_key
  ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
  IF NOT FOUND THEN
    RETURN QUERY SELECT attachment.id, job.id, attachment.object_key
      FROM tenancy.support_ticket_attachments attachment
      JOIN tenancy.support_attachment_scan_jobs job ON job.tenant_id = attachment.tenant_id AND job.attachment_id = attachment.id
      WHERE attachment.tenant_id = current_tenant AND attachment.idempotency_key = target_idempotency_key
        AND attachment.ticket_id = target_ticket_id AND attachment.original_filename = target_filename
        AND attachment.media_type = target_media_type AND attachment.declared_size = target_size
        AND attachment.status = 'pending_upload' AND job.status = 'waiting_upload';
    RETURN;
  END IF;
  INSERT INTO tenancy.support_attachment_scan_jobs (id, tenant_id, attachment_id)
    VALUES (created_job_id, current_tenant, created_attachment_id);
  RETURN QUERY SELECT created_attachment_id, created_job_id, created_key;
END;
$$;

CREATE FUNCTION tenancy.complete_support_ticket_attachment_upload(target_attachment_id uuid, target_size integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE changed_count integer;
BEGIN
  WITH uploaded AS (
    UPDATE tenancy.support_ticket_attachments SET status = 'uploaded', observed_size = target_size, uploaded_at = now()
    WHERE tenant_id = tenancy.current_tenant_id() AND id = target_attachment_id AND status = 'pending_upload'
      AND declared_size = target_size RETURNING tenant_id, id
  ) UPDATE tenancy.support_attachment_scan_jobs job SET status = 'pending', available_at = now(), updated_at = now()
    FROM uploaded WHERE job.tenant_id = uploaded.tenant_id AND job.attachment_id = uploaded.id AND job.status = 'waiting_upload';
  GET DIAGNOSTICS changed_count = ROW_COUNT; RETURN changed_count > 0;
END;
$$;

CREATE FUNCTION tenancy.claim_support_attachment_scan(target_now timestamptz)
RETURNS TABLE (job_id uuid, tenant_id uuid, attachment_id uuid, object_key text, media_type text, declared_size integer, attempt_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
BEGIN
  IF current_setting('app.service', true) <> 'support_attachment_worker' THEN RAISE EXCEPTION 'support_attachment_worker_authority_required'; END IF;
  RETURN QUERY
  WITH candidate AS (
    SELECT job.id FROM tenancy.support_attachment_scan_jobs job
    WHERE job.status = 'pending' AND job.available_at <= target_now
    ORDER BY job.available_at, job.id FOR UPDATE SKIP LOCKED LIMIT 1
  ), claimed AS (
    UPDATE tenancy.support_attachment_scan_jobs job SET status = 'processing', locked_at = target_now,
      attempt_count = job.attempt_count + 1, updated_at = target_now
    FROM candidate WHERE job.id = candidate.id RETURNING job.*
  ), marked AS (
    UPDATE tenancy.support_ticket_attachments attachment SET status = 'scanning', safe_error_code = NULL
    FROM claimed WHERE attachment.tenant_id = claimed.tenant_id AND attachment.id = claimed.attachment_id
      AND attachment.status IN ('uploaded', 'scanning')
    RETURNING attachment.*
  )
  SELECT claimed.id, attachment.tenant_id, attachment.id, attachment.object_key,
    attachment.media_type, attachment.declared_size, claimed.attempt_count
  FROM claimed JOIN marked attachment
    ON attachment.tenant_id = claimed.tenant_id AND attachment.id = claimed.attachment_id;
END;
$$;

CREATE FUNCTION tenancy.complete_support_attachment_scan(target_job_id uuid, target_size integer, target_sha256 bytea)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE changed_count integer;
BEGIN
  IF current_setting('app.service', true) <> 'support_attachment_worker' THEN RAISE EXCEPTION 'support_attachment_worker_authority_required'; END IF;
  WITH eligible AS (
    SELECT job.id, job.tenant_id, job.attachment_id
    FROM tenancy.support_attachment_scan_jobs job
    JOIN tenancy.support_ticket_attachments attachment
      ON attachment.tenant_id = job.tenant_id AND attachment.id = job.attachment_id
    WHERE job.id = target_job_id AND job.status = 'processing'
      AND attachment.status = 'scanning' AND attachment.declared_size = target_size
    FOR UPDATE OF job, attachment
  ), completed AS (
    UPDATE tenancy.support_attachment_scan_jobs job SET status = 'completed', locked_at = NULL,
      safe_error_code = NULL, updated_at = now() FROM eligible
    WHERE job.id = eligible.id RETURNING job.tenant_id, job.attachment_id
  ) UPDATE tenancy.support_ticket_attachments attachment SET status = 'clean', observed_size = target_size,
      sha256 = target_sha256, scanned_at = now(), safe_error_code = NULL
    FROM completed WHERE attachment.tenant_id = completed.tenant_id AND attachment.id = completed.attachment_id
      AND attachment.declared_size = target_size;
  GET DIAGNOSTICS changed_count = ROW_COUNT; RETURN changed_count > 0;
END;
$$;

CREATE FUNCTION tenancy.fail_support_attachment_scan(target_job_id uuid, target_code text, retryable boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE changed_count integer;
BEGIN
  IF current_setting('app.service', true) <> 'support_attachment_worker' THEN RAISE EXCEPTION 'support_attachment_worker_authority_required'; END IF;
  WITH failed AS (
    UPDATE tenancy.support_attachment_scan_jobs SET
      status = CASE WHEN retryable AND attempt_count < 5 THEN 'pending' ELSE 'dead_letter' END,
      available_at = CASE WHEN retryable AND attempt_count < 5 THEN now() + make_interval(secs => LEAST(300, attempt_count * 15)) ELSE available_at END,
      locked_at = NULL, safe_error_code = target_code, updated_at = now()
    WHERE id = target_job_id AND status = 'processing' RETURNING tenant_id, attachment_id, status
  ) UPDATE tenancy.support_ticket_attachments attachment SET
      status = CASE WHEN target_code = 'malware_detected' THEN 'infected' WHEN failed.status = 'dead_letter' THEN 'failed' ELSE 'uploaded' END,
      safe_error_code = target_code, scanned_at = CASE WHEN failed.status = 'dead_letter' THEN now() ELSE scanned_at END
    FROM failed WHERE attachment.tenant_id = failed.tenant_id AND attachment.id = failed.attachment_id;
  GET DIAGNOSTICS changed_count = ROW_COUNT; RETURN changed_count > 0;
END;
$$;

REVOKE ALL ON tenancy.support_ticket_attachments, tenancy.support_attachment_scan_jobs FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.claim_support_attachment_scan(timestamptz),
  tenancy.complete_support_attachment_scan(uuid, integer, bytea),
  tenancy.fail_support_attachment_scan(uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.create_support_ticket_attachment(uuid, uuid, text, text, integer, uuid),
  tenancy.complete_support_ticket_attachment_upload(uuid, integer) FROM PUBLIC;
GRANT SELECT ON tenancy.support_ticket_attachments TO djay_runtime;
GRANT EXECUTE ON FUNCTION tenancy.create_support_ticket_attachment(uuid, uuid, text, text, integer, uuid),
  tenancy.complete_support_ticket_attachment_upload(uuid, integer) TO djay_runtime;
GRANT SELECT ON tenancy.support_ticket_attachments TO djay_platform;
GRANT EXECUTE ON FUNCTION tenancy.claim_support_attachment_scan(timestamptz),
  tenancy.complete_support_attachment_scan(uuid, integer, bytea),
  tenancy.fail_support_attachment_scan(uuid, text, boolean) TO djay_worker;
