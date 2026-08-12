-- Close the appointment operations loop: repeated reschedules enqueue one new
-- provider update, and dead letters require independently reviewed recovery.
ALTER TABLE tenancy.voice_scheduling_jobs
  ADD COLUMN recovery_generation integer NOT NULL DEFAULT 0
    CHECK (recovery_generation BETWEEN 0 AND 3);
ALTER TABLE tenancy.voice_scheduling_jobs
  ADD COLUMN depends_on_job_id uuid,
  ADD FOREIGN KEY (tenant_id, depends_on_job_id)
    REFERENCES tenancy.voice_scheduling_jobs(tenant_id, id) ON DELETE RESTRICT;

DO $$
DECLARE constraint_name text;
BEGIN
  SELECT candidate.conname INTO constraint_name
  FROM pg_catalog.pg_constraint candidate
  WHERE candidate.conrelid = 'tenancy.appointment_sync_attempts'::regclass
    AND candidate.contype = 'u'
    AND pg_catalog.pg_get_constraintdef(candidate.oid)
      = 'UNIQUE (tenant_id, scheduling_job_id, attempt_number)';
  IF constraint_name IS NULL THEN RAISE EXCEPTION 'appointment attempt uniqueness constraint missing'; END IF;
  EXECUTE format('ALTER TABLE tenancy.appointment_sync_attempts DROP CONSTRAINT %I', constraint_name);
END;
$$;
ALTER TABLE tenancy.appointment_sync_attempts
  ADD COLUMN recovery_generation integer NOT NULL DEFAULT 0
    CHECK (recovery_generation BETWEEN 0 AND 3);
ALTER TABLE tenancy.appointment_sync_attempts
  ADD UNIQUE (tenant_id, scheduling_job_id, recovery_generation, attempt_number);

CREATE OR REPLACE FUNCTION tenancy.enqueue_appointment_calendar_sync() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE operation_value text; profile_id uuid; source_fact_id uuid; dependency_id uuid;
BEGIN
  IF NEW.status = 'confirmed' AND OLD.status <> 'confirmed' THEN operation_value := 'create';
  ELSIF NEW.status = 'rescheduled' AND OLD.status <> 'rescheduled' THEN operation_value := 'update';
  ELSIF NEW.status = 'cancelled' AND OLD.status IN ('confirmed','rescheduled') THEN operation_value := 'cancel';
  ELSE RETURN NEW; END IF;
  IF operation_value = 'create' THEN
    SELECT profile.id INTO profile_id FROM tenancy.voice_scheduling_profiles profile
      WHERE profile.tenant_id = NEW.tenant_id AND profile.status = 'active'
      ORDER BY profile.updated_at DESC, profile.id DESC LIMIT 1;
    SELECT option.id INTO source_fact_id FROM tenancy.appointment_time_options option
      WHERE option.tenant_id = NEW.tenant_id AND option.appointment_request_id = NEW.id
        AND option.verification_status = 'confirmed'
      ORDER BY option.preference_order, option.id LIMIT 1;
    IF profile_id IS NULL OR source_fact_id IS NULL THEN RETURN NEW; END IF;
  ELSE
    SELECT job.scheduling_profile_id, job.id INTO profile_id, dependency_id
    FROM tenancy.voice_scheduling_jobs job
    JOIN tenancy.voice_scheduling_profiles profile ON profile.tenant_id = job.tenant_id
      AND profile.id = job.scheduling_profile_id AND profile.status = 'active'
    WHERE job.tenant_id = NEW.tenant_id AND job.appointment_request_id = NEW.id
      AND job.operation IN ('create','update')
    ORDER BY job.created_at DESC, job.id DESC LIMIT 1;
    IF dependency_id IS NULL THEN RETURN NEW; END IF;
    source_fact_id := CASE WHEN operation_value = 'update' THEN (
      SELECT option.id FROM tenancy.appointment_time_options option
      WHERE option.tenant_id = NEW.tenant_id AND option.appointment_request_id = NEW.id
        AND option.verification_status = 'confirmed'
      ORDER BY option.preference_order, option.id LIMIT 1
    ) ELSE dependency_id END;
    IF source_fact_id IS NULL THEN RETURN NEW; END IF;
  END IF;
  INSERT INTO tenancy.voice_scheduling_jobs (
    tenant_id, scheduling_profile_id, appointment_request_id, operation,
    depends_on_job_id, idempotency_key
  ) VALUES (
    NEW.tenant_id, profile_id, NEW.id, operation_value, dependency_id,
    'appointment:' || NEW.id::text || ':' || operation_value || ':' || source_fact_id::text
  ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION tenancy.claim_appointment_sync_job(claimed_at timestamptz, stale_before timestamptz)
RETURNS TABLE (
  job_id uuid, tenant_id uuid, appointment_request_id uuid, operation text,
  provider_kind text, config_ciphertext text, start_at timestamptz, end_at timestamptz,
  timezone text, external_event_ref text, attempt_count integer
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE target_id uuid;
BEGIN
  IF current_setting('app.service', true) <> 'appointment_sync_worker' THEN RETURN; END IF;
  SELECT job.id INTO target_id FROM tenancy.voice_scheduling_jobs job
  JOIN tenancy.voice_scheduling_profiles profile ON profile.tenant_id = job.tenant_id
    AND profile.id = job.scheduling_profile_id AND profile.status = 'active'
  WHERE ((job.status IN ('pending','failed') AND job.available_at <= claimed_at)
      OR (job.status = 'processing' AND job.available_at <= stale_before))
    AND job.attempt_count < 10
    AND (job.depends_on_job_id IS NULL OR EXISTS (
      SELECT 1 FROM tenancy.voice_scheduling_jobs dependency
      WHERE dependency.tenant_id = job.tenant_id AND dependency.id = job.depends_on_job_id
        AND dependency.status = 'confirmed' AND dependency.external_event_ref IS NOT NULL
    ))
  ORDER BY job.available_at, job.created_at, job.id FOR UPDATE SKIP LOCKED LIMIT 1;
  IF target_id IS NULL THEN RETURN; END IF;
  UPDATE tenancy.voice_scheduling_jobs job SET status = 'processing', attempt_count = job.attempt_count + 1,
    available_at = claimed_at + interval '5 minutes'
  WHERE job.id = target_id;
  RETURN QUERY SELECT job.id, job.tenant_id, job.appointment_request_id, job.operation,
    profile.provider_kind, profile.config_ciphertext, option.start_at, option.end_at,
    request.timezone,
    CASE WHEN job.operation = 'create' THEN NULL ELSE dependency.external_event_ref END,
    job.attempt_count
  FROM tenancy.voice_scheduling_jobs job
  JOIN tenancy.voice_scheduling_profiles profile ON profile.tenant_id = job.tenant_id
    AND profile.id = job.scheduling_profile_id AND profile.status = 'active'
  JOIN tenancy.appointment_requests request ON request.tenant_id = job.tenant_id
    AND request.id = job.appointment_request_id
  LEFT JOIN tenancy.voice_scheduling_jobs dependency ON dependency.tenant_id = job.tenant_id
    AND dependency.id = job.depends_on_job_id
  LEFT JOIN LATERAL (
    SELECT selected.start_at, selected.end_at FROM tenancy.appointment_time_options selected
    WHERE selected.tenant_id = request.tenant_id AND selected.appointment_request_id = request.id
      AND selected.verification_status = 'confirmed'
    ORDER BY selected.preference_order, selected.id LIMIT 1
  ) option ON true
  WHERE job.id = target_id;
END;
$$;

CREATE FUNCTION tenancy.enqueue_repeated_appointment_reschedule() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE request_status text; profile_id uuid; previous_job_id uuid; reschedule_event_id uuid := gen_random_uuid();
BEGIN
  IF NEW.verification_status <> 'confirmed' OR OLD.verification_status = 'confirmed' THEN RETURN NEW; END IF;
  SELECT request.status INTO request_status FROM tenancy.appointment_requests request
    WHERE request.tenant_id = NEW.tenant_id AND request.id = NEW.appointment_request_id;
  IF request_status <> 'rescheduled' THEN RETURN NEW; END IF;
  SELECT job.scheduling_profile_id, job.id INTO profile_id, previous_job_id
    FROM tenancy.voice_scheduling_jobs job
    JOIN tenancy.voice_scheduling_profiles profile ON profile.tenant_id = job.tenant_id
      AND profile.id = job.scheduling_profile_id AND profile.status = 'active'
    WHERE job.tenant_id = NEW.tenant_id AND job.appointment_request_id = NEW.appointment_request_id
      AND job.operation IN ('create','update')
    ORDER BY job.created_at DESC, job.id DESC LIMIT 1;
  INSERT INTO tenancy.appointment_status_history (
    id, tenant_id, appointment_request_id, from_status, to_status
  ) VALUES (
    reschedule_event_id, NEW.tenant_id, NEW.appointment_request_id, 'rescheduled', 'rescheduled'
  );
  IF previous_job_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO tenancy.voice_scheduling_jobs (
    tenant_id, scheduling_profile_id, appointment_request_id, operation, depends_on_job_id, idempotency_key
  ) VALUES (
    NEW.tenant_id, profile_id, NEW.appointment_request_id, 'update', previous_job_id,
    'appointment:' || NEW.appointment_request_id::text || ':update:' || reschedule_event_id::text
  ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tenancy_appointment_repeat_reschedule_enqueue
  AFTER UPDATE OF verification_status ON tenancy.appointment_time_options
  FOR EACH ROW EXECUTE FUNCTION tenancy.enqueue_repeated_appointment_reschedule();

ALTER TABLE platform.dead_letter_replay_requests
  DROP CONSTRAINT dead_letter_replay_requests_queue_kind_check;
ALTER TABLE platform.dead_letter_replay_requests
  ADD CONSTRAINT dead_letter_replay_requests_queue_kind_check CHECK (
    queue_kind IN ('system_email', 'flowbot_email', 'ai_chat_email', 'appointment_calendar')
  );
ALTER TABLE platform.dead_letter_replay_requests
  ADD COLUMN expected_recovery_generation integer NOT NULL DEFAULT 0
    CHECK (expected_recovery_generation BETWEEN 0 AND 3);

CREATE FUNCTION platform.appointment_dead_letter_recovery_overview()
RETURNS TABLE (
  record_kind text, record_id uuid, queue_kind text, item_id uuid,
  attempt_count integer, safe_error_code text, occurred_at timestamptz,
  status text, reason text, requested_by_platform_user_id uuid,
  reviewed_by_platform_user_id uuid
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, platform, tenancy AS $$
BEGIN
  PERFORM platform.assert_dead_letter_recovery_context('list');
  RETURN QUERY
  SELECT 'recoverable'::text, job.id, 'appointment_calendar'::text, job.id,
    job.attempt_count, left(COALESCE(job.safe_error_code, 'calendar_delivery_failed'), 100),
    COALESCE(job.completed_at, job.created_at), 'dead_letter'::text, NULL::text, NULL::uuid, NULL::uuid
  FROM tenancy.voice_scheduling_jobs job
  WHERE job.status = 'dead_letter' AND job.recovery_generation < 3
    AND NOT EXISTS (
      SELECT 1 FROM platform.dead_letter_replay_requests request
      WHERE request.queue_kind = 'appointment_calendar' AND request.item_id = job.id
        AND request.status = 'requested'
    )
  ORDER BY job.completed_at DESC NULLS LAST, job.id DESC
  LIMIT 500;
END;
$$;

CREATE FUNCTION platform.request_appointment_dead_letter_replay(
  target_item_id uuid, target_attempt_count integer, target_reason text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, platform, tenancy AS $$
DECLARE actor_id uuid; request_id uuid; generation integer;
BEGIN
  actor_id := platform.assert_dead_letter_recovery_context('request');
  IF char_length(btrim(target_reason)) NOT BETWEEN 12 AND 500 THEN RETURN NULL; END IF;
  SELECT job.recovery_generation INTO generation FROM tenancy.voice_scheduling_jobs job
    WHERE job.id = target_item_id AND job.status = 'dead_letter'
      AND job.attempt_count = target_attempt_count AND job.recovery_generation < 3;
  IF generation IS NULL THEN RETURN NULL; END IF;
  INSERT INTO platform.dead_letter_replay_requests (
    queue_kind, item_id, expected_attempt_count, expected_recovery_generation,
    reason, requested_by_platform_user_id
  ) VALUES (
    'appointment_calendar', target_item_id, target_attempt_count, generation,
    btrim(target_reason), actor_id
  ) ON CONFLICT (queue_kind, item_id) WHERE status = 'requested' DO NOTHING
  RETURNING id INTO request_id;
  IF request_id IS NULL THEN RETURN NULL; END IF;
  INSERT INTO platform.audit_logs (
    actor_platform_user_id, action, target_type, target_id, request_id, reason, result, metadata
  ) VALUES (
    actor_id, 'dead_letter_replay.requested', 'dead_letter_replay_request', request_id::text,
    COALESCE(NULLIF(current_setting('app.request_id', true), ''), request_id::text), btrim(target_reason),
    'succeeded', jsonb_build_object('queueKind', 'appointment_calendar', 'itemId', target_item_id,
      'attemptCount', target_attempt_count, 'recoveryGeneration', generation)
  );
  RETURN request_id;
END;
$$;

CREATE FUNCTION platform.review_dead_letter_replay_v2(target_request_id uuid, decision text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, platform, operations, tenancy AS $$
DECLARE actor_id uuid; request_record platform.dead_letter_replay_requests%ROWTYPE; changed integer;
BEGIN
  actor_id := platform.assert_dead_letter_recovery_context(CASE WHEN decision = 'reject' THEN 'reject' ELSE 'approve' END);
  IF decision NOT IN ('approve', 'reject') THEN RETURN 'not_reviewable'; END IF;
  SELECT * INTO request_record FROM platform.dead_letter_replay_requests
    WHERE id = target_request_id AND status = 'requested' FOR UPDATE;
  IF NOT FOUND OR request_record.requested_by_platform_user_id = actor_id THEN RETURN 'not_reviewable'; END IF;
  IF decision = 'reject' THEN
    UPDATE platform.dead_letter_replay_requests SET status = 'rejected',
      reviewed_by_platform_user_id = actor_id, reviewed_at = now() WHERE id = target_request_id;
    INSERT INTO platform.audit_logs (actor_platform_user_id, action, target_type, target_id, request_id, result, metadata)
    VALUES (actor_id, 'dead_letter_replay.rejected', 'dead_letter_replay_request', target_request_id::text,
      COALESCE(NULLIF(current_setting('app.request_id', true), ''), target_request_id::text), 'succeeded',
      jsonb_build_object('queueKind', request_record.queue_kind, 'itemId', request_record.item_id));
    RETURN 'rejected';
  END IF;
  IF request_record.queue_kind = 'system_email' THEN
    UPDATE operations.outbox SET status = 'failed', available_at = now(), locked_at = NULL,
      processed_at = NULL, last_error_code = 'reviewed_replay'
    WHERE id = request_record.item_id AND status = 'dead_letter'
      AND attempt_count = request_record.expected_attempt_count
      AND topic IN ('auth.verify_email', 'auth.recover_password', 'tenant.invitation', 'tenant.ownership_transfer');
  ELSIF request_record.queue_kind IN ('flowbot_email', 'ai_chat_email') THEN
    UPDATE tenancy.outbox SET status = 'failed', available_at = now(), locked_at = NULL,
      processed_at = NULL, last_error_code = 'reviewed_replay'
    WHERE id = request_record.item_id AND status = 'dead_letter'
      AND attempt_count = request_record.expected_attempt_count
      AND topic = CASE request_record.queue_kind WHEN 'flowbot_email' THEN 'flowbot.merchant_email.requested'
        ELSE 'ai_chat.merchant_email.requested' END;
  ELSIF request_record.queue_kind = 'appointment_calendar' THEN
    UPDATE tenancy.voice_scheduling_jobs SET status = 'failed', attempt_count = 0,
      recovery_generation = recovery_generation + 1, available_at = now(), completed_at = NULL,
      safe_error_code = 'reviewed_replay'
    WHERE id = request_record.item_id AND status = 'dead_letter'
      AND attempt_count = request_record.expected_attempt_count
      AND recovery_generation = request_record.expected_recovery_generation
      AND recovery_generation < 3;
  END IF;
  GET DIAGNOSTICS changed = ROW_COUNT;
  UPDATE platform.dead_letter_replay_requests SET
    status = CASE WHEN changed = 1 THEN 'applied' ELSE 'invalidated' END,
    reviewed_by_platform_user_id = actor_id, reviewed_at = now(),
    applied_at = CASE WHEN changed = 1 THEN now() ELSE NULL END
  WHERE id = target_request_id;
  INSERT INTO platform.audit_logs (actor_platform_user_id, action, target_type, target_id, request_id, result, metadata)
  VALUES (actor_id, CASE WHEN changed = 1 THEN 'dead_letter_replay.applied' ELSE 'dead_letter_replay.invalidated' END,
    'dead_letter_replay_request', target_request_id::text,
    COALESCE(NULLIF(current_setting('app.request_id', true), ''), target_request_id::text),
    CASE WHEN changed = 1 THEN 'succeeded' ELSE 'failed' END,
    jsonb_build_object('queueKind', request_record.queue_kind, 'itemId', request_record.item_id,
      'attemptCount', request_record.expected_attempt_count,
      'recoveryGeneration', request_record.expected_recovery_generation));
  RETURN CASE WHEN changed = 1 THEN 'applied' ELSE 'invalidated' END;
END;
$$;

CREATE OR REPLACE FUNCTION tenancy.finish_appointment_sync_job(
  target_job_id uuid, succeeded boolean, target_external_event_ref text, target_safe_error_code text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE target tenancy.voice_scheduling_jobs%ROWTYPE; terminal boolean;
BEGIN
  IF current_setting('app.service', true) <> 'appointment_sync_worker' THEN RETURN false; END IF;
  SELECT * INTO target FROM tenancy.voice_scheduling_jobs WHERE id = target_job_id FOR UPDATE;
  IF target.id IS NULL OR target.status <> 'processing' THEN RETURN false; END IF;
  IF succeeded AND (target_external_event_ref IS NULL OR char_length(target_external_event_ref) NOT BETWEEN 1 AND 1000) THEN RETURN false; END IF;
  IF NOT succeeded AND (target_safe_error_code IS NULL OR target_safe_error_code !~ '^[a-z0-9_]{2,100}$') THEN RETURN false; END IF;
  terminal := NOT succeeded AND target.attempt_count >= 10;
  UPDATE tenancy.voice_scheduling_jobs SET
    status = CASE WHEN succeeded THEN 'confirmed' WHEN terminal THEN 'dead_letter' ELSE 'failed' END,
    external_event_ref = CASE WHEN succeeded THEN target_external_event_ref ELSE external_event_ref END,
    safe_error_code = CASE WHEN succeeded THEN NULL ELSE target_safe_error_code END,
    available_at = CASE WHEN succeeded OR terminal THEN available_at
      ELSE now() + make_interval(secs => LEAST(3600, 15 * (2 ^ LEAST(target.attempt_count, 8))::integer)) END,
    completed_at = CASE WHEN succeeded OR terminal THEN now() ELSE NULL END
  WHERE id = target_job_id;
  INSERT INTO tenancy.appointment_sync_attempts (
    tenant_id, scheduling_job_id, recovery_generation, attempt_number,
    outcome, safe_error_code, external_reference_sha256
  ) VALUES (
    target.tenant_id, target.id, target.recovery_generation, target.attempt_count,
    CASE WHEN succeeded THEN 'succeeded' WHEN terminal THEN 'dead_letter' ELSE 'failed' END,
    CASE WHEN succeeded THEN NULL ELSE target_safe_error_code END,
    CASE WHEN succeeded THEN sha256(convert_to(target_external_event_ref, 'UTF8')) ELSE NULL END
  ) ON CONFLICT (tenant_id, scheduling_job_id, recovery_generation, attempt_number) DO NOTHING;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION tenancy.enqueue_repeated_appointment_reschedule() FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.appointment_dead_letter_recovery_overview() FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.request_appointment_dead_letter_replay(uuid,integer,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.review_dead_letter_replay_v2(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.appointment_dead_letter_recovery_overview() TO djay_platform;
GRANT EXECUTE ON FUNCTION platform.request_appointment_dead_letter_replay(uuid,integer,text) TO djay_platform;
GRANT EXECUTE ON FUNCTION platform.review_dead_letter_replay_v2(uuid,text) TO djay_platform;
