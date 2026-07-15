ALTER TABLE tenancy.support_access_grants
  ALTER COLUMN approved_by_platform_user_id DROP NOT NULL,
  ALTER COLUMN status SET DEFAULT 'requested',
  DROP CONSTRAINT support_access_grants_status_check,
  ADD COLUMN approved_at timestamptz,
  ADD CONSTRAINT support_access_grants_status_check
    CHECK (status IN ('requested', 'approved', 'active', 'expired', 'revoked')),
  ADD CONSTRAINT support_access_grants_approval_state CHECK (
    (status = 'requested' AND approved_by_platform_user_id IS NULL AND approved_at IS NULL)
    OR (status <> 'requested' AND approved_by_platform_user_id IS NOT NULL AND approved_at IS NOT NULL)
  );

CREATE TABLE tenancy.privacy_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  privacy_job_id uuid NOT NULL,
  media_type text NOT NULL DEFAULT 'application/json',
  payload_ciphertext text NOT NULL,
  plaintext_sha256 bytea NOT NULL,
  byte_length integer NOT NULL CHECK (byte_length > 0 AND byte_length <= 52428800),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, privacy_job_id),
  FOREIGN KEY (tenant_id, privacy_job_id)
    REFERENCES tenancy.privacy_jobs(tenant_id, id) ON DELETE RESTRICT,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '30 days')
);

ALTER TABLE tenancy.privacy_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.privacy_artifacts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.privacy_artifacts
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

DROP POLICY worker_action_access ON tenancy.action_requests;
DROP POLICY worker_action_attempt_access ON tenancy.action_attempts;
DROP POLICY worker_action_result_access ON tenancy.action_results;
DROP POLICY worker_privacy_job_access ON tenancy.privacy_jobs;
DROP POLICY worker_privacy_lineage_access ON tenancy.privacy_lineage;

CREATE POLICY worker_action_access ON tenancy.action_requests TO djay_worker
  USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY worker_action_attempt_access ON tenancy.action_attempts TO djay_worker
  USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY worker_action_result_access ON tenancy.action_results TO djay_worker
  USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY worker_privacy_job_access ON tenancy.privacy_jobs TO djay_worker
  USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY worker_privacy_lineage_access ON tenancy.privacy_lineage TO djay_worker
  USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY worker_privacy_artifact_access ON tenancy.privacy_artifacts TO djay_worker
  USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());

CREATE OR REPLACE FUNCTION tenancy.reject_shared_domain_immutable_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, tenancy AS $$
BEGIN
  IF TG_TABLE_NAME = 'messages'
     AND session_user = 'djay_worker'
     AND nullif(current_setting('app.privacy_erasure_job_id', true), '') IS NOT NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION '% is immutable', TG_TABLE_NAME;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.claim_privacy_job()
RETURNS TABLE (job_id uuid, tenant_id uuid, contact_id uuid, job_type text, scope_json jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'privacy_worker' THEN
    RAISE EXCEPTION 'privacy worker context required';
  END IF;
  RETURN QUERY
  WITH candidate AS (
    SELECT job.id FROM tenancy.privacy_jobs job
    WHERE job.status = 'requested'
    ORDER BY job.requested_at, job.id
    FOR UPDATE SKIP LOCKED LIMIT 1
  )
  UPDATE tenancy.privacy_jobs job SET status = 'processing'
  FROM candidate WHERE job.id = candidate.id
  RETURNING job.id, job.tenant_id, job.contact_id, job.job_type, job.scope_json;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.execute_contact_erasure(target_job_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE
  target_tenant_id uuid;
  target_contact_id uuid;
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'privacy_worker' THEN
    RAISE EXCEPTION 'privacy worker context required';
  END IF;

  SELECT job.tenant_id, job.contact_id INTO target_tenant_id, target_contact_id
  FROM tenancy.privacy_jobs job
  WHERE job.id = target_job_id AND job.job_type = 'erasure' AND job.status = 'processing'
  FOR UPDATE;
  IF target_tenant_id IS NULL OR target_contact_id IS NULL
     OR target_tenant_id::text IS DISTINCT FROM current_setting('app.tenant_id', true) THEN
    RETURN false;
  END IF;

  PERFORM set_config('app.privacy_erasure_job_id', target_job_id::text, true);

  INSERT INTO tenancy.privacy_lineage (tenant_id, privacy_job_id, entity_type, entity_id, disposition)
    SELECT target_tenant_id, target_job_id, 'contact_identity', identity.id::text, 'erased'
    FROM tenancy.contact_identities identity
    WHERE identity.tenant_id = target_tenant_id AND identity.contact_id = target_contact_id
    ON CONFLICT DO NOTHING;
  UPDATE tenancy.contact_identities SET
    normalized_value = 'erased:' || id::text,
    display_value_ciphertext = NULL,
    verification_status = 'disputed', verified_at = NULL, revoked_at = now()
  WHERE tenant_id = target_tenant_id AND contact_id = target_contact_id;

  INSERT INTO tenancy.privacy_lineage (tenant_id, privacy_job_id, entity_type, entity_id, disposition)
    SELECT target_tenant_id, target_job_id, 'message', message.id::text, 'anonymized'
    FROM tenancy.messages message JOIN tenancy.conversations conversation
      ON conversation.tenant_id = message.tenant_id AND conversation.id = message.conversation_id
    WHERE conversation.tenant_id = target_tenant_id AND conversation.contact_id = target_contact_id
    ON CONFLICT DO NOTHING;
  UPDATE tenancy.messages message SET content_json = '{"text":"[personal data erased]"}'::jsonb
  FROM tenancy.conversations conversation
  WHERE conversation.tenant_id = target_tenant_id AND conversation.contact_id = target_contact_id
    AND message.tenant_id = conversation.tenant_id AND message.conversation_id = conversation.id;

  UPDATE tenancy.conversation_notes note SET body = '[personal data erased]', updated_at = now()
  FROM tenancy.conversations conversation
  WHERE conversation.tenant_id = target_tenant_id AND conversation.contact_id = target_contact_id
    AND note.tenant_id = conversation.tenant_id AND note.conversation_id = conversation.id;
  UPDATE tenancy.sales_facts fact SET value_json = '{"value":"[personal data erased]"}'::jsonb
  FROM tenancy.leads lead
  WHERE lead.tenant_id = target_tenant_id AND lead.contact_id = target_contact_id
    AND fact.tenant_id = lead.tenant_id AND fact.lead_id = lead.id;
  UPDATE tenancy.follow_up_tasks task SET note = '[personal data erased]'
  FROM tenancy.leads lead
  WHERE lead.tenant_id = target_tenant_id AND lead.contact_id = target_contact_id
    AND task.tenant_id = lead.tenant_id AND task.lead_id = lead.id;
  UPDATE tenancy.appointment_requests appointment SET notes = NULL, updated_at = now()
  FROM tenancy.leads lead
  WHERE lead.tenant_id = target_tenant_id AND lead.contact_id = target_contact_id
    AND appointment.tenant_id = lead.tenant_id AND appointment.lead_id = lead.id;
  UPDATE tenancy.leads SET title = '[erased lead]', updated_at = now()
  WHERE tenant_id = target_tenant_id AND contact_id = target_contact_id;

  INSERT INTO tenancy.privacy_lineage (tenant_id, privacy_job_id, entity_type, entity_id, disposition)
    SELECT target_tenant_id, target_job_id, 'lead', lead.id::text, 'anonymized'
    FROM tenancy.leads lead WHERE lead.tenant_id = target_tenant_id AND lead.contact_id = target_contact_id
    ON CONFLICT DO NOTHING;
  INSERT INTO tenancy.privacy_lineage (tenant_id, privacy_job_id, entity_type, entity_id, disposition)
    SELECT target_tenant_id, target_job_id, 'conversation', conversation.id::text, 'retained_legal'
    FROM tenancy.conversations conversation
    WHERE conversation.tenant_id = target_tenant_id AND conversation.contact_id = target_contact_id
    ON CONFLICT DO NOTHING;
  INSERT INTO tenancy.privacy_lineage (tenant_id, privacy_job_id, entity_type, entity_id, disposition)
    VALUES (target_tenant_id, target_job_id, 'contact', target_contact_id::text, 'anonymized')
    ON CONFLICT DO NOTHING;

  UPDATE tenancy.contacts SET display_name = '[erased contact]', consent_status = 'withdrawn',
    status = 'erased', merged_into_contact_id = NULL, erased_at = now(), updated_at = now()
  WHERE tenant_id = target_tenant_id AND id = target_contact_id;
  UPDATE tenancy.privacy_jobs SET status = 'completed', completed_at = now()
  WHERE tenant_id = target_tenant_id AND id = target_job_id;
  INSERT INTO tenancy.audit_logs (tenant_id, action, target_type, target_id, request_id, result, metadata)
  VALUES (target_tenant_id, 'privacy.erasure.completed', 'privacy_job', target_job_id::text,
    COALESCE(nullif(current_setting('app.request_id', true), ''), target_job_id::text), 'succeeded',
    jsonb_build_object('contactId', target_contact_id));
  RETURN true;
END
$$;

REVOKE ALL ON FUNCTION tenancy.claim_privacy_job() FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.execute_contact_erasure(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.claim_privacy_job() TO djay_worker;
GRANT EXECUTE ON FUNCTION tenancy.execute_contact_erasure(uuid) TO djay_worker;

GRANT SELECT ON tenancy.contacts, tenancy.contact_identities, tenancy.leads,
  tenancy.lead_status_history, tenancy.sales_facts, tenancy.appointment_requests,
  tenancy.appointment_time_options, tenancy.follow_up_tasks, tenancy.conversations,
  tenancy.messages, tenancy.conversation_notes, tenancy.conversation_transitions,
  tenancy.handover_events, tenancy.action_requests, tenancy.action_results TO djay_worker;
GRANT SELECT, INSERT ON tenancy.privacy_artifacts TO djay_runtime, djay_worker;

