CREATE TABLE billing.webhook_recovery_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_event_id uuid NOT NULL UNIQUE REFERENCES billing.webhook_events(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'attention', 'recovered', 'failed')),
  reason_code text NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE billing.provider_webhook_event_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_event_id uuid NOT NULL REFERENCES billing.webhook_events(id) ON DELETE RESTRICT,
  provider_key text NOT NULL CHECK (provider_key = 'stripe'),
  external_event_id text NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  payload_sha256 bytea NOT NULL CHECK (octet_length(payload_sha256) = 32),
  payload_ciphertext text NOT NULL,
  retrieved_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (webhook_event_id, payload_sha256)
);

CREATE TRIGGER billing_provider_webhook_snapshot_immutable
BEFORE UPDATE OR DELETE ON billing.provider_webhook_event_snapshots
FOR EACH ROW EXECUTE FUNCTION billing.reject_financial_evidence_change();

CREATE TABLE platform.webhook_recovery_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_recovery_job_id uuid NOT NULL UNIQUE REFERENCES billing.webhook_recovery_jobs(id) ON DELETE RESTRICT,
  requested_action text NOT NULL CHECK (requested_action IN ('retry_application', 'accept_unsupported', 'escalate_provider')),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 8 AND 1000),
  requested_by_platform_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL
);

CREATE TABLE platform.webhook_recovery_case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES platform.webhook_recovery_cases(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('requested', 'approved', 'rejected', 'executed')),
  actor_platform_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  safe_note text,
  recorded_at timestamptz NOT NULL
);

CREATE TRIGGER platform_webhook_recovery_case_immutable
BEFORE UPDATE OR DELETE ON platform.webhook_recovery_cases
FOR EACH ROW EXECUTE FUNCTION tenancy.reject_immutable_change();
CREATE TRIGGER platform_webhook_recovery_case_event_immutable
BEFORE UPDATE OR DELETE ON platform.webhook_recovery_case_events
FOR EACH ROW EXECUTE FUNCTION tenancy.reject_immutable_change();

CREATE OR REPLACE FUNCTION billing.queue_ignored_stripe_webhook_recovery()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, billing AS $$
BEGIN
  IF NEW.provider_key = 'stripe' AND NEW.status = 'ignored'
     AND NEW.last_error_code IN ('authority_not_found', 'unknown_provider_state', 'invalid_transition') THEN
    INSERT INTO billing.webhook_recovery_jobs (webhook_event_id, reason_code, available_at)
    VALUES (NEW.id, NEW.last_error_code, NEW.applied_at)
    ON CONFLICT (webhook_event_id) DO UPDATE SET status = 'queued',
      reason_code = EXCLUDED.reason_code, available_at = EXCLUDED.available_at,
      completed_at = NULL, last_error_code = NULL, updated_at = EXCLUDED.available_at;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER billing_ignored_stripe_webhook_recovery_queued
AFTER UPDATE OF status, last_error_code ON billing.webhook_events
FOR EACH ROW EXECUTE FUNCTION billing.queue_ignored_stripe_webhook_recovery();

CREATE OR REPLACE FUNCTION billing.claim_webhook_recovery(
  claimed_at_value timestamptz DEFAULT now(), stale_before timestamptz DEFAULT now() - interval '10 minutes'
)
RETURNS TABLE (
  job_id uuid, webhook_event_id uuid, external_event_id text,
  event_type text, reason_code text, attempt_count integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, billing AS $$
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'billing_webhook_recovery_worker' THEN
    RAISE EXCEPTION 'billing_webhook_recovery_worker_authority_required';
  END IF;
  RETURN QUERY WITH candidate AS (
    SELECT job.id FROM billing.webhook_recovery_jobs job
    WHERE (job.status = 'queued' AND job.available_at <= claimed_at_value)
       OR (job.status = 'processing' AND job.claimed_at < stale_before)
    ORDER BY job.available_at, job.id FOR UPDATE SKIP LOCKED LIMIT 1
  ), claimed AS (
    UPDATE billing.webhook_recovery_jobs job SET status = 'processing',
      attempt_count = job.attempt_count + 1, claimed_at = claimed_at_value,
      last_error_code = NULL, updated_at = claimed_at_value
    FROM candidate WHERE job.id = candidate.id RETURNING job.*
  ) SELECT claimed.id, claimed.webhook_event_id, event.external_event_id,
      event.event_type, claimed.reason_code, claimed.attempt_count
    FROM claimed JOIN billing.webhook_events event ON event.id = claimed.webhook_event_id;
END
$$;

CREATE OR REPLACE FUNCTION billing.record_webhook_recovery_evidence(
  target_job_id uuid, provider_external_event_id text, provider_event_type text,
  provider_occurred_at timestamptz, provider_payload_sha256 bytea,
  provider_payload_ciphertext text, retrieved_at_value timestamptz DEFAULT now()
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, billing AS $$
DECLARE job billing.webhook_recovery_jobs%ROWTYPE; event billing.webhook_events%ROWTYPE;
  result_value text;
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'billing_webhook_recovery_worker' THEN
    RAISE EXCEPTION 'billing_webhook_recovery_worker_authority_required';
  END IF;
  SELECT * INTO job FROM billing.webhook_recovery_jobs WHERE id = target_job_id FOR UPDATE;
  IF job.id IS NULL OR job.status <> 'processing' THEN RAISE EXCEPTION 'webhook_recovery_job_not_claimed'; END IF;
  SELECT * INTO event FROM billing.webhook_events WHERE id = job.webhook_event_id;
  IF provider_payload_ciphertext IS NULL OR octet_length(provider_payload_sha256) <> 32 THEN
    RAISE EXCEPTION 'provider_webhook_snapshot_invalid';
  END IF;
  INSERT INTO billing.provider_webhook_event_snapshots (
    webhook_event_id, provider_key, external_event_id, event_type, occurred_at,
    payload_sha256, payload_ciphertext, retrieved_at
  ) VALUES (event.id, 'stripe', provider_external_event_id, provider_event_type,
    provider_occurred_at, provider_payload_sha256, provider_payload_ciphertext, retrieved_at_value)
  ON CONFLICT DO NOTHING;
  result_value := CASE
    WHEN provider_external_event_id IS DISTINCT FROM event.external_event_id THEN 'reference_mismatch'
    WHEN provider_event_type IS DISTINCT FROM event.event_type THEN 'type_mismatch'
    WHEN provider_occurred_at IS DISTINCT FROM event.occurred_at THEN 'timestamp_mismatch'
    ELSE 'provider_confirmed' END;
  UPDATE billing.webhook_recovery_jobs SET status = 'attention', completed_at = retrieved_at_value,
    last_error_code = CASE WHEN result_value = 'provider_confirmed' THEN reason_code ELSE result_value END,
    updated_at = retrieved_at_value WHERE id = job.id;
  RETURN result_value;
END
$$;

CREATE OR REPLACE FUNCTION billing.fail_webhook_recovery(
  target_job_id uuid, error_code_value text, dead_letter boolean,
  retry_at_value timestamptz DEFAULT now() + interval '5 minutes'
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, billing AS $$
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'billing_webhook_recovery_worker' THEN
    RAISE EXCEPTION 'billing_webhook_recovery_worker_authority_required';
  END IF;
  UPDATE billing.webhook_recovery_jobs SET status = CASE WHEN dead_letter THEN 'failed' ELSE 'queued' END,
    available_at = retry_at_value, completed_at = CASE WHEN dead_letter THEN now() ELSE NULL END,
    last_error_code = left(COALESCE(error_code_value, 'provider_event_retrieval_failed'), 100),
    updated_at = now() WHERE id = target_job_id AND status = 'processing';
  RETURN FOUND;
END
$$;

CREATE OR REPLACE FUNCTION platform.request_webhook_recovery_case(
  target_job_id uuid, action_value text, reason_value text, requested_at_value timestamptz DEFAULT now()
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform, billing AS $$
DECLARE actor_id uuid; actor_role text; job billing.webhook_recovery_jobs%ROWTYPE; case_id uuid;
BEGIN
  actor_id := NULLIF(current_setting('app.platform_user_id', true), '')::uuid;
  actor_role := current_setting('app.platform_role', true);
  IF session_user <> 'djay_platform' OR actor_id IS NULL
     OR actor_role NOT IN ('platform_owner', 'platform_finance') THEN
    RAISE EXCEPTION 'platform_finance_authority_required';
  END IF;
  IF action_value NOT IN ('retry_application', 'accept_unsupported', 'escalate_provider')
     OR char_length(reason_value) NOT BETWEEN 8 AND 1000 THEN RAISE EXCEPTION 'webhook_recovery_case_invalid'; END IF;
  SELECT * INTO job FROM billing.webhook_recovery_jobs WHERE id = target_job_id AND status = 'attention';
  IF job.id IS NULL THEN RAISE EXCEPTION 'webhook_recovery_attention_required'; END IF;
  case_id := gen_random_uuid();
  INSERT INTO platform.webhook_recovery_cases (
    id, webhook_recovery_job_id, requested_action, reason,
    requested_by_platform_user_id, requested_at
  ) VALUES (case_id, job.id, action_value, reason_value, actor_id, requested_at_value);
  INSERT INTO platform.webhook_recovery_case_events (
    case_id, event_type, actor_platform_user_id, safe_note, recorded_at
  ) VALUES (case_id, 'requested', actor_id, reason_value, requested_at_value);
  RETURN case_id;
END
$$;

CREATE OR REPLACE FUNCTION platform.review_webhook_recovery_case(
  target_case_id uuid, approve boolean, note_value text, reviewed_at_value timestamptz DEFAULT now()
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform, billing AS $$
DECLARE actor_id uuid; actor_role text; target platform.webhook_recovery_cases%ROWTYPE;
  event_value text; job billing.webhook_recovery_jobs%ROWTYPE;
BEGIN
  actor_id := NULLIF(current_setting('app.platform_user_id', true), '')::uuid;
  actor_role := current_setting('app.platform_role', true);
  IF session_user <> 'djay_platform' OR actor_id IS NULL
     OR actor_role NOT IN ('platform_owner', 'platform_finance') THEN
    RAISE EXCEPTION 'platform_finance_authority_required';
  END IF;
  IF char_length(note_value) NOT BETWEEN 8 AND 1000 THEN RAISE EXCEPTION 'review_note_invalid'; END IF;
  SELECT * INTO target FROM platform.webhook_recovery_cases WHERE id = target_case_id;
  IF target.id IS NULL OR EXISTS (SELECT 1 FROM platform.webhook_recovery_case_events event
    WHERE event.case_id = target.id AND event.event_type IN ('approved', 'rejected')) THEN
    RAISE EXCEPTION 'webhook_recovery_case_not_reviewable';
  END IF;
  IF target.requested_by_platform_user_id = actor_id THEN RAISE EXCEPTION 'different_reviewer_required'; END IF;
  event_value := CASE WHEN approve THEN 'approved' ELSE 'rejected' END;
  INSERT INTO platform.webhook_recovery_case_events (
    case_id, event_type, actor_platform_user_id, safe_note, recorded_at
  ) VALUES (target.id, event_value, actor_id, note_value, reviewed_at_value);
  IF NOT approve THEN RETURN 'rejected'; END IF;
  SELECT * INTO job FROM billing.webhook_recovery_jobs WHERE id = target.webhook_recovery_job_id FOR UPDATE;
  IF target.requested_action = 'retry_application' THEN
    UPDATE billing.webhook_events SET status = 'received', applied_at = NULL, last_error_code = NULL
    WHERE id = job.webhook_event_id AND status = 'ignored';
  END IF;
  UPDATE billing.webhook_recovery_jobs SET status = 'recovered', completed_at = reviewed_at_value,
    updated_at = reviewed_at_value WHERE id = job.id;
  INSERT INTO platform.webhook_recovery_case_events (
    case_id, event_type, actor_platform_user_id, safe_note, recorded_at
  ) VALUES (target.id, 'executed', actor_id, target.requested_action, reviewed_at_value);
  RETURN 'approved';
END
$$;

CREATE OR REPLACE FUNCTION platform.list_webhook_recovery()
RETURNS TABLE (
  job_id uuid, webhook_event_id uuid, external_event_id text, event_type text,
  reason_code text, status text, attempt_count integer, occurred_at timestamptz,
  provider_evidence_count integer, case_id uuid, requested_action text,
  requested_by_platform_user_id uuid, review_status text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, platform, billing AS $$
DECLARE actor_role text;
BEGIN
  actor_role := current_setting('app.platform_role', true);
  IF session_user <> 'djay_platform' OR actor_role NOT IN ('platform_owner', 'platform_finance') THEN
    RAISE EXCEPTION 'platform_finance_authority_required';
  END IF;
  RETURN QUERY SELECT job.id, event.id, event.external_event_id, event.event_type,
    job.reason_code, job.status, job.attempt_count, event.occurred_at,
    (SELECT count(*)::int FROM billing.provider_webhook_event_snapshots snapshot
      WHERE snapshot.webhook_event_id = event.id),
    remediation.id, remediation.requested_action, remediation.requested_by_platform_user_id,
    (SELECT case_event.event_type FROM platform.webhook_recovery_case_events case_event
      WHERE case_event.case_id = remediation.id AND case_event.event_type IN ('approved', 'rejected')
      ORDER BY case_event.recorded_at DESC LIMIT 1)
  FROM billing.webhook_recovery_jobs job
  JOIN billing.webhook_events event ON event.id = job.webhook_event_id
  LEFT JOIN platform.webhook_recovery_cases remediation
    ON remediation.webhook_recovery_job_id = job.id
  ORDER BY (job.status IN ('attention', 'failed')) DESC, event.occurred_at, job.id
  LIMIT 500;
END
$$;

ALTER TABLE billing.webhook_recovery_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.webhook_recovery_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE billing.provider_webhook_event_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.provider_webhook_event_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.webhook_recovery_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.webhook_recovery_cases FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.webhook_recovery_case_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.webhook_recovery_case_events FORCE ROW LEVEL SECURITY;

CREATE POLICY worker_webhook_recovery_jobs ON billing.webhook_recovery_jobs TO djay_worker USING (true) WITH CHECK (true);
CREATE POLICY platform_webhook_recovery_jobs ON billing.webhook_recovery_jobs FOR SELECT TO djay_platform USING (true);
CREATE POLICY worker_provider_webhook_snapshots ON billing.provider_webhook_event_snapshots TO djay_worker USING (true) WITH CHECK (true);
CREATE POLICY platform_provider_webhook_snapshots ON billing.provider_webhook_event_snapshots FOR SELECT TO djay_platform USING (true);
CREATE POLICY platform_webhook_recovery_cases_access ON platform.webhook_recovery_cases TO djay_platform USING (true) WITH CHECK (true);
CREATE POLICY platform_webhook_recovery_case_events_access ON platform.webhook_recovery_case_events TO djay_platform USING (true) WITH CHECK (true);

REVOKE ALL ON billing.webhook_recovery_jobs, billing.provider_webhook_event_snapshots,
  platform.webhook_recovery_cases, platform.webhook_recovery_case_events FROM PUBLIC;
REVOKE ALL ON FUNCTION billing.claim_webhook_recovery(timestamptz, timestamptz),
  billing.record_webhook_recovery_evidence(uuid, text, text, timestamptz, bytea, text, timestamptz),
  billing.fail_webhook_recovery(uuid, text, boolean, timestamptz),
  platform.request_webhook_recovery_case(uuid, text, text, timestamptz),
  platform.review_webhook_recovery_case(uuid, boolean, text, timestamptz),
  platform.list_webhook_recovery() FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON billing.webhook_recovery_jobs TO djay_worker;
GRANT SELECT, INSERT ON billing.provider_webhook_event_snapshots TO djay_worker;
GRANT SELECT ON billing.webhook_recovery_jobs, billing.provider_webhook_event_snapshots TO djay_platform, djay_readonly_ops;
GRANT SELECT, INSERT ON platform.webhook_recovery_cases,
  platform.webhook_recovery_case_events TO djay_platform;
GRANT SELECT ON platform.webhook_recovery_cases,
  platform.webhook_recovery_case_events TO djay_readonly_ops;
GRANT EXECUTE ON FUNCTION billing.claim_webhook_recovery(timestamptz, timestamptz),
  billing.record_webhook_recovery_evidence(uuid, text, text, timestamptz, bytea, text, timestamptz),
  billing.fail_webhook_recovery(uuid, text, boolean, timestamptz) TO djay_worker;
GRANT EXECUTE ON FUNCTION platform.request_webhook_recovery_case(uuid, text, text, timestamptz),
  platform.review_webhook_recovery_case(uuid, boolean, text, timestamptz),
  platform.list_webhook_recovery() TO djay_platform;
