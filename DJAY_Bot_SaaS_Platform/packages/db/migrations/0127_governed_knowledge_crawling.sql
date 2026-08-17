ALTER TABLE tenancy.knowledge_sources
  ADD COLUMN crawl_page_limit integer NOT NULL DEFAULT 1
    CHECK (crawl_page_limit BETWEEN 1 AND 25);

ALTER TABLE tenancy.knowledge_sources
  ADD CONSTRAINT tenancy_knowledge_crawl_page_limit_contract CHECK (
    (source_kind = 'url') OR crawl_page_limit = 1
  );

CREATE TABLE tenancy.knowledge_crawl_host_pacing (
  hostname text PRIMARY KEY CHECK (hostname ~ '^[a-z0-9.-]{1,253}$'),
  next_allowed_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON tenancy.knowledge_crawl_host_pacing FROM PUBLIC;

CREATE OR REPLACE FUNCTION tenancy.reserve_knowledge_crawl_host(target_hostname text, minimum_interval_ms integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE reserved_at timestamptz; observed_now timestamptz := clock_timestamp(); wait_ms integer;
BEGIN
  IF session_user <> 'djay_worker' OR current_setting('app.service', true) IS DISTINCT FROM 'knowledge_worker'
    OR target_hostname !~ '^[a-z0-9.-]{1,253}$' OR minimum_interval_ms NOT BETWEEN 500 AND 5000 THEN
    RAISE EXCEPTION 'knowledge_worker_context_required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('knowledge-crawl:' || target_hostname, 0));
  SELECT greatest(observed_now, pacing.next_allowed_at) INTO reserved_at
    FROM tenancy.knowledge_crawl_host_pacing pacing WHERE pacing.hostname = target_hostname FOR UPDATE;
  reserved_at := COALESCE(reserved_at, observed_now);
  IF reserved_at > observed_now + interval '60 seconds' THEN RETURN -1; END IF;
  INSERT INTO tenancy.knowledge_crawl_host_pacing (hostname, next_allowed_at, updated_at)
    VALUES (target_hostname, reserved_at + make_interval(secs => minimum_interval_ms::double precision / 1000), observed_now)
    ON CONFLICT (hostname) DO UPDATE SET next_allowed_at = EXCLUDED.next_allowed_at, updated_at = EXCLUDED.updated_at;
  wait_ms := greatest(0, ceil(extract(epoch FROM (reserved_at - observed_now)) * 1000)::integer);
  RETURN wait_ms;
END
$$;

REVOKE ALL ON FUNCTION tenancy.reserve_knowledge_crawl_host(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.reserve_knowledge_crawl_host(text, integer) TO djay_worker;

DROP FUNCTION tenancy.claim_knowledge_ingestion(timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION tenancy.claim_knowledge_ingestion(claim_time timestamptz, stale_before timestamptz)
RETURNS TABLE (job_id uuid, tenant_id uuid, source_id uuid, object_id uuid, job_kind text, source_url text,
  crawl_page_limit integer, object_key text, media_type text, declared_size bigint, attempt_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
BEGIN
  IF session_user <> 'djay_worker' OR current_setting('app.service', true) IS DISTINCT FROM 'knowledge_worker' THEN
    RAISE EXCEPTION 'knowledge_worker_context_required'; END IF;
  RETURN QUERY WITH authority AS (
    SELECT subscription.tenant_id, bool_or(plan.plan_key = 'ai_chat_premium') AS premium
    FROM tenancy.product_subscriptions subscription
    JOIN catalog.plan_versions version ON version.id = subscription.plan_version_id
    JOIN catalog.plans plan ON plan.id = version.plan_id
    JOIN LATERAL (SELECT snapshot.access_mode, snapshot.resolved_json FROM tenancy.entitlement_snapshots snapshot
      WHERE snapshot.tenant_id = subscription.tenant_id AND snapshot.subscription_id = subscription.id
      ORDER BY snapshot.created_at DESC, snapshot.id DESC LIMIT 1) current_snapshot ON true
    WHERE subscription.product_key = 'ai_chat' AND subscription.status IN ('active', 'trialing', 'scheduled_change')
      AND current_snapshot.access_mode = 'active'
      AND current_snapshot.resolved_json->'entitlements'->>'knowledge.enabled' = 'true'
    GROUP BY subscription.tenant_id
  ), candidate AS (
    SELECT item.id FROM tenancy.knowledge_ingestion_jobs item
    JOIN authority ON authority.tenant_id = item.tenant_id
    WHERE item.available_at <= claim_time AND item.attempt_count < 10
      AND (item.status IN ('pending', 'failed') OR (item.status = 'processing' AND item.locked_at < stale_before))
    ORDER BY item.available_at, item.created_at, item.id FOR UPDATE SKIP LOCKED LIMIT 1
  ), claimed AS (
    UPDATE tenancy.knowledge_ingestion_jobs item SET status = 'processing', locked_at = claim_time,
      attempt_count = item.attempt_count + 1, safe_error_code = NULL FROM candidate
    WHERE item.id = candidate.id RETURNING item.*
  ) SELECT claimed.id, claimed.tenant_id, claimed.source_id, claimed.object_id, claimed.job_kind,
      source.source_url, CASE WHEN authority.premium THEN source.crawl_page_limit ELSE 1 END,
      object.object_key, object.media_type,
      object.declared_size, claimed.attempt_count
    FROM claimed JOIN tenancy.knowledge_sources source ON source.tenant_id = claimed.tenant_id AND source.id = claimed.source_id
    JOIN authority ON authority.tenant_id = claimed.tenant_id
    LEFT JOIN tenancy.knowledge_objects object ON object.tenant_id = claimed.tenant_id AND object.id = claimed.object_id;
END
$$;

REVOKE ALL ON FUNCTION tenancy.claim_knowledge_ingestion(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.claim_knowledge_ingestion(timestamptz, timestamptz) TO djay_worker;
