CREATE TABLE billing.accounting_reconciliation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  accounting_reference_id uuid NOT NULL UNIQUE REFERENCES billing.accounting_external_references(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  last_error_code text,
  UNIQUE (tenant_id, id)
);

CREATE TABLE billing.accounting_provider_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  accounting_reference_id uuid NOT NULL REFERENCES billing.accounting_external_references(id) ON DELETE RESTRICT,
  found boolean NOT NULL,
  external_record_ref text,
  external_document_ref text,
  idempotency_reference text,
  provider_status text,
  currency text,
  total_minor bigint CHECK (total_minor IS NULL OR total_minor >= 0),
  payload_sha256 bytea NOT NULL CHECK (octet_length(payload_sha256) = 32),
  payload_ciphertext text NOT NULL,
  retrieved_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (accounting_reference_id, payload_sha256),
  UNIQUE (tenant_id, id),
  CHECK (found OR (external_record_ref IS NULL AND external_document_ref IS NULL
    AND idempotency_reference IS NULL AND provider_status IS NULL AND currency IS NULL AND total_minor IS NULL))
);

CREATE TABLE billing.accounting_reconciliation_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  accounting_reference_id uuid NOT NULL REFERENCES billing.accounting_external_references(id) ON DELETE RESTRICT,
  provider_snapshot_id uuid NOT NULL REFERENCES billing.accounting_provider_snapshots(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('matched', 'missing_remote', 'reference_mismatch', 'currency_mismatch', 'amount_mismatch')),
  differences jsonb NOT NULL,
  reconciled_at timestamptz NOT NULL,
  UNIQUE (accounting_reference_id, provider_snapshot_id),
  UNIQUE (tenant_id, id)
);

CREATE TABLE platform.accounting_reconciliation_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  reconciliation_result_id uuid NOT NULL UNIQUE REFERENCES billing.accounting_reconciliation_results(id) ON DELETE RESTRICT,
  requested_action text NOT NULL CHECK (requested_action IN ('investigate', 'retry_retrieval', 'request_flowaccount_correction', 'credit_and_replace')),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 8 AND 1000),
  requested_by_platform_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL
);

CREATE TABLE platform.accounting_reconciliation_case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  case_id uuid NOT NULL REFERENCES platform.accounting_reconciliation_cases(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('requested', 'approved', 'rejected', 'executed', 'execution_failed')),
  actor_platform_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  safe_note text,
  created_at timestamptz NOT NULL,
  UNIQUE (tenant_id, id)
);

CREATE TRIGGER billing_accounting_provider_snapshot_immutable
BEFORE UPDATE OR DELETE ON billing.accounting_provider_snapshots
FOR EACH ROW EXECUTE FUNCTION billing.reject_financial_evidence_change();
CREATE TRIGGER billing_accounting_reconciliation_result_immutable
BEFORE UPDATE OR DELETE ON billing.accounting_reconciliation_results
FOR EACH ROW EXECUTE FUNCTION billing.reject_financial_evidence_change();
CREATE TRIGGER platform_accounting_reconciliation_case_immutable
BEFORE UPDATE OR DELETE ON platform.accounting_reconciliation_cases
FOR EACH ROW EXECUTE FUNCTION tenancy.reject_immutable_change();
CREATE TRIGGER platform_accounting_reconciliation_case_event_immutable
BEFORE UPDATE OR DELETE ON platform.accounting_reconciliation_case_events
FOR EACH ROW EXECUTE FUNCTION tenancy.reject_immutable_change();

CREATE OR REPLACE FUNCTION billing.queue_accounting_reconciliation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, billing AS $$
BEGIN
  INSERT INTO billing.accounting_reconciliation_jobs (tenant_id, accounting_reference_id, available_at)
  VALUES (NEW.tenant_id, NEW.id, NEW.created_at) ON CONFLICT DO NOTHING;
  RETURN NEW;
END
$$;
CREATE TRIGGER billing_accounting_reference_reconciliation_queued
AFTER INSERT ON billing.accounting_external_references
FOR EACH ROW EXECUTE FUNCTION billing.queue_accounting_reconciliation();
INSERT INTO billing.accounting_reconciliation_jobs (tenant_id, accounting_reference_id, available_at)
SELECT tenant_id, id, created_at FROM billing.accounting_external_references ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION billing.claim_accounting_reconciliation(
  claimed_at_value timestamptz DEFAULT now(), stale_before timestamptz DEFAULT now() - interval '10 minutes'
)
RETURNS TABLE (
  job_id uuid, tenant_id uuid, accounting_reference_id uuid, external_record_ref text,
  external_document_ref text, idempotency_reference text, attempt_count integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, billing AS $$
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'accounting_reconciliation_worker' THEN
    RAISE EXCEPTION 'accounting_reconciliation_worker_authority_required';
  END IF;
  RETURN QUERY WITH candidate AS (
    SELECT source.id FROM billing.accounting_reconciliation_jobs source
    WHERE (source.status = 'queued' AND source.available_at <= claimed_at_value)
       OR (source.status = 'processing' AND source.claimed_at < stale_before)
    ORDER BY source.available_at, source.id FOR UPDATE SKIP LOCKED LIMIT 1
  ), claimed AS (
    UPDATE billing.accounting_reconciliation_jobs job SET status = 'processing',
      attempt_count = job.attempt_count + 1, claimed_at = claimed_at_value, last_error_code = NULL
    FROM candidate WHERE job.id = candidate.id RETURNING job.*
  ) SELECT claimed.id, claimed.tenant_id, reference.id, reference.external_record_ref,
      reference.external_document_ref, reference.idempotency_reference, claimed.attempt_count
    FROM claimed JOIN billing.accounting_external_references reference
      ON reference.id = claimed.accounting_reference_id;
END
$$;

CREATE OR REPLACE FUNCTION billing.record_accounting_reconciliation(
  target_job_id uuid, provider_found boolean, provider_external_record_ref text,
  provider_external_document_ref text, provider_idempotency_reference text, provider_status text,
  provider_currency text, provider_total_minor bigint, provider_payload_sha256 bytea,
  provider_payload_ciphertext text, retrieved_at_value timestamptz DEFAULT now()
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, billing AS $$
DECLARE job billing.accounting_reconciliation_jobs%ROWTYPE;
  reference billing.accounting_external_references%ROWTYPE; sync_job billing.accounting_sync_jobs%ROWTYPE;
  local_currency text; local_total bigint; snapshot_id uuid; result_status text; diff jsonb;
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'accounting_reconciliation_worker' THEN
    RAISE EXCEPTION 'accounting_reconciliation_worker_authority_required';
  END IF;
  SELECT * INTO job FROM billing.accounting_reconciliation_jobs WHERE id = target_job_id FOR UPDATE;
  IF job.id IS NULL OR job.status <> 'processing' THEN RAISE EXCEPTION 'accounting_reconciliation_job_not_claimed'; END IF;
  SELECT * INTO reference FROM billing.accounting_external_references WHERE id = job.accounting_reference_id;
  SELECT * INTO sync_job FROM billing.accounting_sync_jobs WHERE id = reference.sync_job_id;
  IF sync_job.document_kind = 'invoice' THEN
    SELECT currency, total_minor INTO local_currency, local_total FROM billing.invoice_documents WHERE id = sync_job.invoice_document_id;
  ELSE
    SELECT currency, total_minor INTO local_currency, local_total FROM billing.credit_note_documents WHERE id = sync_job.credit_note_document_id;
  END IF;
  IF octet_length(provider_payload_sha256) <> 32 OR provider_payload_ciphertext IS NULL
     OR (provider_found AND (provider_external_record_ref IS NULL OR provider_currency IS NULL OR provider_total_minor IS NULL))
     OR (provider_total_minor IS NOT NULL AND provider_total_minor < 0) THEN
    RAISE EXCEPTION 'accounting_provider_snapshot_invalid';
  END IF;
  INSERT INTO billing.accounting_provider_snapshots (
    tenant_id, accounting_reference_id, found, external_record_ref, external_document_ref,
    idempotency_reference, provider_status, currency, total_minor, payload_sha256,
    payload_ciphertext, retrieved_at
  ) VALUES (job.tenant_id, reference.id, provider_found,
    CASE WHEN provider_found THEN provider_external_record_ref END,
    CASE WHEN provider_found THEN provider_external_document_ref END,
    CASE WHEN provider_found THEN provider_idempotency_reference END,
    CASE WHEN provider_found THEN provider_status END,
    CASE WHEN provider_found THEN upper(provider_currency) END,
    CASE WHEN provider_found THEN provider_total_minor END,
    provider_payload_sha256, provider_payload_ciphertext, retrieved_at_value)
  ON CONFLICT (accounting_reference_id, payload_sha256) DO NOTHING RETURNING id INTO snapshot_id;
  IF snapshot_id IS NULL THEN
    SELECT snapshot.id INTO snapshot_id FROM billing.accounting_provider_snapshots snapshot
    WHERE snapshot.accounting_reference_id = reference.id AND snapshot.payload_sha256 = provider_payload_sha256;
  END IF;
  diff := jsonb_strip_nulls(jsonb_build_object(
    'found', CASE WHEN NOT provider_found THEN jsonb_build_object('local', true, 'provider', false) END,
    'externalRecordRef', CASE WHEN provider_found AND provider_external_record_ref IS DISTINCT FROM reference.external_record_ref
      THEN jsonb_build_object('local', reference.external_record_ref, 'provider', provider_external_record_ref) END,
    'externalDocumentRef', CASE WHEN provider_found AND provider_external_document_ref IS DISTINCT FROM reference.external_document_ref
      THEN jsonb_build_object('local', reference.external_document_ref, 'provider', provider_external_document_ref) END,
    'idempotencyReference', CASE WHEN provider_found AND provider_idempotency_reference IS DISTINCT FROM reference.idempotency_reference
      THEN jsonb_build_object('local', reference.idempotency_reference, 'provider', provider_idempotency_reference) END,
    'currency', CASE WHEN provider_found AND upper(provider_currency) IS DISTINCT FROM local_currency
      THEN jsonb_build_object('local', local_currency, 'provider', upper(provider_currency)) END,
    'totalMinor', CASE WHEN provider_found AND provider_total_minor IS DISTINCT FROM local_total
      THEN jsonb_build_object('local', local_total, 'provider', provider_total_minor) END
  ));
  result_status := CASE
    WHEN NOT provider_found THEN 'missing_remote'
    WHEN provider_external_record_ref IS DISTINCT FROM reference.external_record_ref
      OR provider_external_document_ref IS DISTINCT FROM reference.external_document_ref
      OR provider_idempotency_reference IS DISTINCT FROM reference.idempotency_reference THEN 'reference_mismatch'
    WHEN upper(provider_currency) IS DISTINCT FROM local_currency THEN 'currency_mismatch'
    WHEN provider_total_minor IS DISTINCT FROM local_total THEN 'amount_mismatch'
    ELSE 'matched' END;
  INSERT INTO billing.accounting_reconciliation_results (
    tenant_id, accounting_reference_id, provider_snapshot_id, status, differences, reconciled_at
  ) VALUES (job.tenant_id, reference.id, snapshot_id, result_status, diff, retrieved_at_value)
  ON CONFLICT (accounting_reference_id, provider_snapshot_id) DO NOTHING;
  UPDATE billing.accounting_reconciliation_jobs SET status = 'queued', available_at = retrieved_at_value + interval '24 hours',
    completed_at = retrieved_at_value WHERE id = job.id;
  RETURN result_status;
END
$$;

CREATE OR REPLACE FUNCTION billing.fail_accounting_reconciliation(
  target_job_id uuid, error_code_value text, dead_letter boolean,
  retry_at_value timestamptz DEFAULT now() + interval '5 minutes'
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, billing AS $$
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'accounting_reconciliation_worker' THEN
    RAISE EXCEPTION 'accounting_reconciliation_worker_authority_required';
  END IF;
  UPDATE billing.accounting_reconciliation_jobs SET status = CASE WHEN dead_letter THEN 'failed' ELSE 'queued' END,
    available_at = retry_at_value, last_error_code = left(COALESCE(error_code_value, 'accounting_retrieval_failed'), 100)
  WHERE id = target_job_id AND status = 'processing';
  RETURN FOUND;
END
$$;

CREATE OR REPLACE FUNCTION platform.request_accounting_reconciliation_case(
  target_result_id uuid, action_value text, reason_value text, requested_at_value timestamptz DEFAULT now()
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, platform, billing AS $$
DECLARE actor_id uuid; actor_role text; result billing.accounting_reconciliation_results%ROWTYPE; case_id uuid;
BEGIN
  actor_id := NULLIF(current_setting('app.platform_user_id', true), '')::uuid;
  actor_role := current_setting('app.platform_role', true);
  IF session_user <> 'djay_platform' OR actor_id IS NULL OR actor_role NOT IN ('platform_owner', 'platform_finance')
    THEN RAISE EXCEPTION 'platform_finance_authority_required'; END IF;
  IF action_value NOT IN ('investigate', 'retry_retrieval', 'request_flowaccount_correction', 'credit_and_replace')
     OR char_length(reason_value) NOT BETWEEN 8 AND 1000 THEN RAISE EXCEPTION 'accounting_reconciliation_case_invalid'; END IF;
  SELECT * INTO result FROM billing.accounting_reconciliation_results WHERE id = target_result_id AND status <> 'matched';
  IF result.id IS NULL THEN RAISE EXCEPTION 'accounting_reconciliation_attention_result_required'; END IF;
  case_id := gen_random_uuid();
  INSERT INTO platform.accounting_reconciliation_cases (
    id, tenant_id, reconciliation_result_id, requested_action, reason, requested_by_platform_user_id, requested_at
  ) VALUES (case_id, result.tenant_id, result.id, action_value, reason_value, actor_id, requested_at_value);
  INSERT INTO platform.accounting_reconciliation_case_events (
    tenant_id, case_id, event_type, actor_platform_user_id, safe_note, created_at
  ) VALUES (result.tenant_id, case_id, 'requested', actor_id, reason_value, requested_at_value);
  RETURN case_id;
END
$$;

CREATE OR REPLACE FUNCTION platform.review_accounting_reconciliation_case(
  target_case_id uuid, approve boolean, note_value text, reviewed_at_value timestamptz DEFAULT now()
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, platform AS $$
DECLARE actor_id uuid; actor_role text; target platform.accounting_reconciliation_cases%ROWTYPE; event_value text;
BEGIN
  actor_id := NULLIF(current_setting('app.platform_user_id', true), '')::uuid;
  actor_role := current_setting('app.platform_role', true);
  IF session_user <> 'djay_platform' OR actor_id IS NULL OR actor_role NOT IN ('platform_owner', 'platform_finance')
    THEN RAISE EXCEPTION 'platform_finance_authority_required'; END IF;
  SELECT * INTO target FROM platform.accounting_reconciliation_cases WHERE id = target_case_id;
  IF target.id IS NULL THEN RAISE EXCEPTION 'accounting_reconciliation_case_not_found'; END IF;
  IF target.requested_by_platform_user_id = actor_id THEN RAISE EXCEPTION 'different_reviewer_required'; END IF;
  IF EXISTS (SELECT 1 FROM platform.accounting_reconciliation_case_events event
    WHERE event.case_id = target.id AND event.event_type IN ('approved', 'rejected'))
    THEN RAISE EXCEPTION 'accounting_reconciliation_case_already_reviewed'; END IF;
  event_value := CASE WHEN approve THEN 'approved' ELSE 'rejected' END;
  INSERT INTO platform.accounting_reconciliation_case_events (
    tenant_id, case_id, event_type, actor_platform_user_id, safe_note, created_at
  ) VALUES (target.tenant_id, target.id, event_value, actor_id, left(NULLIF(note_value, ''), 1000), reviewed_at_value);
  RETURN event_value;
END
$$;

ALTER TABLE billing.accounting_reconciliation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.accounting_reconciliation_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE billing.accounting_provider_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.accounting_provider_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE billing.accounting_reconciliation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.accounting_reconciliation_results FORCE ROW LEVEL SECURITY;
CREATE POLICY billing_worker_accounting_reconciliation_jobs ON billing.accounting_reconciliation_jobs TO djay_worker USING (true) WITH CHECK (true);
CREATE POLICY billing_platform_accounting_reconciliation_jobs ON billing.accounting_reconciliation_jobs FOR SELECT TO djay_platform USING (true);
CREATE POLICY billing_worker_accounting_provider_snapshots ON billing.accounting_provider_snapshots TO djay_worker USING (true) WITH CHECK (true);
CREATE POLICY billing_platform_accounting_provider_snapshots ON billing.accounting_provider_snapshots FOR SELECT TO djay_platform USING (true);
CREATE POLICY billing_worker_accounting_reconciliation_results ON billing.accounting_reconciliation_results TO djay_worker USING (true) WITH CHECK (true);
CREATE POLICY billing_platform_accounting_reconciliation_results ON billing.accounting_reconciliation_results FOR SELECT TO djay_platform USING (true);

REVOKE ALL ON billing.accounting_reconciliation_jobs, billing.accounting_provider_snapshots,
  billing.accounting_reconciliation_results, platform.accounting_reconciliation_cases,
  platform.accounting_reconciliation_case_events FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON billing.accounting_reconciliation_jobs TO djay_worker;
GRANT SELECT, INSERT ON billing.accounting_provider_snapshots, billing.accounting_reconciliation_results TO djay_worker;
GRANT SELECT ON billing.accounting_reconciliation_jobs, billing.accounting_provider_snapshots,
  billing.accounting_reconciliation_results TO djay_platform, djay_readonly_ops;
GRANT SELECT, INSERT ON platform.accounting_reconciliation_cases,
  platform.accounting_reconciliation_case_events TO djay_platform;
REVOKE ALL ON FUNCTION billing.claim_accounting_reconciliation(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION billing.record_accounting_reconciliation(uuid, boolean, text, text, text, text, text, bigint, bytea, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION billing.fail_accounting_reconciliation(uuid, text, boolean, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.request_accounting_reconciliation_case(uuid, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.review_accounting_reconciliation_case(uuid, boolean, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION billing.claim_accounting_reconciliation(timestamptz, timestamptz) TO djay_worker;
GRANT EXECUTE ON FUNCTION billing.record_accounting_reconciliation(uuid, boolean, text, text, text, text, text, bigint, bytea, text, timestamptz) TO djay_worker;
GRANT EXECUTE ON FUNCTION billing.fail_accounting_reconciliation(uuid, text, boolean, timestamptz) TO djay_worker;
GRANT EXECUTE ON FUNCTION platform.request_accounting_reconciliation_case(uuid, text, text, timestamptz) TO djay_platform;
GRANT EXECUTE ON FUNCTION platform.review_accounting_reconciliation_case(uuid, boolean, text, timestamptz) TO djay_platform;
