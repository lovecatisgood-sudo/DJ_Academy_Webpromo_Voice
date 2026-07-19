CREATE TABLE billing.financial_reconciliation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  invoice_document_id uuid NOT NULL REFERENCES billing.invoice_documents(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'matched', 'attention', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  last_error_code text,
  UNIQUE (invoice_document_id),
  UNIQUE (tenant_id, id)
);

CREATE TABLE billing.provider_financial_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  invoice_document_id uuid NOT NULL REFERENCES billing.invoice_documents(id) ON DELETE RESTRICT,
  provider_key text NOT NULL CHECK (provider_key = 'stripe'),
  external_invoice_ref text NOT NULL,
  status text NOT NULL,
  currency text NOT NULL,
  total_minor bigint NOT NULL CHECK (total_minor >= 0),
  amount_paid_minor bigint NOT NULL CHECK (amount_paid_minor >= 0),
  amount_remaining_minor bigint NOT NULL CHECK (amount_remaining_minor >= 0),
  payload_sha256 bytea NOT NULL CHECK (octet_length(payload_sha256) = 32),
  payload_ciphertext text NOT NULL,
  retrieved_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_document_id, payload_sha256),
  UNIQUE (tenant_id, id)
);

CREATE TABLE billing.financial_reconciliation_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  invoice_document_id uuid NOT NULL REFERENCES billing.invoice_documents(id) ON DELETE RESTRICT,
  provider_snapshot_id uuid NOT NULL REFERENCES billing.provider_financial_snapshots(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN (
    'matched', 'reference_mismatch', 'currency_mismatch', 'status_mismatch', 'amount_mismatch'
  )),
  differences jsonb NOT NULL,
  reconciled_at timestamptz NOT NULL,
  UNIQUE (invoice_document_id, provider_snapshot_id),
  UNIQUE (tenant_id, id)
);

CREATE TABLE platform.financial_reconciliation_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  reconciliation_result_id uuid NOT NULL REFERENCES billing.financial_reconciliation_results(id) ON DELETE RESTRICT,
  requested_action text NOT NULL CHECK (requested_action IN (
    'investigate', 'retry_provider_retrieval', 'request_stripe_correction', 'issue_customer_credit'
  )),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 8 AND 1000),
  requested_by_platform_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL,
  UNIQUE (reconciliation_result_id)
);

CREATE TABLE platform.financial_reconciliation_case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  case_id uuid NOT NULL REFERENCES platform.financial_reconciliation_cases(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('requested', 'approved', 'rejected', 'executed', 'execution_failed')),
  actor_platform_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  safe_note text,
  created_at timestamptz NOT NULL,
  UNIQUE (tenant_id, id)
);

CREATE TRIGGER billing_provider_financial_snapshot_immutable
BEFORE UPDATE OR DELETE ON billing.provider_financial_snapshots
FOR EACH ROW EXECUTE FUNCTION billing.reject_financial_evidence_change();
CREATE TRIGGER billing_financial_reconciliation_result_immutable
BEFORE UPDATE OR DELETE ON billing.financial_reconciliation_results
FOR EACH ROW EXECUTE FUNCTION billing.reject_financial_evidence_change();
CREATE TRIGGER platform_financial_reconciliation_case_immutable
BEFORE UPDATE OR DELETE ON platform.financial_reconciliation_cases
FOR EACH ROW EXECUTE FUNCTION tenancy.reject_immutable_change();
CREATE TRIGGER platform_financial_reconciliation_case_event_immutable
BEFORE UPDATE OR DELETE ON platform.financial_reconciliation_case_events
FOR EACH ROW EXECUTE FUNCTION tenancy.reject_immutable_change();

CREATE OR REPLACE FUNCTION billing.queue_invoice_reconciliation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, billing AS $$
BEGIN
  INSERT INTO billing.financial_reconciliation_jobs (tenant_id, invoice_document_id, available_at)
  VALUES (NEW.tenant_id, NEW.id, NEW.recorded_at) ON CONFLICT DO NOTHING;
  RETURN NEW;
END
$$;
CREATE TRIGGER billing_invoice_reconciliation_queued
AFTER INSERT ON billing.invoice_documents
FOR EACH ROW EXECUTE FUNCTION billing.queue_invoice_reconciliation();
INSERT INTO billing.financial_reconciliation_jobs (tenant_id, invoice_document_id, available_at)
SELECT tenant_id, id, recorded_at FROM billing.invoice_documents ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION billing.claim_financial_reconciliation(
  claimed_at_value timestamptz DEFAULT now(), stale_before timestamptz DEFAULT now() - interval '10 minutes'
)
RETURNS TABLE (
  job_id uuid, invoice_document_id uuid, tenant_id uuid, external_invoice_ref text,
  attempt_count integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, billing AS $$
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'billing_financial_reconciliation_worker' THEN
    RAISE EXCEPTION 'billing_financial_reconciliation_worker_authority_required';
  END IF;
  RETURN QUERY WITH candidate AS (
    SELECT source.id FROM billing.financial_reconciliation_jobs source
    WHERE (source.status = 'queued' AND source.available_at <= claimed_at_value)
       OR (source.status = 'processing' AND source.claimed_at < stale_before)
    ORDER BY source.available_at, source.id FOR UPDATE SKIP LOCKED LIMIT 1
  ), claimed AS (
    UPDATE billing.financial_reconciliation_jobs job SET status = 'processing',
      attempt_count = job.attempt_count + 1, claimed_at = claimed_at_value, last_error_code = NULL
    FROM candidate WHERE job.id = candidate.id RETURNING job.*
  ) SELECT claimed.id, claimed.invoice_document_id, claimed.tenant_id,
      invoice.external_invoice_ref, claimed.attempt_count
    FROM claimed JOIN billing.invoice_documents invoice ON invoice.id = claimed.invoice_document_id;
END
$$;

CREATE OR REPLACE FUNCTION billing.record_financial_reconciliation(
  target_job_id uuid, provider_external_invoice_ref text, provider_status text,
  provider_currency text, provider_total_minor bigint, provider_amount_paid_minor bigint,
  provider_amount_remaining_minor bigint, provider_payload_sha256 bytea,
  provider_payload_ciphertext text, retrieved_at_value timestamptz DEFAULT now()
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, billing AS $$
DECLARE job billing.financial_reconciliation_jobs%ROWTYPE; invoice billing.invoice_documents%ROWTYPE;
  snapshot_id uuid; result_status text; diff jsonb;
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'billing_financial_reconciliation_worker' THEN
    RAISE EXCEPTION 'billing_financial_reconciliation_worker_authority_required';
  END IF;
  SELECT * INTO job FROM billing.financial_reconciliation_jobs WHERE id = target_job_id FOR UPDATE;
  IF job.id IS NULL OR job.status <> 'processing' THEN RAISE EXCEPTION 'financial_reconciliation_job_not_claimed'; END IF;
  SELECT * INTO invoice FROM billing.invoice_documents WHERE id = job.invoice_document_id;
  IF provider_payload_ciphertext IS NULL OR octet_length(provider_payload_sha256) <> 32
     OR provider_total_minor < 0 OR provider_amount_paid_minor < 0 OR provider_amount_remaining_minor < 0 THEN
    RAISE EXCEPTION 'provider_financial_snapshot_invalid';
  END IF;
  snapshot_id := gen_random_uuid();
  INSERT INTO billing.provider_financial_snapshots (
    id, tenant_id, invoice_document_id, provider_key, external_invoice_ref,
    status, currency, total_minor, amount_paid_minor, amount_remaining_minor,
    payload_sha256, payload_ciphertext, retrieved_at
  ) VALUES (snapshot_id, job.tenant_id, job.invoice_document_id, 'stripe', provider_external_invoice_ref,
    provider_status, upper(provider_currency), provider_total_minor, provider_amount_paid_minor,
    provider_amount_remaining_minor, provider_payload_sha256, provider_payload_ciphertext, retrieved_at_value)
  ON CONFLICT (invoice_document_id, payload_sha256) DO NOTHING
  RETURNING id INTO snapshot_id;
  IF snapshot_id IS NULL THEN
    SELECT snapshot.id INTO snapshot_id
    FROM billing.provider_financial_snapshots snapshot
    WHERE snapshot.invoice_document_id = job.invoice_document_id
      AND snapshot.payload_sha256 = provider_payload_sha256;
  END IF;
  diff := jsonb_strip_nulls(jsonb_build_object(
    'externalInvoiceRef', CASE WHEN provider_external_invoice_ref IS DISTINCT FROM invoice.external_invoice_ref
      THEN jsonb_build_object('local', invoice.external_invoice_ref, 'provider', provider_external_invoice_ref) END,
    'currency', CASE WHEN upper(provider_currency) IS DISTINCT FROM invoice.currency
      THEN jsonb_build_object('local', invoice.currency, 'provider', upper(provider_currency)) END,
    'status', CASE WHEN provider_status IS DISTINCT FROM invoice.status
      THEN jsonb_build_object('local', invoice.status, 'provider', provider_status) END,
    'totalMinor', CASE WHEN provider_total_minor IS DISTINCT FROM invoice.total_minor
      THEN jsonb_build_object('local', invoice.total_minor, 'provider', provider_total_minor) END,
    'amountPaidMinor', CASE WHEN provider_amount_paid_minor IS DISTINCT FROM invoice.amount_paid_minor
      THEN jsonb_build_object('local', invoice.amount_paid_minor, 'provider', provider_amount_paid_minor) END,
    'amountRemainingMinor', CASE WHEN provider_amount_remaining_minor IS DISTINCT FROM invoice.amount_remaining_minor
      THEN jsonb_build_object('local', invoice.amount_remaining_minor, 'provider', provider_amount_remaining_minor) END
  ));
  result_status := CASE
    WHEN provider_external_invoice_ref IS DISTINCT FROM invoice.external_invoice_ref THEN 'reference_mismatch'
    WHEN upper(provider_currency) IS DISTINCT FROM invoice.currency THEN 'currency_mismatch'
    WHEN provider_status IS DISTINCT FROM invoice.status THEN 'status_mismatch'
    WHEN provider_total_minor IS DISTINCT FROM invoice.total_minor
      OR provider_amount_paid_minor IS DISTINCT FROM invoice.amount_paid_minor
      OR provider_amount_remaining_minor IS DISTINCT FROM invoice.amount_remaining_minor THEN 'amount_mismatch'
    ELSE 'matched' END;
  INSERT INTO billing.financial_reconciliation_results (
    tenant_id, invoice_document_id, provider_snapshot_id, status, differences, reconciled_at
  ) VALUES (job.tenant_id, job.invoice_document_id, snapshot_id, result_status, diff, retrieved_at_value)
  ON CONFLICT (invoice_document_id, provider_snapshot_id) DO NOTHING;
  UPDATE billing.financial_reconciliation_jobs SET status = CASE WHEN result_status = 'matched' THEN 'matched' ELSE 'attention' END,
    completed_at = retrieved_at_value WHERE id = job.id;
  RETURN result_status;
END
$$;

CREATE OR REPLACE FUNCTION billing.fail_financial_reconciliation(
  target_job_id uuid, error_code_value text, dead_letter boolean, retry_at timestamptz DEFAULT now() + interval '5 minutes'
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, billing AS $$
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'billing_financial_reconciliation_worker' THEN
    RAISE EXCEPTION 'billing_financial_reconciliation_worker_authority_required';
  END IF;
  UPDATE billing.financial_reconciliation_jobs SET status = CASE WHEN dead_letter THEN 'failed' ELSE 'queued' END,
    available_at = retry_at, last_error_code = left(COALESCE(error_code_value, 'provider_retrieval_failed'), 100)
  WHERE id = target_job_id AND status = 'processing';
  RETURN FOUND;
END
$$;

ALTER TABLE billing.financial_reconciliation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.financial_reconciliation_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE billing.provider_financial_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.provider_financial_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE billing.financial_reconciliation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.financial_reconciliation_results FORCE ROW LEVEL SECURITY;
CREATE POLICY billing_worker_financial_jobs ON billing.financial_reconciliation_jobs TO djay_worker USING (true) WITH CHECK (true);
CREATE POLICY billing_platform_financial_jobs ON billing.financial_reconciliation_jobs FOR SELECT TO djay_platform USING (true);
CREATE POLICY billing_worker_financial_snapshots ON billing.provider_financial_snapshots TO djay_worker USING (true) WITH CHECK (true);
CREATE POLICY billing_platform_financial_snapshots ON billing.provider_financial_snapshots FOR SELECT TO djay_platform USING (true);
CREATE POLICY billing_worker_financial_results ON billing.financial_reconciliation_results TO djay_worker USING (true) WITH CHECK (true);
CREATE POLICY billing_platform_financial_results ON billing.financial_reconciliation_results FOR SELECT TO djay_platform USING (true);

CREATE OR REPLACE FUNCTION platform.request_financial_reconciliation_case(
  target_result_id uuid, action_value text, reason_value text, requested_at_value timestamptz DEFAULT now()
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, platform, billing AS $$
DECLARE actor_id uuid; actor_role text; result billing.financial_reconciliation_results%ROWTYPE; case_id uuid;
BEGIN
  actor_id := NULLIF(current_setting('app.platform_user_id', true), '')::uuid;
  actor_role := current_setting('app.platform_role', true);
  IF session_user <> 'djay_platform' OR actor_id IS NULL
     OR actor_role NOT IN ('platform_owner', 'platform_finance') THEN RAISE EXCEPTION 'platform_finance_authority_required'; END IF;
  IF action_value NOT IN ('investigate', 'retry_provider_retrieval', 'request_stripe_correction', 'issue_customer_credit')
     OR char_length(reason_value) NOT BETWEEN 8 AND 1000 THEN RAISE EXCEPTION 'financial_reconciliation_case_invalid'; END IF;
  SELECT * INTO result FROM billing.financial_reconciliation_results WHERE id = target_result_id AND status <> 'matched';
  IF result.id IS NULL THEN RAISE EXCEPTION 'financial_reconciliation_attention_result_required'; END IF;
  case_id := gen_random_uuid();
  INSERT INTO platform.financial_reconciliation_cases (
    id, tenant_id, reconciliation_result_id, requested_action, reason,
    requested_by_platform_user_id, requested_at
  ) VALUES (case_id, result.tenant_id, result.id, action_value, reason_value, actor_id, requested_at_value);
  INSERT INTO platform.financial_reconciliation_case_events (
    tenant_id, case_id, event_type, actor_platform_user_id, safe_note, created_at
  ) VALUES (result.tenant_id, case_id, 'requested', actor_id, reason_value, requested_at_value);
  RETURN case_id;
END
$$;

CREATE OR REPLACE FUNCTION platform.review_financial_reconciliation_case(
  target_case_id uuid, approve boolean, note_value text, reviewed_at_value timestamptz DEFAULT now()
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, platform AS $$
DECLARE actor_id uuid; actor_role text; target platform.financial_reconciliation_cases%ROWTYPE; event_value text;
BEGIN
  actor_id := NULLIF(current_setting('app.platform_user_id', true), '')::uuid;
  actor_role := current_setting('app.platform_role', true);
  IF session_user <> 'djay_platform' OR actor_id IS NULL
     OR actor_role NOT IN ('platform_owner', 'platform_finance') THEN RAISE EXCEPTION 'platform_finance_authority_required'; END IF;
  SELECT * INTO target FROM platform.financial_reconciliation_cases WHERE id = target_case_id;
  IF target.id IS NULL THEN RAISE EXCEPTION 'financial_reconciliation_case_not_found'; END IF;
  IF target.requested_by_platform_user_id = actor_id THEN RAISE EXCEPTION 'different_reviewer_required'; END IF;
  IF EXISTS (SELECT 1 FROM platform.financial_reconciliation_case_events event
    WHERE event.case_id = target_case_id AND event.event_type IN ('approved', 'rejected')) THEN
    RAISE EXCEPTION 'financial_reconciliation_case_already_reviewed'; END IF;
  event_value := CASE WHEN approve THEN 'approved' ELSE 'rejected' END;
  INSERT INTO platform.financial_reconciliation_case_events (
    tenant_id, case_id, event_type, actor_platform_user_id, safe_note, created_at
  ) VALUES (target.tenant_id, target.id, event_value, actor_id, left(NULLIF(note_value, ''), 1000), reviewed_at_value);
  RETURN event_value;
END
$$;

REVOKE ALL ON billing.financial_reconciliation_jobs, billing.provider_financial_snapshots,
  billing.financial_reconciliation_results, platform.financial_reconciliation_cases,
  platform.financial_reconciliation_case_events FROM PUBLIC;
GRANT USAGE ON SCHEMA billing TO djay_platform, djay_readonly_ops;
GRANT SELECT, INSERT, UPDATE ON billing.financial_reconciliation_jobs TO djay_worker;
GRANT SELECT, INSERT ON billing.provider_financial_snapshots, billing.financial_reconciliation_results TO djay_worker;
GRANT SELECT ON billing.financial_reconciliation_jobs, billing.provider_financial_snapshots,
  billing.financial_reconciliation_results TO djay_platform, djay_readonly_ops;
GRANT SELECT, INSERT ON platform.financial_reconciliation_cases,
  platform.financial_reconciliation_case_events TO djay_platform;
REVOKE ALL ON FUNCTION billing.claim_financial_reconciliation(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION billing.record_financial_reconciliation(uuid, text, text, text, bigint, bigint, bigint, bytea, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION billing.fail_financial_reconciliation(uuid, text, boolean, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.request_financial_reconciliation_case(uuid, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.review_financial_reconciliation_case(uuid, boolean, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION billing.claim_financial_reconciliation(timestamptz, timestamptz) TO djay_worker;
GRANT EXECUTE ON FUNCTION billing.record_financial_reconciliation(uuid, text, text, text, bigint, bigint, bigint, bytea, text, timestamptz) TO djay_worker;
GRANT EXECUTE ON FUNCTION billing.fail_financial_reconciliation(uuid, text, boolean, timestamptz) TO djay_worker;
GRANT EXECUTE ON FUNCTION platform.request_financial_reconciliation_case(uuid, text, text, timestamptz) TO djay_platform;
GRANT EXECUTE ON FUNCTION platform.review_financial_reconciliation_case(uuid, boolean, text, timestamptz) TO djay_platform;
