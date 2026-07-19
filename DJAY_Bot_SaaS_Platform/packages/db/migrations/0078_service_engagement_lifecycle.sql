ALTER TABLE tenancy.service_requests ADD COLUMN idempotency_key text DEFAULT gen_random_uuid()::text;
ALTER TABLE tenancy.service_requests ALTER COLUMN idempotency_key DROP DEFAULT;
ALTER TABLE tenancy.service_requests ALTER COLUMN idempotency_key SET NOT NULL;
ALTER TABLE tenancy.service_requests ADD CONSTRAINT service_requests_idempotency UNIQUE (tenant_id, idempotency_key);

ALTER TABLE tenancy.service_engagement_updates
  ADD COLUMN idempotency_key text DEFAULT gen_random_uuid()::text,
  ADD COLUMN engagement_status text CHECK (engagement_status IN ('awaiting_customer','scheduled','in_progress','review','completed','cancelled'));
ALTER TABLE tenancy.service_engagement_updates ALTER COLUMN idempotency_key DROP DEFAULT;
ALTER TABLE tenancy.service_engagement_updates ALTER COLUMN idempotency_key SET NOT NULL;
ALTER TABLE tenancy.service_engagement_updates ADD CONSTRAINT service_engagement_updates_idempotency UNIQUE (tenant_id, idempotency_key);

CREATE FUNCTION tenancy.validate_customer_service_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
DECLARE engagement_status text;
BEGIN
  IF NEW.author_kind <> 'customer' THEN RETURN NEW; END IF;
  SELECT status INTO engagement_status FROM tenancy.service_engagements
  WHERE tenant_id = NEW.tenant_id AND id = NEW.engagement_id FOR UPDATE;
  IF engagement_status IS NULL THEN RAISE EXCEPTION 'service_engagement_not_found'; END IF;
  IF engagement_status IN ('completed','cancelled') THEN RAISE EXCEPTION 'service_engagement_closed'; END IF;
  IF NEW.next_action_owner IS DISTINCT FROM 'djai' OR NEW.engagement_status IS NOT NULL THEN
    RAISE EXCEPTION 'invalid_customer_service_update';
  END IF;
  RETURN NEW;
END
$$;

CREATE FUNCTION tenancy.advance_customer_service_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
BEGIN
  IF NEW.author_kind = 'customer' THEN
    UPDATE tenancy.service_engagements SET next_action_owner = 'djai', updated_at = now()
    WHERE tenant_id = NEW.tenant_id AND id = NEW.engagement_id;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER tenancy_customer_service_update_validate BEFORE INSERT ON tenancy.service_engagement_updates
  FOR EACH ROW EXECUTE FUNCTION tenancy.validate_customer_service_update();
CREATE TRIGGER tenancy_customer_service_update_advance AFTER INSERT ON tenancy.service_engagement_updates
  FOR EACH ROW EXECUTE FUNCTION tenancy.advance_customer_service_update();

REVOKE ALL ON FUNCTION tenancy.validate_customer_service_update(), tenancy.advance_customer_service_update() FROM PUBLIC;
