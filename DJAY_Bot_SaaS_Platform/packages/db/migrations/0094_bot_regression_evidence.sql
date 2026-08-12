-- Immutable merchant regression evidence. A passing row can only reference a real artifact owned
-- by the current tenant; callers cannot certify a draft as a published version.
CREATE TABLE tenancy.bot_regression_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  product_key text NOT NULL CHECK (product_key IN ('flowbot','ai_chat','voice')),
  subject_id uuid NOT NULL,
  artifact_version_id uuid NOT NULL,
  suite_key text NOT NULL CHECK (suite_key IN ('published_smoke','merchant_scenario','completed_voice_session')),
  locale text NOT NULL CHECK (locale IN ('th','en')),
  status text NOT NULL CHECK (status IN ('passed','failed')),
  checks_json jsonb NOT NULL CHECK (jsonb_typeof(checks_json) = 'object' AND octet_length(checks_json::text) <= 20000),
  evidence_sha256 bytea NOT NULL CHECK (octet_length(evidence_sha256) = 32),
  initiated_by_membership_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, initiated_by_membership_id)
    REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX tenancy_bot_regression_current_idx
  ON tenancy.bot_regression_runs (tenant_id, product_key, subject_id, artifact_version_id, observed_at DESC);
CREATE TRIGGER tenancy_bot_regression_runs_immutable
  BEFORE UPDATE OR DELETE ON tenancy.bot_regression_runs
  FOR EACH ROW EXECUTE FUNCTION tenancy.reject_immutable_change();

CREATE FUNCTION tenancy.record_bot_regression_run(
  target_product_key text, target_subject_id uuid, target_artifact_version_id uuid,
  target_suite_key text, target_locale text, target_checks jsonb,
  target_membership_id uuid, target_idempotency_key uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy AS $$
DECLARE
  current_tenant uuid := tenancy.current_tenant_id();
  result_id uuid;
  all_passed boolean;
  target_status text;
BEGIN
  IF current_tenant IS NULL OR target_product_key NOT IN ('flowbot','ai_chat','voice')
    OR target_suite_key NOT IN ('published_smoke','merchant_scenario','completed_voice_session')
    OR target_locale NOT IN ('th','en') OR jsonb_typeof(target_checks) <> 'object'
    OR target_checks = '{}'::jsonb OR octet_length(target_checks::text) > 20000
    OR EXISTS (SELECT 1 FROM jsonb_each(target_checks) item WHERE jsonb_typeof(item.value) <> 'boolean')
  THEN RETURN NULL; END IF;

  IF NOT EXISTS (SELECT 1 FROM tenancy.memberships membership
    WHERE membership.tenant_id = current_tenant AND membership.id = target_membership_id
      AND membership.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
      AND membership.status = 'active')
  THEN RETURN NULL; END IF;

  IF target_product_key = 'flowbot' AND NOT EXISTS (
      SELECT 1 FROM tenancy.flow_bots bot JOIN tenancy.flow_versions version
        ON version.tenant_id = bot.tenant_id AND version.bot_id = bot.id
      WHERE bot.tenant_id = current_tenant AND bot.id = target_subject_id
        AND version.id = target_artifact_version_id AND bot.current_published_version_id = version.id
    ) THEN RETURN NULL;
  ELSIF target_product_key = 'ai_chat' AND NOT EXISTS (
      SELECT 1 FROM tenancy.ai_agents agent JOIN tenancy.ai_playbook_versions version
        ON version.tenant_id = agent.tenant_id AND version.agent_id = agent.id
      WHERE agent.tenant_id = current_tenant AND agent.id = target_subject_id
        AND version.id = target_artifact_version_id AND agent.current_published_playbook_version_id = version.id
    ) THEN RETURN NULL;
  ELSIF target_product_key = 'voice' AND NOT EXISTS (
      SELECT 1 FROM tenancy.voice_deployments deployment JOIN tenancy.ai_agents agent
        ON agent.tenant_id = deployment.tenant_id AND agent.id = deployment.agent_id
      JOIN tenancy.ai_playbook_versions version
        ON version.tenant_id = agent.tenant_id AND version.agent_id = agent.id
      WHERE deployment.tenant_id = current_tenant AND deployment.id = target_subject_id
        AND version.id = target_artifact_version_id AND agent.current_published_playbook_version_id = version.id
    ) THEN RETURN NULL;
  END IF;

  SELECT bool_and((item.value)::boolean) INTO all_passed FROM jsonb_each(target_checks) item;
  target_status := CASE WHEN all_passed THEN 'passed' ELSE 'failed' END;
  INSERT INTO tenancy.bot_regression_runs (
    tenant_id, product_key, subject_id, artifact_version_id, suite_key, locale, status,
    checks_json, evidence_sha256, initiated_by_membership_id, idempotency_key
  ) VALUES (
    current_tenant, target_product_key, target_subject_id, target_artifact_version_id,
    target_suite_key, target_locale, target_status, target_checks,
    public.digest(convert_to(target_product_key || ':' || target_subject_id::text || ':' || target_artifact_version_id::text
      || ':' || target_suite_key || ':' || target_locale || ':' || target_checks::text, 'UTF8'), 'sha256'),
    target_membership_id, target_idempotency_key
  ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING RETURNING id INTO result_id;
  IF result_id IS NOT NULL THEN RETURN result_id; END IF;
  SELECT id INTO result_id FROM tenancy.bot_regression_runs
    WHERE tenant_id = current_tenant AND idempotency_key = target_idempotency_key
      AND product_key = target_product_key AND subject_id = target_subject_id
      AND artifact_version_id = target_artifact_version_id AND suite_key = target_suite_key
      AND locale = target_locale AND checks_json = target_checks;
  RETURN result_id;
END;
$$;

ALTER TABLE tenancy.bot_regression_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.bot_regression_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.bot_regression_runs
  USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON tenancy.bot_regression_runs FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.record_bot_regression_run(text, uuid, uuid, text, text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT SELECT ON tenancy.bot_regression_runs TO djay_runtime;
GRANT EXECUTE ON FUNCTION tenancy.record_bot_regression_run(text, uuid, uuid, text, text, jsonb, uuid, uuid) TO djay_runtime;
