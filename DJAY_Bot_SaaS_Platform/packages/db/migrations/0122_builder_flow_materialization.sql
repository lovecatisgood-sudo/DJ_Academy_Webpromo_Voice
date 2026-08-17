ALTER TABLE tenancy.builder_draft_claims
  ADD COLUMN materialized_flow_bot_id uuid,
  ADD COLUMN materialized_at timestamptz,
  ADD CONSTRAINT builder_draft_claims_flow_materialization_state_check CHECK (
    (materialized_flow_bot_id IS NULL AND materialized_at IS NULL)
    OR (product_family = 'flow' AND materialized_flow_bot_id IS NOT NULL AND materialized_at IS NOT NULL)
  ),
  ADD CONSTRAINT builder_draft_claims_materialized_flow_bot_fk
    FOREIGN KEY (tenant_id, materialized_flow_bot_id)
    REFERENCES tenancy.flow_bots(tenant_id, id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX builder_draft_claims_materialized_flow_bot_uidx
  ON tenancy.builder_draft_claims (tenant_id, materialized_flow_bot_id)
  WHERE materialized_flow_bot_id IS NOT NULL;

GRANT UPDATE (materialized_flow_bot_id, materialized_at)
  ON tenancy.builder_draft_claims TO djay_runtime;
