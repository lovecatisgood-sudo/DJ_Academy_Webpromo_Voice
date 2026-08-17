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
const releaseReadinessMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0038_release_readiness.sql"), "utf8");
const resilienceDrillsMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0039_resilience_drills.sql"), "utf8");
const deadLetterRecoveryMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0040_dead_letter_recovery.sql"), "utf8");
const dependencyOutageMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0041_dependency_outage_attestation.sql"), "utf8");
const privacyJobScopeMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0042_privacy_job_scope.sql"), "utf8");
const marketReleaseCatalogMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0043_market_release_catalog.sql"), "utf8");
const tenantRolesSecurityMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0044_tenant_roles_security_policy.sql"), "utf8");
const resourceBoundariesMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0045_entitlement_resource_boundaries.sql"), "utf8");
const scheduledChangesMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0046_scheduled_entitlement_changes.sql"), "utf8");
const usageFundingMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0047_usage_funding_forecasts_alerts.sql"), "utf8");
const usageFundingAuthorityMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0048_usage_funding_authority.sql"), "utf8");
const usagePeriodRolloverMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0049_usage_period_rollover.sql"), "utf8");
const runtimeUsageFundingMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0050_runtime_usage_funding_bridge.sql"), "utf8");
const usageAlertDeliveryMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0051_usage_alert_delivery_anomalies.sql"), "utf8");
const providerUsageReconciliationMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0052_provider_usage_reconciliation.sql"), "utf8");
const stripeBillingFoundationMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0053_stripe_billing_foundation.sql"), "utf8");
const tenantFinancialDocumentsMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0056_tenant_financial_documents.sql"), "utf8");
const stripeFinancialReconciliationMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0057_stripe_financial_reconciliation.sql"), "utf8");
const accountingSyncOutboxMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0058_accounting_sync_outbox.sql"), "utf8");
const accountingReconciliationMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0059_accounting_daily_reconciliation.sql"), "utf8");
const stripeFinancialEventReconciliationMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0060_stripe_financial_event_reconciliation.sql"), "utf8");
const subscriptionLifecycleControlsMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0061_subscription_lifecycle_controls.sql"), "utf8");
const stripeWebhookRecoveryMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0062_stripe_webhook_recovery.sql"), "utf8");
const customerBillingNotificationsMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0063_customer_billing_notifications.sql"), "utf8");
const flowbotRichMessageSyncMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0064_flowbot_rich_message_sync.sql"), "utf8");
const customerTagsAttributesMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0065_customer_tags_attributes.sql"), "utf8");
const flowbotConnectorKindsMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0066_flowbot_connector_kinds.sql"), "utf8");
const flowbotSocialTransportMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0067_flowbot_social_transport.sql"), "utf8");
const flowbotSocialWorkersMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0068_flowbot_social_workers.sql"), "utf8");
const flowbotSocialDeliveryMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0069_flowbot_social_delivery.sql"), "utf8");
const flowbotSocialFundingMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0070_flowbot_social_usage_funding.sql"), "utf8");
const purchaseIntentsMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0079_purchase_intents.sql"), "utf8");
const customerSupportCenterMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0088_customer_support_center.sql"), "utf8");
const goalFirstOnboardingMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0089_goal_first_onboarding.sql"), "utf8");
const supportClosureFeedbackMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0090_support_closure_feedback.sql"), "utf8");
const appointmentStatusTimelineMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0091_appointment_status_timeline.sql"), "utf8");
const supportAttachmentScanningMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0092_support_attachment_scanning.sql"), "utf8");
const supportServiceNotificationsMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0093_support_service_notifications.sql"), "utf8");
const botRegressionEvidenceMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0094_bot_regression_evidence.sql"), "utf8");
const customerJourneyValueMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0095_customer_journey_value_callbacks.sql"), "utf8");
const tenantNotificationCenterMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0096_tenant_notification_center.sql"), "utf8");
const platformTenant360Migration = readFileSync(resolve(import.meta.dirname, "../migrations/0097_platform_tenant_360.sql"), "utf8");
const tenantIncidentOperationsMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0098_tenant_incident_operations.sql"), "utf8");
const notificationSourceCoverageMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0099_notification_source_coverage.sql"), "utf8");
const appointmentCalendarReconciliationMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0100_appointment_calendar_reconciliation.sql"), "utf8");
const appointmentRecoveryMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0101_appointment_recovery_and_repeat_reschedule.sql"), "utf8");
const anonymousBuilderDraftMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0107_anonymous_builder_drafts.sql"), "utf8");
const anonymousBuilderImportMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0108_anonymous_builder_import_jobs.sql"), "utf8");
const anonymousBuilderClaimMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0109_anonymous_builder_draft_claim.sql"), "utf8");
const existingAccountBuilderClaimMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0110_existing_account_builder_claim.sql"), "utf8");
const versionedMerchantOnboardingMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0111_versioned_merchant_onboarding.sql"), "utf8");
const purchaseIntentKindMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0112_purchase_intent_kind.sql"), "utf8");
const flowTrialActivationMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0113_flow_starter_trial_activation.sql"), "utf8");
const textTrialSetupMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0114_text_starter_trial_setup.sql"), "utf8");
const trialLifecycleMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0115_trial_warning_and_terminal_states.sql"), "utf8");
const flowDeploymentTrafficMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0116_flow_deployment_traffic_state.sql"), "utf8");
const aiTextDeploymentTrafficMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0117_ai_text_deployment_traffic_state.sql"), "utf8");
const voiceDeploymentTrafficMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0118_voice_deployment_traffic_state.sql"), "utf8");
const flowDeploymentLiveVersionMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0119_flow_deployment_live_version.sql"), "utf8");
const aiTextDeploymentLiveVersionMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0120_ai_text_deployment_live_version.sql"), "utf8");
const voiceDeploymentLiveVersionMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0121_voice_deployment_live_version.sql"), "utf8");
const builderFlowMaterializationMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0122_builder_flow_materialization.sql"), "utf8");
const predeploymentAiConfigurationMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0123_predeployment_ai_configurations.sql"), "utf8");
const staffReleaseBoundariesMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0124_staff_release_boundaries.sql"), "utf8");
const structuredKnowledgeCatalogueMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0125_structured_knowledge_catalogue_lifecycle.sql"), "utf8");
const knowledgeIngestionDigestMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0126_knowledge_ingestion_digest_authority.sql"), "utf8");
const governedKnowledgeCrawlingMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0127_governed_knowledge_crawling.sql"), "utf8");
const activePublishedKnowledgeMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0128_active_published_knowledge_retrieval.sql"), "utf8");
const knowledgeRefreshReviewMigration = readFileSync(resolve(import.meta.dirname, "../migrations/0129_plan_bound_knowledge_refresh_reviews.sql"), "utf8");

const tenantTables = [
  "tenants",
  "memberships",
  "tenant_onboarding",
  "membership_invitations",
  "ownership_transfers",
  "audit_logs",
  "outbox",
];

describe("Merchant experience migration invariants", () => {
  it("keeps structured catalogue versions immutable, tenant-isolated and explicitly published", () => {
    expect(structuredKnowledgeCatalogueMigration).toContain("CREATE TABLE tenancy.knowledge_catalog_item_versions");
    expect(structuredKnowledgeCatalogueMigration).toContain("knowledge catalogue item versions are immutable");
    expect(structuredKnowledgeCatalogueMigration).toContain("published_version_id uuid");
    expect(structuredKnowledgeCatalogueMigration).toContain("DEFERRABLE INITIALLY DEFERRED");
    expect(structuredKnowledgeCatalogueMigration).toContain("FORCE ROW LEVEL SECURITY");
    expect(structuredKnowledgeCatalogueMigration).toContain("tenant_id = tenancy.current_tenant_id()");
    expect(structuredKnowledgeCatalogueMigration).not.toMatch(/GRANT (UPDATE|DELETE) ON tenancy\.knowledge_catalog_item_versions/i);
    expect(knowledgeIngestionDigestMigration).toContain("public.digest(extracted_content, 'sha256')");
    expect(knowledgeIngestionDigestMigration).toContain("public.digest(chunk.content, 'sha256')");
    expect(knowledgeIngestionDigestMigration).toContain("SET search_path = pg_catalog, tenancy");
    expect(governedKnowledgeCrawlingMigration).toContain("crawl_page_limit BETWEEN 1 AND 25");
    expect(governedKnowledgeCrawlingMigration).toContain("source.crawl_page_limit");
    expect(governedKnowledgeCrawlingMigration).toContain("CASE WHEN authority.premium THEN source.crawl_page_limit ELSE 1 END");
    expect(governedKnowledgeCrawlingMigration).toContain("current_snapshot.access_mode = 'active'");
    expect(governedKnowledgeCrawlingMigration).toContain("session_user <> 'djay_worker'");
    expect(governedKnowledgeCrawlingMigration).toContain("REVOKE ALL ON FUNCTION tenancy.claim_knowledge_ingestion");
    expect(governedKnowledgeCrawlingMigration).toContain("CREATE TABLE tenancy.knowledge_crawl_host_pacing");
    expect(governedKnowledgeCrawlingMigration).toContain("pg_advisory_xact_lock");
    expect(governedKnowledgeCrawlingMigration).toContain("minimum_interval_ms NOT BETWEEN 500 AND 5000");
    expect(governedKnowledgeCrawlingMigration).toContain("REVOKE ALL ON FUNCTION tenancy.reserve_knowledge_crawl_host");
    expect(activePublishedKnowledgeMigration).toContain("CREATE TRIGGER tenancy_ai_playbook_knowledge_publishable");
    expect(activePublishedKnowledgeMigration).toContain("revision.status = 'ready'");
    expect(activePublishedKnowledgeMigration).toContain("source.status = 'active'");
    expect(activePublishedKnowledgeMigration).toContain("version.status = 'published'");
    expect(activePublishedKnowledgeMigration).toContain("procedure.proname IN ('begin_ai_turn', 'begin_ai_social_turn')");
    expect(activePublishedKnowledgeMigration).toContain("active_knowledge_join_not_found");
    expect(knowledgeRefreshReviewMigration).toContain("CREATE TABLE tenancy.knowledge_review_cycles");
    expect(knowledgeRefreshReviewMigration).toContain("refresh_interval_hours = CASE WHEN authority.premium THEN NULL ELSE 168 END");
    expect(knowledgeRefreshReviewMigration).toContain("plan.plan_key = 'ai_chat_premium'");
    expect(knowledgeRefreshReviewMigration).toContain("CREATE OR REPLACE FUNCTION tenancy.enqueue_due_knowledge_reviews");
    expect(knowledgeRefreshReviewMigration).toContain("UNIQUE (tenant_id, cycle_month)");
    expect(knowledgeRefreshReviewMigration).toContain("CREATE TRIGGER tenancy_knowledge_review_evidence_immutable");
    expect(knowledgeRefreshReviewMigration).toContain("OLD.status = 'completed'");
  });
  it("keeps anonymous Builder drafts versioned, expiring, pre-tenant, and unavailable to tenant runtime", () => {
    expect(anonymousBuilderDraftMigration).toContain("CREATE TABLE builder.anonymous_sessions");
    expect(anonymousBuilderDraftMigration).toContain("CREATE TABLE builder.draft_revisions");
    expect(anonymousBuilderDraftMigration).toContain("FORCE ROW LEVEL SECURITY");
    expect(anonymousBuilderDraftMigration).toContain("expires_at > issued_at");
    expect(anonymousBuilderDraftMigration).toContain("TO djay_auth_runtime");
    expect(anonymousBuilderDraftMigration).not.toMatch(/GRANT (SELECT|INSERT|UPDATE|DELETE)[^;]+builder\.[^;]+TO djay_runtime/i);
  });

  it("keeps anonymous website imports idempotent, bounded, immutable, and unavailable to tenant runtime", () => {
    expect(anonymousBuilderImportMigration).toContain("UNIQUE (session_id, idempotency_key)");
    expect(anonymousBuilderImportMigration).toContain("generation BETWEEN 1 AND 3");
    expect(anonymousBuilderImportMigration).toContain("builder_website_import_attempts_immutable");
    expect(anonymousBuilderImportMigration).toContain("profile_sha256 bytea");
    expect(anonymousBuilderImportMigration).toContain("provenance_json jsonb");
    expect(anonymousBuilderImportMigration).not.toMatch(/GRANT (SELECT|INSERT|UPDATE|DELETE)[^;]+builder\.website_import[^;]+TO djay_runtime/i);
  });

  it("claims one exact Builder draft into one tenant under auth authority", () => {
    expect(anonymousBuilderClaimMigration).toContain("pending_registration_id uuid");
    expect(anonymousBuilderClaimMigration).toContain("CREATE TABLE tenancy.builder_draft_claims");
    expect(anonymousBuilderClaimMigration).toContain("source_session_id uuid NOT NULL UNIQUE");
    expect(anonymousBuilderClaimMigration).toContain("source_draft_id uuid NOT NULL UNIQUE");
    expect(anonymousBuilderClaimMigration).toContain("builder_draft_claims_tenant_claimed_idx");
    expect(anonymousBuilderClaimMigration).toContain("FORCE ROW LEVEL SECURITY");
    expect(anonymousBuilderClaimMigration).toContain("FOREIGN KEY (claimed_by_membership_id, tenant_id)");
  });

  it("uses a short-lived revision-pinned one-time continuation for existing-account claims", () => {
    expect(existingAccountBuilderClaimMigration).toContain("CREATE TABLE builder.claim_continuations");
    expect(existingAccountBuilderClaimMigration).toContain("token_hash bytea NOT NULL UNIQUE");
    expect(existingAccountBuilderClaimMigration).toContain("draft_revision integer NOT NULL");
    expect(existingAccountBuilderClaimMigration).toContain("status IN ('issued', 'consumed', 'superseded')");
    expect(existingAccountBuilderClaimMigration).toContain("builder_claim_continuations_one_active_session_uidx");
    expect(existingAccountBuilderClaimMigration).toContain("FORCE ROW LEVEL SECURITY");
  });

  it("binds a claimed Flow draft to at most one tenant Flow Bot", () => {
    expect(builderFlowMaterializationMigration).toContain("ADD COLUMN materialized_flow_bot_id uuid");
    expect(builderFlowMaterializationMigration).toContain("builder_draft_claims_materialized_flow_bot_fk");
    expect(builderFlowMaterializationMigration).toContain("builder_draft_claims_materialized_flow_bot_uidx");
    expect(builderFlowMaterializationMigration).toContain("product_family = 'flow'");
    expect(builderFlowMaterializationMigration).toContain("GRANT UPDATE (materialized_flow_bot_id, materialized_at)");
  });

  it("separates Text and Voice configuration identity before deployment", () => {
    expect(predeploymentAiConfigurationMigration).toContain("ADD COLUMN product_family text");
    expect(predeploymentAiConfigurationMigration).toContain("product_family IN ('text', 'voice')");
    expect(predeploymentAiConfigurationMigration).toContain("materialized_ai_agent_id uuid");
    expect(predeploymentAiConfigurationMigration).toContain("builder_draft_claims_materialized_ai_agent_fk");
    expect(predeploymentAiConfigurationMigration).toContain("builder_draft_claims_materialized_ai_agent_uidx");
    expect(predeploymentAiConfigurationMigration).toContain("GRANT UPDATE (materialized_ai_agent_id, materialized_ai_at)");
    expect(predeploymentAiConfigurationMigration).not.toMatch(/deployment_key_hash|allowed_origins|INSERT INTO tenancy\.voice_deployments/);
  });

  it("stores versioned merchant guideline acceptance with server onboarding completion", () => {
    expect(versionedMerchantOnboardingMigration).toContain("merchant_onboarding_version integer NOT NULL DEFAULT 0");
    expect(versionedMerchantOnboardingMigration).toContain("guidelines_version text");
    expect(versionedMerchantOnboardingMigration).toContain("guidelines_accepted_at timestamptz");
    expect(versionedMerchantOnboardingMigration).toContain("preferences_completed_at IS NOT NULL");
  });

  it("preserves subscribe versus trial intent and prohibits Voice or Advanced trials", () => {
    expect(purchaseIntentKindMigration).toContain("commerce_intent text NOT NULL DEFAULT 'subscribe'");
    expect(purchaseIntentKindMigration).toContain("CHECK (commerce_intent IN ('subscribe', 'trial'))");
    expect(purchaseIntentKindMigration).toContain("plan_key IN ('flowbot_basic', 'ai_chat_basic')");
    expect(purchaseIntentKindMigration).not.toMatch(/voice_basic_gen1|voice_advanced_gen2|flowbot_premium|ai_chat_premium/);
  });

  it("pins Flow Starter trials to one verified-email subject, 30 days, website and 5,000 conversations", () => {
    expect(flowTrialActivationMigration).toContain("CREATE TABLE billing.trial_grants");
    expect(flowTrialActivationMigration).toContain("trial_grants_subject_product_uidx");
    expect(flowTrialActivationMigration).toContain("expires_at = starts_at + interval '30 days'");
    expect(flowTrialActivationMigration).toContain("channel_scope = ARRAY['website']::text[]");
    expect(flowTrialActivationMigration).toContain("allowance_quantity = 5000");
    expect(flowTrialActivationMigration).toContain("eligibility_subject_kind = 'verified_email'");
    expect(flowTrialActivationMigration).toContain("current_tenant_verified_owner_email_hash");
    expect(flowTrialActivationMigration).toContain("SECURITY DEFINER");
    expect(flowTrialActivationMigration).toContain("FORCE ROW LEVEL SECURITY");
  });

  it("stores Text trial card authority without raw card data or a raw fingerprint", () => {
    expect(textTrialSetupMigration).toContain("CREATE TABLE billing.text_trial_card_setups");
    expect(textTrialSetupMigration).toContain("external_setup_intent_ref text UNIQUE");
    expect(textTrialSetupMigration).toContain("fingerprint_hash bytea");
    expect(textTrialSetupMigration).toContain("octet_length(fingerprint_hash) = 32");
    expect(textTrialSetupMigration).toContain("FORCE ROW LEVEL SECURITY");
    expect(textTrialSetupMigration).not.toMatch(/card_number|security_code|\bcvc\b|client_secret/);
  });

  it("deduplicates the 100-remaining warning and terminates exhausted or expired trials", () => {
    expect(trialLifecycleMigration).toContain("'trial_100_remaining'");
    expect(trialLifecycleMigration).toContain("OLD.settled_quantity < 400");
    expect(trialLifecycleMigration).toContain("'text-trial-100-remaining:' || trial.id::text");
    expect(trialLifecycleMigration).toContain("status = 'exhausted'");
    expect(trialLifecycleMigration).toContain("CREATE OR REPLACE FUNCTION billing.reconcile_expired_trials");
    expect(trialLifecycleMigration).toContain("status = 'expired'");
    expect(trialLifecycleMigration).toContain("'merchantAction', 'view_paid_plans'");
    expect(trialLifecycleMigration).toContain("session_user <> 'djay_worker'");
  });

  it("keeps Flow installation verification separate from explicit live traffic authority", () => {
    expect(flowDeploymentTrafficMigration).toContain("traffic_status text NOT NULL DEFAULT 'inactive'");
    expect(flowDeploymentTrafficMigration).toContain("deployment.traffic_status = 'live'");
    expect(flowDeploymentTrafficMigration).toContain("CREATE OR REPLACE FUNCTION tenancy.resolve_flowbot_deployment");
    expect(flowDeploymentTrafficMigration).toContain("CREATE OR REPLACE FUNCTION tenancy.flowbot_runtime_resource_active");
    expect(flowDeploymentTrafficMigration).toContain("CREATE OR REPLACE FUNCTION tenancy.flowbot_runtime_config");
    expect(flowDeploymentTrafficMigration).not.toContain("CREATE OR REPLACE FUNCTION tenancy.report_flowbot_install");
  });

  it("keeps AI Text installation verification separate from explicit live traffic authority", () => {
    expect(aiTextDeploymentTrafficMigration).toContain("traffic_status text NOT NULL DEFAULT 'inactive'");
    expect(aiTextDeploymentTrafficMigration).toContain("CREATE TABLE tenancy.ai_install_checks");
    expect(aiTextDeploymentTrafficMigration).toContain("CREATE OR REPLACE FUNCTION tenancy.report_ai_chat_install");
    expect(aiTextDeploymentTrafficMigration).toContain("deployment.traffic_status = 'live'");
    expect(aiTextDeploymentTrafficMigration).toContain("CREATE OR REPLACE FUNCTION tenancy.ai_runtime_resource_active");
    expect(aiTextDeploymentTrafficMigration).toContain("CREATE OR REPLACE FUNCTION tenancy.ai_runtime_config");
    expect(aiTextDeploymentTrafficMigration).toContain("session_user <> 'djay_ai_runtime'");
  });

  it("keeps Voice installation verification separate from explicit live traffic authority", () => {
    expect(voiceDeploymentTrafficMigration).toContain("traffic_status text NOT NULL DEFAULT 'inactive'");
    expect(voiceDeploymentTrafficMigration).toContain("CREATE TABLE tenancy.voice_install_checks");
    expect(voiceDeploymentTrafficMigration).toContain("CREATE OR REPLACE FUNCTION tenancy.report_voice_install");
    expect(voiceDeploymentTrafficMigration).toContain("deployment.traffic_status = 'live'");
    expect(voiceDeploymentTrafficMigration).toContain("CREATE OR REPLACE FUNCTION tenancy.voice_runtime_resource_active");
    expect(voiceDeploymentTrafficMigration).toContain("CREATE OR REPLACE FUNCTION tenancy.voice_runtime_config");
    expect(voiceDeploymentTrafficMigration).toContain("CREATE OR REPLACE FUNCTION tenancy.issue_voice_session_grant");
    expect(voiceDeploymentTrafficMigration).toContain("session_user <> 'djay_voice_runtime'");
  });

  it("pins Flow live traffic to an immutable published version", () => {
    expect(flowDeploymentLiveVersionMigration).toContain("ADD COLUMN live_version_id uuid");
    expect(flowDeploymentLiveVersionMigration).toContain("tenancy_flow_deployment_live_version_fk");
    expect(flowDeploymentLiveVersionMigration).toContain("traffic_status <> 'live' OR live_version_id IS NOT NULL");
    expect(flowDeploymentLiveVersionMigration).toContain("version.id = deployment.live_version_id");
    expect(flowDeploymentLiveVersionMigration).not.toContain("version.id = bot.current_published_version_id");
  });

  it("pins AI Text live traffic to an immutable published playbook", () => {
    expect(aiTextDeploymentLiveVersionMigration).toContain("ADD COLUMN live_playbook_version_id uuid");
    expect(aiTextDeploymentLiveVersionMigration).toContain("tenancy_ai_deployment_live_playbook_fk");
    expect(aiTextDeploymentLiveVersionMigration).toContain("live_playbook_version_id IS NOT NULL");
    expect(aiTextDeploymentLiveVersionMigration).toContain("playbook.id = deployment.live_playbook_version_id");
    expect(aiTextDeploymentLiveVersionMigration).toContain("CREATE OR REPLACE FUNCTION tenancy.start_ai_session");
    expect(aiTextDeploymentLiveVersionMigration).not.toContain("playbook.id = agent.current_published_playbook_version_id");
  });

  it("pins Voice live traffic to an immutable published playbook", () => {
    expect(voiceDeploymentLiveVersionMigration).toContain("ADD COLUMN live_playbook_version_id uuid");
    expect(voiceDeploymentLiveVersionMigration).toContain("tenancy_voice_deployment_live_playbook_fk");
    expect(voiceDeploymentLiveVersionMigration).toContain("traffic_status <> 'live' OR live_playbook_version_id IS NOT NULL");
    expect(voiceDeploymentLiveVersionMigration).toContain("playbook.id = deployment.live_playbook_version_id");
    expect(voiceDeploymentLiveVersionMigration).toContain("resolved.live_playbook_version_id");
    expect(voiceDeploymentLiveVersionMigration.match(/agent\.current_published_playbook_version_id/g)).toHaveLength(1);
  });

  it("keeps appointment recovery independently reviewed, bounded, optimistic, and replay-safe", () => {
    expect(appointmentRecoveryMigration).toContain("request_appointment_dead_letter_replay");
    expect(appointmentRecoveryMigration).toContain("review_dead_letter_replay_v2");
    expect(appointmentRecoveryMigration).toContain("requested_by_platform_user_id = actor_id");
    expect(appointmentRecoveryMigration).toContain("expected_recovery_generation");
    expect(appointmentRecoveryMigration).toContain("recovery_generation < 3");
    expect(appointmentRecoveryMigration).toContain("recovery_generation = recovery_generation + 1");
    expect(appointmentRecoveryMigration).toContain("depends_on_job_id");
    expect(appointmentRecoveryMigration).toContain("dependency.status = 'confirmed'");
    expect(appointmentRecoveryMigration).toContain("UNIQUE (tenant_id, scheduling_job_id, recovery_generation, attempt_number)");
    expect(appointmentRecoveryMigration).toContain("enqueue_repeated_appointment_reschedule");
    expect(appointmentRecoveryMigration).toContain("'rescheduled', 'rescheduled'");
    expect(appointmentRecoveryMigration).toContain("REVOKE ALL ON FUNCTION platform.review_dead_letter_replay_v2(uuid,text) FROM PUBLIC");
  });

  it("keeps Tenant 360 behind a narrow role-checked, audited function without secret fields", () => {
    expect(platformTenant360Migration).toContain("SECURITY DEFINER");
    expect(platformTenant360Migration).toContain("session_user <> 'djay_platform'");
    expect(platformTenant360Migration).toContain("actor_role NOT IN ('platform_owner', 'platform_support', 'platform_finance')");
    expect(platformTenant360Migration).toContain("'tenant_360.viewed'");
    expect(platformTenant360Migration).toContain("REVOKE ALL ON FUNCTION platform.get_tenant_360(uuid) FROM PUBLIC");
    for (const secretField of ["deployment_key_hash", "password_hash", "resolved_json", "scope_json", "metadata"]) {
      expect(platformTenant360Migration).not.toContain(`'${secretField}'`);
    }
  });

  it("keeps tenant incidents role-scoped, tenant-linked, bounded, audited, and append-only", () => {
    expect(tenantIncidentOperationsMigration).toContain("tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id)");
    expect(tenantIncidentOperationsMigration).toContain("platform_tenant_incident_history_immutable");
    expect(tenantIncidentOperationsMigration).toContain("session_user <> 'djay_platform'");
    expect(tenantIncidentOperationsMigration).toContain("actor_role NOT IN ('platform_owner','platform_support','platform_ai_operations')");
    expect(tenantIncidentOperationsMigration).toContain("LIMIT 500");
    expect(tenantIncidentOperationsMigration).toContain("'tenant_incident.opened'");
    expect(tenantIncidentOperationsMigration).toContain("'tenant_incident.transitioned'");
    expect(tenantIncidentOperationsMigration).toContain("tenant_incident_transition_not_allowed");
    expect(tenantIncidentOperationsMigration).toContain("platform_tenant_incidents_idempotency_idx");
    expect(tenantIncidentOperationsMigration).toContain("pg_advisory_xact_lock");
    expect(tenantIncidentOperationsMigration).toContain("tenant_incident_idempotency_conflict");
    expect(tenantIncidentOperationsMigration).toContain("platform.assign_tenant_incident");
    expect(tenantIncidentOperationsMigration).toContain("'tenant_incident.assigned'");
    expect(tenantIncidentOperationsMigration).toContain("REVOKE ALL ON platform.tenant_incidents, platform.tenant_incident_history FROM PUBLIC");
    expect(tenantIncidentOperationsMigration).not.toMatch(/GRANT (SELECT|INSERT|UPDATE|DELETE)[^;]+tenant_incident/i);
  });

  it("keeps support records tenant-scoped, message-author bound, immutable, and forced through RLS", () => {
    for (const table of ["support_tickets", "support_ticket_messages"]) {
      expect(customerSupportCenterMigration).toContain(`ALTER TABLE tenancy.${table} FORCE ROW LEVEL SECURITY`);
      expect(customerSupportCenterMigration).toContain(`REVOKE ALL ON tenancy.support_tickets, tenancy.support_ticket_messages FROM PUBLIC`);
    }
    expect(customerSupportCenterMigration).toContain("FOREIGN KEY (tenant_id, created_by_membership_id)");
    expect(customerSupportCenterMigration).toContain("FOREIGN KEY (tenant_id, author_membership_id)");
    expect(customerSupportCenterMigration).toContain("tenancy_support_ticket_messages_immutable");
    expect(customerSupportCenterMigration).toContain("author_kind = 'customer'");
    expect(customerSupportCenterMigration).toContain("author_kind = 'platform'");
  });

  it("stores complete goal-first preferences against authoritative tenant onboarding", () => {
    expect(goalFirstOnboardingMigration).toContain("ALTER TABLE tenancy.tenant_onboarding");
    expect(goalFirstOnboardingMigration).toContain("tenant_onboarding_preferences_complete");
    for (const field of ["business_goal", "industry", "first_product", "launch_channel", "preferences_completed_at"]) {
      expect(goalFirstOnboardingMigration).toContain(field);
    }
    expect(goalFirstOnboardingMigration).toContain("launch_channel = 'website'");
  });

  it("keeps support closure feedback tenant-scoped, immutable, and bounded", () => {
    expect(supportClosureFeedbackMigration).toContain("FORCE ROW LEVEL SECURITY");
    expect(supportClosureFeedbackMigration).toContain("tenancy_support_ticket_feedback_immutable");
    expect(supportClosureFeedbackMigration).toContain("rating BETWEEN 1 AND 5");
    expect(supportClosureFeedbackMigration).toContain("UNIQUE (tenant_id, ticket_id)");
    expect(supportClosureFeedbackMigration).toContain("FOREIGN KEY (tenant_id, submitted_by_membership_id)");
  });

  it("captures every appointment status change in an append-only tenant timeline", () => {
    expect(appointmentStatusTimelineMigration).toContain("AFTER INSERT OR UPDATE OF status");
    expect(appointmentStatusTimelineMigration).toContain("SECURITY DEFINER");
    expect(appointmentStatusTimelineMigration).toContain("SET search_path = pg_catalog, tenancy");
    expect(appointmentStatusTimelineMigration).toContain("FORCE ROW LEVEL SECURITY");
    expect(appointmentStatusTimelineMigration).toContain("tenancy_appointment_status_history_immutable");
    expect(appointmentStatusTimelineMigration).not.toMatch(/GRANT INSERT[^;]+TO djay_runtime/i);
  });

  it("binds merchant-confirmed value to closed tenant leads and keeps callback history immutable", () => {
    expect(customerJourneyValueMigration).toContain("lead.status = 'closed_deal'");
    expect(customerJourneyValueMigration).toContain("lead.contact_id = target_contact_id");
    expect(customerJourneyValueMigration).toContain("tenancy_customer_value_events_immutable");
    expect(customerJourneyValueMigration).toContain("tenancy_voice_callback_status_history_immutable");
    expect(customerJourneyValueMigration).toContain("AFTER INSERT OR UPDATE OF status");
    expect(customerJourneyValueMigration).toContain("transition_voice_callback_request");
    expect(customerJourneyValueMigration).toContain("membership.status = 'active'");
    expect(customerJourneyValueMigration).toContain("FORCE ROW LEVEL SECURITY");
    expect(customerJourneyValueMigration).not.toMatch(/GRANT (INSERT|UPDATE|DELETE)[^;]+customer_value_events TO djay_runtime/i);
    expect(customerJourneyValueMigration).not.toMatch(/GRANT UPDATE[^;]+voice_callback_requests TO djay_runtime/i);
  });

  it("centralizes authoritative lifecycle events without mutable or arbitrary tenant writes", () => {
    for (const source of ["appointment_status_history", "voice_callback_status_history", "customer_value_events",
      "support_ticket_notifications", "customer_billing_notifications", "usage_alert_deliveries",
      "membership_invitations", "bot_regression_runs"]) expect(tenantNotificationCenterMigration).toContain(source);
    expect(tenantNotificationCenterMigration).toContain("UNIQUE (tenant_id, event_key)");
    expect(tenantNotificationCenterMigration).toContain("tenancy_tenant_notifications_immutable");
    expect(tenantNotificationCenterMigration).toContain("membership.status = 'active'");
    expect(tenantNotificationCenterMigration).toContain("FORCE ROW LEVEL SECURITY");
    expect(tenantNotificationCenterMigration).not.toMatch(/GRANT (INSERT|UPDATE|DELETE)[^;]+tenant_notifications TO djay_runtime/i);
  });

  it("extends notifications from authoritative setup, deployment, privacy, ownership, and support-access sources", () => {
    for (const source of ["tenant_onboarding", "flow_deployments", "ai_deployments", "voice_deployments",
      "privacy_jobs", "ownership_transfers", "support_access_grants"]) {
      expect(notificationSourceCoverageMigration).toContain(source);
    }
    expect(notificationSourceCoverageMigration).toContain("tenancy.queue_tenant_notification");
    expect(notificationSourceCoverageMigration).toContain("SECURITY DEFINER SET search_path = pg_catalog, tenancy");
    expect(notificationSourceCoverageMigration).toContain("REVOKE ALL ON FUNCTION tenancy.capture_setup_security_notification() FROM PUBLIC");
    expect(notificationSourceCoverageMigration).not.toMatch(/GRANT (INSERT|UPDATE|DELETE)[^;]+tenant_notifications TO djay_runtime/i);
  });

  it("separates local appointment state from provider-confirmed synchronization and immutable retry evidence", () => {
    expect(appointmentCalendarReconciliationMigration).toContain("'rescheduled'");
    expect(appointmentCalendarReconciliationMigration).toContain("claim_appointment_sync_job");
    expect(appointmentCalendarReconciliationMigration).toContain("finish_appointment_sync_job");
    expect(appointmentCalendarReconciliationMigration).toContain("app.service', true) <> 'appointment_sync_worker'");
    expect(appointmentCalendarReconciliationMigration).toContain("FOR UPDATE SKIP LOCKED");
    expect(appointmentCalendarReconciliationMigration).toContain("tenancy_appointment_sync_attempts_immutable");
    expect(appointmentCalendarReconciliationMigration).toContain("external_reference_sha256");
    expect(appointmentCalendarReconciliationMigration).toContain("appointment.sync_");
    expect(appointmentCalendarReconciliationMigration).not.toMatch(/GRANT (INSERT|UPDATE|DELETE)[^;]+voice_scheduling_jobs TO djay_worker/i);
  });
});

describe("BILL-01 Stripe billing foundation invariants", () => {
  it("binds Checkout to accepted contracts and verified server-side price authority", () => {
    expect(stripeBillingFoundationMigration).toContain("billing.prepare_stripe_checkout");
    expect(stripeBillingFoundationMigration).toContain("contract.accepted_by_user_id = actor_id");
    expect(stripeBillingFoundationMigration).toContain("mapping.verified_amount_minor = terms.first_term_amount_minor");
    expect(stripeBillingFoundationMigration).toContain("mapping.verified_currency = version.currency");
    expect(stripeBillingFoundationMigration).not.toMatch(/GRANT (SELECT|INSERT|UPDATE|DELETE)[^;]+checkout_intents TO djay_runtime/i);
  });

  it("forces RLS on purchase intents with auth pre-tenant and tenant post-attach policies", () => {
    expect(purchaseIntentsMigration).toContain("CREATE TABLE billing.purchase_intents");
    expect(purchaseIntentsMigration).toContain("FORCE ROW LEVEL SECURITY");
    expect(purchaseIntentsMigration).toContain("djay_auth_runtime");
    expect(purchaseIntentsMigration).toContain("tenant_id = tenancy.current_tenant_id()");
    expect(purchaseIntentsMigration).toContain("REFERENCES identity.signup_intents(id)");
  });

  it("keeps financial documents append-only and outside tenant runtime table access", () => {
    for (const table of ["invoice_documents", "credit_note_documents", "payment_events", "refund_events"]) {
      expect(stripeBillingFoundationMigration).toContain(`ALTER TABLE billing.${table} FORCE ROW LEVEL SECURITY`);
    }
    expect(stripeBillingFoundationMigration).toContain("billing_financial_evidence_is_immutable");
    expect(stripeBillingFoundationMigration).not.toMatch(/GRANT (SELECT|INSERT|UPDATE|DELETE)[^;]+(invoice_documents|credit_note_documents|payment_events|refund_events)[^;]+TO djay_runtime/i);
  });

  it("exposes sanitized tenant documents only through the tenant-scoped function", () => {
    expect(tenantFinancialDocumentsMigration).toContain("billing.list_tenant_financial_documents");
    expect(tenantFinancialDocumentsMigration).toContain("tenancy.current_tenant_id()");
    expect(tenantFinancialDocumentsMigration).toContain("SECURITY DEFINER");
    expect(tenantFinancialDocumentsMigration).toContain("TO djay_runtime");
    expect(tenantFinancialDocumentsMigration).not.toMatch(/provider_(document|pdf)_url_ciphertext/);
  });

  it("reconciles immutable provider snapshots and requires independent remediation review", () => {
    for (const table of ["provider_financial_snapshots", "financial_reconciliation_results"]) {
      expect(stripeFinancialReconciliationMigration).toContain(`ALTER TABLE billing.${table} FORCE ROW LEVEL SECURITY`);
    }
    expect(stripeFinancialReconciliationMigration).toContain("billing_financial_reconciliation_worker_authority_required");
    expect(stripeFinancialReconciliationMigration).toContain("ON CONFLICT (invoice_document_id, payload_sha256) DO NOTHING");
    expect(stripeFinancialReconciliationMigration).toContain("different_reviewer_required");
    expect(stripeFinancialReconciliationMigration).toContain("billing.reject_financial_evidence_change()");
    expect(stripeFinancialReconciliationMigration).not.toMatch(/GRANT (SELECT|INSERT|UPDATE|DELETE)[^;]+provider_financial_snapshots[^;]+TO djay_runtime/i);
  });

  it("queues FlowAccount documents with worker-only authority and immutable references", () => {
    expect(accountingSyncOutboxMigration).toContain("billing.claim_accounting_sync");
    expect(accountingSyncOutboxMigration).toContain("billing.finish_accounting_sync");
    expect(accountingSyncOutboxMigration).toContain("accounting_sync_worker_authority_required");
    expect(accountingSyncOutboxMigration).toContain("char_length(idempotency_reference) BETWEEN 1 AND 36");
    expect(accountingSyncOutboxMigration).toContain("billing.reject_financial_evidence_change()");
    expect(accountingSyncOutboxMigration).toContain("FOR UPDATE SKIP LOCKED");
    expect(accountingSyncOutboxMigration).not.toMatch(/GRANT (SELECT|INSERT|UPDATE|DELETE)[^;]+accounting_(sync_attempts|external_references)[^;]+TO djay_runtime/i);
  });

  it("rechecks FlowAccount daily without allowing remote state to overwrite local documents", () => {
    expect(accountingReconciliationMigration).toContain("retrieved_at_value + interval '24 hours'");
    expect(accountingReconciliationMigration).toContain("accounting_reconciliation_worker_authority_required");
    expect(accountingReconciliationMigration).toContain("missing_remote");
    expect(accountingReconciliationMigration).toContain("amount_mismatch");
    expect(accountingReconciliationMigration).toContain("different_reviewer_required");
    expect(accountingReconciliationMigration).toContain("billing.reject_financial_evidence_change()");
    expect(accountingReconciliationMigration).not.toMatch(/UPDATE billing\.(invoice_documents|credit_note_documents)/i);
  });

  it("independently reconciles Stripe payments, refunds and credit notes", () => {
    for (const kind of ["payment", "refund", "credit_note"]) {
      expect(stripeFinancialEventReconciliationMigration).toContain(`'${kind}'`);
    }
    expect(stripeFinancialEventReconciliationMigration).toContain("num_nonnulls(payment_event_id, refund_event_id, credit_note_document_id) = 1");
    expect(stripeFinancialEventReconciliationMigration).toContain("billing_financial_event_reconciliation_worker_authority_required");
    expect(stripeFinancialEventReconciliationMigration).toContain("billing.reject_financial_evidence_change()");
    expect(stripeFinancialEventReconciliationMigration).toContain("different_reviewer_required");
    expect(stripeFinancialEventReconciliationMigration).not.toMatch(/UPDATE billing\.(payment_events|refund_events|credit_note_documents)/i);
  });

  it("quarantines support attachments behind forced RLS and worker-only scanning", () => {
    for (const table of ["support_ticket_attachments", "support_attachment_scan_jobs"]) {
      expect(supportAttachmentScanningMigration).toContain(`ALTER TABLE tenancy.${table} FORCE ROW LEVEL SECURITY`);
    }
    expect(supportAttachmentScanningMigration).toContain("support_attachment_worker_authority_required");
    expect(supportAttachmentScanningMigration).toContain("attachment.status = 'scanning' AND attachment.declared_size = target_size");
    expect(supportAttachmentScanningMigration).not.toMatch(/GRANT (SELECT|INSERT|UPDATE|DELETE)[^;]+support_attachment_scan_jobs[^;]+TO djay_runtime/i);
    expect(supportAttachmentScanningMigration).not.toMatch(/GRANT (INSERT|UPDATE|DELETE)[^;]+support_ticket_attachments[^;]+TO djay_runtime/i);
  });

  it("separates support service classes and keeps customer updates durable and tenant-scoped", () => {
    expect(supportServiceNotificationsMigration).toContain("customer_commitment boolean NOT NULL DEFAULT false");
    expect(supportServiceNotificationsMigration).toContain("tenancy_support_ticket_notifications_immutable");
    for (const table of ["support_ticket_notifications", "support_ticket_notification_reads"]) {
      expect(supportServiceNotificationsMigration).toContain(`ALTER TABLE tenancy.${table} FORCE ROW LEVEL SECURITY`);
    }
    expect(supportServiceNotificationsMigration).toContain("UNIQUE (tenant_id, event_key)");
    expect(supportServiceNotificationsMigration).not.toMatch(/GRANT (INSERT|UPDATE|DELETE)[^;]+support_ticket_notifications[^;]+TO djay_runtime/i);
  });

  it("binds immutable regression evidence to a current published tenant artifact", () => {
    expect(botRegressionEvidenceMigration).toContain("tenancy_bot_regression_runs_immutable");
    expect(botRegressionEvidenceMigration).toContain("ALTER TABLE tenancy.bot_regression_runs FORCE ROW LEVEL SECURITY");
    expect(botRegressionEvidenceMigration).toContain("bot.current_published_version_id = version.id");
    expect(botRegressionEvidenceMigration).toContain("agent.current_published_playbook_version_id = version.id");
    expect(botRegressionEvidenceMigration).toContain("membership.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid");
    expect(botRegressionEvidenceMigration).not.toMatch(/GRANT (INSERT|UPDATE|DELETE)[^;]+bot_regression_runs[^;]+TO djay_runtime/i);
  });
});

describe("P1 database migration invariants", () => {
  it("enables and forces RLS on every tenant table", () => {
    for (const table of tenantTables) {
      expect(migration).toContain(`ALTER TABLE tenancy.${table} ENABLE ROW LEVEL SECURITY`);
      expect(migration).toContain(`ALTER TABLE tenancy.${table} FORCE ROW LEVEL SECURITY`);
    }
  });

  it("keeps runtime roles without bypass-RLS capability", () => {
    const roles = readFileSync(resolve(import.meta.dirname, "../migrations/0000_roles.sql"), "utf8");
    for (const role of [
      "djay_migrator", "djay_auth_runtime", "djay_runtime", "djay_worker",
      "djay_platform", "djay_readonly_ops", "djay_flowbot_runtime",
      "djay_ai_runtime", "djay_voice_runtime",
    ]) {
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

describe("P9 reviewed dead-letter recovery invariants", () => {
  it("limits replay to idempotent email queues behind two-person platform authority", () => {
    expect(deadLetterRecoveryMigration).toContain("'system_email', 'flowbot_email', 'ai_chat_email'");
    expect(deadLetterRecoveryMigration).toContain("reviewed_by_platform_user_id <> requested_by_platform_user_id");
    expect(deadLetterRecoveryMigration).toContain("request_record.requested_by_platform_user_id = actor_id");
    expect(deadLetterRecoveryMigration).toContain("status = 'dead_letter'");
    expect(deadLetterRecoveryMigration).toContain("attempt_count = request_record.expected_attempt_count");
    expect(deadLetterRecoveryMigration).toContain("last_error_code = 'reviewed_replay'");
    expect(deadLetterRecoveryMigration).not.toMatch(/flowbot_webhook|social_delivery|social_inbound/);
  });

  it("uses narrow fixed-path functions without exposing queue payloads", () => {
    expect(deadLetterRecoveryMigration).toContain("SECURITY DEFINER");
    expect(deadLetterRecoveryMigration).toContain("session_user <> 'djay_platform'");
    expect(deadLetterRecoveryMigration).toContain("REVOKE ALL ON FUNCTION platform.dead_letter_recovery_overview");
    expect(deadLetterRecoveryMigration).not.toMatch(/RETURNS TABLE[\s\S]{0,500}(payload|ciphertext|recipient|tenant_id)/i);
    expect(deadLetterRecoveryMigration).not.toMatch(/GRANT (SELECT|UPDATE)[^;]+(operations|tenancy)\.outbox TO djay_platform/i);
    expect(deadLetterRecoveryMigration).not.toMatch(/GRANT (SELECT|INSERT|UPDATE)[^;]+dead_letter_replay_requests TO djay_platform/i);
  });
});

describe("P9 dependency outage evidence invariants", () => {
  it("requires provider-neutral outage evidence without changing service identity", () => {
    expect(dependencyOutageMigration).toContain("'dependency_outage'");
    expect(dependencyOutageMigration).toContain("operational_attestations_attestation_kind_check");
    expect(dependencyOutageMigration).not.toMatch(/openai|anthropic|gemini|gpt-|claude-|provider_key|model_key/i);
  });
});

describe("V1 market-release commercial contract invariants", () => {
  it("stores exact plan, add-on, pack, and professional-service prices without enabling sales", () => {
    for (const exactTuple of [
      "('flowbot_basic',249900,499900,250000)",
      "('flowbot_premium',445000,890000,445000)",
      "('ai_chat_basic',595000,1190000,595000)",
      "('ai_chat_premium',1245000,2490000,1245000)",
      "('voice_basic_gen1',1495000,2990000,1495000)",
      "('voice_advanced_gen2',2995000,5990000,2995000)",
    ]) expect(marketReleaseCatalogMigration).toContain(exactTuple);
    expect(marketReleaseCatalogMigration).toContain("'additional_social_channel','Additional Social Channel',29900");
    expect(marketReleaseCatalogMigration).toContain("('ai_starter_1000','ai_chat_basic',1000,29900)");
    expect(marketReleaseCatalogMigration).toContain("'voice_custom_automation','Custom Voice Automation',1990000");
    expect(marketReleaseCatalogMigration).not.toMatch(/plan_commercial_terms[\s\S]{0,800}true\s*[),]/i);
  });

  it("makes locked catalogue content and tenant contract snapshots immutable", () => {
    expect(marketReleaseCatalogMigration).toContain("locked catalog content is immutable");
    expect(marketReleaseCatalogMigration).toContain("subscription contract snapshots are immutable");
    expect(marketReleaseCatalogMigration).toContain("tenancy_subscription_contract_immutable");
    expect(marketReleaseCatalogMigration).toContain("renewal_amount_minor - first_term_discount_minor = first_term_amount_minor");
  });

  it("requires platform-owner authority, an approved checksum, and six plans for activation", () => {
    expect(marketReleaseCatalogMigration).toContain("session_user <> 'djay_platform'");
    expect(marketReleaseCatalogMigration).toContain("actor_role <> 'platform_owner'");
    expect(marketReleaseCatalogMigration).toContain("catalog_checksum_mismatch");
    expect(marketReleaseCatalogMigration).toContain("HAVING count(*) = 6");
  });

  it("forces tenant isolation and never grants contract mutation", () => {
    expect(marketReleaseCatalogMigration).toContain("subscription_contract_snapshots ENABLE ROW LEVEL SECURITY");
    expect(marketReleaseCatalogMigration).toContain("subscription_contract_snapshots FORCE ROW LEVEL SECURITY");
    expect(marketReleaseCatalogMigration).not.toMatch(/GRANT[^;]+UPDATE[^;]+subscription_contract_snapshots/i);
    expect(marketReleaseCatalogMigration).not.toMatch(/GRANT[^;]+DELETE[^;]+subscription_contract_snapshots/i);
  });
});

describe("V1 tenant role and sensitive-action policy invariants", () => {
  it("adds distinct conversation, human-agent, billing, and read-only support roles", () => {
    for (const role of [
      "tenant_conversation_manager", "tenant_human_agent",
      "tenant_billing_manager", "tenant_readonly_support",
    ]) expect(tenantRolesSecurityMigration).toContain(`'${role}'`);
    expect(tenantRolesSecurityMigration.match(/tenant_readonly_support/g)).toHaveLength(1);
  });

  it("requires MFA for sensitive actions and creates a policy for every tenant", () => {
    expect(tenantRolesSecurityMigration).toContain("sensitive_actions_require_mfa boolean NOT NULL DEFAULT true");
    expect(tenantRolesSecurityMigration).toContain("CHECK (sensitive_actions_require_mfa = true)");
    expect(tenantRolesSecurityMigration).toContain("CREATE TRIGGER tenancy_default_security_policy");
    expect(tenantRolesSecurityMigration).toMatch(/create_default_security_policy\(\)[\s\S]+SECURITY DEFINER[\s\S]+SET search_path = pg_catalog, tenancy/);
    expect(tenantRolesSecurityMigration).toContain("security_policies FORCE ROW LEVEL SECURITY");
  });

  it("makes tenant, platform, and operations audit events immutable", () => {
    for (const trigger of [
      "tenancy_audit_logs_immutable", "platform_audit_logs_immutable",
      "operations_audit_logs_immutable",
    ]) expect(tenantRolesSecurityMigration).toContain(trigger);
    expect(tenantRolesSecurityMigration).toContain("audit events are immutable");
  });

  it("changes or revokes non-owner memberships through one audited tenant-scoped function", () => {
    expect(tenantRolesSecurityMigration).toContain("CREATE OR REPLACE FUNCTION tenancy.manage_membership");
    expect(tenantRolesSecurityMigration).toContain("session_user <> 'djay_runtime'");
    expect(tenantRolesSecurityMigration).toContain("actor_role <> 'tenant_master_admin'");
    expect(tenantRolesSecurityMigration).toContain("team.membership_role_changed");
    expect(tenantRolesSecurityMigration).toContain("team.membership_revoked");
    expect(tenantRolesSecurityMigration).toContain("'beforeRole'");
    expect(tenantRolesSecurityMigration).toContain("AND membership.status = 'active'");
  });
});

describe("COM-02 entitlement resource boundary invariants", () => {
  it("makes seat admission atomic and derives capacity from active contract snapshots and add-ons", () => {
    expect(resourceBoundariesMigration).toContain("pg_advisory_xact_lock");
    expect(resourceBoundariesMigration).toContain("resolved_json->'limits'->>'seats'");
    expect(resourceBoundariesMigration).toContain("additional_administrator");
    expect(resourceBoundariesMigration).toContain("membership_invitations invitation");
    expect(resourceBoundariesMigration).toMatch(/administrator_seat_capacity[\s\S]+SECURITY DEFINER[\s\S]+SET search_path = pg_catalog, tenancy/);
  });

  it("keeps downgrade evidence immutable and excess resources recoverable", () => {
    expect(resourceBoundariesMigration).toContain("tenancy.downgrade_preflight_evidence");
    expect(resourceBoundariesMigration).toContain("tenancy_downgrade_preflight_immutable");
    expect(resourceBoundariesMigration).toContain("read_only_excess");
    expect(resourceBoundariesMigration).toContain("restored_at");
    expect(resourceBoundariesMigration).toContain("retained_resource_selection");
  });

  it("enforces RLS and same-tenant references on every new tenant record", () => {
    for (const table of [
      "subscription_add_ons", "subscription_scheduled_changes",
      "entitlement_resource_states", "downgrade_preflight_evidence",
    ]) {
      expect(resourceBoundariesMigration).toContain(`ALTER TABLE tenancy.${table} ENABLE ROW LEVEL SECURITY`);
      expect(resourceBoundariesMigration).toContain(`ALTER TABLE tenancy.${table} FORCE ROW LEVEL SECURITY`);
    }
    expect(resourceBoundariesMigration).toContain("FOREIGN KEY (tenant_id, source_change_id)");
  });

  it("applies due changes through a worker-only atomic and recoverable path", () => {
    expect(scheduledChangesMigration).toContain("session_user <> 'djay_worker'");
    expect(scheduledChangesMigration).toContain("FOR UPDATE SKIP LOCKED");
    expect(scheduledChangesMigration).toContain("subscription_authority_changed");
    expect(scheduledChangesMigration).toContain("plan_capacity_restored");
    expect(scheduledChangesMigration).toContain("subscription.plan_change_applied");
    expect(scheduledChangesMigration).toContain("GRANT EXECUTE ON FUNCTION tenancy.apply_next_scheduled_entitlement_change");
    for (const runtime of ["flowbot", "ai", "voice"]) {
      expect(scheduledChangesMigration).toContain(`tenancy.${runtime}_runtime_resource_active`);
    }
  });
});

describe("COM-03 usage funding and alert invariants", () => {
  it("locks exact customer meter definitions and separates provider usage", () => {
    for (const meter of ["flow_conversation_session", "ai_customer_facing_reply", "voice_connected_minute"]) {
      expect(usageFundingMigration).toContain(`'${meter}'`);
    }
    expect(usageFundingMigration).toContain("catalog_meter_versions_immutable");
    expect(usageFundingMigration).toContain("tenancy.provider_usage_events");
    expect(usageFundingMigration).toContain("tenancy_provider_usage_event_immutable");
  });

  it("models append-only pack allocation and deduplicated usage alerts", () => {
    expect(usageFundingMigration).toContain("tenancy.usage_pack_lots");
    expect(usageFundingMigration).toContain("tenancy.usage_pack_consumptions");
    expect(usageFundingMigration).toContain("tenancy_usage_pack_consumption_immutable");
    expect(usageFundingMigration).toContain("ARRAY[50,75,90,100]");
    expect(usageFundingMigration).toContain("UNIQUE (tenant_id, idempotency_key)");
  });

  it("centralizes reservation and finalization behind a tenant-bound function-only authority", () => {
    expect(usageFundingAuthorityMigration).toContain("CREATE OR REPLACE FUNCTION tenancy.reserve_customer_usage");
    expect(usageFundingAuthorityMigration).toContain("CREATE OR REPLACE FUNCTION tenancy.finalize_customer_usage");
    expect(usageFundingAuthorityMigration).toContain("usage_funding_tenant_context_required");
    expect(usageFundingAuthorityMigration).toContain("FOR UPDATE");
    expect(usageFundingAuthorityMigration).toContain("included_funding := LEAST");
    expect(usageFundingAuthorityMigration).toContain("ORDER BY candidate.expires_at");
    expect(usageFundingAuthorityMigration).toContain("account.overage_consent_status = 'consented'");
    expect(usageFundingAuthorityMigration).toContain("target_idempotency_key || ':pack-release:'");
    expect(usageFundingAuthorityMigration).toContain("REVOKE ALL ON FUNCTION tenancy.reserve_customer_usage");
    expect(usageFundingAuthorityMigration).not.toMatch(
      /GRANT (SELECT|INSERT|UPDATE|DELETE)[^;]+usage_(pack|reservation)[^;]+djay_(flowbot|ai|voice)_runtime/i,
    );
  });

  it("rolls monthly Bangkok allowance periods through a restricted idempotent worker", () => {
    expect(usagePeriodRolloverMigration).toContain("current_setting('app.service', true) IS DISTINCT FROM 'usage_period_worker'");
    expect(usagePeriodRolloverMigration).toContain("FOR UPDATE OF account SKIP LOCKED");
    expect(usagePeriodRolloverMigration).toContain("tenancy.finalize_customer_usage");
    expect(usagePeriodRolloverMigration).toContain("AT TIME ZONE 'Asia/Bangkok'");
    expect(usagePeriodRolloverMigration).toContain("ON CONFLICT (tenant_id, subscription_id, customer_unit, period_start) DO NOTHING");
    expect(usagePeriodRolloverMigration).toContain("'usage.period.started'");
    expect(usagePeriodRolloverMigration).toContain("GRANT EXECUTE ON FUNCTION tenancy.roll_usage_periods");
  });

  it("funds every restricted runtime reservation and returns unused prepaid capacity", () => {
    expect(runtimeUsageFundingMigration).toContain("CREATE TRIGGER tenancy_usage_reservation_runtime_funding");
    expect(runtimeUsageFundingMigration).toContain("CREATE TRIGGER tenancy_usage_reservation_runtime_pack_allocation");
    expect(runtimeUsageFundingMigration).toContain("CREATE TRIGGER tenancy_usage_reservation_runtime_pack_release");
    for (const role of ["djay_flowbot_runtime", "djay_ai_runtime", "djay_voice_runtime", "djay_worker"]) {
      expect(runtimeUsageFundingMigration).toContain(`'${role}'`);
    }
    expect(runtimeUsageFundingMigration).toContain("current_setting('app.service', true) IS DISTINCT FROM 'ai_social_worker'");
    expect(runtimeUsageFundingMigration).toContain("ORDER BY candidate.expires_at");
    expect(runtimeUsageFundingMigration).toContain("account.overage_consent_status = 'consented'");
    expect(runtimeUsageFundingMigration).toContain("usage_reservation_authority_is_immutable");
    expect(runtimeUsageFundingMigration).toContain("'runtime:pack-release:'");
    expect(runtimeUsageFundingMigration).not.toMatch(
      /GRANT (SELECT|INSERT|UPDATE|DELETE)[^;]+usage_pack[^;]+djay_(flowbot|ai|voice)_runtime/i,
    );
  });

  it("delivers provider-neutral anomaly alerts with cooldown and append-only outcomes", () => {
    expect(usageAlertDeliveryMigration).toContain("tenancy.usage_alert_delivery_attempts");
    expect(usageAlertDeliveryMigration).toContain("tenancy_usage_alert_attempt_immutable");
    expect(usageAlertDeliveryMigration).toContain("customer_usage_1h_vs_prior_24h_v1");
    expect(usageAlertDeliveryMigration).toContain("make_interval(hours => account.cooldown_hours)");
    expect(usageAlertDeliveryMigration).toContain("usage.alert.email.requested");
    expect(usageAlertDeliveryMigration).toContain("usage_alert_notification_worker");
    expect(usageAlertDeliveryMigration).not.toMatch(/openai|stripe|carrier|model|native_quantity|estimated_cost/i);
    expect(usageAlertDeliveryMigration).not.toMatch(
      /GRANT (SELECT|INSERT|UPDATE|DELETE)[^;]+usage_alert_delivery_attempts[^;]+djay_worker/i,
    );
  });

  it("reconciles provider facts only by exact correlation and reviews remediation independently", () => {
    expect(providerUsageReconciliationMigration).toContain("tenancy.provider_usage_reconciliation_results");
    expect(providerUsageReconciliationMigration).toContain("customerUsageEventId");
    expect(providerUsageReconciliationMigration).toContain("missing_correlation");
    expect(providerUsageReconciliationMigration).toContain("correlation_mismatch");
    expect(providerUsageReconciliationMigration).toContain("FOR UPDATE OF event SKIP LOCKED");
    expect(providerUsageReconciliationMigration).toContain("usage_reconciliation_worker");
    expect(providerUsageReconciliationMigration).toContain("different_reviewer_required");
    expect(providerUsageReconciliationMigration).toContain("platform_usage_reconciliation_case_event_immutable");
    expect(providerUsageReconciliationMigration).not.toMatch(/native_quantity\s*[<>=]+\s*customer_quantity/i);
    expect(providerUsageReconciliationMigration).not.toMatch(/UPDATE tenancy\.(usage_events|quota_accounts|usage_reservations)/i);
  });
});

describe("P9 release-readiness invariants", () => {
  it("defines exactly seven immutable provider-neutral service objectives", () => {
    for (const service of [
      "public_site", "tenant_api", "flowbot_runtime", "ai_chat_runtime",
      "social_delivery", "voice_gateway", "worker",
    ]) expect(releaseReadinessMigration).toContain(`'${service}'`);
    expect(releaseReadinessMigration).toContain("platform_service_objectives_immutable");
    expect(releaseReadinessMigration).not.toMatch(/provider_key|model_key|credential|customer_content/i);
  });

  it("keeps observations and attestations append-only and platform restricted", () => {
    expect(releaseReadinessMigration).toContain("platform_service_observations_immutable");
    expect(releaseReadinessMigration).toContain("platform_operational_attestations_immutable");
    expect(releaseReadinessMigration).toContain("evidence_sha256 bytea NOT NULL");
    expect(releaseReadinessMigration).toContain("SECURITY DEFINER");
    expect(releaseReadinessMigration).toContain("platform.blocking_incident_summary()");
    expect(releaseReadinessMigration).toContain("REVOKE ALL ON FUNCTION platform.blocking_incident_summary() FROM PUBLIC");
    expect(releaseReadinessMigration).toContain("TO djay_platform");
    expect(releaseReadinessMigration).toMatch(/REVOKE ALL ON platform\.service_objectives,[\s\S]+FROM PUBLIC/);
  });

  it("requires replay, queue recovery, and pool exhaustion evidence", () => {
    for (const drill of ["event_replay", "queue_recovery", "pool_exhaustion"]) {
      expect(resilienceDrillsMigration).toContain(`'${drill}'`);
    }
    expect(resilienceDrillsMigration).toContain("operational_attestations_attestation_kind_check");
    expect(resilienceDrillsMigration).not.toMatch(/provider_key|model_key|credential|customer_content/i);
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

  it("requires contact-scoped erasure and keeps JSON scope aligned with its foreign key", () => {
    expect(privacyJobScopeMigration).toContain("privacy_erasure_requires_contact");
    expect(privacyJobScopeMigration).toContain("privacy_job_scope_matches_contact");
    expect(privacyJobScopeMigration).toContain("privacy.erasure.scope_invalidated");
    expect(privacyJobScopeMigration).toContain("status IN ('failed', 'cancelled')");
  });

  it("requires a separate support approver and caps access at four hours", () => {
    expect(sharedDomainMigration).toContain("requested_by_platform_user_id <> approved_by_platform_user_id");
    expect(sharedDomainMigration).toContain("expires_at <= starts_at + interval '4 hours'");
    expect(privacySupportMigration).toContain("status = 'requested' AND approved_by_platform_user_id IS NULL");
  });
});

describe("P4 FlowBot database migration invariants", () => {
  it("resumes AI after staff release through narrow tenant and membership authority", () => {
    expect(staffReleaseBoundariesMigration).toContain("SECURITY DEFINER");
    expect(staffReleaseBoundariesMigration).toContain("tenancy.current_tenant_id()");
    expect(staffReleaseBoundariesMigration).toContain("current_setting('app.membership_id', true)");
    expect(staffReleaseBoundariesMigration).toContain("conversation.automation_mode = 'human'");
    expect(staffReleaseBoundariesMigration).toContain("session.status = 'handover'");
    expect(staffReleaseBoundariesMigration).toContain("REVOKE ALL ON FUNCTION tenancy.resume_ai_session_after_staff_release");
    expect(staffReleaseBoundariesMigration).toContain("TO djay_runtime");
    expect(staffReleaseBoundariesMigration).not.toMatch(/GRANT UPDATE ON tenancy\.ai_sessions/i);
  });
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

  it("syncs structured FlowBot messages without relaxing runtime credentials", () => {
    expect(flowbotRichMessageSyncMigration).toContain("'card', 'carousel', 'actions'");
    expect(flowbotRichMessageSyncMigration).toContain("execution.session_token_hash = target_session_hash");
    expect(flowbotRichMessageSyncMigration).toContain("deployment.deployment_key_hash = target_key_hash");
    expect(flowbotRichMessageSyncMigration).toContain("flowbot_origin_allowed(deployment.allowed_origins, request_origin)");
    expect(flowbotRichMessageSyncMigration).toContain("REVOKE ALL ON FUNCTION tenancy.sync_flowbot_execution");
  });

  it("keeps customer tags and typed attributes tenant-scoped and relational", () => {
    for (const table of ["contact_tags", "contact_tag_assignments", "contact_attributes"]) {
      expect(customerTagsAttributesMigration).toContain(`CREATE TABLE tenancy.${table}`);
      expect(customerTagsAttributesMigration).toContain(`'${table}'`);
    }
    expect(customerTagsAttributesMigration).toContain("FORCE ROW LEVEL SECURITY");
    expect(customerTagsAttributesMigration).toContain("UNIQUE (tenant_id, contact_id, attribute_key)");
    expect(customerTagsAttributesMigration).not.toMatch(/GRANT[^;]+TO djay_(ai|flowbot|voice)_runtime/i);
  });

  it("identifies Google Sheets and external API connectors without exposing secrets", () => {
    expect(flowbotConnectorKindsMigration).toContain("integration_kind IN ('external_api', 'google_sheets')");
    expect(flowbotConnectorKindsMigration).not.toMatch(/endpoint_ciphertext.*DROP|GRANT/i);
  });

  it("isolates signed deterministic Flow social transport from AI resources", () => {
    for (const table of ["flow_social_connections", "flow_social_receipts", "flow_social_subjects", "flow_social_deliveries"]) {
      expect(flowbotSocialTransportMigration).toContain(`CREATE TABLE tenancy.${table}`);
    }
    expect(flowbotSocialTransportMigration).toContain("flowbot.social.inbound.received");
    expect(flowbotSocialTransportMigration).toContain("channel.social' = 'true'");
    expect(flowbotSocialTransportMigration).toContain("TO djay_flowbot_runtime");
    expect(flowbotSocialTransportMigration).not.toMatch(/ai_agents|ai_sessions|ai_turns/);
  });
  it("creates quota-backed Flow social executions under restricted worker authority", () => {
    expect(flowbotSocialWorkersMigration).toContain("prepare_flow_social_turn");
    expect(flowbotSocialWorkersMigration).toContain("flowbot_quota_unavailable");
    expect(flowbotSocialWorkersMigration).toContain("flowbot:social:start:");
    expect(flowbotSocialWorkersMigration).toContain("session_user <> 'djay_worker'");
    expect(flowbotSocialWorkersMigration).not.toMatch(/ai_agents|ai_sessions|ai_turns/);
  });
  it("commits Flow social turns before resumable provider delivery", () => {
    expect(flowbotSocialDeliveryMigration).toContain("commit_flowbot_step");
    expect(flowbotSocialDeliveryMigration).toContain("flow_social_deliveries");
    expect(flowbotSocialDeliveryMigration).toContain("delivered_part_count");
    expect(flowbotSocialDeliveryMigration).toContain("FOR UPDATE SKIP LOCKED");
    expect(flowbotSocialDeliveryMigration).toContain("subject.status = 'active'");
  });
  it("funds Flow social usage only in the dedicated restricted worker context", () => {
    expect(flowbotSocialFundingMigration).toContain("'ai_social_worker', 'flow_social_worker'");
    expect(flowbotSocialFundingMigration).toContain("unfunded_worker_usage_reservation_forbidden");
    expect(flowbotSocialFundingMigration).toContain("runtime_usage_authority_invalid");
    expect(flowbotSocialFundingMigration).toContain("flowbot_allowance_exhausted");
    expect(flowbotSocialFundingMigration).toContain("REVOKE ALL ON FUNCTION tenancy.fund_restricted_runtime_reservation()");
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

  it("schedules tenant cancellation at period end with immutable provider evidence", () => {
    expect(subscriptionLifecycleControlsMigration).toContain("CREATE TABLE billing.subscription_cancellation_requests");
    expect(subscriptionLifecycleControlsMigration).toContain("CREATE TABLE billing.subscription_cancellation_events");
    expect(subscriptionLifecycleControlsMigration).toContain("billing_subscription_cancellation_event_immutable");
    expect(subscriptionLifecycleControlsMigration).toContain("provider_cancel_at_period_end");
    expect(subscriptionLifecycleControlsMigration).toContain("subscription.cancel_at IS NULL");
    expect(subscriptionLifecycleControlsMigration).not.toContain("DELETE FROM tenancy.product_subscriptions");
  });

  it("requires independently reviewed dunning policy before lifecycle enforcement", () => {
    expect(subscriptionLifecycleControlsMigration).toContain("CREATE TABLE platform.subscription_dunning_policy_versions");
    expect(subscriptionLifecycleControlsMigration).toContain("requested_by_platform_user_id");
    expect(subscriptionLifecycleControlsMigration).toContain("different_reviewer_required");
    expect(subscriptionLifecycleControlsMigration).toContain("CREATE UNIQUE INDEX platform_one_active_dunning_policy");
    expect(subscriptionLifecycleControlsMigration).toContain("apply_next_subscription_dunning_transition");
    expect(subscriptionLifecycleControlsMigration).toContain("subscription_lifecycle_worker_authority_required");
    expect(subscriptionLifecycleControlsMigration).not.toMatch(/INSERT INTO platform\.subscription_dunning_policy_versions[\s\S]+VALUES\s*\([^;]+active/i);
  });

  it("queues ignored Stripe authority failures for independently evidenced reviewed recovery", () => {
    expect(stripeWebhookRecoveryMigration).toContain("queue_ignored_stripe_webhook_recovery");
    expect(stripeWebhookRecoveryMigration).toContain("provider_webhook_event_snapshots");
    expect(stripeWebhookRecoveryMigration).toContain("billing_webhook_recovery_worker_authority_required");
    expect(stripeWebhookRecoveryMigration).toContain("different_reviewer_required");
    expect(stripeWebhookRecoveryMigration).toContain("status = 'received'");
    expect(stripeWebhookRecoveryMigration).not.toContain("payload_ciphertext text NOT NULL DEFAULT");
  });

  it("records immutable customer billing notices and restricts email delivery to a fixed worker", () => {
    expect(customerBillingNotificationsMigration).toContain("CREATE TABLE tenancy.customer_billing_notifications");
    expect(customerBillingNotificationsMigration).toContain("tenancy_customer_billing_notification_immutable");
    expect(customerBillingNotificationsMigration).toContain("billing.customer_email.requested");
    expect(customerBillingNotificationsMigration).toContain("'billing_notification_worker'");
    expect(customerBillingNotificationsMigration).toContain("CREATE TABLE tenancy.billing_notification_delivery_attempts");
    expect(customerBillingNotificationsMigration).toContain("REVOKE ALL ON FUNCTION tenancy.queue_customer_billing_notification");
  });
});
