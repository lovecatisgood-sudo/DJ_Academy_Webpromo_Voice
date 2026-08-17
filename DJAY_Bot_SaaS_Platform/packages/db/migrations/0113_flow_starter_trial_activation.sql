CREATE TABLE billing.trial_grants (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  purchase_intent_id uuid NOT NULL UNIQUE REFERENCES billing.purchase_intents(id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL UNIQUE,
  plan_version_id uuid NOT NULL REFERENCES catalog.plan_versions(id) ON DELETE RESTRICT,
  product_key text NOT NULL CHECK (product_key IN ('flowbot', 'ai_chat')),
  eligibility_subject_kind text NOT NULL
    CHECK (eligibility_subject_kind IN ('verified_email', 'stripe_card_fingerprint')),
  eligibility_subject_hash bytea NOT NULL CHECK (octet_length(eligibility_subject_hash) = 32),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'exhausted', 'expired', 'cancelled')),
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  channel_scope text[] NOT NULL DEFAULT ARRAY['website']::text[],
  allowance_unit text NOT NULL
    CHECK (allowance_unit IN ('flow_conversation_started', 'ai_customer_reply_committed')),
  allowance_quantity integer NOT NULL CHECK (allowance_quantity > 0),
  consumed_quantity integer NOT NULL DEFAULT 0
    CHECK (consumed_quantity >= 0 AND consumed_quantity <= allowance_quantity),
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 16 AND 200),
  activated_by_user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  activated_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, subscription_id)
    REFERENCES tenancy.product_subscriptions(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (activated_by_membership_id, tenant_id)
    REFERENCES tenancy.memberships(id, tenant_id) ON DELETE RESTRICT,
  CHECK (expires_at = starts_at + interval '30 days'),
  CHECK (channel_scope = ARRAY['website']::text[]),
  CHECK (
    (product_key = 'flowbot' AND eligibility_subject_kind = 'verified_email'
      AND allowance_unit = 'flow_conversation_started' AND allowance_quantity = 5000)
    OR
    (product_key = 'ai_chat' AND eligibility_subject_kind = 'stripe_card_fingerprint'
      AND allowance_unit = 'ai_customer_reply_committed' AND allowance_quantity = 500)
  )
);

CREATE UNIQUE INDEX trial_grants_subject_product_uidx
  ON billing.trial_grants (eligibility_subject_kind, eligibility_subject_hash, product_key);
CREATE UNIQUE INDEX trial_grants_tenant_idempotency_uidx
  ON billing.trial_grants (tenant_id, idempotency_key);
CREATE INDEX trial_grants_expiry_idx
  ON billing.trial_grants (expires_at) WHERE status = 'active';

CREATE OR REPLACE FUNCTION billing.current_tenant_verified_owner_email_hash()
RETURNS bytea
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, billing, tenancy, identity
AS $$
  SELECT public.digest(convert_to(email.email_normalized, 'UTF8'), 'sha256')
  FROM tenancy.memberships owner
  JOIN identity.users account_owner ON account_owner.id = owner.user_id
    AND account_owner.status = 'active'
  JOIN identity.email_addresses email ON email.user_id = account_owner.id
    AND email.is_primary = true AND email.verified_at IS NOT NULL
  WHERE owner.tenant_id = tenancy.current_tenant_id()
    AND owner.role = 'tenant_master_admin' AND owner.status = 'active'
  ORDER BY owner.accepted_at, owner.id
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION billing.current_tenant_verified_owner_email_hash() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION billing.current_tenant_verified_owner_email_hash() TO djay_runtime;

ALTER TABLE billing.purchase_intents
  ADD COLUMN activated_trial_grant_id uuid UNIQUE
    REFERENCES billing.trial_grants(id) ON DELETE RESTRICT;

ALTER TABLE billing.purchase_intents
  DROP CONSTRAINT purchase_intents_status_check,
  DROP CONSTRAINT purchase_intents_check1,
  DROP CONSTRAINT purchase_intents_check2;

ALTER TABLE billing.purchase_intents
  ADD CONSTRAINT purchase_intents_status_check
    CHECK (status IN ('open', 'consumed', 'trial_activated', 'expired', 'canceled')),
  ADD CONSTRAINT purchase_intents_consumption_check CHECK (
    (status = 'consumed' AND consumed_at IS NOT NULL
      AND consumed_checkout_intent_id IS NOT NULL AND activated_trial_grant_id IS NULL)
    OR (status = 'trial_activated' AND consumed_at IS NOT NULL
      AND consumed_checkout_intent_id IS NULL AND activated_trial_grant_id IS NOT NULL)
    OR status IN ('open', 'expired', 'canceled')
  ),
  ADD CONSTRAINT purchase_intents_open_state_check CHECK (
    (status IN ('open', 'expired', 'canceled') AND consumed_at IS NULL
      AND consumed_checkout_intent_id IS NULL AND activated_trial_grant_id IS NULL)
    OR status IN ('consumed', 'trial_activated')
  );

ALTER TABLE billing.trial_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.trial_grants FORCE ROW LEVEL SECURITY;

CREATE POLICY billing_tenant_trial_grants ON billing.trial_grants
  TO djay_runtime
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY billing_platform_trial_grants ON billing.trial_grants
  FOR SELECT TO djay_platform USING (true);
CREATE POLICY billing_worker_trial_grants ON billing.trial_grants
  TO djay_worker USING (true) WITH CHECK (true);

REVOKE ALL ON billing.trial_grants FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON billing.trial_grants TO djay_runtime;
GRANT SELECT ON billing.trial_grants TO djay_platform, djay_readonly_ops;
GRANT SELECT, INSERT, UPDATE ON billing.trial_grants TO djay_worker;
