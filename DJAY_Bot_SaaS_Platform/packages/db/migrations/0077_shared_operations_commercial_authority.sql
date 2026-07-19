UPDATE tenancy.add_on_requests
SET add_on_key = 'starter_branding_removal'
WHERE add_on_key = 'branding_removal';

UPDATE tenancy.subscription_add_ons
SET add_on_key = 'starter_branding_removal'
WHERE add_on_key = 'branding_removal';

ALTER TABLE tenancy.add_on_requests
  DROP CONSTRAINT add_on_requests_add_on_key_check,
  ADD COLUMN idempotency_key text,
  ADD CONSTRAINT add_on_requests_add_on_key_check CHECK (add_on_key IN (
    'additional_administrator','additional_workspace','additional_social_channel','starter_branding_removal'
  )),
  ADD CONSTRAINT add_on_requests_unit_quantity_check CHECK (
    (add_on_key IN ('additional_workspace','starter_branding_removal') AND quantity = 1)
    OR (add_on_key NOT IN ('additional_workspace','starter_branding_removal') AND quantity BETWEEN 1 AND 100)
  );

UPDATE tenancy.add_on_requests SET idempotency_key = id::text WHERE idempotency_key IS NULL;
ALTER TABLE tenancy.add_on_requests ALTER COLUMN idempotency_key SET NOT NULL;
ALTER TABLE tenancy.add_on_requests ADD CONSTRAINT add_on_requests_idempotency UNIQUE (tenant_id, idempotency_key);

CREATE OR REPLACE FUNCTION tenancy.active_branding_removal(target_tenant_id uuid, target_product_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
BEGIN
  IF target_product_key NOT IN ('flowbot', 'ai_chat', 'voice') THEN
    RAISE EXCEPTION 'invalid_product_key';
  END IF;
  IF session_user = 'djay_runtime' AND target_tenant_id <> tenancy.current_tenant_id() THEN
    RAISE EXCEPTION 'tenant_context_mismatch';
  END IF;
  IF session_user NOT IN ('djay_runtime', 'djay_flowbot_runtime', 'djay_ai_runtime', 'djay_voice_runtime') THEN
    RAISE EXCEPTION 'runtime_role_required';
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM tenancy.product_subscriptions subscription
    JOIN LATERAL (
      SELECT snapshot.resolved_json
      FROM tenancy.entitlement_snapshots snapshot
      WHERE snapshot.tenant_id = subscription.tenant_id AND snapshot.subscription_id = subscription.id
        AND snapshot.product_key = target_product_key AND snapshot.access_mode = 'active'
      ORDER BY snapshot.created_at DESC, snapshot.id DESC LIMIT 1
    ) snapshot ON true
    WHERE subscription.tenant_id = target_tenant_id
      AND subscription.product_key = target_product_key
      AND subscription.status IN ('active', 'trialing', 'scheduled_change')
      AND COALESCE((snapshot.resolved_json->'entitlements'->>'branding.remove')::boolean, false)
  ) OR EXISTS (
    SELECT 1 FROM tenancy.subscription_add_ons add_on
    JOIN tenancy.product_subscriptions subscription
      ON subscription.tenant_id = add_on.tenant_id AND subscription.id = add_on.subscription_id
      AND subscription.status IN ('active', 'trialing', 'scheduled_change')
    WHERE add_on.tenant_id = target_tenant_id AND add_on.add_on_key = 'starter_branding_removal'
      AND subscription.product_key = target_product_key
      AND add_on.status IN ('active', 'scheduled_end') AND add_on.effective_from <= now()
      AND (add_on.effective_until IS NULL OR add_on.effective_until > now())
  );
END
$$;

REVOKE ALL ON FUNCTION tenancy.active_branding_removal(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.active_branding_removal(uuid, text) TO djay_runtime, djay_flowbot_runtime, djay_ai_runtime, djay_voice_runtime;
