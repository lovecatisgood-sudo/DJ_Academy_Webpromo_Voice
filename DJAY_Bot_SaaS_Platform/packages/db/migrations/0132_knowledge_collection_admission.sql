CREATE OR REPLACE FUNCTION tenancy.enforce_knowledge_collection_admission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
DECLARE
  context_tenant_id uuid;
  knowledge_allowed boolean;
  collection_limit integer;
  occupied_collections integer;
BEGIN
  IF session_user <> 'djay_runtime' OR NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  context_tenant_id := NULLIF(current_setting('app.tenant_id', true), '')::uuid;
  IF context_tenant_id IS NULL OR context_tenant_id <> NEW.tenant_id THEN
    RAISE EXCEPTION 'knowledge_collection_tenant_context_required';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.tenant_id::text || ':knowledge:collections', 0)
  );

  WITH current_authority AS (
    SELECT snapshot.resolved_json
    FROM tenancy.product_subscriptions subscription
    JOIN LATERAL (
      SELECT candidate.access_mode, candidate.resolved_json
      FROM tenancy.entitlement_snapshots candidate
      WHERE candidate.tenant_id = subscription.tenant_id
        AND candidate.subscription_id = subscription.id
      ORDER BY candidate.created_at DESC, candidate.id DESC
      LIMIT 1
    ) snapshot ON true
    WHERE subscription.tenant_id = NEW.tenant_id
      AND subscription.product_key IN ('ai_chat', 'voice')
      AND subscription.status IN ('active', 'trialing', 'scheduled_change')
      AND snapshot.access_mode = 'active'
      AND snapshot.resolved_json->'entitlements'->>'knowledge.enabled' = 'true'
  )
  SELECT EXISTS(SELECT 1 FROM current_authority),
    CASE
      WHEN EXISTS (
        SELECT 1 FROM current_authority
        WHERE jsonb_typeof(resolved_json->'limits'->'knowledge_collections') <> 'number'
      ) THEN NULL
      ELSE (SELECT max((resolved_json->'limits'->>'knowledge_collections')::integer) FROM current_authority)
    END
  INTO knowledge_allowed, collection_limit;

  IF knowledge_allowed IS NOT TRUE THEN
    RAISE EXCEPTION 'knowledge_collection_not_entitled';
  END IF;

  SELECT count(*)::integer INTO occupied_collections
  FROM tenancy.knowledge_collections collection
  WHERE collection.tenant_id = NEW.tenant_id
    AND collection.status = 'active'
    AND collection.id <> NEW.id;

  IF collection_limit IS NOT NULL AND occupied_collections >= collection_limit THEN
    RAISE EXCEPTION 'knowledge_collection_limit_reached';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS tenancy_knowledge_collection_admission ON tenancy.knowledge_collections;
CREATE TRIGGER tenancy_knowledge_collection_admission
BEFORE INSERT OR UPDATE OF tenant_id, status ON tenancy.knowledge_collections
FOR EACH ROW EXECUTE FUNCTION tenancy.enforce_knowledge_collection_admission();

REVOKE ALL ON FUNCTION tenancy.enforce_knowledge_collection_admission() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.enforce_knowledge_collection_admission() TO djay_runtime;
