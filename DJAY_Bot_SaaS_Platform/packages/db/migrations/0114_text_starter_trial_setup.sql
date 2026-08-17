CREATE TABLE billing.text_trial_card_setups (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  purchase_intent_id uuid NOT NULL UNIQUE REFERENCES billing.purchase_intents(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'ready', 'activated')),
  external_customer_ref text,
  external_setup_intent_ref text UNIQUE,
  external_payment_method_ref text,
  fingerprint_hash bytea CHECK (fingerprint_hash IS NULL OR octet_length(fingerprint_hash) = 32),
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 16 AND 200),
  requested_by_user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  requested_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  provider_ready_at timestamptz,
  activated_at timestamptz,
  FOREIGN KEY (requested_by_membership_id, tenant_id)
    REFERENCES tenancy.memberships(id, tenant_id) ON DELETE RESTRICT,
  CHECK (
    (status = 'requested' AND external_customer_ref IS NULL AND external_setup_intent_ref IS NULL
      AND external_payment_method_ref IS NULL AND fingerprint_hash IS NULL
      AND provider_ready_at IS NULL AND activated_at IS NULL)
    OR (status = 'ready' AND external_customer_ref IS NOT NULL AND external_setup_intent_ref IS NOT NULL
      AND external_payment_method_ref IS NULL AND fingerprint_hash IS NULL
      AND provider_ready_at IS NOT NULL AND activated_at IS NULL)
    OR (status = 'activated' AND external_customer_ref IS NOT NULL AND external_setup_intent_ref IS NOT NULL
      AND external_payment_method_ref IS NOT NULL AND fingerprint_hash IS NOT NULL
      AND provider_ready_at IS NOT NULL AND activated_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX text_trial_card_setups_tenant_idempotency_uidx
  ON billing.text_trial_card_setups (tenant_id, idempotency_key);

ALTER TABLE billing.text_trial_card_setups ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.text_trial_card_setups FORCE ROW LEVEL SECURITY;
CREATE POLICY billing_tenant_text_trial_card_setups ON billing.text_trial_card_setups
  TO djay_runtime USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY billing_platform_text_trial_card_setups ON billing.text_trial_card_setups
  FOR SELECT TO djay_platform USING (true);

REVOKE ALL ON billing.text_trial_card_setups FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON billing.text_trial_card_setups TO djay_runtime;
GRANT SELECT ON billing.text_trial_card_setups TO djay_platform, djay_readonly_ops;
