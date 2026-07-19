CREATE OR REPLACE FUNCTION billing.claim_stripe_webhook(
  claimed_at timestamptz DEFAULT now(), stale_before timestamptz DEFAULT now() - interval '10 minutes'
)
RETURNS TABLE (
  webhook_event_id uuid, event_type text, occurred_at timestamptz,
  payload_hash_hex text, payload_ciphertext text, attempt_count integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, billing AS $$
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'billing_webhook_worker' THEN
    RAISE EXCEPTION 'billing_webhook_worker_authority_required';
  END IF;
  RETURN QUERY
  WITH candidate AS (
    SELECT source.id FROM billing.webhook_events source
    WHERE source.provider_key = 'stripe'
      AND (source.status = 'received' OR (source.status = 'processing' AND source.received_at < stale_before))
      AND source.attempt_count < 12
    ORDER BY source.occurred_at, source.received_at, source.id FOR UPDATE SKIP LOCKED LIMIT 1
  ), claimed AS (
    UPDATE billing.webhook_events event SET status = 'processing',
      attempt_count = event.attempt_count + 1, last_error_code = NULL
    FROM candidate WHERE event.id = candidate.id RETURNING event.*
  ) SELECT claimed.id, claimed.event_type, claimed.occurred_at,
      encode(claimed.payload_hash, 'hex'), claimed.payload_ciphertext, claimed.attempt_count
    FROM claimed;
END
$$;

CREATE OR REPLACE FUNCTION billing.record_stripe_subscription_transition(
  target_webhook_event_id uuid, target_tenant_id uuid, target_subscription_id uuid,
  external_subscription_ref_value text, provider_status_value text,
  effective_at_value timestamptz
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, billing, tenancy AS $$
DECLARE target tenancy.product_subscriptions%ROWTYPE; next_value text; access_value text;
  last_effective timestamptz; snapshot tenancy.entitlement_snapshots%ROWTYPE; resolved jsonb;
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'billing_webhook_worker' THEN
    RAISE EXCEPTION 'billing_webhook_worker_authority_required';
  END IF;
  next_value := CASE provider_status_value
    WHEN 'trialing' THEN 'trialing' WHEN 'active' THEN 'active'
    WHEN 'past_due' THEN 'past_due' WHEN 'paused' THEN 'paused'
    WHEN 'incomplete' THEN 'incomplete' WHEN 'incomplete_expired' THEN 'cancelled'
    WHEN 'unpaid' THEN 'restricted' WHEN 'canceled' THEN 'cancelled'
    ELSE NULL END;
  IF next_value IS NULL THEN RETURN 'unknown_provider_state'; END IF;
  SELECT * INTO target FROM tenancy.product_subscriptions
    WHERE tenant_id = target_tenant_id AND id = target_subscription_id FOR UPDATE;
  IF target.id IS NULL THEN RETURN 'authority_not_found'; END IF;
  SELECT max(effective_at) INTO last_effective FROM billing.subscription_lifecycle_events
    WHERE tenant_id = target_tenant_id AND subscription_id = target_subscription_id;
  IF last_effective IS NOT NULL AND effective_at_value < last_effective THEN RETURN 'stale_event'; END IF;
  IF target.status = next_value THEN RETURN 'replayed_state'; END IF;
  BEGIN
    UPDATE tenancy.product_subscriptions SET status = next_value,
      cancelled_at = CASE WHEN next_value = 'cancelled' THEN effective_at_value ELSE cancelled_at END,
      updated_at = effective_at_value
    WHERE tenant_id = target_tenant_id AND id = target_subscription_id;
  EXCEPTION WHEN raise_exception OR check_violation THEN
    RETURN 'invalid_transition';
  END;
  access_value := CASE WHEN next_value IN ('active', 'trialing') THEN 'active'
    WHEN next_value IN ('past_due', 'grace_period') THEN 'read_only' ELSE 'none' END;
  SELECT * INTO snapshot FROM tenancy.entitlement_snapshots
    WHERE tenant_id = target_tenant_id AND subscription_id = target_subscription_id
    ORDER BY created_at DESC, id DESC LIMIT 1;
  resolved := jsonb_set(jsonb_set(snapshot.resolved_json, '{subscriptionStatus}', to_jsonb(next_value), true),
    '{accessMode}', to_jsonb(access_value), true);
  INSERT INTO tenancy.entitlement_snapshots (
    tenant_id, subscription_id, product_key, plan_version_id,
    subscription_status, access_mode, resolved_json, resolution_hash, created_at
  ) VALUES (
    target_tenant_id, target_subscription_id, target.product_key, target.plan_version_id,
    next_value, access_value, resolved, public.digest(convert_to(resolved::text, 'UTF8'), 'sha256'), effective_at_value
  );
  INSERT INTO billing.subscription_lifecycle_events (
    tenant_id, subscription_id, webhook_event_id, external_subscription_ref,
    previous_status, next_status, provider_status, effective_at
  ) VALUES (
    target_tenant_id, target_subscription_id, target_webhook_event_id,
    external_subscription_ref_value, target.status, next_value, provider_status_value, effective_at_value
  ) ON CONFLICT DO NOTHING;
  RETURN 'applied';
END
$$;

CREATE OR REPLACE FUNCTION billing.apply_stripe_webhook(
  target_webhook_event_id uuid, stripe_object jsonb, applied_at_value timestamptz DEFAULT now()
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, billing, tenancy, catalog AS $$
DECLARE event billing.webhook_events%ROWTYPE; intent billing.checkout_intents%ROWTYPE;
  link billing.subscription_links%ROWTYPE; target_tenant_id uuid; target_subscription_id uuid;
  intent_id_value uuid; contract_hash_value text; external_sub text; result_value text;
  invoice_doc_id uuid; invoice_ref text; currency_value text;
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'billing_webhook_worker' THEN
    RAISE EXCEPTION 'billing_webhook_worker_authority_required';
  END IF;
  SELECT * INTO event FROM billing.webhook_events
    WHERE id = target_webhook_event_id AND provider_key = 'stripe' FOR UPDATE;
  IF event.id IS NULL OR event.status <> 'processing' THEN RAISE EXCEPTION 'billing_webhook_not_claimed'; END IF;
  IF stripe_object ->> 'id' IS NULL THEN RAISE EXCEPTION 'stripe_object_id_required'; END IF;

  BEGIN intent_id_value := NULLIF(COALESCE(
    stripe_object #>> '{metadata,checkout_intent_id}',
    stripe_object #>> '{subscription_details,metadata,checkout_intent_id}'
  ), '')::uuid; EXCEPTION WHEN invalid_text_representation THEN intent_id_value := NULL; END;
  external_sub := NULLIF(CASE jsonb_typeof(stripe_object -> 'subscription')
    WHEN 'string' THEN stripe_object ->> 'subscription' ELSE stripe_object #>> '{parent,subscription_details,subscription}' END, '');

  IF intent_id_value IS NOT NULL THEN
    SELECT * INTO intent FROM billing.checkout_intents WHERE id = intent_id_value FOR UPDATE;
  ELSIF event.event_type = 'checkout.session.completed' THEN
    SELECT * INTO intent FROM billing.checkout_intents
      WHERE external_session_ref = stripe_object ->> 'id' FOR UPDATE;
  END IF;
  IF intent.id IS NOT NULL THEN
    target_tenant_id := intent.tenant_id; target_subscription_id := intent.subscription_id;
  ELSIF external_sub IS NOT NULL THEN
    SELECT * INTO link FROM billing.subscription_links
      WHERE provider_key = 'stripe' AND external_subscription_ref = external_sub;
    target_tenant_id := link.tenant_id; target_subscription_id := link.subscription_id;
  END IF;

  IF event.event_type = 'checkout.session.completed' THEN
    contract_hash_value := stripe_object #>> '{metadata,contract_sha256}';
    IF intent.id IS NULL OR intent.external_session_ref <> stripe_object ->> 'id'
       OR contract_hash_value IS DISTINCT FROM (SELECT encode(contract_sha256, 'hex')
         FROM tenancy.subscription_contract_snapshots WHERE id = intent.contract_snapshot_id)
       OR stripe_object ->> 'mode' <> 'subscription'
       OR stripe_object ->> 'payment_status' NOT IN ('paid', 'no_payment_required') THEN
      RAISE EXCEPTION 'stripe_checkout_correlation_failed';
    END IF;
    IF stripe_object ->> 'customer' !~ '^cus_[A-Za-z0-9]+$'
       OR stripe_object ->> 'subscription' !~ '^sub_[A-Za-z0-9]+$' THEN
      RAISE EXCEPTION 'stripe_checkout_provider_refs_invalid';
    END IF;
    INSERT INTO billing.payment_customers (tenant_id, provider_key, external_customer_ref)
      VALUES (intent.tenant_id, 'stripe', stripe_object ->> 'customer')
      ON CONFLICT (tenant_id) DO UPDATE SET external_customer_ref = EXCLUDED.external_customer_ref
      WHERE billing.payment_customers.provider_key = 'stripe';
    INSERT INTO billing.subscription_links (tenant_id, subscription_id, provider_key, external_subscription_ref)
      VALUES (intent.tenant_id, intent.subscription_id, 'stripe', stripe_object ->> 'subscription')
      ON CONFLICT (tenant_id, subscription_id) DO UPDATE
        SET external_subscription_ref = EXCLUDED.external_subscription_ref
      WHERE billing.subscription_links.provider_key = 'stripe';
    UPDATE billing.checkout_intents SET status = 'completed',
      external_customer_ref = stripe_object ->> 'customer',
      external_subscription_ref = stripe_object ->> 'subscription', updated_at = applied_at_value
      WHERE id = intent.id;
    result_value := 'applied';

  ELSIF event.event_type IN ('customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted') THEN
    IF target_subscription_id IS NULL THEN result_value := 'authority_not_found';
    ELSE
      IF external_sub IS NULL THEN external_sub := stripe_object ->> 'id'; END IF;
      result_value := billing.record_stripe_subscription_transition(event.id, target_tenant_id,
        target_subscription_id, external_sub, stripe_object ->> 'status', event.occurred_at);
    END IF;

  ELSIF event.event_type LIKE 'invoice.%' THEN
    invoice_ref := stripe_object ->> 'id'; currency_value := upper(stripe_object ->> 'currency');
    IF target_subscription_id IS NULL OR currency_value <> 'THB' THEN result_value := 'authority_not_found';
    ELSE
      INSERT INTO billing.invoice_documents (
        tenant_id, subscription_id, webhook_event_id, provider_key, external_invoice_ref,
        external_customer_ref, external_subscription_ref, status, currency,
        subtotal_minor, discount_minor, tax_minor, total_minor, amount_paid_minor,
        amount_remaining_minor, tax_authority_state, issued_at, period_start, period_end, payload_sha256
      ) VALUES (
        target_tenant_id, target_subscription_id, event.id, 'stripe', invoice_ref,
        stripe_object ->> 'customer', external_sub, COALESCE(stripe_object ->> 'status', 'unknown'), currency_value,
        GREATEST(COALESCE((stripe_object ->> 'subtotal')::bigint, 0), 0),
        GREATEST(COALESCE((stripe_object ->> 'total_discount_amounts')::jsonb #>> '{0,amount}', '0')::bigint, 0),
        GREATEST(COALESCE((stripe_object ->> 'total_tax_amounts')::jsonb #>> '{0,amount}', '0')::bigint, 0),
        GREATEST(COALESCE((stripe_object ->> 'total')::bigint, 0), 0),
        GREATEST(COALESCE((stripe_object ->> 'amount_paid')::bigint, 0), 0),
        GREATEST(COALESCE((stripe_object ->> 'amount_remaining')::bigint, 0), 0),
        CASE WHEN stripe_object ->> 'automatic_tax' IS NOT NULL THEN 'provider_calculated' ELSE 'unknown' END,
        to_timestamp(NULLIF(stripe_object ->> 'created', '')::double precision),
        to_timestamp(NULLIF(stripe_object ->> 'period_start', '')::double precision),
        to_timestamp(NULLIF(stripe_object ->> 'period_end', '')::double precision), event.payload_hash
      ) ON CONFLICT DO NOTHING RETURNING id INTO invoice_doc_id;
      IF event.event_type = 'invoice.paid' THEN
        INSERT INTO billing.payment_events (
          tenant_id, subscription_id, webhook_event_id, invoice_document_id, provider_key,
          external_payment_ref, event_type, currency, amount_minor, occurred_at, payload_sha256
        ) VALUES (target_tenant_id, target_subscription_id, event.id, invoice_doc_id, 'stripe',
          COALESCE(stripe_object ->> 'payment_intent', invoice_ref), 'succeeded', currency_value,
          GREATEST(COALESCE((stripe_object ->> 'amount_paid')::bigint, 0), 0), event.occurred_at, event.payload_hash)
        ON CONFLICT DO NOTHING;
        result_value := billing.record_stripe_subscription_transition(event.id, target_tenant_id,
          target_subscription_id, external_sub, 'active', event.occurred_at);
      ELSIF event.event_type = 'invoice.payment_failed' THEN
        result_value := billing.record_stripe_subscription_transition(event.id, target_tenant_id,
          target_subscription_id, external_sub, 'past_due', event.occurred_at);
      ELSE result_value := 'applied'; END IF;
    END IF;

  ELSIF event.event_type LIKE 'credit_note.%' THEN
    invoice_ref := stripe_object ->> 'invoice'; currency_value := upper(stripe_object ->> 'currency');
    SELECT document.id, document.tenant_id, document.subscription_id INTO invoice_doc_id, target_tenant_id, target_subscription_id
      FROM billing.invoice_documents document WHERE document.external_invoice_ref = invoice_ref
      ORDER BY document.recorded_at DESC LIMIT 1;
    IF target_subscription_id IS NULL OR currency_value <> 'THB' THEN result_value := 'authority_not_found';
    ELSE
      INSERT INTO billing.credit_note_documents (
        tenant_id, subscription_id, webhook_event_id, invoice_document_id, provider_key,
        external_credit_note_ref, external_invoice_ref, status, reason, currency,
        subtotal_minor, tax_minor, total_minor, refund_minor, credit_minor, issued_at, payload_sha256
      ) VALUES (target_tenant_id, target_subscription_id, event.id, invoice_doc_id, 'stripe',
        stripe_object ->> 'id', invoice_ref, COALESCE(stripe_object ->> 'status', 'unknown'),
        stripe_object ->> 'reason', currency_value,
        GREATEST(COALESCE((stripe_object ->> 'subtotal')::bigint, 0), 0),
        GREATEST(COALESCE((stripe_object ->> 'tax_amounts')::jsonb #>> '{0,amount}', '0')::bigint, 0),
        GREATEST(COALESCE((stripe_object ->> 'total')::bigint, 0), 0),
        GREATEST(COALESCE((stripe_object ->> 'refund_amount')::bigint, 0), 0),
        GREATEST(COALESCE((stripe_object ->> 'credit_amount')::bigint, 0), 0),
        to_timestamp(NULLIF(stripe_object ->> 'created', '')::double precision), event.payload_hash)
      ON CONFLICT DO NOTHING; result_value := 'applied';
    END IF;

  ELSIF event.event_type IN ('refund.created', 'refund.updated', 'refund.failed') THEN
    SELECT customer.tenant_id INTO target_tenant_id FROM billing.payment_customers customer
      WHERE customer.provider_key = 'stripe' AND customer.external_customer_ref = stripe_object ->> 'customer';
    SELECT subscription_id INTO target_subscription_id FROM billing.subscription_links
      WHERE tenant_id = target_tenant_id AND provider_key = 'stripe' LIMIT 1;
    currency_value := upper(stripe_object ->> 'currency');
    IF target_subscription_id IS NULL OR currency_value <> 'THB' THEN result_value := 'authority_not_found';
    ELSE
      INSERT INTO billing.refund_events (
        tenant_id, subscription_id, webhook_event_id, provider_key, external_refund_ref,
        external_payment_ref, status, reason, currency, amount_minor, occurred_at, payload_sha256
      ) VALUES (target_tenant_id, target_subscription_id, event.id, 'stripe', stripe_object ->> 'id',
        stripe_object ->> 'payment_intent', COALESCE(stripe_object ->> 'status', 'unknown'),
        stripe_object ->> 'reason', currency_value,
        GREATEST(COALESCE((stripe_object ->> 'amount')::bigint, 0), 0), event.occurred_at, event.payload_hash)
      ON CONFLICT DO NOTHING; result_value := 'applied';
    END IF;
  ELSE result_value := 'ignored_event_type'; END IF;

  UPDATE billing.webhook_events SET status = CASE
      WHEN result_value IN ('applied', 'replayed_state', 'stale_event') THEN 'applied' ELSE 'ignored' END,
    applied_at = applied_at_value,
    last_error_code = CASE WHEN result_value = 'applied' THEN NULL ELSE result_value END
    WHERE id = event.id;
  RETURN result_value;
END
$$;

CREATE OR REPLACE FUNCTION billing.fail_stripe_webhook(
  target_webhook_event_id uuid, error_code_value text, dead_letter boolean DEFAULT false
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, billing AS $$
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'billing_webhook_worker' THEN
    RAISE EXCEPTION 'billing_webhook_worker_authority_required';
  END IF;
  UPDATE billing.webhook_events SET status = CASE WHEN dead_letter THEN 'failed' ELSE 'received' END,
    last_error_code = left(COALESCE(error_code_value, 'billing_webhook_failed'), 100)
    WHERE id = target_webhook_event_id AND status = 'processing';
  RETURN FOUND;
END
$$;

REVOKE ALL ON FUNCTION billing.claim_stripe_webhook(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION billing.record_stripe_subscription_transition(uuid, uuid, uuid, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION billing.apply_stripe_webhook(uuid, jsonb, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION billing.fail_stripe_webhook(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION billing.claim_stripe_webhook(timestamptz, timestamptz) TO djay_worker;
GRANT EXECUTE ON FUNCTION billing.record_stripe_subscription_transition(uuid, uuid, uuid, text, text, timestamptz) TO djay_worker;
GRANT EXECUTE ON FUNCTION billing.apply_stripe_webhook(uuid, jsonb, timestamptz) TO djay_worker;
GRANT EXECUTE ON FUNCTION billing.fail_stripe_webhook(uuid, text, boolean) TO djay_worker;
