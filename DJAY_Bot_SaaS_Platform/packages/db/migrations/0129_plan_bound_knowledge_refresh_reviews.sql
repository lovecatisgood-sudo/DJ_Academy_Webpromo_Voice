CREATE TABLE tenancy.knowledge_review_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  cycle_month date NOT NULL,
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'due' CHECK (status IN ('due', 'in_progress', 'completed')),
  owner_membership_id uuid,
  started_at timestamptz,
  completed_at timestamptz,
  completion_note text CHECK (completion_note IS NULL OR char_length(completion_note) BETWEEN 8 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, cycle_month),
  FOREIGN KEY (tenant_id, owner_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT,
  CHECK (
    (status = 'due' AND started_at IS NULL AND completed_at IS NULL AND completion_note IS NULL)
    OR (status = 'in_progress' AND started_at IS NOT NULL AND completed_at IS NULL AND completion_note IS NULL)
    OR (status = 'completed' AND started_at IS NOT NULL AND completed_at IS NOT NULL AND completion_note IS NOT NULL)
  )
);

ALTER TABLE tenancy.knowledge_review_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.knowledge_review_cycles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.knowledge_review_cycles
  USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
REVOKE ALL ON tenancy.knowledge_review_cycles FROM PUBLIC;
GRANT SELECT, UPDATE ON tenancy.knowledge_review_cycles TO djay_runtime;

CREATE OR REPLACE FUNCTION tenancy.protect_knowledge_review_evidence()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, tenancy AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.status = 'completed' THEN
    RAISE EXCEPTION 'knowledge_review_evidence_immutable';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER tenancy_knowledge_review_evidence_immutable
BEFORE UPDATE OR DELETE ON tenancy.knowledge_review_cycles
FOR EACH ROW EXECUTE FUNCTION tenancy.protect_knowledge_review_evidence();
REVOKE ALL ON FUNCTION tenancy.protect_knowledge_review_evidence() FROM PUBLIC;

CREATE OR REPLACE FUNCTION tenancy.enqueue_due_knowledge_refreshes(batch_limit integer DEFAULT 100)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE inserted integer;
BEGIN
  IF session_user <> 'djay_worker' OR current_setting('app.service', true) IS DISTINCT FROM 'knowledge_worker'
    OR batch_limit NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'knowledge_worker_context_required'; END IF;
  WITH authority AS (
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
  ), reconciled AS (
    UPDATE tenancy.knowledge_sources source SET
      refresh_interval_hours = CASE WHEN authority.premium THEN NULL ELSE 168 END,
      next_refresh_at = CASE WHEN authority.premium THEN NULL
        WHEN source.refresh_interval_hours IS DISTINCT FROM 168 OR source.next_refresh_at IS NULL
          THEN COALESCE(source.last_refreshed_at, now()) + interval '168 hours'
        ELSE source.next_refresh_at END,
      updated_at = CASE WHEN source.refresh_interval_hours IS DISTINCT FROM CASE WHEN authority.premium THEN NULL ELSE 168 END
        THEN now() ELSE source.updated_at END
    FROM authority WHERE source.tenant_id = authority.tenant_id AND source.source_kind = 'url' AND source.status = 'active'
    RETURNING source.id
  ), due AS (
    SELECT source.id, source.tenant_id, source.created_by_membership_id
    FROM tenancy.knowledge_sources source JOIN authority ON authority.tenant_id = source.tenant_id AND NOT authority.premium
    WHERE source.source_kind = 'url' AND source.status = 'active' AND source.next_refresh_at <= now()
      AND NOT EXISTS (SELECT 1 FROM tenancy.knowledge_ingestion_jobs active
        WHERE active.tenant_id = source.tenant_id AND active.source_id = source.id
          AND active.status IN ('pending', 'processing', 'failed'))
    ORDER BY source.next_refresh_at, source.id FOR UPDATE OF source SKIP LOCKED LIMIT batch_limit
  )
  INSERT INTO tenancy.knowledge_ingestion_jobs (tenant_id, source_id, job_kind, requested_by_membership_id)
    SELECT due.tenant_id, due.id, 'scheduled_refresh', due.created_by_membership_id FROM due;
  GET DIAGNOSTICS inserted = ROW_COUNT; RETURN inserted;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.enqueue_due_knowledge_reviews(batch_limit integer DEFAULT 100)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE inserted integer;
BEGIN
  IF session_user <> 'djay_worker' OR current_setting('app.service', true) IS DISTINCT FROM 'knowledge_worker'
    OR batch_limit NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'knowledge_worker_context_required'; END IF;
  WITH eligible AS (
    SELECT subscription.tenant_id, min(subscription.period_start) AS activated_at
    FROM tenancy.product_subscriptions subscription
    JOIN catalog.plan_versions version ON version.id = subscription.plan_version_id
    JOIN catalog.plans plan ON plan.id = version.plan_id AND plan.plan_key = 'ai_chat_premium'
    JOIN LATERAL (SELECT snapshot.access_mode FROM tenancy.entitlement_snapshots snapshot
      WHERE snapshot.tenant_id = subscription.tenant_id AND snapshot.subscription_id = subscription.id
      ORDER BY snapshot.created_at DESC, snapshot.id DESC LIMIT 1) current_snapshot ON true
    WHERE subscription.product_key = 'ai_chat' AND subscription.status IN ('active', 'trialing', 'scheduled_change')
      AND current_snapshot.access_mode = 'active'
    GROUP BY subscription.tenant_id
  ), due AS (
    SELECT tenant_id, date_trunc('month', now())::date AS cycle_month,
      GREATEST(date_trunc('month', now()), activated_at + interval '30 days') AS due_at
    FROM eligible
    WHERE activated_at + interval '30 days' <= now()
      AND NOT EXISTS (SELECT 1 FROM tenancy.knowledge_review_cycles cycle
        WHERE cycle.tenant_id = eligible.tenant_id AND cycle.cycle_month = date_trunc('month', now())::date)
    ORDER BY tenant_id LIMIT batch_limit
  )
  INSERT INTO tenancy.knowledge_review_cycles (tenant_id, cycle_month, due_at)
    SELECT tenant_id, cycle_month, due_at FROM due ON CONFLICT (tenant_id, cycle_month) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT; RETURN inserted;
END
$$;

REVOKE ALL ON FUNCTION tenancy.enqueue_due_knowledge_reviews(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.enqueue_due_knowledge_reviews(integer) TO djay_worker;
