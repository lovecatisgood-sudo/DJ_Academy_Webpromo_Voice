-- Phase 10 / G6c: conversation legal hold + extended contact erasure coverage.

ALTER TABLE tenancy.conversations
  ADD COLUMN IF NOT EXISTS legal_hold boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS legal_hold_reason text
    CHECK (legal_hold_reason IS NULL OR char_length(legal_hold_reason) BETWEEN 8 AND 500),
  ADD COLUMN IF NOT EXISTS legal_hold_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS legal_hold_set_by_membership_id uuid;

ALTER TABLE tenancy.conversations
  DROP CONSTRAINT IF EXISTS tenancy_conversations_legal_hold_membership_fk;

ALTER TABLE tenancy.conversations
  ADD CONSTRAINT tenancy_conversations_legal_hold_membership_fk
  FOREIGN KEY (tenant_id, legal_hold_set_by_membership_id)
  REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE tenancy.conversations
  DROP CONSTRAINT IF EXISTS tenancy_conversations_legal_hold_consistency;

ALTER TABLE tenancy.conversations
  ADD CONSTRAINT tenancy_conversations_legal_hold_consistency
  CHECK (
    (legal_hold = false AND legal_hold_reason IS NULL AND legal_hold_set_at IS NULL AND legal_hold_set_by_membership_id IS NULL)
    OR (legal_hold = true AND legal_hold_reason IS NOT NULL AND legal_hold_set_at IS NOT NULL AND legal_hold_set_by_membership_id IS NOT NULL)
  );

-- Allow privacy-worker redaction of action_results (and keep message retention/erasure bypass).
CREATE OR REPLACE FUNCTION tenancy.reject_shared_domain_immutable_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, tenancy AS $$
BEGIN
  IF session_user = 'djay_worker'
     AND nullif(current_setting('app.privacy_erasure_job_id', true), '') IS NOT NULL
     AND TG_TABLE_NAME IN ('messages', 'action_results') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_TABLE_NAME = 'messages'
     AND session_user = 'djay_worker'
     AND current_setting('app.service', true) = 'retention_worker'
     AND current_setting('app.retention_sweep', true) = 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION '% is immutable', TG_TABLE_NAME;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.execute_contact_erasure(target_job_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE
  target_tenant_id uuid;
  target_contact_id uuid;
  erased_subject text;
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
  erased_subject := 'erased:' || replace(target_contact_id::text, '-', '');

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

  -- Non-held conversations: anonymize messages + notes.
  INSERT INTO tenancy.privacy_lineage (tenant_id, privacy_job_id, entity_type, entity_id, disposition)
    SELECT target_tenant_id, target_job_id, 'message', message.id::text, 'anonymized'
    FROM tenancy.messages message
    JOIN tenancy.conversations conversation
      ON conversation.tenant_id = message.tenant_id AND conversation.id = message.conversation_id
    WHERE conversation.tenant_id = target_tenant_id
      AND conversation.contact_id = target_contact_id
      AND conversation.legal_hold = false
    ON CONFLICT DO NOTHING;
  UPDATE tenancy.messages message SET content_json = '{"text":"[personal data erased]"}'::jsonb
  FROM tenancy.conversations conversation
  WHERE conversation.tenant_id = target_tenant_id
    AND conversation.contact_id = target_contact_id
    AND conversation.legal_hold = false
    AND message.tenant_id = conversation.tenant_id
    AND message.conversation_id = conversation.id;

  UPDATE tenancy.conversation_notes note SET body = '[personal data erased]', updated_at = now()
  FROM tenancy.conversations conversation
  WHERE conversation.tenant_id = target_tenant_id
    AND conversation.contact_id = target_contact_id
    AND conversation.legal_hold = false
    AND note.tenant_id = conversation.tenant_id
    AND note.conversation_id = conversation.id;

  -- Held conversations: retain transcript content; record legal hold disposition.
  INSERT INTO tenancy.privacy_lineage (
    tenant_id, privacy_job_id, entity_type, entity_id, disposition, detail_json
  )
    SELECT target_tenant_id, target_job_id, 'conversation', conversation.id::text, 'retained_legal',
           jsonb_build_object('reason', 'legal_hold', 'legalHoldReason', conversation.legal_hold_reason)
    FROM tenancy.conversations conversation
    WHERE conversation.tenant_id = target_tenant_id
      AND conversation.contact_id = target_contact_id
      AND conversation.legal_hold = true
    ON CONFLICT DO NOTHING;

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

  -- Action payloads / results linked to the contact (skip when conversation is on legal hold).
  INSERT INTO tenancy.privacy_lineage (tenant_id, privacy_job_id, entity_type, entity_id, disposition)
    SELECT target_tenant_id, target_job_id, 'action_request', request.id::text, 'anonymized'
    FROM tenancy.action_requests request
    LEFT JOIN tenancy.conversations conversation
      ON conversation.tenant_id = request.tenant_id AND conversation.id = request.conversation_id
    WHERE request.tenant_id = target_tenant_id
      AND (
        conversation.contact_id = target_contact_id
        OR request.input_json->>'contactId' = target_contact_id::text
        OR EXISTS (
          SELECT 1 FROM tenancy.leads lead
          WHERE lead.tenant_id = request.tenant_id
            AND lead.contact_id = target_contact_id
            AND lead.id::text = request.input_json->>'leadId'
        )
      )
      AND COALESCE(conversation.legal_hold, false) = false
    ON CONFLICT DO NOTHING;

  UPDATE tenancy.action_requests request
  SET input_json = jsonb_build_object('erased', true, 'actionType', request.action_type)
  FROM tenancy.conversations conversation
  WHERE request.tenant_id = target_tenant_id
    AND conversation.tenant_id = request.tenant_id
    AND conversation.id = request.conversation_id
    AND conversation.contact_id = target_contact_id
    AND conversation.legal_hold = false;

  UPDATE tenancy.action_requests request
  SET input_json = jsonb_build_object('erased', true, 'actionType', request.action_type)
  WHERE request.tenant_id = target_tenant_id
    AND request.conversation_id IS NULL
    AND (
      request.input_json->>'contactId' = target_contact_id::text
      OR EXISTS (
        SELECT 1 FROM tenancy.leads lead
        WHERE lead.tenant_id = request.tenant_id
          AND lead.contact_id = target_contact_id
          AND lead.id::text = request.input_json->>'leadId'
      )
    );

  INSERT INTO tenancy.privacy_lineage (tenant_id, privacy_job_id, entity_type, entity_id, disposition)
    SELECT target_tenant_id, target_job_id, 'action_result', result.id::text, 'anonymized'
    FROM tenancy.action_results result
    JOIN tenancy.action_requests request
      ON request.tenant_id = result.tenant_id AND request.id = result.action_request_id
    LEFT JOIN tenancy.conversations conversation
      ON conversation.tenant_id = request.tenant_id AND conversation.id = request.conversation_id
    WHERE result.tenant_id = target_tenant_id
      AND (
        conversation.contact_id = target_contact_id
        OR request.input_json->>'contactId' = target_contact_id::text
        OR request.input_json ? 'erased'
      )
      AND COALESCE(conversation.legal_hold, false) = false
    ON CONFLICT DO NOTHING;

  UPDATE tenancy.action_results result
  SET result_json = '{"erased":true}'::jsonb
  FROM tenancy.action_requests request
  LEFT JOIN tenancy.conversations conversation
    ON conversation.tenant_id = request.tenant_id AND conversation.id = request.conversation_id
  WHERE result.tenant_id = target_tenant_id
    AND request.tenant_id = result.tenant_id
    AND request.id = result.action_request_id
    AND (
      conversation.contact_id = target_contact_id
      OR request.input_json->>'contactId' = target_contact_id::text
      OR request.input_json ? 'erased'
    )
    AND COALESCE(conversation.legal_hold, false) = false;

  -- Voice outcome summaries (turns already redacted via contact status trigger).
  INSERT INTO tenancy.privacy_lineage (tenant_id, privacy_job_id, entity_type, entity_id, disposition)
    SELECT target_tenant_id, target_job_id, 'voice_call_outcome', outcome.id::text, 'anonymized'
    FROM tenancy.voice_call_outcomes outcome
    JOIN tenancy.voice_sessions session
      ON session.tenant_id = outcome.tenant_id AND session.id = outcome.session_id
    LEFT JOIN tenancy.conversations conversation
      ON conversation.tenant_id = outcome.tenant_id AND conversation.id = outcome.conversation_id
    WHERE session.tenant_id = target_tenant_id
      AND session.contact_id = target_contact_id
      AND COALESCE(conversation.legal_hold, false) = false
    ON CONFLICT DO NOTHING;

  UPDATE tenancy.voice_call_outcomes outcome
  SET summary_text = '[personal data erased]', updated_at = now()
  FROM tenancy.voice_sessions session
  WHERE session.tenant_id = target_tenant_id
    AND session.contact_id = target_contact_id
    AND outcome.tenant_id = session.tenant_id
    AND outcome.session_id = session.id
    AND NOT EXISTS (
      SELECT 1 FROM tenancy.conversations conversation
      WHERE conversation.tenant_id = outcome.tenant_id
        AND conversation.id = outcome.conversation_id
        AND conversation.legal_hold = true
    );

  -- Social subject ciphertext linked to the contact.
  INSERT INTO tenancy.privacy_lineage (tenant_id, privacy_job_id, entity_type, entity_id, disposition)
    SELECT target_tenant_id, target_job_id, 'ai_social_subject', subject.id::text, 'anonymized'
    FROM tenancy.ai_social_subjects subject
    WHERE subject.tenant_id = target_tenant_id AND subject.contact_id = target_contact_id
    ON CONFLICT DO NOTHING;
  UPDATE tenancy.ai_social_subjects
  SET external_subject_ciphertext = erased_subject,
      status = 'opted_out',
      updated_at = now()
  WHERE tenant_id = target_tenant_id AND contact_id = target_contact_id;

  INSERT INTO tenancy.privacy_lineage (tenant_id, privacy_job_id, entity_type, entity_id, disposition)
    SELECT target_tenant_id, target_job_id, 'flow_social_subject', subject.id::text, 'anonymized'
    FROM tenancy.flow_social_subjects subject
    WHERE subject.tenant_id = target_tenant_id AND subject.contact_id = target_contact_id
    ON CONFLICT DO NOTHING;
  UPDATE tenancy.flow_social_subjects
  SET external_subject_ciphertext = erased_subject,
      status = 'opted_out',
      updated_at = now()
  WHERE tenant_id = target_tenant_id AND contact_id = target_contact_id;

  -- Non-held conversations still get retained_legal shell lineage (IDs kept for audit).
  INSERT INTO tenancy.privacy_lineage (tenant_id, privacy_job_id, entity_type, entity_id, disposition)
    SELECT target_tenant_id, target_job_id, 'conversation', conversation.id::text, 'retained_legal'
    FROM tenancy.conversations conversation
    WHERE conversation.tenant_id = target_tenant_id
      AND conversation.contact_id = target_contact_id
      AND conversation.legal_hold = false
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
    jsonb_build_object(
      'contactId', target_contact_id,
      'heldConversationCount', (
        SELECT count(*)::int FROM tenancy.conversations
        WHERE tenant_id = target_tenant_id AND contact_id = target_contact_id AND legal_hold = true
      )
    ));
  RETURN true;
END
$$;

REVOKE ALL ON FUNCTION tenancy.execute_contact_erasure(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.execute_contact_erasure(uuid) TO djay_worker;

-- Privacy export (worker role) reads social subject metadata without ciphertext.
GRANT SELECT ON tenancy.ai_social_subjects, tenancy.flow_social_subjects TO djay_worker;
