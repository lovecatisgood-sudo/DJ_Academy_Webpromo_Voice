-- Provider-confirmed appointment synchronization. Local merchant confirmation and an
-- external calendar outcome remain separate authorities at every layer.
ALTER TABLE tenancy.appointment_requests DROP CONSTRAINT appointment_requests_status_check;
ALTER TABLE tenancy.appointment_requests ADD CONSTRAINT appointment_requests_status_check CHECK (status IN (
  'requested','pending_confirmation','confirmed','rescheduled','completed','cancelled','rejected','no_show'
));
ALTER TABLE tenancy.appointment_status_history DROP CONSTRAINT appointment_status_history_to_status_check;
ALTER TABLE tenancy.appointment_status_history ADD CONSTRAINT appointment_status_history_to_status_check CHECK (to_status IN (
  'requested','pending_confirmation','confirmed','rescheduled','completed','cancelled','rejected','no_show'
));

ALTER TABLE tenancy.voice_scheduling_jobs
  ADD COLUMN operation text NOT NULL DEFAULT 'create' CHECK (operation IN ('create','update','cancel'));
CREATE INDEX tenancy_voice_scheduling_jobs_claim_idx
  ON tenancy.voice_scheduling_jobs (available_at, created_at, id)
  WHERE status IN ('pending','failed');

CREATE TABLE tenancy.appointment_sync_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  scheduling_job_id uuid NOT NULL,
  attempt_number integer NOT NULL CHECK (attempt_number BETWEEN 1 AND 10),
  outcome text NOT NULL CHECK (outcome IN ('succeeded','failed','dead_letter')),
  safe_error_code text CHECK (safe_error_code IS NULL OR safe_error_code ~ '^[a-z0-9_]{2,100}$'),
  external_reference_sha256 bytea CHECK (external_reference_sha256 IS NULL OR octet_length(external_reference_sha256) = 32),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, scheduling_job_id, attempt_number),
  FOREIGN KEY (tenant_id, scheduling_job_id)
    REFERENCES tenancy.voice_scheduling_jobs(tenant_id, id) ON DELETE RESTRICT,
  CHECK ((outcome = 'succeeded' AND safe_error_code IS NULL) OR (outcome <> 'succeeded' AND safe_error_code IS NOT NULL))
);
CREATE INDEX tenancy_appointment_sync_attempts_timeline_idx
  ON tenancy.appointment_sync_attempts (tenant_id, scheduling_job_id, occurred_at, id);
CREATE TRIGGER tenancy_appointment_sync_attempts_immutable
  BEFORE UPDATE OR DELETE ON tenancy.appointment_sync_attempts
  FOR EACH ROW EXECUTE FUNCTION tenancy.reject_immutable_change();

CREATE FUNCTION tenancy.enqueue_appointment_calendar_sync() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE profile_id uuid; selected_option_id uuid; operation_value text;
BEGIN
  IF TG_OP <> 'UPDATE' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  operation_value := CASE NEW.status WHEN 'confirmed' THEN 'create' WHEN 'rescheduled' THEN 'update'
    WHEN 'cancelled' THEN 'cancel' ELSE NULL END;
  IF operation_value IS NULL OR (operation_value = 'cancel' AND OLD.status NOT IN ('confirmed','rescheduled')) THEN RETURN NEW; END IF;
  IF operation_value <> 'cancel' THEN
    SELECT profile.id INTO profile_id FROM tenancy.voice_scheduling_profiles profile
      WHERE profile.tenant_id = NEW.tenant_id AND profile.status = 'active'
      ORDER BY profile.created_at, profile.id LIMIT 1;
    IF profile_id IS NULL THEN RETURN NEW; END IF;
    SELECT option.id INTO selected_option_id FROM tenancy.appointment_time_options option
      WHERE option.tenant_id = NEW.tenant_id AND option.appointment_request_id = NEW.id
        AND option.verification_status = 'confirmed'
      ORDER BY option.preference_order, option.id LIMIT 1;
    IF selected_option_id IS NULL THEN RETURN NEW; END IF;
  ELSE
    SELECT job.scheduling_profile_id, job.id INTO profile_id, selected_option_id
    FROM tenancy.voice_scheduling_jobs job
    JOIN tenancy.voice_scheduling_profiles profile ON profile.tenant_id = job.tenant_id
      AND profile.id = job.scheduling_profile_id AND profile.status = 'active'
      WHERE job.tenant_id = NEW.tenant_id AND job.appointment_request_id = NEW.id
        AND job.status = 'confirmed' AND job.operation IN ('create','update')
      ORDER BY job.completed_at DESC, job.id DESC LIMIT 1;
    IF selected_option_id IS NULL THEN RETURN NEW; END IF;
  END IF;
  INSERT INTO tenancy.voice_scheduling_jobs (
    tenant_id, scheduling_profile_id, appointment_request_id, operation, idempotency_key
  ) VALUES (
    NEW.tenant_id, profile_id, NEW.id, operation_value,
    'appointment:' || NEW.id::text || ':' || operation_value || ':' || selected_option_id::text
  ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER tenancy_appointment_calendar_sync_enqueue
  AFTER UPDATE OF status ON tenancy.appointment_requests
  FOR EACH ROW EXECUTE FUNCTION tenancy.enqueue_appointment_calendar_sync();

CREATE FUNCTION tenancy.claim_appointment_sync_job(claimed_at timestamptz, stale_before timestamptz)
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
    AND (job.operation = 'create' OR EXISTS (
      SELECT 1 FROM tenancy.voice_scheduling_jobs prior
      WHERE prior.tenant_id = job.tenant_id AND prior.appointment_request_id = job.appointment_request_id
        AND prior.operation IN ('create','update') AND prior.status = 'confirmed' AND prior.external_event_ref IS NOT NULL
    ))
  ORDER BY job.available_at, job.created_at, job.id FOR UPDATE SKIP LOCKED LIMIT 1;
  IF target_id IS NULL THEN RETURN; END IF;
  UPDATE tenancy.voice_scheduling_jobs job SET status = 'processing', attempt_count = job.attempt_count + 1,
    available_at = claimed_at + interval '5 minutes'
  WHERE job.id = target_id;
  RETURN QUERY SELECT job.id, job.tenant_id, job.appointment_request_id, job.operation,
    profile.provider_kind, profile.config_ciphertext, option.start_at, option.end_at,
    request.timezone,
    CASE WHEN job.operation = 'create' THEN NULL ELSE (
      SELECT prior.external_event_ref FROM tenancy.voice_scheduling_jobs prior
      WHERE prior.tenant_id = job.tenant_id AND prior.appointment_request_id = job.appointment_request_id
        AND prior.operation IN ('create','update') AND prior.status = 'confirmed' AND prior.external_event_ref IS NOT NULL
      ORDER BY prior.completed_at DESC, prior.id DESC LIMIT 1
    ) END,
    job.attempt_count
  FROM tenancy.voice_scheduling_jobs job
  JOIN tenancy.voice_scheduling_profiles profile ON profile.tenant_id = job.tenant_id
    AND profile.id = job.scheduling_profile_id AND profile.status = 'active'
  JOIN tenancy.appointment_requests request ON request.tenant_id = job.tenant_id
    AND request.id = job.appointment_request_id
  LEFT JOIN LATERAL (
    SELECT selected.start_at, selected.end_at FROM tenancy.appointment_time_options selected
    WHERE selected.tenant_id = request.tenant_id AND selected.appointment_request_id = request.id
      AND selected.verification_status = 'confirmed'
    ORDER BY selected.preference_order, selected.id LIMIT 1
  ) option ON true
  WHERE job.id = target_id;
END;
$$;

CREATE FUNCTION tenancy.finish_appointment_sync_job(
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
  WHERE id = target.id;
  INSERT INTO tenancy.appointment_sync_attempts (
    tenant_id, scheduling_job_id, attempt_number, outcome, safe_error_code, external_reference_sha256
  ) VALUES (
    target.tenant_id, target.id, target.attempt_count,
    CASE WHEN succeeded THEN 'succeeded' WHEN terminal THEN 'dead_letter' ELSE 'failed' END,
    CASE WHEN succeeded THEN NULL ELSE target_safe_error_code END,
    CASE WHEN succeeded THEN sha256(convert_to(target_external_event_ref, 'UTF8')) ELSE NULL END
  );
  RETURN true;
END;
$$;

CREATE FUNCTION tenancy.capture_appointment_sync_notification() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE request_id uuid; kind_value text;
BEGIN
  SELECT job.appointment_request_id INTO request_id FROM tenancy.voice_scheduling_jobs job
    WHERE job.tenant_id = NEW.tenant_id AND job.id = NEW.scheduling_job_id;
  kind_value := 'appointment.sync_' || NEW.outcome;
  PERFORM tenancy.queue_tenant_notification(
    NEW.tenant_id, 'appointment_sync_attempt:' || NEW.id::text,
    CASE WHEN NEW.outcome = 'succeeded' THEN 'completed' ELSE 'action_needed' END,
    CASE WHEN NEW.outcome = 'succeeded' THEN 'success' WHEN NEW.outcome = 'dead_letter' THEN 'critical' ELSE 'warning' END,
    kind_value, 'appointment_request', request_id, '/workspace/appointments', NEW.occurred_at
  );
  RETURN NEW;
END;
$$;
CREATE TRIGGER tenancy_appointment_sync_notification_center
  AFTER INSERT ON tenancy.appointment_sync_attempts
  FOR EACH ROW EXECUTE FUNCTION tenancy.capture_appointment_sync_notification();

ALTER TABLE tenancy.appointment_sync_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.appointment_sync_attempts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.appointment_sync_attempts
  USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
REVOKE ALL ON tenancy.appointment_sync_attempts FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.enqueue_appointment_calendar_sync() FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.claim_appointment_sync_job(timestamptz,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.finish_appointment_sync_job(uuid,boolean,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.capture_appointment_sync_notification() FROM PUBLIC;
GRANT SELECT ON tenancy.appointment_sync_attempts TO djay_runtime;
GRANT EXECUTE ON FUNCTION tenancy.claim_appointment_sync_job(timestamptz,timestamptz) TO djay_worker;
GRANT EXECUTE ON FUNCTION tenancy.finish_appointment_sync_job(uuid,boolean,text,text) TO djay_worker;
