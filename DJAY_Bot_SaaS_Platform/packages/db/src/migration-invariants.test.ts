import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(import.meta.dirname, "../migrations/0001_identity_tenancy.sql"), "utf8");
const hardeningMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0002_identity_hardening.sql"), "utf8");
const teamQueryMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0003_tenant_team_queries.sql"), "utf8");
const platformIdentityMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0004_platform_identity.sql"), "utf8");
const tenantMfaMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0005_tenant_mfa.sql"), "utf8");
const commerceMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0006_catalog_entitlements_usage.sql"), "utf8");
const sharedDomainMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0007_shared_domain.sql"), "utf8");
const privacySupportMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0008_privacy_support_hardening.sql"), "utf8");
const flowbotMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0009_flowbot_saas.sql"), "utf8");
const flowbotRuntimeMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0010_flowbot_public_runtime.sql"), "utf8");
const flowbotSyncMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0013_flowbot_session_sync.sql"), "utf8");
const flowbotOperationsMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0014_flowbot_operations.sql"), "utf8");
const flowbotReleaseMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0015_flowbot_release_operations.sql"), "utf8");
const flowbotNotificationMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0016_flowbot_lead_notifications.sql"), "utf8");
const aiChatMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0017_ai_chat_saas.sql"), "utf8");
const aiRuntimeMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0018_ai_chat_public_runtime.sql"), "utf8");
const aiNotificationMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0019_ai_chat_notifications.sql"), "utf8");
const aiSocialMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0020_ai_chat_social_line.sql"), "utf8");
const aiSocialWorkerMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0021_ai_chat_social_workers.sql"), "utf8");
const aiSocialSessionMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0022_ai_chat_social_sessions.sql"), "utf8");
const aiSocialCommitMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0023_ai_chat_social_commit.sql"), "utf8");
const aiSocialDeliveryMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0024_ai_chat_social_delivery.sql"), "utf8");
const identityReviewMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0025_contact_identity_review_candidates.sql"), "utf8");
const socialServiceWindowMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0026_ai_chat_social_service_window.sql"), "utf8");
const socialDeliveryProgressMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0027_ai_chat_social_delivery_progress.sql"), "utf8");
const socialOperationsMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0028_ai_chat_social_operations.sql"), "utf8");
const voiceBasicAuthorityMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0029_voice_basic_authority.sql"), "utf8");
const voiceRecoveryMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0030_voice_runtime_recovery.sql"), "utf8");
const voiceSalesCoreMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0031_voice_sales_core.sql"), "utf8");
const voiceOutcomesRetentionMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0032_voice_outcomes_retention.sql"), "utf8");
const voiceTextLegacyMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0033_voice_text_legacy_migration.sql"), "utf8");
const voiceAdvancedRoutingMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0034_voice_advanced_routing.sql"), "utf8");
const voiceAdvancedDeploymentMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0035_voice_advanced_deployments.sql"), "utf8");
const voiceAdvancedRuntimeMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0036_voice_advanced_runtime.sql"), "utf8");
const voiceAnalyticsMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0037_voice_analytics_indexes.sql"), "utf8");

const tenantTables = [
  "tenants",
  "memberships",
  "tenant_onboarding",
  "membership_invitations",
  "ownership_transfers",
  "audit_logs",
  "outbox",
];

describe("P1 database migration invariants", () => {
  it("enables and forces RLS on every tenant table", () => {
    for (const table of tenantTables) {
      expect(migration).toContain(`ALTER TABLE tenancy.${table} ENABLE ROW LEVEL SECURITY`);
      expect(migration).toContain(`ALTER TABLE tenancy.${table} FORCE ROW LEVEL SECURITY`);
    }
  });

  it("keeps runtime roles without bypass-RLS capability", () => {
    const roles = readFileSync(resolve(import.meta.dirname, "../migrations/0000_roles.sql"), "utf8");
    for (const role of ["djay_auth_runtime", "djay_runtime", "djay_worker"]) {
      expect(roles).toMatch(new RegExp(`CREATE ROLE ${role}[^;]+NOBYPASSRLS`));
    }
  });

  it("enforces one active Tenant Master Admin and same-tenant ownership references", () => {
    expect(migration).toContain("CREATE UNIQUE INDEX tenancy_one_active_master_admin");
    expect(migration).toContain("CREATE CONSTRAINT TRIGGER tenancy_membership_owner_invariant");
    expect(migration).toContain("REFERENCES tenancy.memberships(tenant_id, id)");
  });

  it("does not grant tenant runtime access to the platform schema", () => {
    expect(migration).not.toMatch(/GRANT[^;]+platform[^;]+TO djay_runtime/i);
    expect(migration).toContain("GRANT USAGE ON SCHEMA platform TO djay_platform");
  });

  it("uses fixed-search-path security definer triggers for the owner invariant", () => {
    expect(migration).toMatch(/check_owner_after_membership_change\(\)[\s\S]+SECURITY DEFINER[\s\S]+SET search_path = pg_catalog, tenancy/);
    expect(migration).toMatch(/check_owner_after_tenant_change\(\)[\s\S]+SECURITY DEFINER[\s\S]+SET search_path = pg_catalog, tenancy/);
  });

  it("tracks recent reauthentication and supports tenant-scoped invitation tokens", () => {
    expect(hardeningMigration).toContain("ADD COLUMN reauthenticated_at");
    expect(hardeningMigration).toContain("ADD COLUMN tenant_id uuid REFERENCES tenancy.tenants");
    expect(hardeningMigration).toContain("identity_one_time_token_has_subject");
  });

  it("exposes team identity data only through a fixed-context restricted function", () => {
    expect(teamQueryMigration).toContain("SECURITY DEFINER");
    expect(teamQueryMigration).toContain("SET search_path = pg_catalog, identity, tenancy");
    expect(teamQueryMigration).toContain("membership.tenant_id = tenancy.current_tenant_id()");
    expect(teamQueryMigration).toContain("REVOKE ALL ON FUNCTION tenancy.current_tenant_team() FROM PUBLIC");
  });

  it("keeps platform bootstrap one-time and MFA login challenge state separate", () => {
    expect(platformIdentityMigration).toContain("CREATE TABLE platform.bootstrap_state");
    expect(platformIdentityMigration).toContain("CHECK (singleton = true)");
    expect(platformIdentityMigration).toContain("CREATE TABLE platform.login_challenges");
    expect(platformIdentityMigration).toContain("platform.mfa_recovery_codes");
    expect(platformIdentityMigration).toContain("TO djay_platform");
  });

  it("records tenant MFA assurance on the session and stores only recovery digests", () => {
    expect(tenantMfaMigration).toContain("ADD COLUMN mfa_verified_at");
    expect(tenantMfaMigration).toContain("CREATE TABLE identity.auth_login_challenges");
    expect(tenantMfaMigration).toContain("code_hash bytea NOT NULL UNIQUE");
  });
});

describe("P5 AI Chat database migration invariants", () => {
  it("forces tenant isolation across every AI authoring and runtime table", () => {
    for (const table of [
      "ai_agents", "ai_playbook_versions", "ai_playbook_knowledge", "ai_playbook_drafts",
      "ai_deployments", "ai_sessions", "ai_turns",
    ]) expect(aiChatMigration).toContain(`'${table}'`);
    expect(aiChatMigration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(aiChatMigration).toContain("FORCE ROW LEVEL SECURITY");
  });

  it("uses opaque web credentials and immutable playbook/knowledge pins", () => {
    expect(aiChatMigration).toContain("deployment_key_hash bytea UNIQUE");
    expect(aiChatMigration).toContain("session_token_hash bytea NOT NULL UNIQUE");
    expect(aiChatMigration).toContain("tenancy_ai_playbook_version_immutable");
    expect(aiChatMigration).toContain("tenancy_ai_playbook_knowledge_immutable");
    expect(aiChatMigration).not.toMatch(/deployment_key text|session_token text/i);
  });

  it("keeps native usage in a restricted operations table", () => {
    expect(aiChatMigration).toContain("CREATE TABLE operations.ai_native_usage");
    expect(aiChatMigration).toContain("REVOKE ALL ON operations.ai_native_usage FROM PUBLIC");
    expect(aiChatMigration).not.toMatch(/GRANT[^;]+operations\.ai_native_usage[^;]+djay_runtime/i);
  });

  it("gives the AI public runtime no table access", () => {
    expect(aiChatMigration).toMatch(/CREATE ROLE djay_ai_runtime[^;]+NOBYPASSRLS/);
    expect(aiChatMigration).not.toMatch(/GRANT (SELECT|INSERT|UPDATE|DELETE)[^;]+djay_ai_runtime/i);
  });

  it("uses fixed-path functions for origin-bound, idempotent, metered turns", () => {
    expect(aiRuntimeMigration).toContain("tenancy.ai_origin_allowed(deployment.allowed_origins, request_origin)");
    expect(aiRuntimeMigration).toContain("session.session_token_hash = target_session_hash");
    expect(aiRuntimeMigration).toContain("'ai:turn:' || target_input_id::text");
    expect(aiRuntimeMigration).toContain("customer_unit, customer_quantity");
    expect(aiRuntimeMigration).toContain("SECURITY DEFINER");
    expect(aiRuntimeMigration).toContain("REVOKE ALL ON FUNCTION tenancy.begin_ai_turn");
    expect(aiRuntimeMigration).toContain("TO djay_ai_runtime");
  });

  it("rechecks human takeover before committing an AI reply", () => {
    expect(aiRuntimeMigration).toContain("runtime.automation_mode <> 'ai_text'");
    expect(aiRuntimeMigration).toContain("'handover_active'");
    expect(aiRuntimeMigration).toContain("SET status = 'released'");
  });

  it("delivers merchant email only through an entitlement-aware fixed worker context", () => {
    expect(aiNotificationMigration).toContain("'ai_chat.merchant_email.requested'");
    expect(aiNotificationMigration).toContain("'ai_chat.lead_qualified'");
    expect(aiNotificationMigration).toContain("'sales_email_action.enabled' = 'true'");
    expect(aiNotificationMigration).toContain("session_user <> 'djay_worker'");
    expect(aiNotificationMigration).toContain("'ai_chat_notification_worker'");
    expect(aiNotificationMigration).toContain("REVOKE ALL ON FUNCTION tenancy.claim_ai_chat_notification");
  });
});

describe("P6 AI Chat Premium social migration invariants", () => {
  it("forces RLS on connections, subject offsets, and inbound receipts", () => {
    for (const table of [
      "ai_social_connections", "ai_social_subject_offsets", "ai_social_inbound_receipts",
    ]) expect(aiSocialMigration).toContain(`'${table}'`);
    expect(aiSocialMigration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(aiSocialMigration).toContain("FORCE ROW LEVEL SECURITY");
  });

  it("keeps credentials encrypted and webhook keys hashed", () => {
    expect(aiSocialMigration).toContain("credential_ciphertext text NOT NULL");
    expect(aiSocialMigration).toContain("webhook_key_hash bytea NOT NULL UNIQUE");
    expect(aiSocialMigration).not.toMatch(/channel_access_token|channel_secret|webhook_key text/i);
  });

  it("requires Premium channel authority inside both restricted runtime functions", () => {
    expect(aiSocialMigration).toContain("plan.plan_key = 'ai_chat_premium'");
    expect(aiSocialMigration).toContain("snapshot.resolved_json->'entitlements'->>('channel.' || target_channel) = 'true'");
    expect(aiSocialMigration).toContain("REVOKE ALL ON FUNCTION tenancy.ai_social_runtime_connection");
    expect(aiSocialMigration).toContain("TO djay_ai_runtime");
    expect(aiSocialMigration).not.toMatch(/GRANT (SELECT|INSERT|UPDATE|DELETE)[^;]+djay_ai_runtime/i);
  });

  it("deduplicates, orders per subject, and enqueues only accepted events", () => {
    expect(aiSocialMigration).toContain("pg_advisory_xact_lock");
    expect(aiSocialMigration).toContain("last_accepted_occurred_at");
    expect(aiSocialMigration).toContain("'out_of_order'");
    expect(aiSocialMigration).toContain("IF selected_disposition = 'accepted'");
    expect(aiSocialMigration).toContain("'ai_chat.social.inbound.received'");
  });

  it("keeps social subjects tenant-isolated and inbound work restricted and retryable", () => {
    expect(aiSocialWorkerMigration).toContain("ALTER TABLE tenancy.ai_social_subjects ENABLE ROW LEVEL SECURITY");
    expect(aiSocialWorkerMigration).toContain("ALTER TABLE tenancy.ai_social_subjects FORCE ROW LEVEL SECURITY");
    expect(aiSocialWorkerMigration).toContain("session_user <> 'djay_worker'");
    expect(aiSocialWorkerMigration).toContain("'ai_social_worker'");
    expect(aiSocialWorkerMigration).toContain("FOR UPDATE SKIP LOCKED");
    expect(aiSocialWorkerMigration).toContain("'dead_letter'");
    expect(aiSocialWorkerMigration).toContain("plan.plan_key = 'ai_chat_premium'");
    expect(aiSocialWorkerMigration).toContain("REVOKE ALL ON FUNCTION tenancy.claim_ai_social_inbound");
  });

  it("serializes subjects and creates metered social turns only in worker context", () => {
    expect(aiSocialSessionMigration).toContain("earlier_receipt.subject_hash = candidate_receipt.subject_hash");
    expect(aiSocialSessionMigration).toContain("'ai_social_worker'");
    expect(aiSocialSessionMigration).toContain("CREATE OR REPLACE FUNCTION tenancy.begin_ai_social_turn");
    expect(aiSocialSessionMigration).toContain("'ai:social:turn:' || runtime.receipt_id::text");
    expect(aiSocialSessionMigration).toContain("session.status = 'active'");
    expect(aiSocialSessionMigration).toContain("conversation.automation_mode = 'ai_text'");
    expect(aiSocialSessionMigration).toContain("REVOKE ALL ON FUNCTION tenancy.begin_ai_social_turn");
  });

  it("commits social actions, usage, and one durable outbound reply atomically", () => {
    expect(aiSocialCommitMigration).toContain("CREATE TABLE tenancy.ai_social_outbound_deliveries");
    expect(aiSocialCommitMigration).toContain("FORCE ROW LEVEL SECURITY");
    expect(aiSocialCommitMigration).toContain("CREATE OR REPLACE FUNCTION tenancy.commit_ai_social_turn");
    for (const action of ["lead.capture", "sales_fact.record", "appointment.request", "follow_up.create", "handover.request", "merchant_email.send"]) {
      expect(aiSocialCommitMigration).toContain(`'${action}'`);
    }
    expect(aiSocialCommitMigration).toContain("plan.plan_key = 'ai_chat_premium'");
    expect(aiSocialCommitMigration).toContain("INSERT INTO operations.ai_native_usage");
    expect(aiSocialCommitMigration).toContain("'ai:social:turn:' || runtime.receipt_id::text || ':settled'");
    expect(aiSocialCommitMigration).toContain("REVOKE ALL ON FUNCTION tenancy.commit_ai_social_turn");
  });

  it("delivers replies through a restricted retry ledger without inventing rates", () => {
    expect(aiSocialDeliveryMigration).toContain("CREATE TABLE tenancy.ai_social_channel_quantity_events");
    expect(aiSocialDeliveryMigration).toContain("FORCE ROW LEVEL SECURITY");
    expect(aiSocialDeliveryMigration).toContain("FOR UPDATE SKIP LOCKED");
    expect(aiSocialDeliveryMigration).toContain("'ai_social_delivery_worker'");
    expect(aiSocialDeliveryMigration).toContain("'dead_letter'");
    expect(aiSocialDeliveryMigration).toContain("fee_classification");
    expect(aiSocialDeliveryMigration).toContain("IF attempted_quantity > 0 THEN");
    expect(aiSocialDeliveryMigration).not.toMatch(/rate_minor|billable_amount|THB/i);
    expect(aiSocialDeliveryMigration).toContain("REVOKE ALL ON FUNCTION tenancy.claim_ai_social_delivery");
    expect(socialDeliveryProgressMigration).toContain("delivered_part_count");
    expect(socialDeliveryProgressMigration).toContain("finish_ai_social_delivery_parts");
    expect(socialDeliveryProgressMigration).toContain("delivery.external_message_ids ||");
    expect(socialDeliveryProgressMigration).toContain("REVOKE ALL ON FUNCTION tenancy.finish_ai_social_delivery_parts");
    expect(socialDeliveryProgressMigration).not.toMatch(/rate_minor|billable_amount|THB/i);
  });

  it("exposes only aggregate social operations health to the platform role", () => {
    expect(socialOperationsMigration).toContain("CREATE FUNCTION platform.ai_social_health_summary");
    expect(socialOperationsMigration).toContain("session_user <> 'djay_platform'");
    expect(socialOperationsMigration).toContain("oldestInboundQueueSeconds");
    expect(socialOperationsMigration).toContain("oldestDeliveryQueueSeconds");
    expect(socialOperationsMigration).toContain("serviceWindowClosed24h");
    expect(socialOperationsMigration).toContain("REVOKE ALL ON FUNCTION platform.ai_social_health_summary");
    expect(socialOperationsMigration).not.toMatch(/credential|recipient|subject|provider|model/i);
  });

  it("records cross-contact identity matches for review without merging", () => {
    expect(identityReviewMigration).toContain("CREATE TABLE tenancy.contact_identity_review_candidates");
    expect(identityReviewMigration).toContain("FORCE ROW LEVEL SECURITY");
    expect(identityReviewMigration).toContain("candidate_identity.contact_id <> NEW.contact_id");
    expect(identityReviewMigration).toContain("AFTER INSERT OR UPDATE OF normalized_value, revoked_at");
    expect(identityReviewMigration).toContain("GRANT SELECT ON tenancy.contact_identity_review_candidates TO djay_runtime");
    expect(identityReviewMigration).not.toMatch(/UPDATE tenancy\.contacts[\s\S]*merged_into_contact_id/);
  });

  it("fails non-LINE delivery closed when the customer-service window expires", () => {
    expect(socialServiceWindowMigration).toContain("DROP FUNCTION tenancy.claim_ai_social_delivery");
    expect(socialServiceWindowMigration).toContain("receipt.occurred_at + interval '24 hours'");
    expect(socialServiceWindowMigration).toContain("claimed.channel = 'line' OR claim_time <=");
    expect(socialServiceWindowMigration).toContain("service_window_open boolean");
    expect(socialServiceWindowMigration).toContain("REVOKE ALL ON FUNCTION tenancy.claim_ai_social_delivery");
  });
});

describe("P2 database migration invariants", () => {
  it("forces RLS on every tenant commerce and usage table", () => {
    for (const table of [
      "product_subscriptions", "entitlement_overrides", "entitlement_snapshots",
      "quota_accounts", "usage_reservations", "usage_events",
    ]) {
      expect(commerceMigration).toContain(`ALTER TABLE tenancy.${table} ENABLE ROW LEVEL SECURITY`);
      expect(commerceMigration).toContain(`ALTER TABLE tenancy.${table} FORCE ROW LEVEL SECURITY`);
    }
  });

  it("locks exactly six plans and one live tier per product", () => {
    expect(commerceMigration).toContain("CREATE UNIQUE INDEX tenancy_one_live_subscription_per_product");
    for (const key of [
      "flowbot_basic", "flowbot_premium", "ai_chat_basic", "ai_chat_premium",
      "voice_basic_gen1", "voice_advanced_gen2",
    ]) expect(commerceMigration).toContain(key);
  });

  it("makes published plan versions, entitlement snapshots, and usage events immutable", () => {
    expect(commerceMigration).toContain("catalog_plan_version_immutable");
    expect(commerceMigration).toContain("tenancy_entitlement_snapshot_immutable");
    expect(commerceMigration).toContain("tenancy_usage_event_immutable");
  });
});

describe("P3 database migration invariants", () => {
  it("forces RLS on every shared tenant-domain table", () => {
    for (const table of [
      "contacts", "contact_identities", "leads", "lead_status_history", "sales_facts",
      "appointment_requests", "appointment_time_options", "follow_up_tasks", "conversations",
      "messages", "conversation_notes", "conversation_transitions", "handover_events",
      "knowledge_sources", "knowledge_source_revisions", "knowledge_chunks",
      "notification_profiles", "action_requests", "action_attempts", "action_results",
      "retention_policies", "privacy_jobs", "privacy_lineage", "support_access_grants",
    ]) {
      expect(sharedDomainMigration).toContain(`'${table}'`);
    }
    expect(sharedDomainMigration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sharedDomainMigration).toContain("FORCE ROW LEVEL SECURITY");
    expect(privacySupportMigration).toContain("ALTER TABLE tenancy.privacy_artifacts FORCE ROW LEVEL SECURITY");
  });

  it("keeps messages and audit histories immutable outside the narrow erasure function", () => {
    for (const trigger of [
      "tenancy_message_immutable", "tenancy_lead_history_immutable",
      "tenancy_conversation_transition_immutable", "tenancy_handover_event_immutable",
      "tenancy_knowledge_revision_immutable", "tenancy_action_result_immutable",
      "tenancy_privacy_lineage_immutable",
    ]) expect(sharedDomainMigration).toContain(trigger);
    expect(privacySupportMigration).toContain("session_user = 'djay_worker'");
    expect(privacySupportMigration).toContain("app.privacy_erasure_job_id");
    expect(privacySupportMigration).not.toMatch(/GRANT UPDATE ON tenancy\.messages/i);
  });

  it("removes global worker policies and requires explicit tenant context", () => {
    expect(privacySupportMigration).toContain("DROP POLICY worker_privacy_job_access");
    expect(privacySupportMigration).toContain("tenant_id = tenancy.current_tenant_id()");
    expect(privacySupportMigration).not.toMatch(/CREATE POLICY worker_[^;]+USING \(true\)/s);
  });

  it("uses encrypted expiring export artifacts and a restricted claim function", () => {
    expect(privacySupportMigration).toContain("payload_ciphertext text NOT NULL");
    expect(privacySupportMigration).toContain("plaintext_sha256 bytea NOT NULL");
    expect(privacySupportMigration).toContain("SECURITY DEFINER SET search_path = pg_catalog, tenancy");
    expect(privacySupportMigration).toContain("REVOKE ALL ON FUNCTION tenancy.claim_privacy_job() FROM PUBLIC");
  });

  it("requires a separate support approver and caps access at four hours", () => {
    expect(sharedDomainMigration).toContain("requested_by_platform_user_id <> approved_by_platform_user_id");
    expect(sharedDomainMigration).toContain("expires_at <= starts_at + interval '4 hours'");
    expect(privacySupportMigration).toContain("status = 'requested' AND approved_by_platform_user_id IS NULL");
  });
});

describe("P4 FlowBot database migration invariants", () => {
  it("forces tenant isolation across every FlowBot authoring and runtime table", () => {
    for (const table of [
      "flow_bots", "flow_versions", "flow_drafts", "flow_deployments", "flow_executions",
      "flow_processed_inputs", "flow_events", "flow_timers", "flow_integration_profiles",
      "flow_integration_dispatches", "flow_install_checks", "flow_legacy_mappings",
      "flow_migration_quarantine",
    ]) expect(flowbotMigration).toContain(`'${table}'`);
    expect(flowbotMigration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(flowbotMigration).toContain("FORCE ROW LEVEL SECURITY");
  });

  it("stores only hashed deployment and session credentials", () => {
    expect(flowbotMigration).toContain("deployment_key_hash bytea NOT NULL UNIQUE");
    expect(flowbotRuntimeMigration).toContain("session_token_hash bytea NOT NULL UNIQUE");
    expect(flowbotMigration).not.toMatch(/deployment_key text/i);
    expect(flowbotRuntimeMigration).not.toMatch(/session_token text/i);
  });

  it("keeps versions, processed inputs, events, and legacy mappings immutable", () => {
    for (const trigger of [
      "tenancy_flow_version_immutable", "tenancy_flow_processed_input_immutable",
      "tenancy_flow_event_immutable", "tenancy_flow_legacy_mapping_immutable",
    ]) expect(flowbotMigration).toContain(trigger);
  });

  it("gives the public runtime no table grants and only fixed-path restricted functions", () => {
    expect(flowbotRuntimeMigration).toMatch(/CREATE ROLE djay_flowbot_runtime[^;]+NOBYPASSRLS/);
    expect(flowbotRuntimeMigration).not.toMatch(/GRANT (SELECT|INSERT|UPDATE|DELETE)[^;]+djay_flowbot_runtime/i);
    expect(flowbotRuntimeMigration).toContain("SECURITY DEFINER");
    expect(flowbotRuntimeMigration).toContain("SET search_path = pg_catalog, tenancy, catalog");
    expect(flowbotRuntimeMigration).toContain("REVOKE ALL ON FUNCTION tenancy.start_flowbot_execution");
    expect(flowbotRuntimeMigration).toContain("GRANT EXECUTE ON FUNCTION tenancy.commit_flowbot_step");
  });

  it("requires an exact registered web origin and a non-AI entitlement snapshot", () => {
    expect(flowbotRuntimeMigration).toContain("request_origin = ANY(allowed_origins)");
    expect(flowbotRuntimeMigration).toContain("'ai.enabled' = 'false'");
    expect(flowbotRuntimeMigration).not.toMatch(/openai|anthropic|gemini|gpt-|claude-/i);
  });

  it("binds transcript synchronization to every public runtime credential", () => {
    expect(flowbotSyncMigration).toContain("execution.session_token_hash = target_session_hash");
    expect(flowbotSyncMigration).toContain("deployment.deployment_key_hash = target_key_hash");
    expect(flowbotSyncMigration).toContain("flowbot_origin_allowed(deployment.allowed_origins, request_origin)");
    expect(flowbotSyncMigration).toContain("REVOKE ALL ON FUNCTION tenancy.sync_flowbot_execution");
    expect(flowbotSyncMigration).toContain("TO djay_flowbot_runtime");
  });

  it("forces RLS on operational schedules and routing data", () => {
    for (const table of ["flow_business_schedules", "flow_routing_teams", "flow_routing_team_members"]) {
      expect(flowbotOperationsMigration).toContain(`'${table}'`);
    }
    expect(flowbotOperationsMigration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(flowbotOperationsMigration).toContain("FORCE ROW LEVEL SECURITY");
  });

  it("keeps legacy migration controls outside every tenant runtime realm", () => {
    expect(flowbotReleaseMigration).toContain("CREATE SCHEMA IF NOT EXISTS migration");
    expect(flowbotReleaseMigration).toContain("REVOKE ALL ON SCHEMA migration FROM PUBLIC");
    expect(flowbotReleaseMigration).toContain("REVOKE SELECT, INSERT ON tenancy.flow_legacy_mappings FROM djay_runtime");
    expect(flowbotReleaseMigration).toContain("REVOKE SELECT, INSERT, UPDATE ON tenancy.flow_migration_quarantine FROM djay_runtime");
  });

  it("queues lead notifications atomically and exposes claims only to a fixed worker context", () => {
    expect(flowbotNotificationMigration).toContain("AFTER INSERT ON tenancy.leads");
    expect(flowbotNotificationMigration).toContain("'flowbot.lead_captured'");
    expect(flowbotNotificationMigration).toMatch(/claim_flowbot_notification[\s\S]+SECURITY DEFINER[\s\S]+SET search_path = pg_catalog, tenancy/);
    expect(flowbotNotificationMigration).toContain("session_user <> 'djay_worker'");
    expect(flowbotNotificationMigration).toContain("'flowbot_notification_worker'");
    expect(flowbotNotificationMigration).toContain("REVOKE ALL ON FUNCTION tenancy.claim_flowbot_notification");
    expect(flowbotNotificationMigration).not.toMatch(/GRANT (SELECT|INSERT|UPDATE|DELETE)[^;]+notification_profiles[^;]+djay_worker/i);
  });
});

describe("P7 Voice Basic database migration invariants", () => {
  it("forces tenant isolation and stores only opaque deployment and grant digests", () => {
    for (const table of [
      "voice_deployments", "voice_sessions", "voice_session_connections", "voice_concurrency_leases",
    ]) expect(voiceBasicAuthorityMigration).toContain(`'${table}'`);
    expect(voiceBasicAuthorityMigration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(voiceBasicAuthorityMigration).toContain("FORCE ROW LEVEL SECURITY");
    expect(voiceBasicAuthorityMigration).toContain("deployment_key_hash bytea NOT NULL UNIQUE");
    expect(voiceBasicAuthorityMigration).toContain("grant_hash bytea NOT NULL UNIQUE");
    expect(voiceBasicAuthorityMigration).not.toMatch(/deployment_key text|session_grant text/i);
  });

  it("gives the voice runtime function-only authority and requires its service identity", () => {
    expect(voiceBasicAuthorityMigration).toMatch(/CREATE ROLE djay_voice_runtime[^;]+NOBYPASSRLS/);
    expect(voiceBasicAuthorityMigration).not.toMatch(/GRANT (SELECT|INSERT|UPDATE|DELETE)[^;]+djay_voice_runtime/i);
    expect(voiceBasicAuthorityMigration).toContain("session_user <> 'djay_voice_runtime'");
    expect(voiceBasicAuthorityMigration).toContain("SECURITY DEFINER");
    expect(voiceBasicAuthorityMigration).toContain("SET search_path = pg_catalog, tenancy, catalog");
  });

  it("issues only Gen1 and reserves concurrency and maximum minutes before authorization", () => {
    expect(voiceBasicAuthorityMigration).toContain("plan.plan_key = 'voice_basic_gen1'");
    expect(voiceBasicAuthorityMigration).toContain("'voice_gen1'");
    expect(voiceBasicAuthorityMigration).toContain("voice_concurrency_unconfigured");
    expect(voiceBasicAuthorityMigration).toContain("pg_advisory_xact_lock");
    expect(voiceBasicAuthorityMigration).toContain("reserve_minutes := ceil(runtime.max_call_seconds::numeric / 60)");
    expect(voiceBasicAuthorityMigration).toContain("voice_safety_cap");
  });

  it("settles minutes once and releases concurrency on every terminal commit", () => {
    expect(voiceBasicAuthorityMigration).toContain("voice:session:' || runtime.id::text || ':terminal");
    expect(voiceBasicAuthorityMigration).toContain("released_at = COALESCE(released_at, now())");
    expect(voiceBasicAuthorityMigration).toContain("IF runtime.status IN ('ended', 'failed', 'expired')");
    expect(voiceBasicAuthorityMigration).not.toMatch(/openai|anthropic|gemini|gpt-|claude-/i);
  });

  it("keeps runtime control private and audited with a safe paused default", () => {
    expect(voiceRecoveryMigration).toContain("VALUES (true, 'paused', 'activation_required')");
    expect(voiceRecoveryMigration).toContain("voice.runtime_control_changed");
    expect(voiceRecoveryMigration).toContain("platform_owner', 'platform_ai_operations");
    expect(voiceRecoveryMigration).toContain("REVOKE ALL ON platform.voice_runtime_controls FROM PUBLIC");
    expect(voiceRecoveryMigration).not.toMatch(/GRANT (SELECT|INSERT|UPDATE|DELETE)[^;]+voice_runtime_controls/i);
  });

  it("keeps Advanced Voice routing Gen2-only, platform-private, and paused by default", () => {
    expect(voiceAdvancedRoutingMigration).toContain("CHECK (capability_profile = 'voice_gen2')");
    expect(voiceAdvancedRoutingMigration).toContain("VALUES ('voice_gen2', 'paused', 'qualification_required')");
    expect(voiceAdvancedRoutingMigration).toContain("platform_owner', 'platform_ai_operations");
    expect(voiceAdvancedRoutingMigration).toContain("REVOKE ALL ON platform.voice_route_candidates");
    expect(voiceAdvancedRoutingMigration).toContain("REVOKE ALL ON FUNCTION platform.get_voice_routing_overview() FROM PUBLIC");
    expect(voiceAdvancedRoutingMigration).toContain("platform_owner', 'platform_ai_operations', 'platform_finance");
    expect(voiceAdvancedRoutingMigration).toContain("REVOKE ALL ON FUNCTION platform.get_voice_incidents() FROM PUBLIC");
    expect(voiceAdvancedRoutingMigration).not.toMatch(
      /GRANT (SELECT|INSERT|UPDATE|DELETE)[^;]+voice_(route_candidates|routing_changes|active_routes|profile_controls|incidents|session_routes)/i,
    );
  });

  it("requires independent qualification and change approval with reviewed canary rollback", () => {
    expect(voiceAdvancedRoutingMigration).toContain("reviewed_by_platform_user_id <> proposed_by_platform_user_id");
    expect(voiceAdvancedRoutingMigration).toContain("approved_by_platform_user_id <> requested_by_platform_user_id");
    expect(voiceAdvancedRoutingMigration).toContain("octet_length(qualification_evidence_sha256) = 32");
    expect(voiceAdvancedRoutingMigration).toContain("octet_length(evaluation_evidence_sha256) = 32");
    expect(voiceAdvancedRoutingMigration).toContain("pg_advisory_xact_lock");
    expect(voiceAdvancedRoutingMigration).toContain("target_action NOT IN ('start_canary', 'promote', 'rollback')");
    expect(voiceAdvancedRoutingMigration).toContain("change_record.status <> 'canary'");
    expect(voiceAdvancedRoutingMigration).toContain("voice_routing_change_stale");
  });

  it("binds every Voice deployment and session to one generation without tenant routing disclosure", () => {
    expect(voiceAdvancedDeploymentMigration).toContain("ADD COLUMN capability_profile text NOT NULL DEFAULT 'voice_gen1'");
    expect(voiceAdvancedDeploymentMigration).toContain("FOREIGN KEY (tenant_id, deployment_id, capability_profile)");
    expect(voiceAdvancedDeploymentMigration).toContain("REFERENCES tenancy.voice_deployments(tenant_id, id, capability_profile)");
    expect(voiceAdvancedDeploymentMigration).toContain("CREATE OR REPLACE FUNCTION tenancy.voice_profile_available");
    expect(voiceAdvancedDeploymentMigration).toContain("session_user <> 'djay_runtime'");
    expect(voiceAdvancedDeploymentMigration).toContain("candidate.status = 'qualified'");
    expect(voiceAdvancedDeploymentMigration).toContain("control.mode = 'running'");
    expect(voiceAdvancedDeploymentMigration).toContain("ADD COLUMN admission_enabled boolean NOT NULL DEFAULT false");
    expect(voiceAdvancedDeploymentMigration).toContain("control.admission_enabled = true");
    expect(voiceAdvancedDeploymentMigration).not.toMatch(/RETURNS[^;]+provider|RETURNS[^;]+model/i);
  });

  it("admits Advanced Voice only through reviewed routing and an immutable restricted assignment", () => {
    expect(voiceAdvancedRuntimeMigration).toContain("CREATE TABLE platform.voice_admission_changes");
    expect(voiceAdvancedRuntimeMigration).toContain("approved_by_platform_user_id <> requested_by_platform_user_id");
    expect(voiceAdvancedRuntimeMigration).toContain("CREATE TRIGGER platform_voice_profile_fail_closed_admission");
    expect(voiceAdvancedRuntimeMigration).toContain("candidate.status = 'qualified'");
    expect(voiceAdvancedRuntimeMigration).toContain("control.admission_enabled = true");
    expect(voiceAdvancedRuntimeMigration).toContain("INSERT INTO operations.voice_session_routes");
    expect(voiceAdvancedRuntimeMigration).toContain("latest ON latest.id = snapshot.id");
    expect(voiceAdvancedRuntimeMigration).toContain("deployment.capability_profile = session.capability_profile");
    expect(voiceAdvancedRuntimeMigration).toContain("CREATE OR REPLACE FUNCTION tenancy.heartbeat_voice_session");
    expect(voiceAdvancedRuntimeMigration).toContain("REVOKE ALL ON FUNCTION tenancy.authorize_voice_session");
    expect(voiceAdvancedRuntimeMigration).not.toMatch(/GRANT (SELECT|INSERT|UPDATE|DELETE)[^;]+voice_(admission_changes|session_routes)/i);
  });

  it("indexes only tenant-owned operational facts needed by bounded Voice analytics", () => {
    for (const index of [
      "tenancy_voice_sessions_analytics",
      "tenancy_voice_turns_analytics",
      "tenancy_voice_connections_analytics",
      "tenancy_voice_outcomes_analytics",
      "tenancy_voice_callbacks_analytics",
      "tenancy_appointment_requests_conversation_analytics",
    ]) expect(voiceAnalyticsMigration).toContain(`CREATE INDEX ${index}`);
    expect(voiceAnalyticsMigration).not.toMatch(/provider|model|route|cost|price|margin/i);
  });

  it("settles from connection history and reaps grants, stale transports, and emergency stops", () => {
    expect(voiceRecoveryMigration).toContain("settled_elapsed_seconds");
    expect(voiceRecoveryMigration).toContain("heartbeat_voice_basic_session");
    expect(voiceRecoveryMigration).toContain("reap_voice_basic_sessions");
    expect(voiceRecoveryMigration).toContain("FOR UPDATE OF session SKIP LOCKED");
    expect(voiceRecoveryMigration).toContain("current_setting('app.service', true) IS DISTINCT FROM 'voice_reaper_worker'");
    expect(voiceRecoveryMigration).toContain("GRANT EXECUTE ON FUNCTION tenancy.reap_voice_basic_sessions");
    expect(voiceRecoveryMigration).not.toMatch(/openai|anthropic|gemini|gpt-|claude-/i);
  });

  it("pins an immutable Sales Core playbook and isolates durable Voice turns", () => {
    expect(voiceSalesCoreMigration).toContain("playbook_version_id uuid");
    expect(voiceSalesCoreMigration).toContain("tenancy_voice_session_playbook_fk");
    expect(voiceSalesCoreMigration).toContain("ALTER TABLE tenancy.voice_turns ENABLE ROW LEVEL SECURITY");
    expect(voiceSalesCoreMigration).toContain("ALTER TABLE tenancy.voice_turns FORCE ROW LEVEL SECURITY");
    expect(voiceSalesCoreMigration).toContain("REVOKE ALL ON tenancy.voice_turns, operations.voice_native_usage FROM PUBLIC");
    expect(voiceSalesCoreMigration).not.toMatch(/GRANT (SELECT|INSERT|UPDATE|DELETE)[^;]+djay_voice_runtime/i);
  });

  it("commits only entitled allow-listed actions through the Voice runtime authority", () => {
    expect(voiceSalesCoreMigration).toContain("CREATE OR REPLACE FUNCTION tenancy.begin_voice_turn");
    expect(voiceSalesCoreMigration).toContain("CREATE OR REPLACE FUNCTION tenancy.commit_voice_turn");
    expect(voiceSalesCoreMigration).toContain("session_user <> 'djay_voice_runtime'");
    expect(voiceSalesCoreMigration).toContain("voice_action_not_allowed");
    expect(voiceSalesCoreMigration).toContain("voice_action_not_entitled");
    expect(voiceSalesCoreMigration).toContain("operations.voice_native_usage");
    expect(voiceSalesCoreMigration).not.toMatch(/openai|anthropic|gemini|gpt-|claude-/i);
  });

  it("persists tenant-isolated call outcomes and callbacks without exposing the core commit function", () => {
    expect(voiceOutcomesRetentionMigration).toContain("CREATE TABLE tenancy.voice_call_outcomes");
    expect(voiceOutcomesRetentionMigration).toContain("CREATE TABLE tenancy.voice_callback_requests");
    expect(voiceOutcomesRetentionMigration).toContain("ALTER TABLE tenancy.voice_call_outcomes FORCE ROW LEVEL SECURITY");
    expect(voiceOutcomesRetentionMigration).toContain("ALTER TABLE tenancy.voice_callback_requests FORCE ROW LEVEL SECURITY");
    expect(voiceOutcomesRetentionMigration).toContain("REVOKE ALL ON FUNCTION tenancy.commit_voice_turn_core");
    expect(voiceOutcomesRetentionMigration).toContain("'terminalReason', 'callback_requested'");
  });

  it("restricts transcript retention enforcement to the privacy worker service identity", () => {
    expect(voiceOutcomesRetentionMigration).toContain("CREATE OR REPLACE FUNCTION tenancy.apply_retention_policies");
    expect(voiceOutcomesRetentionMigration).toContain("session_user <> 'djay_worker'");
    expect(voiceOutcomesRetentionMigration).toContain("current_setting('app.service', true) IS DISTINCT FROM 'retention_worker'");
    expect(voiceOutcomesRetentionMigration).toContain("retained_tombstone");
    expect(voiceOutcomesRetentionMigration).toContain("GRANT EXECUTE ON FUNCTION tenancy.apply_retention_policies");
  });

  it("isolates imported history and gives the migration role only scoped tenant authority", () => {
    expect(voiceTextLegacyMigration).toContain("CREATE TABLE tenancy.legacy_conversation_imports");
    expect(voiceTextLegacyMigration).toContain("ALTER TABLE tenancy.legacy_conversation_imports ENABLE ROW LEVEL SECURITY");
    expect(voiceTextLegacyMigration).toContain("ALTER TABLE tenancy.legacy_conversation_imports FORCE ROW LEVEL SECURITY");
    expect(voiceTextLegacyMigration).toContain("tenant_id = tenancy.current_tenant_id()");
    expect(voiceTextLegacyMigration).toContain("GRANT EXECUTE ON FUNCTION tenancy.current_tenant_id() TO djay_migrator");
    expect(voiceTextLegacyMigration).not.toMatch(/GRANT (SELECT|INSERT|UPDATE|DELETE) ON ALL TABLES IN SCHEMA tenancy TO djay_migrator/i);
  });

  it("records safe legacy facts without fabricating Voice session or usage evidence", () => {
    expect(voiceTextLegacyMigration).toContain("source_kind text NOT NULL CHECK");
    expect(voiceTextLegacyMigration).toContain("source_checksum bytea NOT NULL");
    expect(voiceTextLegacyMigration).toContain("migration_reject_idempotency");
    expect(voiceTextLegacyMigration).not.toMatch(/voice_sessions|usage_events|native_usage/i);
    expect(voiceTextLegacyMigration).not.toMatch(/openai|anthropic|gemini|gpt-|claude-/i);
  });
});
