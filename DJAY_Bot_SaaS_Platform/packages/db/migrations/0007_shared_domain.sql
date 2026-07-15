CREATE TABLE tenancy.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 200),
  locale text NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'th')),
  consent_status text NOT NULL DEFAULT 'unknown'
    CHECK (consent_status IN ('unknown', 'granted', 'denied', 'withdrawn')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'merged', 'erased')),
  merged_into_contact_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  erased_at timestamptz,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, merged_into_contact_id)
    REFERENCES tenancy.contacts(tenant_id, id) ON DELETE RESTRICT,
  CHECK ((status = 'merged') = (merged_into_contact_id IS NOT NULL)),
  CHECK (merged_into_contact_id IS NULL OR merged_into_contact_id <> id)
);

CREATE TABLE tenancy.contact_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  identity_kind text NOT NULL CHECK (identity_kind IN ('email', 'phone', 'channel')),
  normalized_value text NOT NULL CHECK (normalized_value = lower(btrim(normalized_value))),
  display_value_ciphertext text,
  verification_status text NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'verified', 'disputed')),
  verified_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, contact_id) REFERENCES tenancy.contacts(tenant_id, id) ON DELETE CASCADE,
  CHECK ((verification_status = 'verified') = (verified_at IS NOT NULL))
);

CREATE UNIQUE INDEX tenancy_verified_contact_identity_unique
  ON tenancy.contact_identities(tenant_id, identity_kind, normalized_value)
  WHERE verification_status = 'verified' AND revoked_at IS NULL;

CREATE INDEX tenancy_contact_identity_candidates
  ON tenancy.contact_identities(tenant_id, identity_kind, normalized_value);

CREATE TABLE tenancy.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 200),
  source text NOT NULL CHECK (char_length(source) BETWEEN 2 AND 80),
  status text NOT NULL DEFAULT 'new' CHECK (status IN (
    'new', 'pending_follow_up', 'appointment_made', 'not_closed_follow', 'closed_deal', 'disqualified'
  )),
  assigned_membership_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, contact_id) REFERENCES tenancy.contacts(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, assigned_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.lead_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  source_action text NOT NULL,
  actor_membership_id uuid,
  request_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, lead_id) REFERENCES tenancy.leads(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.sales_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  fact_type text NOT NULL,
  value_json jsonb NOT NULL,
  confidence text NOT NULL DEFAULT 'customer_stated'
    CHECK (confidence IN ('inferred', 'customer_stated', 'merchant_confirmed', 'disputed')),
  source_message_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, lead_id) REFERENCES tenancy.leads(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.appointment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  conversation_id uuid,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN (
    'requested', 'pending_confirmation', 'confirmed', 'completed', 'cancelled', 'rejected', 'no_show'
  )),
  timezone text NOT NULL CHECK (char_length(timezone) BETWEEN 3 AND 64),
  notes text,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, lead_id) REFERENCES tenancy.leads(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.appointment_time_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  appointment_request_id uuid NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  preference_order smallint NOT NULL CHECK (preference_order BETWEEN 1 AND 5),
  source text NOT NULL,
  verification_status text NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'available', 'unavailable', 'confirmed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, appointment_request_id, preference_order),
  FOREIGN KEY (tenant_id, appointment_request_id)
    REFERENCES tenancy.appointment_requests(tenant_id, id) ON DELETE CASCADE,
  CHECK (end_at > start_at)
);

CREATE TABLE tenancy.follow_up_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  assignee_membership_id uuid,
  task_type text NOT NULL DEFAULT 'follow_up',
  note text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'cancelled')),
  due_at timestamptz NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, lead_id) REFERENCES tenancy.leads(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, assignee_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  lead_id uuid,
  product_key text NOT NULL REFERENCES catalog.products(product_key) ON DELETE RESTRICT,
  public_plan_key text NOT NULL,
  entitlement_snapshot_id uuid NOT NULL,
  channel_kind text NOT NULL CHECK (channel_kind IN ('web', 'line', 'whatsapp', 'messenger', 'voice', 'internal')),
  automation_mode text NOT NULL CHECK (automation_mode IN ('flowbot', 'ai_text', 'voice', 'human', 'closed')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'waiting', 'closed')),
  assigned_membership_id uuid,
  next_sequence integer NOT NULL DEFAULT 1 CHECK (next_sequence > 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, contact_id) REFERENCES tenancy.contacts(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, lead_id) REFERENCES tenancy.leads(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, entitlement_snapshot_id)
    REFERENCES tenancy.entitlement_snapshots(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, assigned_membership_id)
    REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT,
  CHECK ((status = 'closed') = (closed_at IS NOT NULL)),
  CHECK ((automation_mode = 'closed') = (status = 'closed'))
);

ALTER TABLE tenancy.appointment_requests
  ADD CONSTRAINT tenancy_appointment_conversation_fk
  FOREIGN KEY (tenant_id, conversation_id) REFERENCES tenancy.conversations(tenant_id, id) ON DELETE RESTRICT;

CREATE TABLE tenancy.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  actor_type text NOT NULL CHECK (actor_type IN ('customer', 'flowbot', 'ai', 'human', 'system')),
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound', 'internal')),
  content_json jsonb NOT NULL,
  external_message_id text,
  reply_to_message_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, conversation_id, sequence),
  FOREIGN KEY (tenant_id, conversation_id) REFERENCES tenancy.conversations(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, reply_to_message_id) REFERENCES tenancy.messages(tenant_id, id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX tenancy_external_message_dedupe
  ON tenancy.messages(tenant_id, conversation_id, external_message_id)
  WHERE external_message_id IS NOT NULL;

ALTER TABLE tenancy.sales_facts
  ADD CONSTRAINT tenancy_sales_fact_source_message_fk
  FOREIGN KEY (tenant_id, source_message_id) REFERENCES tenancy.messages(tenant_id, id) ON DELETE RESTRICT;

CREATE TABLE tenancy.conversation_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  author_membership_id uuid NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, conversation_id) REFERENCES tenancy.conversations(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, author_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.conversation_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  from_mode text NOT NULL,
  to_mode text NOT NULL,
  reason text NOT NULL,
  actor_membership_id uuid,
  context_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, conversation_id) REFERENCES tenancy.conversations(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT,
  CHECK (from_mode <> to_mode)
);

CREATE TABLE tenancy.handover_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('requested', 'accepted', 'released', 'declined', 'timed_out')),
  actor_membership_id uuid,
  assigned_membership_id uuid,
  reason text,
  summary text,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, conversation_id) REFERENCES tenancy.conversations(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, assigned_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
  source_kind text NOT NULL CHECK (source_kind IN ('text', 'file', 'url', 'structured')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'erased')),
  created_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, created_by_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.knowledge_source_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  source_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  content_text text NOT NULL,
  checksum bytea NOT NULL CHECK (octet_length(checksum) = 32),
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('processing', 'ready', 'failed', 'superseded')),
  provenance_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, source_id, version),
  FOREIGN KEY (tenant_id, source_id) REFERENCES tenancy.knowledge_sources(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  source_revision_id uuid NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  content_text text NOT NULL,
  content_hash bytea NOT NULL CHECK (octet_length(content_hash) = 32),
  vector_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, source_revision_id, sequence),
  FOREIGN KEY (tenant_id, source_revision_id)
    REFERENCES tenancy.knowledge_source_revisions(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE tenancy.notification_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  name text NOT NULL,
  recipient_ciphertext text NOT NULL,
  allowed_template_keys text[] NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, created_by_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.action_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  conversation_id uuid,
  entitlement_snapshot_id uuid NOT NULL,
  action_type text NOT NULL CHECK (action_type IN (
    'lead.create', 'lead.update', 'sales_fact.record', 'appointment.request',
    'follow_up.create', 'handover.request', 'merchant_email.send'
  )),
  input_json jsonb NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'processing', 'succeeded', 'failed')),
  requested_by_membership_id uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, conversation_id) REFERENCES tenancy.conversations(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, entitlement_snapshot_id) REFERENCES tenancy.entitlement_snapshots(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, requested_by_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.action_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  action_request_id uuid NOT NULL,
  executor_key text NOT NULL,
  attempt integer NOT NULL CHECK (attempt > 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  result_code text,
  safe_error text,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, action_request_id, attempt),
  FOREIGN KEY (tenant_id, action_request_id) REFERENCES tenancy.action_requests(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.action_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  action_request_id uuid NOT NULL,
  success boolean NOT NULL,
  result_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, action_request_id),
  FOREIGN KEY (tenant_id, action_request_id) REFERENCES tenancy.action_requests(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.retention_policies (
  tenant_id uuid PRIMARY KEY REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  conversation_days integer NOT NULL DEFAULT 365 CHECK (conversation_days BETWEEN 30 AND 3650),
  message_days integer NOT NULL DEFAULT 365 CHECK (message_days BETWEEN 30 AND 3650),
  knowledge_days integer NOT NULL DEFAULT 730 CHECK (knowledge_days BETWEEN 30 AND 3650),
  recording_days integer NOT NULL DEFAULT 0 CHECK (recording_days BETWEEN 0 AND 3650),
  updated_by_membership_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, updated_by_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.privacy_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  contact_id uuid,
  job_type text NOT NULL CHECK (job_type IN ('export', 'erasure')),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'processing', 'completed', 'failed', 'cancelled')),
  scope_json jsonb NOT NULL,
  result_object_ref_ciphertext text,
  idempotency_key text NOT NULL,
  requested_by_membership_id uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, contact_id) REFERENCES tenancy.contacts(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, requested_by_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.privacy_lineage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  privacy_job_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  disposition text NOT NULL CHECK (disposition IN ('exported', 'erased', 'anonymized', 'retained_legal', 'not_found')),
  detail_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, privacy_job_id, entity_type, entity_id),
  FOREIGN KEY (tenant_id, privacy_job_id) REFERENCES tenancy.privacy_jobs(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.support_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  requested_by_platform_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  approved_by_platform_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 12 AND 500),
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'active', 'expired', 'revoked')),
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CHECK (requested_by_platform_user_id <> approved_by_platform_user_id),
  CHECK (expires_at > starts_at AND expires_at <= starts_at + interval '4 hours')
);

CREATE OR REPLACE FUNCTION tenancy.reject_shared_domain_immutable_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, tenancy AS $$
BEGIN
  RAISE EXCEPTION '% is immutable', TG_TABLE_NAME;
END
$$;

CREATE TRIGGER tenancy_message_immutable BEFORE UPDATE OR DELETE ON tenancy.messages
  FOR EACH ROW EXECUTE FUNCTION tenancy.reject_shared_domain_immutable_change();
CREATE TRIGGER tenancy_lead_history_immutable BEFORE UPDATE OR DELETE ON tenancy.lead_status_history
  FOR EACH ROW EXECUTE FUNCTION tenancy.reject_shared_domain_immutable_change();
CREATE TRIGGER tenancy_conversation_transition_immutable BEFORE UPDATE OR DELETE ON tenancy.conversation_transitions
  FOR EACH ROW EXECUTE FUNCTION tenancy.reject_shared_domain_immutable_change();
CREATE TRIGGER tenancy_handover_event_immutable BEFORE UPDATE OR DELETE ON tenancy.handover_events
  FOR EACH ROW EXECUTE FUNCTION tenancy.reject_shared_domain_immutable_change();
CREATE TRIGGER tenancy_knowledge_revision_immutable BEFORE UPDATE OR DELETE ON tenancy.knowledge_source_revisions
  FOR EACH ROW EXECUTE FUNCTION tenancy.reject_shared_domain_immutable_change();
CREATE TRIGGER tenancy_action_result_immutable BEFORE UPDATE OR DELETE ON tenancy.action_results
  FOR EACH ROW EXECUTE FUNCTION tenancy.reject_shared_domain_immutable_change();
CREATE TRIGGER tenancy_privacy_lineage_immutable BEFORE UPDATE OR DELETE ON tenancy.privacy_lineage
  FOR EACH ROW EXECUTE FUNCTION tenancy.reject_shared_domain_immutable_change();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'contacts', 'contact_identities', 'leads', 'lead_status_history', 'sales_facts',
    'appointment_requests', 'appointment_time_options', 'follow_up_tasks', 'conversations',
    'messages', 'conversation_notes', 'conversation_transitions', 'handover_events',
    'knowledge_sources', 'knowledge_source_revisions', 'knowledge_chunks',
    'notification_profiles', 'action_requests', 'action_attempts', 'action_results',
    'retention_policies', 'privacy_jobs', 'privacy_lineage', 'support_access_grants'
  ] LOOP
    EXECUTE format('ALTER TABLE tenancy.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE tenancy.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON tenancy.%I USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id())',
      table_name
    );
  END LOOP;
END
$$;

CREATE POLICY platform_support_grant_access ON tenancy.support_access_grants TO djay_platform
  USING (true) WITH CHECK (true);
CREATE POLICY worker_action_access ON tenancy.action_requests TO djay_worker
  USING (true) WITH CHECK (true);
CREATE POLICY worker_action_attempt_access ON tenancy.action_attempts TO djay_worker
  USING (true) WITH CHECK (true);
CREATE POLICY worker_action_result_access ON tenancy.action_results TO djay_worker
  USING (true) WITH CHECK (true);
CREATE POLICY worker_privacy_job_access ON tenancy.privacy_jobs TO djay_worker
  USING (true) WITH CHECK (true);
CREATE POLICY worker_privacy_lineage_access ON tenancy.privacy_lineage TO djay_worker
  USING (true) WITH CHECK (true);

REVOKE ALL ON ALL TABLES IN SCHEMA tenancy FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE ON tenancy.contacts, tenancy.contact_identities,
  tenancy.leads, tenancy.sales_facts, tenancy.appointment_requests,
  tenancy.appointment_time_options, tenancy.follow_up_tasks, tenancy.conversations,
  tenancy.conversation_notes, tenancy.knowledge_sources, tenancy.notification_profiles,
  tenancy.action_requests, tenancy.action_attempts, tenancy.retention_policies,
  tenancy.privacy_jobs TO djay_runtime;
GRANT SELECT, INSERT ON tenancy.lead_status_history, tenancy.messages,
  tenancy.conversation_transitions, tenancy.handover_events,
  tenancy.knowledge_source_revisions, tenancy.knowledge_chunks,
  tenancy.action_results, tenancy.privacy_lineage TO djay_runtime;
GRANT SELECT ON tenancy.support_access_grants TO djay_runtime;

GRANT SELECT, INSERT, UPDATE ON tenancy.action_requests, tenancy.action_attempts,
  tenancy.privacy_jobs TO djay_worker;
GRANT SELECT, INSERT ON tenancy.action_results, tenancy.privacy_lineage TO djay_worker;

GRANT SELECT, INSERT, UPDATE ON tenancy.support_access_grants TO djay_platform;
GRANT EXECUTE ON FUNCTION tenancy.reject_shared_domain_immutable_change()
  TO djay_runtime, djay_worker, djay_platform;
