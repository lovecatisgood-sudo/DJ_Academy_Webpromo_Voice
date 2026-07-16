INSERT INTO tenancy.audit_logs (
  tenant_id, action, target_type, target_id, request_id, result, metadata
)
SELECT job.tenant_id, 'privacy.erasure.scope_invalidated', 'privacy_job', job.id::text,
       'migration:0042_privacy_job_scope', 'failed',
       jsonb_build_object('reason', 'missing_contact_scope', 'previousStatus', job.status)
FROM tenancy.privacy_jobs job
WHERE job.job_type = 'erasure' AND job.contact_id IS NULL
  AND job.status IN ('requested', 'processing')
ON CONFLICT DO NOTHING;

UPDATE tenancy.privacy_jobs
SET status = 'failed', completed_at = COALESCE(completed_at, now())
WHERE job_type = 'erasure' AND contact_id IS NULL
  AND status IN ('requested', 'processing');

ALTER TABLE tenancy.privacy_jobs
  ADD CONSTRAINT privacy_erasure_requires_contact
  CHECK (job_type <> 'erasure' OR contact_id IS NOT NULL OR status IN ('failed', 'cancelled'));

ALTER TABLE tenancy.privacy_jobs
  ADD CONSTRAINT privacy_job_scope_matches_contact
  CHECK ((scope_json->>'contactId') IS NOT DISTINCT FROM contact_id::text);
