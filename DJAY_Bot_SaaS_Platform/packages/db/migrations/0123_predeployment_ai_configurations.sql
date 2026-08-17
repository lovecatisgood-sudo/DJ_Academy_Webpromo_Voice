ALTER TABLE tenancy.ai_agents
  ADD COLUMN product_family text;

UPDATE tenancy.ai_agents agent
SET product_family = CASE WHEN EXISTS (
  SELECT 1 FROM tenancy.voice_deployments deployment
  WHERE deployment.tenant_id = agent.tenant_id AND deployment.agent_id = agent.id
) THEN 'voice' ELSE 'text' END;

ALTER TABLE tenancy.ai_agents
  ALTER COLUMN product_family SET DEFAULT 'text',
  ALTER COLUMN product_family SET NOT NULL,
  ADD CONSTRAINT ai_agents_product_family_check CHECK (product_family IN ('text', 'voice'));

CREATE INDEX ai_agents_tenant_family_updated_idx
  ON tenancy.ai_agents (tenant_id, product_family, updated_at DESC, id);

ALTER TABLE tenancy.builder_draft_claims
  ADD COLUMN materialized_ai_agent_id uuid,
  ADD COLUMN materialized_ai_at timestamptz,
  ADD CONSTRAINT builder_draft_claims_ai_materialization_state_check CHECK (
    (materialized_ai_agent_id IS NULL AND materialized_ai_at IS NULL)
    OR (product_family IN ('text', 'voice')
      AND materialized_ai_agent_id IS NOT NULL AND materialized_ai_at IS NOT NULL)
  ),
  ADD CONSTRAINT builder_draft_claims_materialized_ai_agent_fk
    FOREIGN KEY (tenant_id, materialized_ai_agent_id)
    REFERENCES tenancy.ai_agents(tenant_id, id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX builder_draft_claims_materialized_ai_agent_uidx
  ON tenancy.builder_draft_claims (tenant_id, materialized_ai_agent_id)
  WHERE materialized_ai_agent_id IS NOT NULL;

GRANT UPDATE (materialized_ai_agent_id, materialized_ai_at)
  ON tenancy.builder_draft_claims TO djay_runtime;
