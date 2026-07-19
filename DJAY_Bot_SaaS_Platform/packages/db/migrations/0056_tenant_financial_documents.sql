CREATE OR REPLACE FUNCTION billing.list_tenant_financial_documents()
RETURNS TABLE (
  document_id uuid, document_kind text, subscription_id uuid,
  document_number text, status text, currency text,
  subtotal_minor bigint, tax_minor bigint, total_minor bigint,
  amount_paid_minor bigint, amount_remaining_minor bigint,
  issued_at timestamptz, recorded_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, billing, tenancy
AS $$
DECLARE tenant_context_id uuid;
BEGIN
  tenant_context_id := tenancy.current_tenant_id();
  IF session_user <> 'djay_runtime' OR tenant_context_id IS NULL THEN
    RAISE EXCEPTION 'tenant_financial_document_authority_required';
  END IF;
  RETURN QUERY
  WITH latest_invoices AS (
    SELECT DISTINCT ON (invoice.external_invoice_ref)
      invoice.id, invoice.subscription_id, invoice.external_invoice_ref,
      invoice.status, invoice.currency, invoice.subtotal_minor,
      invoice.tax_minor, invoice.total_minor, invoice.amount_paid_minor,
      invoice.amount_remaining_minor, invoice.issued_at, invoice.recorded_at
    FROM billing.invoice_documents invoice
    WHERE invoice.tenant_id = tenant_context_id
    ORDER BY invoice.external_invoice_ref, invoice.recorded_at DESC, invoice.id DESC
  ), latest_credits AS (
    SELECT DISTINCT ON (credit.external_credit_note_ref)
      credit.id, credit.subscription_id, credit.external_credit_note_ref,
      credit.status, credit.currency, credit.subtotal_minor,
      credit.tax_minor, credit.total_minor, credit.issued_at, credit.recorded_at
    FROM billing.credit_note_documents credit
    WHERE credit.tenant_id = tenant_context_id
    ORDER BY credit.external_credit_note_ref, credit.recorded_at DESC, credit.id DESC
  ), documents AS (
  SELECT invoice.id AS document_id, 'invoice'::text AS document_kind, invoice.subscription_id,
    invoice.external_invoice_ref, invoice.status, invoice.currency,
    invoice.subtotal_minor, invoice.tax_minor, invoice.total_minor,
    invoice.amount_paid_minor, invoice.amount_remaining_minor,
    invoice.issued_at, invoice.recorded_at
  FROM latest_invoices invoice
  UNION ALL
  SELECT credit.id, 'credit_note'::text, credit.subscription_id,
    credit.external_credit_note_ref, credit.status, credit.currency,
    credit.subtotal_minor, credit.tax_minor, credit.total_minor,
    0::bigint, 0::bigint, credit.issued_at, credit.recorded_at
  FROM latest_credits credit
  ) SELECT documents.* FROM documents
  ORDER BY documents.issued_at DESC NULLS LAST, documents.recorded_at DESC, documents.document_id DESC;
END
$$;

REVOKE ALL ON FUNCTION billing.list_tenant_financial_documents() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION billing.list_tenant_financial_documents() TO djay_runtime;
