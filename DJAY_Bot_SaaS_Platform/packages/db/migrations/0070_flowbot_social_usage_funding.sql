CREATE OR REPLACE FUNCTION tenancy.fund_restricted_runtime_reservation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE
  account record; available_packs numeric := 0; prior_committed numeric;
  included_funding numeric; pack_funding numeric; overage_funding numeric := 0;
  remaining numeric; safe_error text;
BEGIN
  IF NEW.status <> 'reserved'
     OR NEW.funding_json IS DISTINCT FROM '{"included":0,"packs":0,"overage":0}'::jsonb THEN RETURN NEW; END IF;
  IF session_user = 'djay_runtime' THEN RAISE EXCEPTION 'unfunded_tenant_usage_reservation_forbidden'; END IF;
  IF session_user NOT IN ('djay_flowbot_runtime', 'djay_ai_runtime', 'djay_voice_runtime', 'djay_worker') THEN RETURN NEW; END IF;
  IF session_user = 'djay_worker'
     AND current_setting('app.service', true) NOT IN ('ai_social_worker', 'flow_social_worker') THEN
    RAISE EXCEPTION 'unfunded_worker_usage_reservation_forbidden'; END IF;

  SELECT quota.* INTO account FROM tenancy.quota_accounts quota
  WHERE quota.tenant_id = NEW.tenant_id AND quota.id = NEW.quota_account_id FOR UPDATE;
  IF account IS NULL OR account.reserved_quantity < NEW.reserved_quantity
     OR account.product_key || ':' || account.customer_unit NOT IN (
       'flowbot:flow_execution', 'ai_chat:ai_response', 'voice:voice_minute')
     OR NOT EXISTS (
       SELECT 1 FROM tenancy.entitlement_snapshots snapshot
       JOIN tenancy.product_subscriptions subscription ON subscription.tenant_id = snapshot.tenant_id
         AND subscription.id = snapshot.subscription_id
       WHERE snapshot.tenant_id = NEW.tenant_id AND snapshot.id = NEW.entitlement_snapshot_id
         AND snapshot.subscription_id = account.subscription_id AND snapshot.product_key = account.product_key
         AND snapshot.access_mode = 'active'
         AND subscription.status IN ('active', 'trialing', 'scheduled_change')) THEN
    RAISE EXCEPTION 'runtime_usage_authority_invalid';
  END IF;
  prior_committed := account.reserved_quantity + account.settled_quantity - NEW.reserved_quantity;
  IF prior_committed < 0 THEN RAISE EXCEPTION 'runtime_usage_ledger_invalid'; END IF;
  IF account.safety_cap_quantity IS NOT NULL
     AND prior_committed + NEW.reserved_quantity > account.safety_cap_quantity THEN
    safe_error := CASE account.product_key WHEN 'flowbot' THEN 'flowbot_safety_cap'
      WHEN 'ai_chat' THEN 'ai_safety_cap' ELSE 'voice_safety_cap' END;
    RAISE EXCEPTION '%', safe_error;
  END IF;

  remaining := NEW.reserved_quantity;
  included_funding := LEAST(remaining, GREATEST(COALESCE(account.included_quantity, 0) - prior_committed, 0));
  remaining := remaining - included_funding;
  SELECT COALESCE(sum(GREATEST(lot.purchased_quantity - COALESCE((
    SELECT sum(CASE consumption.event_type WHEN 'allocated' THEN consumption.quantity ELSE -consumption.quantity END)
    FROM tenancy.usage_pack_consumptions consumption
    WHERE consumption.tenant_id = lot.tenant_id AND consumption.pack_lot_id = lot.id), 0), 0)), 0)
  INTO available_packs FROM tenancy.usage_pack_lots lot
  WHERE lot.tenant_id = NEW.tenant_id AND lot.subscription_id = account.subscription_id
    AND lot.customer_unit = account.customer_unit AND lot.status = 'active'
    AND lot.effective_from <= now() AND lot.expires_at > now();
  pack_funding := LEAST(remaining, available_packs); remaining := remaining - pack_funding;
  IF remaining > 0 AND account.overage_consent_status = 'consented' THEN overage_funding := remaining; remaining := 0; END IF;
  IF remaining > 0 THEN
    safe_error := CASE account.product_key WHEN 'flowbot' THEN 'flowbot_allowance_exhausted'
      WHEN 'ai_chat' THEN 'ai_allowance_exhausted' ELSE 'voice_allowance_exhausted' END;
    RAISE EXCEPTION '%', safe_error;
  END IF;
  NEW.funding_json := jsonb_build_object('included', included_funding, 'packs', pack_funding, 'overage', overage_funding);
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION tenancy.fund_restricted_runtime_reservation() FROM PUBLIC;
