CREATE TABLE billing.subscription_cancellation_requests (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('schedule', 'revoke')),
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 16 AND 200),
  status text NOT NULL CHECK (status IN ('prepared', 'scheduled', 'revoked', 'applied', 'failed')),
  external_subscription_ref text NOT NULL,
  effective_at timestamptz,
  failure_code text,
  requested_by_user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  requested_by_membership_id uuid NOT NULL,
  request_id text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, subscription_id)
    REFERENCES tenancy.product_subscriptions(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, requested_by_membership_id)
    REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT,
  CHECK ((status = 'failed' AND failure_code IS NOT NULL) OR status <> 'failed'),
  CHECK ((status IN ('scheduled', 'applied') AND action = 'schedule' AND effective_at IS NOT NULL)
    OR status NOT IN ('scheduled', 'applied'))
);

CREATE UNIQUE INDEX billing_one_prepared_cancellation_action
  ON billing.subscription_cancellation_requests(tenant_id, subscription_id)
  WHERE status = 'prepared';

CREATE TABLE billing.subscription_cancellation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL,
  cancellation_request_id uuid REFERENCES billing.subscription_cancellation_requests(id) ON DELETE RESTRICT,
  webhook_event_id uuid REFERENCES billing.webhook_events(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN (
    'requested', 'provider_scheduled', 'provider_revoked', 'provider_failed', 'provider_cancelled'
  )),
  effective_at timestamptz,
  actor_user_id uuid REFERENCES identity.users(id) ON DELETE RESTRICT,
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE NULLS NOT DISTINCT (cancellation_request_id, webhook_event_id, event_type),
  FOREIGN KEY (tenant_id, subscription_id)
    REFERENCES tenancy.product_subscriptions(tenant_id, id) ON DELETE RESTRICT
);

CREATE TRIGGER billing_subscription_cancellation_event_immutable
BEFORE UPDATE OR DELETE ON billing.subscription_cancellation_events
FOR EACH ROW EXECUTE FUNCTION billing.reject_financial_evidence_change();

CREATE OR REPLACE FUNCTION billing.confirm_subscription_cancellation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, billing AS $$
DECLARE request_id_value uuid;
BEGIN
  IF NEW.next_status <> 'cancelled' THEN RETURN NEW; END IF;
  SELECT request.id INTO request_id_value
  FROM billing.subscription_cancellation_requests request
  WHERE request.tenant_id = NEW.tenant_id AND request.subscription_id = NEW.subscription_id
    AND request.action = 'schedule' AND request.status = 'scheduled'
  ORDER BY request.created_at DESC, request.id DESC LIMIT 1 FOR UPDATE;
  IF request_id_value IS NOT NULL THEN
    UPDATE billing.subscription_cancellation_requests SET status = 'applied',
      effective_at = COALESCE(effective_at, NEW.effective_at), updated_at = NEW.recorded_at
    WHERE id = request_id_value;
  END IF;
  INSERT INTO billing.subscription_cancellation_events (
    tenant_id, subscription_id, cancellation_request_id, webhook_event_id,
    event_type, effective_at, safe_metadata, recorded_at
  ) VALUES (NEW.tenant_id, NEW.subscription_id, request_id_value, NEW.webhook_event_id,
    'provider_cancelled', NEW.effective_at,
    jsonb_build_object('providerStatus', NEW.provider_status), NEW.recorded_at)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END
$$;

CREATE TRIGGER billing_subscription_cancellation_confirmed
AFTER INSERT ON billing.subscription_lifecycle_events
FOR EACH ROW EXECUTE FUNCTION billing.confirm_subscription_cancellation();

CREATE OR REPLACE FUNCTION billing.synchronize_stripe_subscription_terms(
  target_webhook_event_id uuid, stripe_object jsonb, synchronized_at_value timestamptz DEFAULT now()
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, billing, tenancy AS $$
DECLARE event billing.webhook_events%ROWTYPE; link billing.subscription_links%ROWTYPE;
  period_start_value timestamptz; period_end_value timestamptz; cancel_at_value timestamptz;
  cancel_at_period_end_value boolean; external_subscription_ref_value text;
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'billing_webhook_worker' THEN
    RAISE EXCEPTION 'billing_webhook_worker_authority_required';
  END IF;
  SELECT * INTO event FROM billing.webhook_events
  WHERE id = target_webhook_event_id AND provider_key = 'stripe';
  IF event.id IS NULL OR event.event_type NOT IN (
    'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'
  ) THEN RETURN 'not_subscription_event'; END IF;
  external_subscription_ref_value := stripe_object ->> 'id';
  SELECT * INTO link FROM billing.subscription_links
  WHERE provider_key = 'stripe' AND external_subscription_ref = external_subscription_ref_value;
  IF link.subscription_id IS NULL THEN RETURN 'authority_not_found'; END IF;
  BEGIN
    period_start_value := to_timestamp(NULLIF(stripe_object ->> 'current_period_start', '')::double precision);
    period_end_value := to_timestamp(NULLIF(stripe_object ->> 'current_period_end', '')::double precision);
    cancel_at_value := to_timestamp(NULLIF(stripe_object ->> 'cancel_at', '')::double precision);
    cancel_at_period_end_value := COALESCE((stripe_object ->> 'cancel_at_period_end')::boolean, false);
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
    RAISE EXCEPTION 'stripe_subscription_terms_invalid';
  END;
  IF event.event_type <> 'customer.subscription.deleted'
     AND (period_start_value IS NULL OR period_end_value IS NULL OR period_end_value <= period_start_value) THEN
    RAISE EXCEPTION 'stripe_subscription_period_invalid';
  END IF;
  UPDATE tenancy.product_subscriptions SET
    period_start = COALESCE(period_start_value, period_start),
    period_end = COALESCE(period_end_value, period_end),
    cancel_at = CASE WHEN cancel_at_period_end_value
      THEN COALESCE(cancel_at_value, period_end_value) ELSE NULL END,
    updated_at = GREATEST(updated_at, synchronized_at_value)
  WHERE tenant_id = link.tenant_id AND id = link.subscription_id;
  IF cancel_at_period_end_value THEN
    UPDATE billing.subscription_cancellation_requests SET status = 'scheduled',
      effective_at = COALESCE(cancel_at_value, period_end_value), updated_at = synchronized_at_value
    WHERE id = (
      SELECT request.id FROM billing.subscription_cancellation_requests request
      WHERE request.tenant_id = link.tenant_id AND request.subscription_id = link.subscription_id
        AND request.action = 'schedule' AND request.status = 'prepared'
      ORDER BY request.created_at DESC, request.id DESC LIMIT 1
    );
  END IF;
  RETURN 'synchronized';
END
$$;

CREATE OR REPLACE FUNCTION billing.prepare_subscription_cancellation(
  request_id_value uuid, target_subscription_id uuid, action_value text,
  idempotency_key_value text, prepared_at_value timestamptz DEFAULT now()
)
RETURNS TABLE (
  cancellation_request_id uuid, external_subscription_ref text,
  action text, current_period_end timestamptz, replayed boolean
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, billing, tenancy AS $$
DECLARE tenant_context_id uuid; actor_id uuid; membership_id uuid;
  existing billing.subscription_cancellation_requests%ROWTYPE;
BEGIN
  tenant_context_id := tenancy.current_tenant_id();
  actor_id := NULLIF(current_setting('app.user_id', true), '')::uuid;
  membership_id := NULLIF(current_setting('app.membership_id', true), '')::uuid;
  IF session_user <> 'djay_runtime' OR tenant_context_id IS NULL OR actor_id IS NULL OR membership_id IS NULL THEN
    RAISE EXCEPTION 'tenant_cancellation_authority_required';
  END IF;
  IF action_value NOT IN ('schedule', 'revoke')
     OR char_length(idempotency_key_value) NOT BETWEEN 16 AND 200 THEN
    RAISE EXCEPTION 'cancellation_request_invalid';
  END IF;
  SELECT request.* INTO existing FROM billing.subscription_cancellation_requests request
  WHERE request.tenant_id = tenant_context_id AND request.idempotency_key = idempotency_key_value;
  IF existing.id IS NOT NULL THEN
    IF existing.subscription_id <> target_subscription_id OR existing.action <> action_value THEN
      RAISE EXCEPTION 'cancellation_idempotency_conflict';
    END IF;
    RETURN QUERY SELECT existing.id, existing.external_subscription_ref, existing.action,
      subscription.period_end, true
    FROM tenancy.product_subscriptions subscription
    WHERE subscription.tenant_id = tenant_context_id AND subscription.id = target_subscription_id;
    RETURN;
  END IF;
  RETURN QUERY WITH authority AS (
    SELECT subscription.tenant_id, subscription.id, subscription.period_end,
      link.external_subscription_ref
    FROM tenancy.product_subscriptions subscription
    JOIN billing.subscription_links link ON link.tenant_id = subscription.tenant_id
      AND link.subscription_id = subscription.id AND link.provider_key = 'stripe'
    WHERE subscription.tenant_id = tenant_context_id AND subscription.id = target_subscription_id
      AND subscription.status IN ('trialing', 'active', 'past_due', 'grace_period', 'restricted', 'paused')
      AND subscription.period_end IS NOT NULL
      AND ((action_value = 'schedule' AND subscription.cancel_at IS NULL)
        OR (action_value = 'revoke' AND subscription.cancel_at IS NOT NULL))
  ), inserted AS (
    INSERT INTO billing.subscription_cancellation_requests (
      id, tenant_id, subscription_id, action, idempotency_key, status,
      external_subscription_ref, requested_by_user_id, requested_by_membership_id,
      request_id, created_at, updated_at
    ) SELECT request_id_value, authority.tenant_id, authority.id, action_value,
      idempotency_key_value, 'prepared', authority.external_subscription_ref,
      actor_id, membership_id, COALESCE(current_setting('app.request_id', true), request_id_value::text),
      prepared_at_value, prepared_at_value FROM authority RETURNING *
  ) SELECT inserted.id, inserted.external_subscription_ref, inserted.action,
      authority.period_end, false FROM inserted JOIN authority ON authority.id = inserted.subscription_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'cancellation_authority_unavailable'; END IF;
  INSERT INTO billing.subscription_cancellation_events (
    tenant_id, subscription_id, cancellation_request_id, event_type, actor_user_id, recorded_at
  ) VALUES (tenant_context_id, target_subscription_id, request_id_value, 'requested', actor_id, prepared_at_value);
END
$$;

CREATE OR REPLACE FUNCTION billing.complete_subscription_cancellation(
  target_request_id uuid, expected_idempotency_key text, provider_cancel_at_period_end boolean,
  provider_effective_at timestamptz, failure_code_value text,
  completed_at_value timestamptz DEFAULT now()
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, billing, tenancy AS $$
DECLARE tenant_context_id uuid; target billing.subscription_cancellation_requests%ROWTYPE;
  resulting_status text; event_value text;
BEGIN
  tenant_context_id := tenancy.current_tenant_id();
  IF session_user <> 'djay_runtime' OR tenant_context_id IS NULL THEN
    RAISE EXCEPTION 'tenant_cancellation_authority_required';
  END IF;
  SELECT * INTO target FROM billing.subscription_cancellation_requests
  WHERE tenant_id = tenant_context_id AND id = target_request_id FOR UPDATE;
  IF target.id IS NULL OR target.idempotency_key <> expected_idempotency_key THEN
    RAISE EXCEPTION 'cancellation_request_not_found';
  END IF;
  IF target.status <> 'prepared' THEN RETURN target.status; END IF;
  IF failure_code_value IS NOT NULL THEN
    UPDATE billing.subscription_cancellation_requests SET status = 'failed',
      failure_code = left(failure_code_value, 100), updated_at = completed_at_value WHERE id = target.id;
    INSERT INTO billing.subscription_cancellation_events (
      tenant_id, subscription_id, cancellation_request_id, event_type, actor_user_id,
      safe_metadata, recorded_at
    ) VALUES (target.tenant_id, target.subscription_id, target.id, 'provider_failed',
      target.requested_by_user_id, jsonb_build_object('failureCode', left(failure_code_value, 100)), completed_at_value);
    RETURN 'failed';
  END IF;
  IF (target.action = 'schedule' AND (NOT provider_cancel_at_period_end OR provider_effective_at IS NULL))
     OR (target.action = 'revoke' AND provider_cancel_at_period_end) THEN
    RAISE EXCEPTION 'cancellation_provider_response_invalid';
  END IF;
  resulting_status := CASE WHEN target.action = 'schedule' THEN 'scheduled' ELSE 'revoked' END;
  event_value := CASE WHEN target.action = 'schedule' THEN 'provider_scheduled' ELSE 'provider_revoked' END;
  UPDATE billing.subscription_cancellation_requests SET status = resulting_status,
    effective_at = CASE WHEN target.action = 'schedule' THEN provider_effective_at ELSE NULL END,
    updated_at = completed_at_value WHERE id = target.id;
  UPDATE tenancy.product_subscriptions SET
    cancel_at = CASE WHEN target.action = 'schedule' THEN provider_effective_at ELSE NULL END,
    updated_at = completed_at_value
  WHERE tenant_id = target.tenant_id AND id = target.subscription_id;
  INSERT INTO billing.subscription_cancellation_events (
    tenant_id, subscription_id, cancellation_request_id, event_type, effective_at,
    actor_user_id, recorded_at
  ) VALUES (target.tenant_id, target.subscription_id, target.id, event_value,
    CASE WHEN target.action = 'schedule' THEN provider_effective_at ELSE NULL END,
    target.requested_by_user_id, completed_at_value);
  INSERT INTO tenancy.audit_logs (
    tenant_id, actor_user_id, actor_membership_id, action, target_type,
    target_id, request_id, result, metadata
  ) VALUES (target.tenant_id, target.requested_by_user_id, target.requested_by_membership_id,
    CASE WHEN target.action = 'schedule' THEN 'subscription.cancellation_scheduled'
      ELSE 'subscription.cancellation_revoked' END,
    'product_subscription', target.subscription_id::text, target.request_id, 'succeeded',
    jsonb_build_object('cancellationRequestId', target.id, 'effectiveAt', provider_effective_at));
  RETURN resulting_status;
END
$$;

CREATE TABLE platform.subscription_dunning_policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL UNIQUE CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('draft', 'pending_review', 'active', 'retired', 'rejected')),
  grace_period_hours integer NOT NULL CHECK (grace_period_hours BETWEEN 0 AND 2160),
  restrict_after_hours integer NOT NULL CHECK (restrict_after_hours BETWEEN grace_period_hours AND 4320),
  customer_notice_offsets_hours integer[] NOT NULL DEFAULT '{}'::integer[],
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 8 AND 1000),
  requested_by_platform_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  reviewed_by_platform_user_id uuid REFERENCES platform.users(id) ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL,
  reviewed_at timestamptz,
  activated_at timestamptz,
  retired_at timestamptz,
  CHECK (reviewed_by_platform_user_id IS NULL OR reviewed_by_platform_user_id <> requested_by_platform_user_id),
  CHECK (0 <= ALL(customer_notice_offsets_hours))
);

CREATE UNIQUE INDEX platform_one_active_dunning_policy
  ON platform.subscription_dunning_policy_versions((status)) WHERE status = 'active';

CREATE TABLE platform.subscription_dunning_policy_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_version_id uuid NOT NULL REFERENCES platform.subscription_dunning_policy_versions(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('requested', 'approved', 'rejected', 'retired')),
  actor_platform_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  safe_note text,
  recorded_at timestamptz NOT NULL,
  UNIQUE (policy_version_id, event_type, actor_platform_user_id)
);

CREATE TRIGGER platform_dunning_policy_event_immutable
BEFORE UPDATE OR DELETE ON platform.subscription_dunning_policy_events
FOR EACH ROW EXECUTE FUNCTION tenancy.reject_immutable_change();

CREATE OR REPLACE FUNCTION platform.request_subscription_dunning_policy(
  grace_hours_value integer, restrict_hours_value integer, notice_offsets_value integer[],
  reason_value text, requested_at_value timestamptz DEFAULT now()
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
DECLARE actor_id uuid; actor_role text; policy_id uuid; next_version integer;
BEGIN
  actor_id := NULLIF(current_setting('app.platform_user_id', true), '')::uuid;
  actor_role := current_setting('app.platform_role', true);
  IF session_user <> 'djay_platform' OR actor_id IS NULL
     OR actor_role NOT IN ('platform_owner', 'platform_finance') THEN
    RAISE EXCEPTION 'platform_finance_authority_required';
  END IF;
  IF grace_hours_value NOT BETWEEN 0 AND 2160
     OR restrict_hours_value NOT BETWEEN grace_hours_value AND 4320
     OR char_length(reason_value) NOT BETWEEN 8 AND 1000
     OR EXISTS (SELECT 1 FROM unnest(notice_offsets_value) offset_value
       WHERE offset_value < 0 OR offset_value > restrict_hours_value) THEN
    RAISE EXCEPTION 'dunning_policy_invalid';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('subscription-dunning-policy', 0));
  SELECT COALESCE(max(version), 0) + 1 INTO next_version FROM platform.subscription_dunning_policy_versions;
  policy_id := gen_random_uuid();
  INSERT INTO platform.subscription_dunning_policy_versions (
    id, version, status, grace_period_hours, restrict_after_hours,
    customer_notice_offsets_hours, reason, requested_by_platform_user_id, requested_at
  ) VALUES (policy_id, next_version, 'pending_review', grace_hours_value, restrict_hours_value,
    COALESCE(notice_offsets_value, '{}'::integer[]), reason_value, actor_id, requested_at_value);
  INSERT INTO platform.subscription_dunning_policy_events (
    policy_version_id, event_type, actor_platform_user_id, safe_note, recorded_at
  ) VALUES (policy_id, 'requested', actor_id, reason_value, requested_at_value);
  RETURN policy_id;
END
$$;

CREATE OR REPLACE FUNCTION platform.review_subscription_dunning_policy(
  target_policy_id uuid, approve boolean, note_value text, reviewed_at_value timestamptz DEFAULT now()
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
DECLARE actor_id uuid; actor_role text; target platform.subscription_dunning_policy_versions%ROWTYPE;
  next_status text; event_value text;
BEGIN
  actor_id := NULLIF(current_setting('app.platform_user_id', true), '')::uuid;
  actor_role := current_setting('app.platform_role', true);
  IF session_user <> 'djay_platform' OR actor_id IS NULL
     OR actor_role NOT IN ('platform_owner', 'platform_finance') THEN
    RAISE EXCEPTION 'platform_finance_authority_required';
  END IF;
  IF char_length(note_value) NOT BETWEEN 8 AND 1000 THEN RAISE EXCEPTION 'review_note_invalid'; END IF;
  SELECT * INTO target FROM platform.subscription_dunning_policy_versions
  WHERE id = target_policy_id FOR UPDATE;
  IF target.id IS NULL OR target.status <> 'pending_review' THEN RAISE EXCEPTION 'dunning_policy_not_reviewable'; END IF;
  IF target.requested_by_platform_user_id = actor_id THEN RAISE EXCEPTION 'different_reviewer_required'; END IF;
  next_status := CASE WHEN approve THEN 'active' ELSE 'rejected' END;
  event_value := CASE WHEN approve THEN 'approved' ELSE 'rejected' END;
  IF approve THEN
    UPDATE platform.subscription_dunning_policy_versions SET status = 'retired', retired_at = reviewed_at_value
    WHERE status = 'active';
  END IF;
  UPDATE platform.subscription_dunning_policy_versions SET status = next_status,
    reviewed_by_platform_user_id = actor_id, reviewed_at = reviewed_at_value,
    activated_at = CASE WHEN approve THEN reviewed_at_value ELSE NULL END
  WHERE id = target.id;
  INSERT INTO platform.subscription_dunning_policy_events (
    policy_version_id, event_type, actor_platform_user_id, safe_note, recorded_at
  ) VALUES (target.id, event_value, actor_id, note_value, reviewed_at_value);
  RETURN next_status;
END
$$;

CREATE OR REPLACE FUNCTION billing.apply_next_subscription_dunning_transition(
  evaluated_at_value timestamptz DEFAULT now()
)
RETURNS TABLE (subscription_id uuid, tenant_id uuid, previous_status text, next_status text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, billing, tenancy, platform AS $$
#variable_conflict use_column
DECLARE policy platform.subscription_dunning_policy_versions%ROWTYPE;
  target tenancy.product_subscriptions%ROWTYPE; failed_at_value timestamptz;
  selected_subscription_id uuid;
  next_status_value text; snapshot tenancy.entitlement_snapshots%ROWTYPE; resolved jsonb;
  external_subscription_ref_value text;
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'subscription_lifecycle_worker' THEN
    RAISE EXCEPTION 'subscription_lifecycle_worker_authority_required';
  END IF;
  SELECT * INTO policy FROM platform.subscription_dunning_policy_versions
  WHERE status = 'active' ORDER BY activated_at DESC, id DESC LIMIT 1;
  IF policy.id IS NULL THEN RETURN; END IF;
  SELECT subscription.id, failed.failed_at INTO selected_subscription_id, failed_at_value
  FROM tenancy.product_subscriptions subscription
  JOIN LATERAL (
    SELECT max(event.effective_at) AS failed_at
    FROM billing.subscription_lifecycle_events event
    WHERE event.tenant_id = subscription.tenant_id AND event.subscription_id = subscription.id
      AND event.next_status = 'past_due'
  ) failed ON failed.failed_at IS NOT NULL
  WHERE (subscription.status = 'past_due'
      AND evaluated_at_value >= failed.failed_at + make_interval(hours => policy.grace_period_hours))
     OR (subscription.status = 'grace_period'
      AND evaluated_at_value >= failed.failed_at + make_interval(hours => policy.restrict_after_hours))
  ORDER BY failed.failed_at, subscription.id
  FOR UPDATE OF subscription SKIP LOCKED LIMIT 1;
  IF selected_subscription_id IS NULL THEN RETURN; END IF;
  SELECT * INTO target FROM tenancy.product_subscriptions subscription
  WHERE subscription.id = selected_subscription_id;
  next_status_value := CASE WHEN target.status = 'past_due' THEN 'grace_period' ELSE 'restricted' END;
  SELECT * INTO snapshot FROM tenancy.entitlement_snapshots candidate
  WHERE candidate.tenant_id = target.tenant_id AND candidate.subscription_id = target.id
  ORDER BY candidate.created_at DESC, candidate.id DESC LIMIT 1;
  IF snapshot.id IS NULL THEN RAISE EXCEPTION 'subscription_entitlement_snapshot_required'; END IF;
  resolved := jsonb_set(jsonb_set(snapshot.resolved_json,
    '{subscriptionStatus}', to_jsonb(next_status_value), true),
    '{accessMode}', to_jsonb(CASE WHEN next_status_value = 'grace_period'
      THEN 'read_only'::text ELSE 'none'::text END), true);
  UPDATE tenancy.product_subscriptions SET status = next_status_value, updated_at = evaluated_at_value
  WHERE id = target.id AND tenant_id = target.tenant_id;
  INSERT INTO tenancy.entitlement_snapshots (
    tenant_id, subscription_id, product_key, plan_version_id,
    subscription_status, access_mode, resolved_json, resolution_hash, created_at
  ) VALUES (target.tenant_id, target.id, target.product_key, target.plan_version_id,
    next_status_value, CASE WHEN next_status_value = 'grace_period' THEN 'read_only' ELSE 'none' END,
    resolved, public.digest(convert_to(resolved::text, 'UTF8'), 'sha256'), evaluated_at_value);
  SELECT link.external_subscription_ref INTO external_subscription_ref_value
  FROM billing.subscription_links link WHERE link.tenant_id = target.tenant_id
    AND link.subscription_id = target.id AND link.provider_key = 'stripe';
  INSERT INTO billing.subscription_lifecycle_events (
    tenant_id, subscription_id, external_subscription_ref, previous_status,
    next_status, provider_status, effective_at, recorded_at
  ) VALUES (target.tenant_id, target.id, external_subscription_ref_value, target.status,
    next_status_value, 'local_dunning_policy', evaluated_at_value, evaluated_at_value);
  INSERT INTO tenancy.audit_logs (
    tenant_id, action, target_type, target_id, request_id, result, metadata
  ) VALUES (target.tenant_id, 'subscription.dunning_transition_applied', 'product_subscription',
    target.id::text, COALESCE(current_setting('app.request_id', true), target.id::text), 'succeeded',
    jsonb_build_object('previousStatus', target.status, 'nextStatus', next_status_value,
      'policyVersionId', policy.id, 'failedAt', failed_at_value));
  RETURN QUERY SELECT target.id, target.tenant_id, target.status, next_status_value;
END
$$;

ALTER TABLE billing.subscription_cancellation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.subscription_cancellation_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE billing.subscription_cancellation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.subscription_cancellation_events FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.subscription_dunning_policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.subscription_dunning_policy_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.subscription_dunning_policy_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.subscription_dunning_policy_events FORCE ROW LEVEL SECURITY;

CREATE POLICY billing_tenant_cancellation_requests ON billing.subscription_cancellation_requests
  TO djay_runtime USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY billing_platform_cancellation_requests ON billing.subscription_cancellation_requests
  FOR SELECT TO djay_platform USING (true);
CREATE POLICY billing_worker_cancellation_requests ON billing.subscription_cancellation_requests
  TO djay_worker USING (true) WITH CHECK (true);
CREATE POLICY billing_tenant_cancellation_events ON billing.subscription_cancellation_events
  FOR SELECT TO djay_runtime USING (tenant_id = tenancy.current_tenant_id());
CREATE POLICY billing_platform_cancellation_events ON billing.subscription_cancellation_events
  FOR SELECT TO djay_platform USING (true);
CREATE POLICY billing_worker_cancellation_events ON billing.subscription_cancellation_events
  TO djay_worker USING (true) WITH CHECK (true);
CREATE POLICY platform_dunning_policy_access ON platform.subscription_dunning_policy_versions
  TO djay_platform USING (true) WITH CHECK (true);
CREATE POLICY platform_dunning_policy_event_access ON platform.subscription_dunning_policy_events
  TO djay_platform USING (true) WITH CHECK (true);
CREATE POLICY worker_dunning_policy_read ON platform.subscription_dunning_policy_versions
  FOR SELECT TO djay_worker USING (true);

REVOKE ALL ON billing.subscription_cancellation_requests,
  billing.subscription_cancellation_events,
  platform.subscription_dunning_policy_versions,
  platform.subscription_dunning_policy_events FROM PUBLIC;
REVOKE ALL ON FUNCTION billing.prepare_subscription_cancellation(uuid, uuid, text, text, timestamptz),
  billing.complete_subscription_cancellation(uuid, text, boolean, timestamptz, text, timestamptz),
  billing.synchronize_stripe_subscription_terms(uuid, jsonb, timestamptz),
  billing.apply_next_subscription_dunning_transition(timestamptz),
  platform.request_subscription_dunning_policy(integer, integer, integer[], text, timestamptz),
  platform.review_subscription_dunning_policy(uuid, boolean, text, timestamptz) FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE ON billing.subscription_cancellation_requests TO djay_runtime;
GRANT SELECT ON billing.subscription_cancellation_events TO djay_runtime;
GRANT SELECT ON billing.subscription_cancellation_requests,
  billing.subscription_cancellation_events TO djay_platform, djay_readonly_ops;
GRANT SELECT, INSERT, UPDATE ON billing.subscription_cancellation_requests TO djay_worker;
GRANT SELECT, INSERT ON billing.subscription_cancellation_events TO djay_worker;
GRANT SELECT, INSERT, UPDATE ON platform.subscription_dunning_policy_versions,
  platform.subscription_dunning_policy_events TO djay_platform;
GRANT SELECT ON platform.subscription_dunning_policy_versions,
  platform.subscription_dunning_policy_events TO djay_readonly_ops;
GRANT SELECT ON platform.subscription_dunning_policy_versions TO djay_worker;
GRANT EXECUTE ON FUNCTION billing.prepare_subscription_cancellation(uuid, uuid, text, text, timestamptz),
  billing.complete_subscription_cancellation(uuid, text, boolean, timestamptz, text, timestamptz) TO djay_runtime;
GRANT EXECUTE ON FUNCTION billing.synchronize_stripe_subscription_terms(uuid, jsonb, timestamptz) TO djay_worker;
GRANT EXECUTE ON FUNCTION billing.apply_next_subscription_dunning_transition(timestamptz) TO djay_worker;
GRANT EXECUTE ON FUNCTION platform.request_subscription_dunning_policy(integer, integer, integer[], text, timestamptz),
  platform.review_subscription_dunning_policy(uuid, boolean, text, timestamptz) TO djay_platform;
