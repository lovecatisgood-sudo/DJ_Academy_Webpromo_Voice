CREATE TABLE billing.checkout_intents (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL,
  contract_snapshot_id uuid NOT NULL,
  provider_price_mapping_id uuid NOT NULL REFERENCES catalog.provider_price_mappings(id) ON DELETE RESTRICT,
  provider_mode text NOT NULL CHECK (provider_mode IN ('test', 'live')),
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 16 AND 200),
  status text NOT NULL CHECK (status IN (
    'prepared', 'provider_pending', 'ready', 'completed', 'expired', 'failed'
  )),
  external_session_ref text,
  external_customer_ref text,
  external_subscription_ref text,
  checkout_url_ciphertext text,
  expires_at timestamptz,
  failure_code text,
  created_by_user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (provider_mode, external_session_ref),
  FOREIGN KEY (tenant_id, subscription_id)
    REFERENCES tenancy.product_subscriptions(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, contract_snapshot_id)
    REFERENCES tenancy.subscription_contract_snapshots(tenant_id, id) ON DELETE RESTRICT,
  CHECK ((status = 'ready' AND external_session_ref IS NOT NULL
    AND checkout_url_ciphertext IS NOT NULL AND expires_at IS NOT NULL) OR status <> 'ready'),
  CHECK ((status = 'failed' AND failure_code IS NOT NULL) OR status <> 'failed')
);

CREATE TABLE billing.subscription_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL,
  webhook_event_id uuid REFERENCES billing.webhook_events(id) ON DELETE RESTRICT,
  checkout_intent_id uuid REFERENCES billing.checkout_intents(id) ON DELETE RESTRICT,
  external_subscription_ref text,
  previous_status text,
  next_status text NOT NULL,
  provider_status text,
  effective_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE NULLS NOT DISTINCT (webhook_event_id, subscription_id, next_status),
  FOREIGN KEY (tenant_id, subscription_id)
    REFERENCES tenancy.product_subscriptions(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE billing.invoice_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  subscription_id uuid,
  webhook_event_id uuid NOT NULL REFERENCES billing.webhook_events(id) ON DELETE RESTRICT,
  provider_key text NOT NULL CHECK (provider_key = 'stripe'),
  external_invoice_ref text NOT NULL,
  external_customer_ref text,
  external_subscription_ref text,
  status text NOT NULL,
  currency text NOT NULL CHECK (currency = 'THB'),
  subtotal_minor bigint NOT NULL CHECK (subtotal_minor >= 0),
  discount_minor bigint NOT NULL CHECK (discount_minor >= 0),
  tax_minor bigint NOT NULL CHECK (tax_minor >= 0),
  total_minor bigint NOT NULL CHECK (total_minor >= 0),
  amount_paid_minor bigint NOT NULL CHECK (amount_paid_minor >= 0),
  amount_remaining_minor bigint NOT NULL CHECK (amount_remaining_minor >= 0),
  tax_authority_state text NOT NULL CHECK (tax_authority_state IN ('provider_calculated', 'not_collected', 'unknown')),
  provider_document_url_ciphertext text,
  provider_pdf_url_ciphertext text,
  issued_at timestamptz,
  period_start timestamptz,
  period_end timestamptz,
  payload_sha256 bytea NOT NULL CHECK (octet_length(payload_sha256) = 32),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_key, external_invoice_ref, payload_sha256),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, subscription_id)
    REFERENCES tenancy.product_subscriptions(tenant_id, id) ON DELETE RESTRICT,
  CHECK (period_end IS NULL OR period_start IS NOT NULL),
  CHECK (period_end IS NULL OR period_end >= period_start)
);

CREATE TABLE billing.credit_note_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  subscription_id uuid,
  webhook_event_id uuid NOT NULL REFERENCES billing.webhook_events(id) ON DELETE RESTRICT,
  invoice_document_id uuid REFERENCES billing.invoice_documents(id) ON DELETE RESTRICT,
  provider_key text NOT NULL CHECK (provider_key = 'stripe'),
  external_credit_note_ref text NOT NULL,
  external_invoice_ref text NOT NULL,
  status text NOT NULL,
  reason text,
  currency text NOT NULL CHECK (currency = 'THB'),
  subtotal_minor bigint NOT NULL CHECK (subtotal_minor >= 0),
  tax_minor bigint NOT NULL CHECK (tax_minor >= 0),
  total_minor bigint NOT NULL CHECK (total_minor >= 0),
  refund_minor bigint NOT NULL CHECK (refund_minor >= 0),
  credit_minor bigint NOT NULL CHECK (credit_minor >= 0),
  provider_pdf_url_ciphertext text,
  issued_at timestamptz,
  payload_sha256 bytea NOT NULL CHECK (octet_length(payload_sha256) = 32),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_key, external_credit_note_ref, payload_sha256),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, subscription_id)
    REFERENCES tenancy.product_subscriptions(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE billing.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  subscription_id uuid,
  webhook_event_id uuid NOT NULL REFERENCES billing.webhook_events(id) ON DELETE RESTRICT,
  invoice_document_id uuid REFERENCES billing.invoice_documents(id) ON DELETE RESTRICT,
  provider_key text NOT NULL CHECK (provider_key = 'stripe'),
  external_payment_ref text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('succeeded', 'failed', 'cancelled')),
  currency text NOT NULL CHECK (currency = 'THB'),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  failure_code text,
  occurred_at timestamptz NOT NULL,
  payload_sha256 bytea NOT NULL CHECK (octet_length(payload_sha256) = 32),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_key, external_payment_ref, event_type, payload_sha256),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, subscription_id)
    REFERENCES tenancy.product_subscriptions(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE billing.refund_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  subscription_id uuid,
  webhook_event_id uuid NOT NULL REFERENCES billing.webhook_events(id) ON DELETE RESTRICT,
  provider_key text NOT NULL CHECK (provider_key = 'stripe'),
  external_refund_ref text NOT NULL,
  external_payment_ref text,
  status text NOT NULL,
  reason text,
  currency text NOT NULL CHECK (currency = 'THB'),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  occurred_at timestamptz NOT NULL,
  payload_sha256 bytea NOT NULL CHECK (octet_length(payload_sha256) = 32),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_key, external_refund_ref, status, payload_sha256),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, subscription_id)
    REFERENCES tenancy.product_subscriptions(tenant_id, id) ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION billing.reject_financial_evidence_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, billing AS $$
BEGIN RAISE EXCEPTION 'billing_financial_evidence_is_immutable'; END
$$;

CREATE TRIGGER billing_lifecycle_event_immutable BEFORE UPDATE OR DELETE ON billing.subscription_lifecycle_events
FOR EACH ROW EXECUTE FUNCTION billing.reject_financial_evidence_change();
CREATE TRIGGER billing_invoice_document_immutable BEFORE UPDATE OR DELETE ON billing.invoice_documents
FOR EACH ROW EXECUTE FUNCTION billing.reject_financial_evidence_change();
CREATE TRIGGER billing_credit_note_document_immutable BEFORE UPDATE OR DELETE ON billing.credit_note_documents
FOR EACH ROW EXECUTE FUNCTION billing.reject_financial_evidence_change();
CREATE TRIGGER billing_payment_event_immutable BEFORE UPDATE OR DELETE ON billing.payment_events
FOR EACH ROW EXECUTE FUNCTION billing.reject_financial_evidence_change();
CREATE TRIGGER billing_refund_event_immutable BEFORE UPDATE OR DELETE ON billing.refund_events
FOR EACH ROW EXECUTE FUNCTION billing.reject_financial_evidence_change();

CREATE OR REPLACE FUNCTION billing.prepare_stripe_checkout(
  checkout_intent_id uuid,
  target_subscription_id uuid,
  target_contract_snapshot_id uuid,
  requested_idempotency_key text,
  required_provider_mode text,
  prepared_at timestamptz DEFAULT now()
)
RETURNS TABLE (
  intent_id uuid, tenant_id uuid, plan_key text, external_price_ref text,
  contract_sha256_hex text, first_term_amount_minor bigint, currency text, replayed boolean
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, billing, tenancy, catalog
AS $$
DECLARE tenant_context_id uuid; actor_id uuid; target billing.checkout_intents%ROWTYPE;
BEGIN
  tenant_context_id := tenancy.current_tenant_id();
  actor_id := NULLIF(current_setting('app.user_id', true), '')::uuid;
  IF session_user <> 'djay_runtime' OR tenant_context_id IS NULL OR actor_id IS NULL THEN
    RAISE EXCEPTION 'tenant_checkout_authority_required';
  END IF;
  IF required_provider_mode NOT IN ('test', 'live')
     OR char_length(requested_idempotency_key) NOT BETWEEN 16 AND 200 THEN
    RAISE EXCEPTION 'checkout_request_invalid';
  END IF;
  SELECT intent.* INTO target FROM billing.checkout_intents intent
  WHERE intent.tenant_id = tenant_context_id AND intent.idempotency_key = requested_idempotency_key;
  IF target.id IS NOT NULL THEN
    IF target.subscription_id <> target_subscription_id
       OR target.contract_snapshot_id <> target_contract_snapshot_id
       OR target.provider_mode <> required_provider_mode THEN
      RAISE EXCEPTION 'checkout_idempotency_conflict';
    END IF;
    RETURN QUERY SELECT target.id, target.tenant_id, plan.plan_key, mapping.external_price_ref,
      encode(contract.contract_sha256, 'hex'), terms.first_term_amount_minor, version.currency, true
    FROM tenancy.subscription_contract_snapshots contract
    JOIN catalog.plan_versions version ON version.id = contract.plan_version_id
    JOIN catalog.plans plan ON plan.id = version.plan_id
    JOIN catalog.plan_commercial_terms terms ON terms.catalog_version_id = contract.catalog_version_id
      AND terms.plan_version_id = contract.plan_version_id
    JOIN catalog.provider_price_mappings mapping ON mapping.id = target.provider_price_mapping_id;
    RETURN;
  END IF;
  RETURN QUERY
  WITH authority AS (
    SELECT subscription.tenant_id, subscription.id AS subscription_id, contract.id AS contract_id,
      contract.contract_sha256, plan.plan_key, terms.first_term_amount_minor, version.currency,
      mapping.id AS mapping_id, mapping.external_price_ref
    FROM tenancy.product_subscriptions subscription
    JOIN tenancy.subscription_contract_snapshots contract
      ON contract.tenant_id = subscription.tenant_id AND contract.subscription_id = subscription.id
    JOIN catalog.plan_versions version ON version.id = contract.plan_version_id
    JOIN catalog.plans plan ON plan.id = version.plan_id
    JOIN catalog.plan_commercial_terms terms ON terms.catalog_version_id = contract.catalog_version_id
      AND terms.plan_version_id = contract.plan_version_id
    JOIN catalog.provider_price_mappings mapping ON mapping.catalog_version_id = contract.catalog_version_id
      AND mapping.item_kind = 'plan' AND mapping.item_key = plan.plan_key
      AND mapping.provider_key = 'stripe' AND mapping.provider_mode = required_provider_mode
      AND mapping.status = 'ready'
    WHERE subscription.tenant_id = tenant_context_id AND subscription.id = target_subscription_id
      AND subscription.status = 'pending' AND contract.id = target_contract_snapshot_id
      AND contract.accepted_by_user_id = actor_id AND contract.accepted_at IS NOT NULL
      AND version.sellable AND terms.sellable
      AND mapping.verified_amount_minor = terms.first_term_amount_minor
      AND mapping.verified_currency = version.currency
  ), inserted AS (
    INSERT INTO billing.checkout_intents (
      id, tenant_id, subscription_id, contract_snapshot_id, provider_price_mapping_id,
      provider_mode, idempotency_key, status, created_by_user_id, created_at, updated_at
    ) SELECT checkout_intent_id, authority.tenant_id, authority.subscription_id,
      authority.contract_id, authority.mapping_id, required_provider_mode,
      requested_idempotency_key, 'prepared', actor_id, prepared_at, prepared_at
    FROM authority RETURNING *
  ) SELECT inserted.id, inserted.tenant_id, authority.plan_key, authority.external_price_ref,
      encode(authority.contract_sha256, 'hex'), authority.first_term_amount_minor,
      authority.currency, false FROM inserted JOIN authority ON true;
  IF NOT FOUND THEN RAISE EXCEPTION 'checkout_authority_unavailable'; END IF;
END
$$;

CREATE OR REPLACE FUNCTION billing.complete_stripe_checkout(
  target_intent_id uuid, expected_idempotency_key text, external_session_ref_value text,
  external_customer_ref_value text, external_subscription_ref_value text,
  checkout_url_ciphertext_value text, expires_at_value timestamptz,
  failed_code_value text, completed_at timestamptz DEFAULT now()
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, billing, tenancy
AS $$
DECLARE tenant_context_id uuid; target billing.checkout_intents%ROWTYPE;
BEGIN
  tenant_context_id := tenancy.current_tenant_id();
  IF session_user <> 'djay_runtime' OR tenant_context_id IS NULL THEN
    RAISE EXCEPTION 'tenant_checkout_authority_required';
  END IF;
  SELECT * INTO target FROM billing.checkout_intents
  WHERE tenant_id = tenant_context_id AND id = target_intent_id FOR UPDATE;
  IF target.id IS NULL OR target.idempotency_key <> expected_idempotency_key THEN
    RAISE EXCEPTION 'checkout_intent_not_found';
  END IF;
  IF target.status = 'ready' THEN
    IF target.external_session_ref IS DISTINCT FROM external_session_ref_value THEN
      RAISE EXCEPTION 'checkout_completion_conflict';
    END IF;
    RETURN 'ready';
  END IF;
  IF target.status <> 'prepared' THEN RAISE EXCEPTION 'checkout_intent_not_prepared'; END IF;
  IF failed_code_value IS NOT NULL THEN
    UPDATE billing.checkout_intents SET status = 'failed', failure_code = left(failed_code_value, 100),
      updated_at = completed_at WHERE id = target.id;
    RETURN 'failed';
  END IF;
  IF external_session_ref_value !~ '^cs_[A-Za-z0-9_]+$'
     OR checkout_url_ciphertext_value IS NULL OR expires_at_value <= completed_at THEN
    RAISE EXCEPTION 'checkout_provider_response_invalid';
  END IF;
  UPDATE billing.checkout_intents SET status = 'ready',
    external_session_ref = external_session_ref_value,
    external_customer_ref = external_customer_ref_value,
    external_subscription_ref = external_subscription_ref_value,
    checkout_url_ciphertext = checkout_url_ciphertext_value, expires_at = expires_at_value,
    updated_at = completed_at WHERE id = target.id;
  RETURN 'ready';
END
$$;

ALTER TABLE billing.checkout_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.checkout_intents FORCE ROW LEVEL SECURITY;
ALTER TABLE billing.subscription_lifecycle_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.subscription_lifecycle_events FORCE ROW LEVEL SECURITY;
ALTER TABLE billing.invoice_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.invoice_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE billing.credit_note_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.credit_note_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE billing.payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.payment_events FORCE ROW LEVEL SECURITY;
ALTER TABLE billing.refund_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.refund_events FORCE ROW LEVEL SECURITY;

CREATE POLICY billing_worker_checkout_access ON billing.checkout_intents TO djay_worker USING (true) WITH CHECK (true);
CREATE POLICY billing_platform_checkout_read ON billing.checkout_intents FOR SELECT TO djay_platform USING (true);
CREATE POLICY billing_worker_lifecycle_access ON billing.subscription_lifecycle_events TO djay_worker USING (true) WITH CHECK (true);
CREATE POLICY billing_platform_lifecycle_read ON billing.subscription_lifecycle_events FOR SELECT TO djay_platform USING (true);
CREATE POLICY billing_worker_invoice_access ON billing.invoice_documents TO djay_worker USING (true) WITH CHECK (true);
CREATE POLICY billing_platform_invoice_read ON billing.invoice_documents FOR SELECT TO djay_platform USING (true);
CREATE POLICY billing_worker_credit_access ON billing.credit_note_documents TO djay_worker USING (true) WITH CHECK (true);
CREATE POLICY billing_platform_credit_read ON billing.credit_note_documents FOR SELECT TO djay_platform USING (true);
CREATE POLICY billing_worker_payment_access ON billing.payment_events TO djay_worker USING (true) WITH CHECK (true);
CREATE POLICY billing_platform_payment_read ON billing.payment_events FOR SELECT TO djay_platform USING (true);
CREATE POLICY billing_worker_refund_access ON billing.refund_events TO djay_worker USING (true) WITH CHECK (true);
CREATE POLICY billing_platform_refund_read ON billing.refund_events FOR SELECT TO djay_platform USING (true);

REVOKE ALL ON billing.checkout_intents, billing.subscription_lifecycle_events,
  billing.invoice_documents, billing.credit_note_documents, billing.payment_events,
  billing.refund_events FROM PUBLIC;
REVOKE ALL ON FUNCTION billing.prepare_stripe_checkout(uuid, uuid, uuid, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION billing.complete_stripe_checkout(uuid, text, text, text, text, text, timestamptz, text, timestamptz) FROM PUBLIC;
GRANT USAGE ON SCHEMA billing TO djay_runtime;
GRANT SELECT, INSERT, UPDATE ON billing.checkout_intents TO djay_worker;
GRANT SELECT, INSERT ON billing.subscription_lifecycle_events, billing.invoice_documents,
  billing.credit_note_documents, billing.payment_events, billing.refund_events TO djay_worker;
GRANT SELECT ON billing.checkout_intents, billing.subscription_lifecycle_events,
  billing.invoice_documents, billing.credit_note_documents, billing.payment_events,
  billing.refund_events TO djay_platform, djay_readonly_ops;
GRANT EXECUTE ON FUNCTION billing.prepare_stripe_checkout(uuid, uuid, uuid, text, text, timestamptz) TO djay_runtime;
GRANT EXECUTE ON FUNCTION billing.complete_stripe_checkout(uuid, text, text, text, text, text, timestamptz, text, timestamptz) TO djay_runtime;
