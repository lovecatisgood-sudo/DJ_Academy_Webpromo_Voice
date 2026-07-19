CREATE TABLE tenancy.provider_usage_reconciliation_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  provider_usage_event_id uuid NOT NULL,
  customer_usage_event_id uuid,
  status text NOT NULL CHECK (status IN (
    'matched', 'missing_correlation', 'invalid_correlation', 'missing_customer_event', 'correlation_mismatch'
  )),
  evidence_json jsonb NOT NULL,
  reconciled_at timestamptz NOT NULL,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, provider_usage_event_id),
  FOREIGN KEY (tenant_id, provider_usage_event_id)
    REFERENCES tenancy.provider_usage_events(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, customer_usage_event_id)
    REFERENCES tenancy.usage_events(tenant_id, id) ON DELETE RESTRICT
);

CREATE POLICY platform_provider_usage_event_access
  ON tenancy.provider_usage_events TO djay_platform
  USING (session_user = 'djay_platform');
CREATE POLICY readonly_provider_usage_event_access
  ON tenancy.provider_usage_events TO djay_readonly_ops
  USING (session_user = 'djay_readonly_ops');

CREATE TRIGGER tenancy_provider_usage_reconciliation_immutable
BEFORE UPDATE OR DELETE ON tenancy.provider_usage_reconciliation_results
FOR EACH ROW EXECUTE FUNCTION tenancy.reject_immutable_change();

ALTER TABLE tenancy.provider_usage_reconciliation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.provider_usage_reconciliation_results FORCE ROW LEVEL SECURITY;
CREATE POLICY worker_provider_usage_reconciliation_access
  ON tenancy.provider_usage_reconciliation_results TO djay_worker
  USING (session_user = 'djay_worker') WITH CHECK (session_user = 'djay_worker');
CREATE POLICY platform_provider_usage_reconciliation_access
  ON tenancy.provider_usage_reconciliation_results TO djay_platform
  USING (session_user = 'djay_platform');
CREATE POLICY readonly_provider_usage_reconciliation_access
  ON tenancy.provider_usage_reconciliation_results TO djay_readonly_ops
  USING (session_user = 'djay_readonly_ops');

CREATE TABLE platform.usage_reconciliation_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  reconciliation_result_id uuid NOT NULL,
  requested_action text NOT NULL CHECK (requested_action IN (
    'investigate', 'accept_provider_only', 'correct_correlation', 'request_provider_credit'
  )),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 8 AND 1000),
  requested_by_platform_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, reconciliation_result_id),
  FOREIGN KEY (tenant_id, reconciliation_result_id)
    REFERENCES tenancy.provider_usage_reconciliation_results(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE platform.usage_reconciliation_case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('requested', 'approved', 'rejected', 'closed_no_balance_change')),
  actor_platform_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  safe_note text CHECK (safe_note IS NULL OR char_length(safe_note) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, case_id, event_type),
  FOREIGN KEY (tenant_id, case_id)
    REFERENCES platform.usage_reconciliation_cases(tenant_id, id) ON DELETE RESTRICT
);

CREATE TRIGGER platform_usage_reconciliation_case_immutable
BEFORE UPDATE OR DELETE ON platform.usage_reconciliation_cases
FOR EACH ROW EXECUTE FUNCTION tenancy.reject_immutable_change();
CREATE TRIGGER platform_usage_reconciliation_case_event_immutable
BEFORE UPDATE OR DELETE ON platform.usage_reconciliation_case_events
FOR EACH ROW EXECUTE FUNCTION tenancy.reject_immutable_change();

REVOKE ALL ON tenancy.provider_usage_reconciliation_results,
  platform.usage_reconciliation_cases, platform.usage_reconciliation_case_events FROM PUBLIC;
GRANT SELECT, INSERT ON tenancy.provider_usage_reconciliation_results TO djay_worker;
GRANT SELECT ON tenancy.provider_usage_reconciliation_results TO djay_platform, djay_readonly_ops;
GRANT SELECT ON platform.usage_reconciliation_cases,
  platform.usage_reconciliation_case_events TO djay_platform, djay_readonly_ops;

CREATE OR REPLACE FUNCTION tenancy.reconcile_provider_usage_events(
  reconciled_at_value timestamptz DEFAULT now(),
  event_limit integer DEFAULT 500
)
RETURNS TABLE (matched integer, attention integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy, operations
AS $$
DECLARE
  provider_event record;
  correlation_text text;
  customer_event tenancy.usage_events%ROWTYPE;
  result_status text;
  matched_count integer := 0;
  attention_count integer := 0;
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'usage_reconciliation_worker' THEN
    RAISE EXCEPTION 'usage reconciliation worker context required';
  END IF;
  IF event_limit < 1 OR event_limit > 5000 THEN RAISE EXCEPTION 'event_limit_invalid'; END IF;

  FOR provider_event IN
    SELECT event.* FROM tenancy.provider_usage_events event
    WHERE NOT EXISTS (
      SELECT 1 FROM tenancy.provider_usage_reconciliation_results result
      WHERE result.tenant_id = event.tenant_id AND result.provider_usage_event_id = event.id
    )
    ORDER BY event.occurred_at, event.id
    FOR UPDATE OF event SKIP LOCKED LIMIT event_limit
  LOOP
    correlation_text := provider_event.metadata->>'customerUsageEventId';
    customer_event := NULL;
    IF correlation_text IS NULL OR btrim(correlation_text) = '' THEN
      result_status := 'missing_correlation';
    ELSIF correlation_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      result_status := 'invalid_correlation';
    ELSE
      SELECT usage.* INTO customer_event
      FROM tenancy.usage_events usage
      WHERE usage.tenant_id = provider_event.tenant_id
        AND usage.id = correlation_text::uuid;
      IF customer_event.id IS NULL THEN
        result_status := 'missing_customer_event';
      ELSIF customer_event.subscription_id <> provider_event.subscription_id THEN
        result_status := 'correlation_mismatch';
        customer_event := NULL;
      ELSE
        result_status := 'matched';
      END IF;
    END IF;

    INSERT INTO tenancy.provider_usage_reconciliation_results (
      tenant_id, provider_usage_event_id, customer_usage_event_id,
      status, evidence_json, reconciled_at
    ) VALUES (
      provider_event.tenant_id, provider_event.id, customer_event.id,
      result_status,
      jsonb_build_object(
        'correlationMethod', 'customerUsageEventId',
        'providerOccurredAt', provider_event.occurred_at,
        'customerOccurredAt', customer_event.occurred_at,
        'customerUnit', customer_event.customer_unit,
        'customerQuantity', customer_event.customer_quantity
      ),
      reconciled_at_value
    ) ON CONFLICT (tenant_id, provider_usage_event_id) DO NOTHING;
    IF result_status = 'matched' THEN matched_count := matched_count + 1;
    ELSE
      attention_count := attention_count + 1;
      INSERT INTO operations.audit_logs (
        realm, action, target_type, target_id, request_id, result, metadata
      ) VALUES (
        'system', 'usage.provider_reconciliation_attention', 'provider_usage_event',
        provider_event.id::text, COALESCE(current_setting('app.request_id', true), 'usage-reconciliation-worker'),
        'failed', jsonb_build_object('status', result_status, 'tenantId', provider_event.tenant_id)
      );
    END IF;
  END LOOP;
  RETURN QUERY SELECT matched_count, attention_count;
END
$$;

CREATE OR REPLACE FUNCTION platform.request_usage_reconciliation_case(
  target_tenant_id uuid,
  target_result_id uuid,
  action_value text,
  reason_value text,
  requested_at_value timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform, tenancy
AS $$
DECLARE actor_id uuid; actor_role text; case_id uuid;
BEGIN
  actor_id := NULLIF(current_setting('app.platform_user_id', true), '')::uuid;
  actor_role := current_setting('app.platform_role', true);
  IF session_user <> 'djay_platform' OR actor_id IS NULL
     OR actor_role NOT IN ('platform_owner', 'platform_finance') THEN
    RAISE EXCEPTION 'platform_finance_authority_required';
  END IF;
  IF action_value NOT IN ('investigate', 'accept_provider_only', 'correct_correlation', 'request_provider_credit')
     OR char_length(reason_value) < 8 OR char_length(reason_value) > 1000 THEN
    RAISE EXCEPTION 'usage_reconciliation_case_invalid';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM tenancy.provider_usage_reconciliation_results result
    WHERE result.tenant_id = target_tenant_id AND result.id = target_result_id
      AND result.status <> 'matched'
  ) THEN RAISE EXCEPTION 'usage_reconciliation_attention_result_required'; END IF;
  case_id := gen_random_uuid();
  INSERT INTO platform.usage_reconciliation_cases (
    id, tenant_id, reconciliation_result_id, requested_action, reason,
    requested_by_platform_user_id, requested_at
  ) VALUES (
    case_id, target_tenant_id, target_result_id, action_value, reason_value,
    actor_id, requested_at_value
  );
  INSERT INTO platform.usage_reconciliation_case_events (
    tenant_id, case_id, event_type, actor_platform_user_id, safe_note, created_at
  ) VALUES (target_tenant_id, case_id, 'requested', actor_id, reason_value, requested_at_value);
  RETURN case_id;
END
$$;

CREATE OR REPLACE FUNCTION platform.review_usage_reconciliation_case(
  target_case_id uuid,
  approve boolean,
  note_value text,
  reviewed_at_value timestamptz DEFAULT now()
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
DECLARE actor_id uuid; actor_role text; target_case platform.usage_reconciliation_cases%ROWTYPE; event_value text;
BEGIN
  actor_id := NULLIF(current_setting('app.platform_user_id', true), '')::uuid;
  actor_role := current_setting('app.platform_role', true);
  IF session_user <> 'djay_platform' OR actor_id IS NULL
     OR actor_role NOT IN ('platform_owner', 'platform_finance') THEN
    RAISE EXCEPTION 'platform_finance_authority_required';
  END IF;
  SELECT * INTO target_case FROM platform.usage_reconciliation_cases WHERE id = target_case_id;
  IF target_case.id IS NULL THEN RAISE EXCEPTION 'usage_reconciliation_case_not_found'; END IF;
  IF target_case.requested_by_platform_user_id = actor_id THEN RAISE EXCEPTION 'different_reviewer_required'; END IF;
  IF EXISTS (SELECT 1 FROM platform.usage_reconciliation_case_events event
    WHERE event.case_id = target_case_id AND event.event_type IN ('approved', 'rejected')) THEN
    RAISE EXCEPTION 'usage_reconciliation_case_already_reviewed';
  END IF;
  event_value := CASE WHEN approve THEN 'approved' ELSE 'rejected' END;
  INSERT INTO platform.usage_reconciliation_case_events (
    tenant_id, case_id, event_type, actor_platform_user_id, safe_note, created_at
  ) VALUES (
    target_case.tenant_id, target_case.id, event_value, actor_id,
    left(NULLIF(note_value, ''), 1000), reviewed_at_value
  );
  RETURN event_value;
END
$$;

REVOKE ALL ON FUNCTION tenancy.reconcile_provider_usage_events(timestamptz, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.request_usage_reconciliation_case(uuid, uuid, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.review_usage_reconciliation_case(uuid, boolean, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.reconcile_provider_usage_events(timestamptz, integer) TO djay_worker;
GRANT EXECUTE ON FUNCTION platform.request_usage_reconciliation_case(uuid, uuid, text, text, timestamptz) TO djay_platform;
GRANT EXECUTE ON FUNCTION platform.review_usage_reconciliation_case(uuid, boolean, text, timestamptz) TO djay_platform;
