CREATE TABLE billing.portal_intents (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  payment_customer_id uuid NOT NULL REFERENCES billing.payment_customers(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 16 AND 200),
  status text NOT NULL CHECK (status IN ('prepared', 'ready', 'failed')),
  portal_url_ciphertext text,
  expires_at timestamptz,
  failure_code text,
  created_by_user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  CHECK ((status = 'ready' AND portal_url_ciphertext IS NOT NULL AND expires_at IS NOT NULL) OR status <> 'ready'),
  CHECK ((status = 'failed' AND failure_code IS NOT NULL) OR status <> 'failed')
);

CREATE OR REPLACE FUNCTION billing.prepare_stripe_portal(
  portal_intent_id uuid, requested_idempotency_key text, prepared_at timestamptz DEFAULT now()
)
RETURNS TABLE (intent_id uuid, external_customer_ref text, replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, billing, tenancy AS $$
DECLARE tenant_context_id uuid; actor_id uuid; existing billing.portal_intents%ROWTYPE;
BEGIN
  tenant_context_id := tenancy.current_tenant_id();
  actor_id := NULLIF(current_setting('app.user_id', true), '')::uuid;
  IF session_user <> 'djay_runtime' OR tenant_context_id IS NULL OR actor_id IS NULL THEN
    RAISE EXCEPTION 'tenant_portal_authority_required';
  END IF;
  IF char_length(requested_idempotency_key) NOT BETWEEN 16 AND 200 THEN
    RAISE EXCEPTION 'portal_request_invalid';
  END IF;
  SELECT * INTO existing FROM billing.portal_intents
    WHERE tenant_id = tenant_context_id AND idempotency_key = requested_idempotency_key;
  IF existing.id IS NOT NULL THEN
    RETURN QUERY SELECT existing.id, customer.external_customer_ref, true
      FROM billing.payment_customers customer WHERE customer.id = existing.payment_customer_id;
    RETURN;
  END IF;
  RETURN QUERY
    WITH customer AS (
      SELECT source.* FROM billing.payment_customers source
      WHERE source.tenant_id = tenant_context_id AND source.provider_key = 'stripe'
        AND source.external_customer_ref ~ '^cus_[A-Za-z0-9]+$'
    ), inserted AS (
      INSERT INTO billing.portal_intents (
        id, tenant_id, payment_customer_id, idempotency_key, status,
        created_by_user_id, created_at, updated_at
      ) SELECT portal_intent_id, tenant_context_id, customer.id, requested_idempotency_key,
        'prepared', actor_id, prepared_at, prepared_at FROM customer RETURNING *
    ) SELECT inserted.id, customer.external_customer_ref, false FROM inserted JOIN customer ON true;
  IF NOT FOUND THEN RAISE EXCEPTION 'stripe_customer_unavailable'; END IF;
END
$$;

CREATE OR REPLACE FUNCTION billing.complete_stripe_portal(
  target_intent_id uuid, expected_idempotency_key text, portal_url_ciphertext_value text,
  expires_at_value timestamptz, failure_code_value text, completed_at timestamptz DEFAULT now()
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, billing, tenancy AS $$
DECLARE tenant_context_id uuid; target billing.portal_intents%ROWTYPE;
BEGIN
  tenant_context_id := tenancy.current_tenant_id();
  IF session_user <> 'djay_runtime' OR tenant_context_id IS NULL THEN
    RAISE EXCEPTION 'tenant_portal_authority_required';
  END IF;
  SELECT * INTO target FROM billing.portal_intents WHERE tenant_id = tenant_context_id
    AND id = target_intent_id AND idempotency_key = expected_idempotency_key FOR UPDATE;
  IF target.id IS NULL THEN RAISE EXCEPTION 'portal_intent_not_found'; END IF;
  IF target.status = 'ready' THEN RETURN 'ready'; END IF;
  IF target.status <> 'prepared' THEN RAISE EXCEPTION 'portal_intent_not_prepared'; END IF;
  IF failure_code_value IS NOT NULL THEN
    UPDATE billing.portal_intents SET status = 'failed', failure_code = left(failure_code_value, 100),
      updated_at = completed_at WHERE id = target.id; RETURN 'failed';
  END IF;
  IF portal_url_ciphertext_value IS NULL OR expires_at_value <= completed_at THEN
    RAISE EXCEPTION 'portal_provider_response_invalid';
  END IF;
  UPDATE billing.portal_intents SET status = 'ready', portal_url_ciphertext = portal_url_ciphertext_value,
    expires_at = expires_at_value, updated_at = completed_at WHERE id = target.id;
  RETURN 'ready';
END
$$;

ALTER TABLE billing.portal_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.portal_intents FORCE ROW LEVEL SECURITY;
CREATE POLICY billing_worker_portal_access ON billing.portal_intents TO djay_worker USING (true) WITH CHECK (true);
CREATE POLICY billing_platform_portal_read ON billing.portal_intents FOR SELECT TO djay_platform USING (true);
REVOKE ALL ON billing.portal_intents FROM PUBLIC;
REVOKE ALL ON FUNCTION billing.prepare_stripe_portal(uuid, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION billing.complete_stripe_portal(uuid, text, text, timestamptz, text, timestamptz) FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON billing.portal_intents TO djay_worker;
GRANT SELECT ON billing.portal_intents TO djay_platform, djay_readonly_ops;
GRANT EXECUTE ON FUNCTION billing.prepare_stripe_portal(uuid, text, timestamptz) TO djay_runtime;
GRANT EXECUTE ON FUNCTION billing.complete_stripe_portal(uuid, text, text, timestamptz, text, timestamptz) TO djay_runtime;
