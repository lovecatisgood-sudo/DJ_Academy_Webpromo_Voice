CREATE TABLE tenancy.subscription_add_ons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL,
  add_on_key text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  status text NOT NULL CHECK (status IN ('pending', 'active', 'scheduled_end', 'ended')),
  effective_from timestamptz NOT NULL,
  effective_until timestamptz,
  provider_item_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, subscription_id, add_on_key),
  FOREIGN KEY (tenant_id, subscription_id)
    REFERENCES tenancy.product_subscriptions(tenant_id, id) ON DELETE RESTRICT,
  CHECK (effective_until IS NULL OR effective_until > effective_from)
);

CREATE TABLE tenancy.subscription_scheduled_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL,
  from_plan_version_id uuid NOT NULL REFERENCES catalog.plan_versions(id) ON DELETE RESTRICT,
  to_plan_version_id uuid NOT NULL REFERENCES catalog.plan_versions(id) ON DELETE RESTRICT,
  effective_at timestamptz NOT NULL,
  retained_resource_selection jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL CHECK (status IN ('preflight', 'scheduled', 'applying', 'applied', 'cancelled', 'failed')),
  requested_by_user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  requested_by_membership_id uuid NOT NULL,
  request_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  failure_code text,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, subscription_id)
    REFERENCES tenancy.product_subscriptions(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, requested_by_membership_id)
    REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT,
  CHECK (from_plan_version_id <> to_plan_version_id)
);

CREATE UNIQUE INDEX tenancy_one_open_scheduled_change
  ON tenancy.subscription_scheduled_changes(tenant_id, subscription_id)
  WHERE status IN ('preflight', 'scheduled', 'applying');

CREATE TABLE tenancy.entitlement_resource_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  product_key text NOT NULL REFERENCES catalog.products(product_key) ON DELETE RESTRICT,
  resource_kind text NOT NULL CHECK (resource_kind IN (
    'bot', 'deployment', 'social_channel', 'knowledge_collection',
    'knowledge_source', 'workspace', 'membership'
  )),
  resource_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('active', 'read_only_excess', 'disabled_excess')),
  source_change_id uuid,
  reason_code text NOT NULL,
  disabled_at timestamptz,
  restored_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, product_key, resource_kind, resource_id),
  FOREIGN KEY (tenant_id, source_change_id)
    REFERENCES tenancy.subscription_scheduled_changes(tenant_id, id) ON DELETE RESTRICT,
  CHECK ((state = 'active' AND disabled_at IS NULL) OR state <> 'active')
);

CREATE TABLE tenancy.downgrade_preflight_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL,
  destination_plan_version_id uuid NOT NULL REFERENCES catalog.plan_versions(id) ON DELETE RESTRICT,
  current_resource_counts jsonb NOT NULL,
  destination_limits jsonb NOT NULL,
  blockers jsonb NOT NULL,
  required_selection jsonb NOT NULL,
  content_hash bytea NOT NULL CHECK (octet_length(content_hash) = 32),
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, subscription_id)
    REFERENCES tenancy.product_subscriptions(tenant_id, id) ON DELETE RESTRICT,
  CHECK (expires_at > evaluated_at)
);

CREATE TRIGGER tenancy_downgrade_preflight_immutable
BEFORE UPDATE OR DELETE ON tenancy.downgrade_preflight_evidence
FOR EACH ROW EXECUTE FUNCTION tenancy.reject_immutable_change();

CREATE OR REPLACE FUNCTION tenancy.administrator_seat_capacity(
  acceptance_check boolean DEFAULT false
)
RETURNS TABLE (allowed boolean, seat_limit integer, occupied integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
DECLARE
  tenant_id_value uuid;
  base_limit integer;
  add_on_quantity integer;
  occupied_value integer;
BEGIN
  IF session_user NOT IN ('djay_auth_runtime', 'djay_runtime') THEN
    RAISE EXCEPTION 'tenant_runtime_required';
  END IF;
  tenant_id_value := NULLIF(current_setting('app.tenant_id', true), '')::uuid;
  IF tenant_id_value IS NULL THEN RAISE EXCEPTION 'tenant_context_required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(tenant_id_value::text || ':administrator-seats', 0));

  SELECT COALESCE(max(NULLIF(snapshot.resolved_json->'limits'->>'seats', '')::integer), 1)
  INTO base_limit
  FROM tenancy.product_subscriptions subscription
  JOIN LATERAL (
    SELECT candidate.resolved_json
    FROM tenancy.entitlement_snapshots candidate
    WHERE candidate.tenant_id = subscription.tenant_id
      AND candidate.subscription_id = subscription.id
      AND candidate.access_mode = 'active'
    ORDER BY candidate.created_at DESC, candidate.id DESC LIMIT 1
  ) snapshot ON true
  WHERE subscription.tenant_id = tenant_id_value
    AND subscription.status IN ('active', 'trialing', 'scheduled_change');

  SELECT COALESCE(sum(add_on.quantity), 0)::integer INTO add_on_quantity
  FROM tenancy.subscription_add_ons add_on
  WHERE add_on.tenant_id = tenant_id_value
    AND add_on.add_on_key = 'additional_administrator'
    AND add_on.status IN ('active', 'scheduled_end')
    AND add_on.effective_from <= now()
    AND (add_on.effective_until IS NULL OR add_on.effective_until > now());

  SELECT (
    (SELECT count(*) FROM tenancy.memberships membership
      WHERE membership.tenant_id = tenant_id_value AND membership.status = 'active')
    +
    (SELECT count(*) FROM tenancy.membership_invitations invitation
      WHERE invitation.tenant_id = tenant_id_value AND invitation.status = 'pending'
        AND invitation.expires_at > now())
  )::integer INTO occupied_value;

  RETURN QUERY SELECT
    CASE WHEN acceptance_check THEN occupied_value <= base_limit + add_on_quantity
      ELSE occupied_value < base_limit + add_on_quantity END,
    base_limit + add_on_quantity,
    occupied_value;
END
$$;

ALTER TABLE tenancy.subscription_add_ons ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.subscription_add_ons FORCE ROW LEVEL SECURITY;
ALTER TABLE tenancy.subscription_scheduled_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.subscription_scheduled_changes FORCE ROW LEVEL SECURITY;
ALTER TABLE tenancy.entitlement_resource_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.entitlement_resource_states FORCE ROW LEVEL SECURITY;
ALTER TABLE tenancy.downgrade_preflight_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.downgrade_preflight_evidence FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_subscription_add_ons_isolation ON tenancy.subscription_add_ons
  USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_scheduled_changes_isolation ON tenancy.subscription_scheduled_changes
  USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_resource_states_isolation ON tenancy.entitlement_resource_states
  USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY tenant_downgrade_preflight_isolation ON tenancy.downgrade_preflight_evidence
  USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON tenancy.subscription_add_ons, tenancy.subscription_scheduled_changes,
  tenancy.entitlement_resource_states, tenancy.downgrade_preflight_evidence FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.administrator_seat_capacity(boolean) FROM PUBLIC;

GRANT SELECT ON tenancy.subscription_add_ons, tenancy.subscription_scheduled_changes,
  tenancy.entitlement_resource_states, tenancy.downgrade_preflight_evidence
  TO djay_runtime, djay_readonly_ops;
GRANT INSERT, UPDATE ON tenancy.subscription_scheduled_changes,
  tenancy.entitlement_resource_states TO djay_runtime;
GRANT INSERT ON tenancy.downgrade_preflight_evidence TO djay_runtime;
GRANT EXECUTE ON FUNCTION tenancy.administrator_seat_capacity(boolean)
  TO djay_auth_runtime, djay_runtime;
