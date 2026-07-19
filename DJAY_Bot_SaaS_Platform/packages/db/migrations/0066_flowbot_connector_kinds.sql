ALTER TABLE tenancy.flow_integration_profiles
  ADD COLUMN integration_kind text NOT NULL DEFAULT 'external_api'
    CHECK (integration_kind IN ('external_api', 'google_sheets'));

CREATE INDEX tenancy_flow_integration_kind
  ON tenancy.flow_integration_profiles(tenant_id, integration_kind, status, created_at DESC);
