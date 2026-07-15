CREATE TABLE tenancy.legacy_conversation_imports (
  tenant_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  migration_run_id uuid NOT NULL REFERENCES migration.runs(id) ON DELETE RESTRICT,
  source_kind text NOT NULL CHECK (source_kind IN ('voice_widget', 'text_widget')),
  source_language text,
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  summary_text text CHECK (summary_text IS NULL OR char_length(summary_text) <= 5000),
  starred boolean NOT NULL DEFAULT false,
  cutover_state text NOT NULL DEFAULT 'imported' CHECK (cutover_state IN ('imported', 'rolled_back')),
  source_checksum bytea NOT NULL CHECK (octet_length(source_checksum) = 32),
  imported_at timestamptz NOT NULL DEFAULT now(),
  rolled_back_at timestamptz,
  PRIMARY KEY (tenant_id, conversation_id),
  FOREIGN KEY (tenant_id, conversation_id)
    REFERENCES tenancy.conversations(tenant_id, id) ON DELETE RESTRICT,
  CHECK ((cutover_state = 'rolled_back') = (rolled_back_at IS NOT NULL))
);

ALTER TABLE tenancy.legacy_conversation_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.legacy_conversation_imports FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.legacy_conversation_imports
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

CREATE UNIQUE INDEX migration_reject_idempotency
  ON migration.rejects(run_id, source_entity_type, redacted_locator, reason_code);

REVOKE ALL ON tenancy.legacy_conversation_imports FROM PUBLIC;
GRANT SELECT ON tenancy.legacy_conversation_imports TO djay_runtime;

GRANT USAGE ON SCHEMA tenancy, catalog TO djay_migrator;
GRANT SELECT ON ALL TABLES IN SCHEMA catalog TO djay_migrator;
GRANT SELECT ON tenancy.tenants, tenancy.product_subscriptions,
  tenancy.entitlement_snapshots TO djay_migrator;
GRANT SELECT, INSERT, UPDATE ON tenancy.contacts, tenancy.contact_identities,
  tenancy.leads, tenancy.sales_facts, tenancy.conversations,
  tenancy.legacy_conversation_imports TO djay_migrator;
GRANT SELECT, INSERT ON tenancy.lead_status_history, tenancy.messages TO djay_migrator;
GRANT SELECT ON tenancy.conversation_notes, tenancy.conversation_transitions,
  tenancy.handover_events, tenancy.action_requests,
  tenancy.appointment_requests TO djay_migrator;
GRANT EXECUTE ON FUNCTION tenancy.current_tenant_id() TO djay_migrator;
