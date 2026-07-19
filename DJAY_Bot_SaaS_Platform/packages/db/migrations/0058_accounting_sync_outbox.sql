CREATE TABLE billing.accounting_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  document_kind text NOT NULL CHECK (document_kind IN ('invoice', 'credit_note')),
  invoice_document_id uuid REFERENCES billing.invoice_documents(id) ON DELETE RESTRICT,
  credit_note_document_id uuid REFERENCES billing.credit_note_documents(id) ON DELETE RESTRICT,
  provider_key text NOT NULL DEFAULT 'flowaccount' CHECK (provider_key = 'flowaccount'),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'synced', 'attention', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((document_kind = 'invoice' AND invoice_document_id IS NOT NULL AND credit_note_document_id IS NULL)
    OR (document_kind = 'credit_note' AND credit_note_document_id IS NOT NULL AND invoice_document_id IS NULL)),
  UNIQUE NULLS NOT DISTINCT (provider_key, document_kind, invoice_document_id, credit_note_document_id),
  UNIQUE (tenant_id, id)
);

CREATE TABLE billing.accounting_sync_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  sync_job_id uuid NOT NULL REFERENCES billing.accounting_sync_jobs(id) ON DELETE RESTRICT,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  outcome text NOT NULL CHECK (outcome IN ('succeeded', 'rejected', 'unknown', 'rate_limited')),
  request_sha256 bytea NOT NULL CHECK (octet_length(request_sha256) = 32),
  request_ciphertext text NOT NULL,
  response_sha256 bytea CHECK (response_sha256 IS NULL OR octet_length(response_sha256) = 32),
  response_ciphertext text,
  safe_error_code text,
  occurred_at timestamptz NOT NULL,
  UNIQUE (sync_job_id, attempt_number),
  UNIQUE (tenant_id, id)
);

CREATE TABLE billing.accounting_external_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  sync_job_id uuid NOT NULL UNIQUE REFERENCES billing.accounting_sync_jobs(id) ON DELETE RESTRICT,
  provider_key text NOT NULL CHECK (provider_key = 'flowaccount'),
  external_record_ref text NOT NULL,
  external_document_ref text,
  idempotency_reference text NOT NULL CHECK (char_length(idempotency_reference) BETWEEN 1 AND 36),
  source_payload_sha256 bytea NOT NULL CHECK (octet_length(source_payload_sha256) = 32),
  created_at timestamptz NOT NULL,
  UNIQUE (provider_key, external_record_ref),
  UNIQUE (provider_key, idempotency_reference),
  UNIQUE (tenant_id, id)
);

CREATE TRIGGER billing_accounting_sync_attempt_immutable
BEFORE UPDATE OR DELETE ON billing.accounting_sync_attempts
FOR EACH ROW EXECUTE FUNCTION billing.reject_financial_evidence_change();
CREATE TRIGGER billing_accounting_external_reference_immutable
BEFORE UPDATE OR DELETE ON billing.accounting_external_references
FOR EACH ROW EXECUTE FUNCTION billing.reject_financial_evidence_change();

CREATE OR REPLACE FUNCTION billing.queue_invoice_accounting_sync()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, billing AS $$
BEGIN
  INSERT INTO billing.accounting_sync_jobs (
    tenant_id, document_kind, invoice_document_id, available_at, created_at
  ) VALUES (NEW.tenant_id, 'invoice', NEW.id, now(), now()) ON CONFLICT DO NOTHING;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION billing.queue_credit_note_accounting_sync()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, billing AS $$
BEGIN
  INSERT INTO billing.accounting_sync_jobs (
    tenant_id, document_kind, credit_note_document_id, available_at, created_at
  ) VALUES (NEW.tenant_id, 'credit_note', NEW.id, now(), now()) ON CONFLICT DO NOTHING;
  RETURN NEW;
END
$$;

CREATE TRIGGER billing_invoice_accounting_sync_queued
AFTER INSERT ON billing.invoice_documents
FOR EACH ROW EXECUTE FUNCTION billing.queue_invoice_accounting_sync();
CREATE TRIGGER billing_credit_note_accounting_sync_queued
AFTER INSERT ON billing.credit_note_documents
FOR EACH ROW EXECUTE FUNCTION billing.queue_credit_note_accounting_sync();

INSERT INTO billing.accounting_sync_jobs (tenant_id, document_kind, invoice_document_id, available_at, created_at)
SELECT tenant_id, 'invoice', id, now(), now() FROM billing.invoice_documents ON CONFLICT DO NOTHING;
INSERT INTO billing.accounting_sync_jobs (tenant_id, document_kind, credit_note_document_id, available_at, created_at)
SELECT tenant_id, 'credit_note', id, now(), now() FROM billing.credit_note_documents ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION billing.claim_accounting_sync(
  claimed_at_value timestamptz DEFAULT now(), stale_before timestamptz DEFAULT now() - interval '10 minutes'
)
RETURNS TABLE (
  job_id uuid, tenant_id uuid, document_kind text, idempotency_reference text,
  canonical_document jsonb, attempt_count integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, billing AS $$
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'accounting_sync_worker' THEN
    RAISE EXCEPTION 'accounting_sync_worker_authority_required';
  END IF;
  RETURN QUERY WITH candidate AS (
    SELECT source.id FROM billing.accounting_sync_jobs source
    WHERE (source.status = 'queued' AND source.available_at <= claimed_at_value)
       OR (source.status = 'processing' AND source.claimed_at < stale_before)
    ORDER BY source.available_at, source.id FOR UPDATE SKIP LOCKED LIMIT 1
  ), claimed AS (
    UPDATE billing.accounting_sync_jobs job SET status = 'processing',
      attempt_count = job.attempt_count + 1, claimed_at = claimed_at_value, last_error_code = NULL
    FROM candidate WHERE job.id = candidate.id RETURNING job.*
  )
  SELECT claimed.id, claimed.tenant_id, claimed.document_kind, claimed.id::text,
    CASE WHEN claimed.document_kind = 'invoice' THEN jsonb_build_object(
      'schemaVersion', 1, 'kind', 'invoice', 'localDocumentId', invoice.id,
      'documentNumber', invoice.external_invoice_ref, 'status', invoice.status,
      'currency', invoice.currency, 'subtotalMinor', invoice.subtotal_minor,
      'discountMinor', invoice.discount_minor, 'taxMinor', invoice.tax_minor,
      'totalMinor', invoice.total_minor, 'amountPaidMinor', invoice.amount_paid_minor,
      'amountRemainingMinor', invoice.amount_remaining_minor,
      'taxAuthorityState', invoice.tax_authority_state, 'issuedAt', invoice.issued_at
    ) ELSE jsonb_build_object(
      'schemaVersion', 1, 'kind', 'credit_note', 'localDocumentId', credit.id,
      'sourceInvoiceId', credit.invoice_document_id, 'documentNumber', credit.external_credit_note_ref,
      'sourceInvoiceNumber', credit.external_invoice_ref, 'status', credit.status,
      'reason', credit.reason, 'currency', credit.currency, 'subtotalMinor', credit.subtotal_minor,
      'taxMinor', credit.tax_minor, 'totalMinor', credit.total_minor,
      'refundMinor', credit.refund_minor, 'creditMinor', credit.credit_minor, 'issuedAt', credit.issued_at
    ) END,
    claimed.attempt_count
  FROM claimed
  LEFT JOIN billing.invoice_documents invoice ON invoice.id = claimed.invoice_document_id
  LEFT JOIN billing.credit_note_documents credit ON credit.id = claimed.credit_note_document_id;
END
$$;

CREATE OR REPLACE FUNCTION billing.finish_accounting_sync(
  target_job_id uuid, outcome_value text, request_sha256_value bytea, request_ciphertext_value text,
  response_sha256_value bytea, response_ciphertext_value text, external_record_ref_value text,
  external_document_ref_value text, safe_error_code_value text,
  occurred_at_value timestamptz DEFAULT now(), retry_at_value timestamptz DEFAULT now() + interval '5 minutes'
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, billing AS $$
DECLARE job billing.accounting_sync_jobs%ROWTYPE;
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'accounting_sync_worker' THEN
    RAISE EXCEPTION 'accounting_sync_worker_authority_required';
  END IF;
  SELECT * INTO job FROM billing.accounting_sync_jobs WHERE id = target_job_id FOR UPDATE;
  IF job.id IS NULL OR job.status <> 'processing' THEN RAISE EXCEPTION 'accounting_sync_job_not_claimed'; END IF;
  IF outcome_value NOT IN ('succeeded', 'rejected', 'unknown', 'rate_limited')
     OR octet_length(request_sha256_value) <> 32 OR request_ciphertext_value IS NULL
     OR (response_sha256_value IS NOT NULL AND octet_length(response_sha256_value) <> 32) THEN
    RAISE EXCEPTION 'accounting_sync_attempt_invalid';
  END IF;
  IF outcome_value = 'succeeded' AND external_record_ref_value IS NULL THEN
    RAISE EXCEPTION 'accounting_external_reference_required';
  END IF;
  INSERT INTO billing.accounting_sync_attempts (
    tenant_id, sync_job_id, attempt_number, outcome, request_sha256, request_ciphertext,
    response_sha256, response_ciphertext, safe_error_code, occurred_at
  ) VALUES (job.tenant_id, job.id, job.attempt_count, outcome_value, request_sha256_value,
    request_ciphertext_value, response_sha256_value, response_ciphertext_value,
    left(safe_error_code_value, 100), occurred_at_value);
  IF outcome_value = 'succeeded' THEN
    INSERT INTO billing.accounting_external_references (
      tenant_id, sync_job_id, provider_key, external_record_ref, external_document_ref,
      idempotency_reference, source_payload_sha256, created_at
    ) VALUES (job.tenant_id, job.id, 'flowaccount', external_record_ref_value,
      external_document_ref_value, job.id::text, request_sha256_value, occurred_at_value)
    ON CONFLICT (sync_job_id) DO NOTHING;
  END IF;
  UPDATE billing.accounting_sync_jobs SET
    status = CASE outcome_value WHEN 'succeeded' THEN 'synced' WHEN 'rejected' THEN 'attention' ELSE 'queued' END,
    available_at = CASE WHEN outcome_value IN ('unknown', 'rate_limited') THEN retry_at_value ELSE available_at END,
    completed_at = CASE WHEN outcome_value IN ('succeeded', 'rejected') THEN occurred_at_value ELSE NULL END,
    last_error_code = CASE WHEN outcome_value = 'succeeded' THEN NULL ELSE left(COALESCE(safe_error_code_value, outcome_value), 100) END
  WHERE id = job.id;
  RETURN CASE outcome_value WHEN 'succeeded' THEN 'synced' WHEN 'rejected' THEN 'attention' ELSE 'retry_scheduled' END;
END
$$;

CREATE OR REPLACE FUNCTION billing.dead_letter_accounting_sync(
  target_job_id uuid, safe_error_code_value text, occurred_at_value timestamptz DEFAULT now()
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, billing AS $$
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'accounting_sync_worker' THEN
    RAISE EXCEPTION 'accounting_sync_worker_authority_required';
  END IF;
  UPDATE billing.accounting_sync_jobs SET status = 'failed', completed_at = occurred_at_value,
    last_error_code = left(COALESCE(safe_error_code_value, 'accounting_sync_failed'), 100)
  WHERE id = target_job_id AND status = 'processing';
  RETURN FOUND;
END
$$;

ALTER TABLE billing.accounting_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.accounting_sync_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE billing.accounting_sync_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.accounting_sync_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE billing.accounting_external_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.accounting_external_references FORCE ROW LEVEL SECURITY;
CREATE POLICY billing_worker_accounting_sync_jobs ON billing.accounting_sync_jobs TO djay_worker USING (true) WITH CHECK (true);
CREATE POLICY billing_platform_accounting_sync_jobs ON billing.accounting_sync_jobs FOR SELECT TO djay_platform USING (true);
CREATE POLICY billing_worker_accounting_sync_attempts ON billing.accounting_sync_attempts TO djay_worker USING (true) WITH CHECK (true);
CREATE POLICY billing_platform_accounting_sync_attempts ON billing.accounting_sync_attempts FOR SELECT TO djay_platform USING (true);
CREATE POLICY billing_worker_accounting_external_references ON billing.accounting_external_references TO djay_worker USING (true) WITH CHECK (true);
CREATE POLICY billing_platform_accounting_external_references ON billing.accounting_external_references FOR SELECT TO djay_platform USING (true);

REVOKE ALL ON billing.accounting_sync_jobs, billing.accounting_sync_attempts,
  billing.accounting_external_references FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON billing.accounting_sync_jobs TO djay_worker;
GRANT SELECT, INSERT ON billing.accounting_sync_attempts, billing.accounting_external_references TO djay_worker;
GRANT SELECT ON billing.accounting_sync_jobs, billing.accounting_sync_attempts,
  billing.accounting_external_references TO djay_platform, djay_readonly_ops;
REVOKE ALL ON FUNCTION billing.claim_accounting_sync(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION billing.finish_accounting_sync(uuid, text, bytea, text, bytea, text, text, text, text, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION billing.dead_letter_accounting_sync(uuid, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION billing.claim_accounting_sync(timestamptz, timestamptz) TO djay_worker;
GRANT EXECUTE ON FUNCTION billing.finish_accounting_sync(uuid, text, bytea, text, bytea, text, text, text, text, timestamptz, timestamptz) TO djay_worker;
GRANT EXECUTE ON FUNCTION billing.dead_letter_accounting_sync(uuid, text, timestamptz) TO djay_worker;
