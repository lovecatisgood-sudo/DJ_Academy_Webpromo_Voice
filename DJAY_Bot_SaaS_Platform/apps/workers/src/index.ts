import { createServer } from "node:http";
import { openJson, parse32ByteSecret, sealJson } from "@djay/auth";
import { createHash } from "node:crypto";
import { AiTextRuntimeError, generateAiTurn } from "@djay/ai-chat-runtime";
import {
  AiChatNotificationWorkerStore, AiIntegrationWorkerStore, AiSocialWorkerStore, BillingNotificationWorkerStore, BillingWebhookStore, createDatabaseClient, DatabaseReadinessProbe, EntitlementChangeWorkerStore,
  FinancialEventReconciliationWorkerStore, FinancialReconciliationWorkerStore, FlowbotNotificationWorkerStore, FlowbotWorkerStore,
  FlowSocialWorkerStore,
  KnowledgeIngestionWorkerStore,
  PostgresEmailOutboxStore, PrivacyStore, ProviderUsageReconciliationWorkerStore,
  UsageAlertNotificationWorkerStore,
  UsageAlertWorkerStore, UsagePeriodWorkerStore, VoiceReaperStore, TrialLifecycleWorkerStore,
  SupportAttachmentWorkerStore,
  AppointmentSyncWorkerStore,
  SubscriptionLifecycleWorkerStore,
  BillingWebhookRecoveryWorkerStore,
} from "@djay/db";
import {
  createHttpEmailDelivery, runAiChatMerchantEmail, runCustomerBillingEmail, runEmailBatch,
  runFlowbotMerchantEmail, runUsageAlertEmail,
} from "@djay/notifications";
import { createHttpTextProviderGateway, ProviderGatewayError } from "@djay/provider-gateway";
import { assertNoProductionPlaceholders } from "@djay/shared/production-config";
import { createStripePaymentProvider } from "@djay/usage-billing";
import { createSocialDeliveryClient, flowMessagesToSocialReplyInput, renderSocialReply, resumeSocialReply, SocialDeliveryError, socialCredentialSchema, type StructuredFlowMessage } from "@djay/channel-adapters";
import { deliveryErrorClass, emitChannelDeliveryResult, emitConversationFirstResponse, emitLineReplyWindowHit } from "@djay/shared";
import { z } from "zod";
import { deliverFlowbotIntegration } from "./flowbot-integration";
import { runKnowledgeIngestionBatch } from "./knowledge-ingestion";
import { deliverAiIntegration } from "./ai-integration";
import { runSupportAttachmentBatch } from "./support-attachments";
import { appointmentSyncErrorCode, deliverAppointmentSync } from "./appointment-sync";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SOCIAL_CHANNELS_RELEASE_ENABLED: z.enum(["true", "false"]).default("false"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3104),
  WORKER_DATABASE_URL: z.string().url(),
  AUTH_EMAIL_ENVELOPE_KEY: z.string().min(40).optional(),
  EMAIL_DELIVERY_MODE: z.enum(["disabled", "http"]).default("disabled"),
  EMAIL_DELIVERY_ENDPOINT: z.string().url().optional(),
  EMAIL_DELIVERY_API_TOKEN: z.string().min(16).optional(),
  EMAIL_FROM: z.string().min(3).max(320).optional(),
  EMAIL_WORKER_INTERVAL_MS: z.coerce.number().int().min(250).max(60_000).default(2_000),
  EMAIL_WORKER_ONCE: z.enum(["true", "false"]).default("false"),
  PRIVACY_WORKER_ENABLED: z.enum(["true", "false"]).default("false"),
  PRIVACY_EXPORT_KEY: z.string().min(40).optional(),
  FLOWBOT_WORKER_ENABLED: z.enum(["true", "false"]).default("false"),
  FLOWBOT_INTEGRATION_ENVELOPE_KEY: z.string().min(40).optional(),
  FLOWBOT_NOTIFICATION_ENVELOPE_KEY: z.string().min(40).optional(),
  FLOWBOT_SOCIAL_WORKER_ENABLED: z.enum(["true", "false"]).default("false"),
  FLOWBOT_SOCIAL_CREDENTIAL_ENVELOPE_KEY: z.string().min(40).optional(),
  AI_WORKER_ENABLED: z.enum(["true", "false"]).default("false"),
  AI_INTEGRATION_WORKER_ENABLED: z.enum(["true", "false"]).default("false"),
  AI_INTEGRATION_ENVELOPE_KEY: z.string().min(40).optional(),
  KNOWLEDGE_WORKER_ENABLED: z.enum(["true", "false"]).default("false"),
  SUPPORT_ATTACHMENT_WORKER_ENABLED: z.enum(["true", "false"]).default("false"),
  APPOINTMENT_SYNC_WORKER_ENABLED: z.enum(["true", "false"]).default("false"),
  VOICE_TELEPHONY_ENVELOPE_KEY: z.string().min(40).optional(),
  KNOWLEDGE_OBJECT_BUCKET: z.string().min(3).max(222).optional(),
  MALWARE_SCANNER_ENDPOINT: z.string().url().optional(),
  MALWARE_SCANNER_TOKEN: z.string().min(16).optional(),
  AI_NOTIFICATION_ENVELOPE_KEY: z.string().min(40).optional(),
  AI_SOCIAL_WORKER_ENABLED: z.enum(["true", "false"]).default("false"),
  AI_SOCIAL_CREDENTIAL_ENVELOPE_KEY: z.string().min(40).optional(),
  AI_TEXT_GATEWAY_ENDPOINT: z.string().url().optional(),
  AI_TEXT_GATEWAY_SERVICE_TOKEN: z.string().min(32).optional(),
  AI_SOCIAL_LINE_API_BASE_URL: z.string().url().default("https://api.line.me/"),
  AI_SOCIAL_META_GRAPH_BASE_URL: z.string().url().default("https://graph.facebook.com/v23.0/"),
  VOICE_REAPER_ENABLED: z.enum(["true", "false"]).default("false"),
  VOICE_REAPER_STALE_SECONDS: z.coerce.number().int().min(15).max(300).default(30),
  VOICE_REAPER_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(100),
  ENTITLEMENT_CHANGE_WORKER_ENABLED: z.enum(["true", "false"]).default("false"),
  USAGE_ALERT_WORKER_ENABLED: z.enum(["true", "false"]).default("false"),
  USAGE_ALERT_NOTIFICATION_ENVELOPE_KEY: z.string().min(40).optional(),
  BILLING_NOTIFICATION_ENVELOPE_KEY: z.string().min(40).optional(),
  COMMERCE_WORKERS_ENABLED: z.enum(["true", "false"]).default("false"),
  USAGE_PERIOD_WORKER_ENABLED: z.enum(["true", "false"]).default("false"),
  USAGE_RECONCILIATION_WORKER_ENABLED: z.enum(["true", "false"]).default("false"),
  BILLING_WEBHOOK_WORKER_ENABLED: z.enum(["true", "false"]).default("false"),
  SUBSCRIPTION_LIFECYCLE_WORKER_ENABLED: z.enum(["true", "false"]).default("false"),
  BILLING_WEBHOOK_RECOVERY_WORKER_ENABLED: z.enum(["true", "false"]).default("false"),
  BILLING_WEBHOOK_ENVELOPE_KEY: z.string().min(40).optional(),
  BILLING_FINANCIAL_RECONCILIATION_WORKER_ENABLED: z.enum(["true", "false"]).default("false"),
  BILLING_FINANCIAL_ENVELOPE_KEY: z.string().min(40).optional(),
  STRIPE_SECRET_KEY: z.string().min(20).optional(),
  TENANT_APP_URL: z.string().url().optional(),
});

const env = envSchema.parse(process.env);
const socialReleaseEnabled = env.SOCIAL_CHANNELS_RELEASE_ENABLED === "true";
assertNoProductionPlaceholders(env.NODE_ENV, env);
if (env.NODE_ENV === "production" && env.EMAIL_DELIVERY_MODE !== "http") throw new Error("EMAIL_DELIVERY_MODE=http is required in production.");
if (env.NODE_ENV === "production" && env.PRIVACY_WORKER_ENABLED !== "true") throw new Error("PRIVACY_WORKER_ENABLED=true is required in production.");
if (env.NODE_ENV === "production" && env.FLOWBOT_WORKER_ENABLED !== "true") throw new Error("FLOWBOT_WORKER_ENABLED=true is required in production.");
if (env.NODE_ENV === "production" && socialReleaseEnabled && env.FLOWBOT_SOCIAL_WORKER_ENABLED !== "true") throw new Error("FLOWBOT_SOCIAL_WORKER_ENABLED=true is required when the social release is enabled.");
if (env.NODE_ENV === "production" && env.AI_WORKER_ENABLED !== "true") throw new Error("AI_WORKER_ENABLED=true is required in production.");
if (env.NODE_ENV === "production" && env.AI_INTEGRATION_WORKER_ENABLED !== "true") throw new Error("AI_INTEGRATION_WORKER_ENABLED=true is required in production.");
if (env.NODE_ENV === "production" && env.KNOWLEDGE_WORKER_ENABLED !== "true") throw new Error("KNOWLEDGE_WORKER_ENABLED=true is required in production.");
if (env.NODE_ENV === "production" && env.SUPPORT_ATTACHMENT_WORKER_ENABLED !== "true") throw new Error("SUPPORT_ATTACHMENT_WORKER_ENABLED=true is required in production.");
if (env.NODE_ENV === "production" && env.APPOINTMENT_SYNC_WORKER_ENABLED !== "true") throw new Error("APPOINTMENT_SYNC_WORKER_ENABLED=true is required in production.");
if (env.NODE_ENV === "production" && socialReleaseEnabled && env.AI_SOCIAL_WORKER_ENABLED !== "true") throw new Error("AI_SOCIAL_WORKER_ENABLED=true is required when the social release is enabled.");
if (env.NODE_ENV === "production" && !socialReleaseEnabled && (env.FLOWBOT_SOCIAL_WORKER_ENABLED === "true" || env.AI_SOCIAL_WORKER_ENABLED === "true")) {
  throw new Error("Social workers require SOCIAL_CHANNELS_RELEASE_ENABLED=true.");
}
if (env.NODE_ENV === "production" && env.ENTITLEMENT_CHANGE_WORKER_ENABLED !== "true") throw new Error("ENTITLEMENT_CHANGE_WORKER_ENABLED=true is required in production.");
if (env.NODE_ENV === "production" && env.USAGE_ALERT_WORKER_ENABLED !== "true") throw new Error("USAGE_ALERT_WORKER_ENABLED=true is required in production.");
if (env.NODE_ENV === "production" && env.USAGE_PERIOD_WORKER_ENABLED !== "true") throw new Error("USAGE_PERIOD_WORKER_ENABLED=true is required in production.");
if (env.NODE_ENV === "production" && env.USAGE_RECONCILIATION_WORKER_ENABLED !== "true") throw new Error("USAGE_RECONCILIATION_WORKER_ENABLED=true is required in production.");
const commerceWorkerFlags = [env.BILLING_WEBHOOK_WORKER_ENABLED, env.SUBSCRIPTION_LIFECYCLE_WORKER_ENABLED,
  env.BILLING_WEBHOOK_RECOVERY_WORKER_ENABLED, env.BILLING_FINANCIAL_RECONCILIATION_WORKER_ENABLED];
if (env.NODE_ENV === "production" && env.COMMERCE_WORKERS_ENABLED === "true" && commerceWorkerFlags.some((flag) => flag !== "true")) {
  throw new Error("All commerce workers must be enabled when COMMERCE_WORKERS_ENABLED=true in production.");
}
if (env.COMMERCE_WORKERS_ENABLED === "false" && commerceWorkerFlags.some((flag) => flag === "true")) {
  throw new Error("Commerce worker flags require COMMERCE_WORKERS_ENABLED=true.");
}
if (env.EMAIL_DELIVERY_MODE === "http" && (!env.EMAIL_DELIVERY_ENDPOINT || !env.EMAIL_DELIVERY_API_TOKEN || !env.EMAIL_FROM || !env.AUTH_EMAIL_ENVELOPE_KEY)) {
  throw new Error("HTTP email delivery configuration is incomplete.");
}
if (env.PRIVACY_WORKER_ENABLED === "true" && !env.PRIVACY_EXPORT_KEY) throw new Error("PRIVACY_EXPORT_KEY is required when privacy processing is enabled.");
if (env.FLOWBOT_WORKER_ENABLED === "true" && !env.FLOWBOT_INTEGRATION_ENVELOPE_KEY) throw new Error("FLOWBOT_INTEGRATION_ENVELOPE_KEY is required when FlowBot processing is enabled.");
if (env.FLOWBOT_WORKER_ENABLED === "true" && !env.FLOWBOT_NOTIFICATION_ENVELOPE_KEY) throw new Error("FLOWBOT_NOTIFICATION_ENVELOPE_KEY is required when FlowBot processing is enabled.");
if (env.FLOWBOT_SOCIAL_WORKER_ENABLED === "true" && !env.FLOWBOT_SOCIAL_CREDENTIAL_ENVELOPE_KEY) throw new Error("FLOWBOT_SOCIAL_CREDENTIAL_ENVELOPE_KEY is required when FlowBot social processing is enabled.");
if (env.AI_WORKER_ENABLED === "true" && !env.AI_NOTIFICATION_ENVELOPE_KEY) throw new Error("AI_NOTIFICATION_ENVELOPE_KEY is required when AI processing is enabled.");
if (env.AI_INTEGRATION_WORKER_ENABLED === "true" && !env.AI_INTEGRATION_ENVELOPE_KEY) throw new Error("AI_INTEGRATION_ENVELOPE_KEY is required when AI integration processing is enabled.");
if (env.KNOWLEDGE_WORKER_ENABLED === "true" && (!env.KNOWLEDGE_OBJECT_BUCKET || !env.MALWARE_SCANNER_ENDPOINT || !env.MALWARE_SCANNER_TOKEN)) {
  throw new Error("Knowledge object storage and malware scanner configuration is incomplete.");
}
if (env.SUPPORT_ATTACHMENT_WORKER_ENABLED === "true" && (!env.KNOWLEDGE_OBJECT_BUCKET || !env.MALWARE_SCANNER_ENDPOINT || !env.MALWARE_SCANNER_TOKEN)) {
  throw new Error("Support attachment object storage and malware scanner configuration is incomplete.");
}
if (env.APPOINTMENT_SYNC_WORKER_ENABLED === "true" && !env.VOICE_TELEPHONY_ENVELOPE_KEY) {
  throw new Error("VOICE_TELEPHONY_ENVELOPE_KEY is required when appointment synchronization is enabled.");
}
if (env.AI_SOCIAL_WORKER_ENABLED === "true" && (!env.AI_SOCIAL_CREDENTIAL_ENVELOPE_KEY
  || !env.AI_TEXT_GATEWAY_ENDPOINT || !env.AI_TEXT_GATEWAY_SERVICE_TOKEN)) {
  throw new Error("AI social worker credential and text gateway configuration is incomplete.");
}
if (env.USAGE_ALERT_WORKER_ENABLED === "true" && !env.USAGE_ALERT_NOTIFICATION_ENVELOPE_KEY) {
  throw new Error("USAGE_ALERT_NOTIFICATION_ENVELOPE_KEY is required when usage alerts are enabled.");
}
if (env.COMMERCE_WORKERS_ENABLED === "true" && !env.BILLING_NOTIFICATION_ENVELOPE_KEY) {
  throw new Error("BILLING_NOTIFICATION_ENVELOPE_KEY is required when commerce workers are enabled.");
}
if (env.BILLING_WEBHOOK_WORKER_ENABLED === "true" && !env.BILLING_WEBHOOK_ENVELOPE_KEY) {
  throw new Error("BILLING_WEBHOOK_ENVELOPE_KEY is required when billing webhook processing is enabled.");
}
if (env.BILLING_FINANCIAL_RECONCILIATION_WORKER_ENABLED === "true"
  && (!env.BILLING_FINANCIAL_ENVELOPE_KEY || !env.STRIPE_SECRET_KEY || !env.TENANT_APP_URL)) {
  throw new Error("Stripe financial reconciliation configuration is incomplete.");
}

const client = createDatabaseClient(env.WORKER_DATABASE_URL);
const databaseReadiness = new DatabaseReadinessProbe(client);
const emailStore = new PostgresEmailOutboxStore(client);
const privacyStore = new PrivacyStore(client);
const flowbotWorker = new FlowbotWorkerStore(client);
const flowbotNotificationWorker = new FlowbotNotificationWorkerStore(client);
const flowSocialWorker = new FlowSocialWorkerStore(client);
const aiChatNotificationWorker = new AiChatNotificationWorkerStore(client);
const knowledgeWorker = new KnowledgeIngestionWorkerStore(client);
const supportAttachmentWorker = new SupportAttachmentWorkerStore(client);
const appointmentSyncWorker = new AppointmentSyncWorkerStore(client);
const aiIntegrationWorker = new AiIntegrationWorkerStore(client);
const delivery = env.EMAIL_DELIVERY_MODE === "http" ? createHttpEmailDelivery({
  endpoint: env.EMAIL_DELIVERY_ENDPOINT!, apiToken: env.EMAIL_DELIVERY_API_TOKEN!, from: env.EMAIL_FROM!,
}) : null;
const emailEnvelopeKey = env.AUTH_EMAIL_ENVELOPE_KEY ? parse32ByteSecret(env.AUTH_EMAIL_ENVELOPE_KEY, "AUTH_EMAIL_ENVELOPE_KEY") : null;
const privacyExportKey = env.PRIVACY_EXPORT_KEY ? parse32ByteSecret(env.PRIVACY_EXPORT_KEY, "PRIVACY_EXPORT_KEY") : null;
const flowbotIntegrationKey = env.FLOWBOT_INTEGRATION_ENVELOPE_KEY ? parse32ByteSecret(env.FLOWBOT_INTEGRATION_ENVELOPE_KEY, "FLOWBOT_INTEGRATION_ENVELOPE_KEY") : null;
const flowbotNotificationKey = env.FLOWBOT_NOTIFICATION_ENVELOPE_KEY ? parse32ByteSecret(env.FLOWBOT_NOTIFICATION_ENVELOPE_KEY, "FLOWBOT_NOTIFICATION_ENVELOPE_KEY") : null;
const flowSocialCredentialKey = socialReleaseEnabled && env.FLOWBOT_SOCIAL_CREDENTIAL_ENVELOPE_KEY
  ? parse32ByteSecret(env.FLOWBOT_SOCIAL_CREDENTIAL_ENVELOPE_KEY, "FLOWBOT_SOCIAL_CREDENTIAL_ENVELOPE_KEY") : null;
const aiNotificationKey = env.AI_NOTIFICATION_ENVELOPE_KEY ? parse32ByteSecret(env.AI_NOTIFICATION_ENVELOPE_KEY, "AI_NOTIFICATION_ENVELOPE_KEY") : null;
const aiIntegrationKey = env.AI_INTEGRATION_ENVELOPE_KEY ? parse32ByteSecret(env.AI_INTEGRATION_ENVELOPE_KEY, "AI_INTEGRATION_ENVELOPE_KEY") : null;
const aiSocialCredentialKey = socialReleaseEnabled && env.AI_SOCIAL_CREDENTIAL_ENVELOPE_KEY
  ? parse32ByteSecret(env.AI_SOCIAL_CREDENTIAL_ENVELOPE_KEY, "AI_SOCIAL_CREDENTIAL_ENVELOPE_KEY") : null;
const usageAlertNotificationKey = env.USAGE_ALERT_NOTIFICATION_ENVELOPE_KEY
  ? parse32ByteSecret(env.USAGE_ALERT_NOTIFICATION_ENVELOPE_KEY, "USAGE_ALERT_NOTIFICATION_ENVELOPE_KEY") : null;
const billingNotificationKey = env.BILLING_NOTIFICATION_ENVELOPE_KEY
  ? parse32ByteSecret(env.BILLING_NOTIFICATION_ENVELOPE_KEY, "BILLING_NOTIFICATION_ENVELOPE_KEY") : null;
const appointmentSyncKey = env.VOICE_TELEPHONY_ENVELOPE_KEY
  ? parse32ByteSecret(env.VOICE_TELEPHONY_ENVELOPE_KEY, "VOICE_TELEPHONY_ENVELOPE_KEY") : null;
const aiSocialWorker = aiSocialCredentialKey ? new AiSocialWorkerStore(client, aiSocialCredentialKey) : null;
const voiceReaper = new VoiceReaperStore(client);
const entitlementChangeWorker = new EntitlementChangeWorkerStore(client);
const usageAlertWorker = new UsageAlertWorkerStore(client);
const usageAlertNotificationWorker = new UsageAlertNotificationWorkerStore(client);
const billingNotificationWorker = new BillingNotificationWorkerStore(client);
const usagePeriodWorker = new UsagePeriodWorkerStore(client);
const trialLifecycleWorker = new TrialLifecycleWorkerStore(client);
const usageReconciliationWorker = new ProviderUsageReconciliationWorkerStore(client);
const billingWebhookWorker = new BillingWebhookStore(client);
const subscriptionLifecycleWorker = new SubscriptionLifecycleWorkerStore(client);
const billingWebhookRecoveryWorker = new BillingWebhookRecoveryWorkerStore(client);
const billingWebhookEnvelopeKey = env.BILLING_WEBHOOK_ENVELOPE_KEY
  ? parse32ByteSecret(env.BILLING_WEBHOOK_ENVELOPE_KEY, "BILLING_WEBHOOK_ENVELOPE_KEY") : null;
const financialReconciliationWorker = new FinancialReconciliationWorkerStore(client);
const financialEventReconciliationWorker = new FinancialEventReconciliationWorkerStore(client);
const billingFinancialEnvelopeKey = env.BILLING_FINANCIAL_ENVELOPE_KEY
  ? parse32ByteSecret(env.BILLING_FINANCIAL_ENVELOPE_KEY, "BILLING_FINANCIAL_ENVELOPE_KEY") : null;
const stripeFinancialProvider = env.STRIPE_SECRET_KEY && env.TENANT_APP_URL
  ? createStripePaymentProvider({ secretKey: env.STRIPE_SECRET_KEY, allowedReturnOrigins: [env.TENANT_APP_URL] }) : null;
const aiTextGateway = env.AI_TEXT_GATEWAY_ENDPOINT && env.AI_TEXT_GATEWAY_SERVICE_TOKEN
  ? createHttpTextProviderGateway({
    endpoint: env.AI_TEXT_GATEWAY_ENDPOINT, serviceToken: env.AI_TEXT_GATEWAY_SERVICE_TOKEN,
  }) : null;
/**
 * Emit response-latency and LINE reply-window metrics for one delivered turn.
 *
 * `inboundOccurredAt` is the provider's own timestamp for the inbound event, which is
 * also the moment LINE issued the `replyToken`. It only reaches the worker once
 * migration 0084 is applied; until then this emits nothing at all rather than
 * substituting a proxy such as claim time, which would silently misreport a hard SLO.
 */
function recordSocialResponseLatency(
  product: "flowbot" | "ai_chat",
  channel: "line" | "messenger" | "whatsapp",
  inboundOccurredAt: Date | null | undefined,
  usedReplyToken: boolean,
) {
  if (!inboundOccurredAt) return;
  const elapsedMs = Date.now() - inboundOccurredAt.getTime();
  emitConversationFirstResponse({ product, channel, elapsedMs });
  if (channel === "line") emitLineReplyWindowHit({ product, elapsedMs, usedReplyToken });
}

const aiSocialDelivery = createSocialDeliveryClient({
  lineApiBaseUrl: env.AI_SOCIAL_LINE_API_BASE_URL,
  metaGraphBaseUrl: env.AI_SOCIAL_META_GRAPH_BASE_URL,
});
let stopping = false;
let nextRetentionSweepAt = 0;
let nextUsageAlertSweepAt = 0;
let nextUsagePeriodSweepAt = 0;
let nextUsageReconciliationSweepAt = 0;

const healthServer = createServer(async (request, response) => {
  response.setHeader("content-type", "application/json");
  response.setHeader("cache-control", "no-store");
  if (request.method === "GET" && request.url === "/health/live") {
    response.writeHead(200).end(JSON.stringify({ status: "live" }));
    return;
  }
  if (request.method === "GET" && request.url === "/health/ready") {
    const database = stopping ? { status: "unavailable" as const, reason: "stopping" as const } : await databaseReadiness.check();
    let backlog: {
      received_count: number; processing_stale_count: number; failed_recent_count: number;
    } | { status: "skipped" } | { status: "error"; reason: string } = { status: "skipped" };
    const backlogLimit = Number(process.env.WORKER_WEBHOOK_BACKLOG_READY_LIMIT || "200");
    if (database.status === "ready" && env.BILLING_WEBHOOK_WORKER_ENABLED === "true") {
      try {
        backlog = await billingWebhookWorker.backlogStats();
      } catch (error) {
        backlog = {
          status: "error",
          reason: error instanceof Error ? error.message.slice(0, 80) : "backlog_unavailable",
        };
      }
    }
    const backlogPressure = backlog && "received_count" in backlog
      ? backlog.received_count + backlog.processing_stale_count
      : 0;
    // Missing migration / query errors warn but do not fail readiness (deploy order).
    // Extreme pending backlog fails ready so Cloud Run stops sending work to a stuck worker.
    const backlogOk = !("received_count" in backlog) || backlogPressure <= backlogLimit;
    const ready = database.status === "ready" && backlogOk;
    if ("status" in backlog && backlog.status === "error") {
      console.warn("worker_ready_backlog_unavailable", backlog);
    } else if (!backlogOk && "received_count" in backlog) {
      console.warn("worker_ready_backlog_pressure", backlog);
    }
    response.writeHead(ready ? 200 : 503).end(JSON.stringify({
      status: ready ? "ready" : "not_ready",
      database,
      webhookBacklog: backlog,
      webhookBacklogLimit: backlogLimit,
    }));
    return;
  }
  response.writeHead(404).end(JSON.stringify({ status: "not_found" }));
});
healthServer.listen(env.PORT, "0.0.0.0", () => {
  console.info("worker_health_listening", { port: env.PORT });
});

function socialErrorCode(error: unknown) {
  if (error instanceof AiTextRuntimeError || error instanceof ProviderGatewayError) return error.code;
  if (error instanceof z.ZodError) return "structured_output_invalid";
  const code = error instanceof Error ? error.message : "social_processing_failed";
  const allowed = new Set([
    "structured_output_invalid", "action_not_entitled", "grounding_invalid",
    "gateway_invalid_response", "ai_social_turn_not_available", "ai_quota_unavailable",
    "ai_safety_cap", "ai_allowance_exhausted", "ai_social_automation_suspended", "invalid_ai_social_turn_request",
    "ai_social_subject_not_active", "ai_social_idempotency_conflict",
    "ai_social_turn_not_found", "ai_social_turn_not_committable",
    "invalid_ai_structured_output", "ai_action_not_allowed", "ai_lead_action_required",
    "ai_action_not_entitled", "ai_notification_profile_unavailable",
  ]);
  return allowed.has(code) ? code : "social_processing_failed";
}

function terminalSocialError(code: string) {
  return new Set([
    "structured_output_invalid", "action_not_entitled", "grounding_invalid",
    "gateway_invalid_response", "ai_social_turn_not_available", "ai_safety_cap", "ai_allowance_exhausted",
    "ai_social_automation_suspended", "invalid_ai_social_turn_request",
    "ai_social_subject_not_active", "ai_social_idempotency_conflict",
    "ai_social_turn_not_found", "ai_social_turn_not_committable",
    "invalid_ai_structured_output", "ai_action_not_allowed", "ai_lead_action_required",
    "ai_action_not_entitled", "ai_notification_profile_unavailable",
  ]).has(code);
}

function socialResponseText(response: Readonly<{ text: string; actions?: readonly Readonly<{ label?: unknown; url?: unknown }>[] }>) {
  const links = (response.actions ?? []).flatMap((action) => typeof action.label === "string" && typeof action.url === "string"
    && (action.url.startsWith("https://") || action.url.startsWith("tel:")) ? [`${action.label}: ${action.url}`] : []);
  return links.length ? `${response.text}\n\n${links.join("\n")}` : response.text;
}

process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

do {
  if (env.BILLING_FINANCIAL_RECONCILIATION_WORKER_ENABLED === "true"
    && stripeFinancialProvider && billingFinancialEnvelopeKey) {
    const job = await financialReconciliationWorker.claim();
    if (job) {
      try {
        const invoice = await stripeFinancialProvider.retrieveInvoice(job.externalInvoiceRef);
        const serialized = JSON.stringify(invoice.raw);
        const result = await financialReconciliationWorker.record({
          jobId: job.jobId, externalInvoiceRef: invoice.externalInvoiceRef,
          status: invoice.status, currency: invoice.currency, totalMinor: invoice.totalMinor,
          amountPaidMinor: invoice.amountPaidMinor, amountRemainingMinor: invoice.amountRemainingMinor,
          payloadHash: createHash("sha256").update(serialized).digest(),
          payloadCiphertext: sealJson({ raw: invoice.raw }, billingFinancialEnvelopeKey),
        });
        console.info("financial_reconciliation_result", { jobId: job.jobId, status: result.status });
      } catch (error) {
        const code = error instanceof Error ? error.message.slice(0, 100) : "stripe_invoice_retrieval_failed";
        await financialReconciliationWorker.fail(job.jobId, code, job.attemptCount >= 12);
        console.warn("financial_reconciliation_failed", { jobId: job.jobId, errorCode: code });
      }
    }
  }
  if (env.BILLING_FINANCIAL_RECONCILIATION_WORKER_ENABLED === "true"
    && stripeFinancialProvider && billingFinancialEnvelopeKey) {
    const job = await financialEventReconciliationWorker.claim();
    if (job) {
      try {
        const evidence = await stripeFinancialProvider.retrieveFinancialEvent(job.evidenceKind, job.externalRef);
        const serialized = JSON.stringify(evidence.raw);
        const result = await financialEventReconciliationWorker.record({
          jobId: job.jobId, externalRef: evidence.externalRef, relatedRef: evidence.relatedRef,
          status: evidence.status, currency: evidence.currency, totalMinor: evidence.totalMinor,
          refundMinor: evidence.refundMinor, creditMinor: evidence.creditMinor,
          payloadHash: createHash("sha256").update(serialized).digest(),
          payloadCiphertext: sealJson({ raw: evidence.raw }, billingFinancialEnvelopeKey),
        });
        console.info("financial_event_reconciliation_result", {
          jobId: job.jobId, evidenceKind: job.evidenceKind, status: result.status,
        });
      } catch (error) {
        const code = error instanceof Error ? error.message.slice(0, 100) : "stripe_financial_event_retrieval_failed";
        await financialEventReconciliationWorker.fail(job.jobId, code, job.attemptCount >= 12);
        console.warn("financial_event_reconciliation_failed", {
          jobId: job.jobId, evidenceKind: job.evidenceKind, errorCode: code,
        });
      }
    }
  }
  if (env.BILLING_WEBHOOK_WORKER_ENABLED === "true" && billingWebhookEnvelopeKey) {
    const claimed = await billingWebhookWorker.claim();
    if (claimed) {
      try {
        const envelope = openJson<{ rawBody: string }>(claimed.payloadCiphertext, billingWebhookEnvelopeKey);
        const parsed = z.object({ data: z.object({ object: z.unknown() }) })
          .parse(JSON.parse(envelope.rawBody));
        const applied = await billingWebhookWorker.apply(claimed.webhookEventId, parsed.data.object);
        console.info("billing_webhook_result", { webhookEventId: claimed.webhookEventId, status: applied.status });
        console.info(JSON.stringify({
          severity: "INFO", message: "commerce_metric", metric: "webhook_result", outcome: applied.status,
        }));
      } catch (error) {
        const errorCode = error instanceof Error ? error.message.slice(0, 100) : "billing_webhook_processing_failed";
        await billingWebhookWorker.fail(claimed.webhookEventId, errorCode, claimed.attemptCount >= 12);
        console.warn("billing_webhook_failed", { webhookEventId: claimed.webhookEventId, errorCode });
        console.info(JSON.stringify({
          severity: "INFO", message: "commerce_metric", metric: "webhook_result", outcome: "failed", errorCode,
        }));
      }
    }
  }
  if (env.SUBSCRIPTION_LIFECYCLE_WORKER_ENABLED === "true") {
    const transition = await subscriptionLifecycleWorker.applyNext();
    if (transition) console.info("subscription_lifecycle_transition", transition);
  }
  if (env.BILLING_WEBHOOK_RECOVERY_WORKER_ENABLED === "true"
    && stripeFinancialProvider && billingFinancialEnvelopeKey) {
    const recovery = await billingWebhookRecoveryWorker.claim();
    if (recovery) {
      try {
        const evidence = await stripeFinancialProvider.retrieveWebhookEvent(recovery.externalEventId);
        const serialized = JSON.stringify(evidence.raw);
        const result = await billingWebhookRecoveryWorker.record({
          jobId: recovery.jobId, externalEventId: evidence.externalEventId,
          eventType: evidence.eventType, occurredAt: evidence.occurredAt,
          payloadHash: createHash("sha256").update(serialized).digest(),
          payloadCiphertext: sealJson({ raw: evidence.raw }, billingFinancialEnvelopeKey),
        });
        console.info("billing_webhook_recovery_evidence", { jobId: recovery.jobId, status: result.status });
      } catch (error) {
        const code = error instanceof Error ? error.message.slice(0, 100) : "stripe_event_retrieval_failed";
        await billingWebhookRecoveryWorker.fail(recovery.jobId, code, recovery.attemptCount >= 12);
        console.warn("billing_webhook_recovery_failed", { jobId: recovery.jobId, errorCode: code });
      }
    }
  }
  if (env.USAGE_PERIOD_WORKER_ENABLED === "true" && Date.now() >= nextUsagePeriodSweepAt) {
    const result = await usagePeriodWorker.roll();
    const expiredTrials = await trialLifecycleWorker.reconcileExpired();
    nextUsagePeriodSweepAt = Date.now() + 3_600_000;
    if (result.periodsCreated > 0 || result.reservationsReleased > 0 || expiredTrials > 0) {
      console.info("usage_period_rollover_complete", { ...result, expiredTrials });
    }
  }
  if (env.USAGE_RECONCILIATION_WORKER_ENABLED === "true" && Date.now() >= nextUsageReconciliationSweepAt) {
    const result = await usageReconciliationWorker.reconcile();
    nextUsageReconciliationSweepAt = Date.now() + 3_600_000;
    if (result.matched > 0 || result.attention > 0) {
      console.info("provider_usage_reconciliation_complete", result);
    }
  }
  if (env.USAGE_ALERT_WORKER_ENABLED === "true" && Date.now() >= nextUsageAlertSweepAt) {
    const generated = await usageAlertWorker.generate();
    nextUsageAlertSweepAt = Date.now() + 3_600_000;
    if (generated > 0) console.info("usage_alerts_generated", { generated });
  }
  if (env.USAGE_ALERT_WORKER_ENABLED === "true" && delivery && usageAlertNotificationKey) {
    const result = await runUsageAlertEmail(
      usageAlertNotificationWorker, delivery, usageAlertNotificationKey,
    );
    if (result.status !== "idle") console.info("usage_alert_email_result", result);
  }
  if (delivery && billingNotificationKey) {
    const result = await runCustomerBillingEmail(billingNotificationWorker, delivery, billingNotificationKey);
    if (result.status !== "idle") console.info("billing_customer_email_result", result);
  }
  if (env.ENTITLEMENT_CHANGE_WORKER_ENABLED === "true") {
    const applied = await entitlementChangeWorker.applyNext();
    if (applied) console.info("entitlement_change_result", applied);
  }
  if (env.PRIVACY_WORKER_ENABLED === "true" && Date.now() >= nextRetentionSweepAt) {
    const result = await privacyStore.applyRetention();
    nextRetentionSweepAt = Date.now() + 3_600_000;
    if (result.messagesRedacted || result.voiceTurnsRedacted) {
      console.info("retention_sweep_complete", result);
    }
  }
  if (env.VOICE_REAPER_ENABLED === "true") {
    const now = new Date();
    const reaped = await voiceReaper.reap({
      now,
      staleBefore: new Date(now.getTime() - env.VOICE_REAPER_STALE_SECONDS * 1_000),
      limit: env.VOICE_REAPER_BATCH_SIZE,
    });
    if (reaped.length) console.info("voice_sessions_reaped", { count: reaped.length });
  }
  if (delivery && emailEnvelopeKey) {
    const result = await runEmailBatch(emailStore, delivery, emailEnvelopeKey);
    if (result.claimed > 0) console.info("email_batch_complete", result);
  }
  if (env.PRIVACY_WORKER_ENABLED === "true" && privacyExportKey) {
    const result = await privacyStore.processNext(privacyExportKey);
    if (result.status === "completed") console.info("privacy_job_complete", { jobId: result.jobId, jobType: result.jobType });
  }
  if (env.FLOWBOT_WORKER_ENABLED === "true") {
    const result = await flowbotWorker.processNextTimer();
    if (result.status !== "idle") console.info("flowbot_timer_result", result);
    if (flowbotIntegrationKey) {
      const dispatch = await flowbotWorker.claimNextDispatch();
      if (dispatch) {
        try {
          await deliverFlowbotIntegration(dispatch, flowbotIntegrationKey);
          await flowbotWorker.completeDispatch(dispatch, true);
          console.info("flowbot_dispatch_succeeded", { dispatchId: dispatch.dispatchId });
        } catch (error) {
          const errorCode = error instanceof Error ? error.message.slice(0, 100) : "delivery_failed";
          if (dispatch.attemptCount >= 10) await flowbotWorker.completeDispatch(dispatch, false, errorCode);
          else await flowbotWorker.finishDispatch(dispatch.dispatchId, false, errorCode);
          console.warn("flowbot_dispatch_failed", { dispatchId: dispatch.dispatchId, errorCode });
        }
      }
    }
    if (delivery && flowbotNotificationKey) {
      const notification = await runFlowbotMerchantEmail(flowbotNotificationWorker, delivery, flowbotNotificationKey);
      if (notification.status !== "idle") console.info("flowbot_notification_result", notification);
    }
  }
  if (env.FLOWBOT_SOCIAL_WORKER_ENABLED === "true" && flowSocialCredentialKey) {
    const claimed = await flowSocialWorker.claim();
    if (claimed) {
      try {
        if (!claimed.processing_allowed) throw new Error("flow_social_authority_unavailable");
        await flowSocialWorker.processInbound(claimed);
        console.info("flow_social_inbound_processed", { receiptId: claimed.receipt_id, channel: claimed.channel });
      } catch (error) {
        const code = error instanceof Error ? error.message.slice(0, 100) : "flow_social_processing_failed";
        const deadLetter = ["flow_social_authority_unavailable", "flow_social_subject_not_active"].includes(code) || claimed.attempt_count >= 10;
        await flowSocialWorker.finish(claimed.outbox_id, false, code, deadLetter).catch(() => undefined);
        console.warn("flow_social_inbound_failed", { receiptId: claimed.receipt_id, channel: claimed.channel, code, deadLetter });
      }
    }
    const deliveryClaim = await flowSocialWorker.claimDelivery();
    if (deliveryClaim) {
      let attemptedCount = 0;
      try {
        if (!deliveryClaim.delivery_allowed) throw new Error("flow_social_authority_unavailable");
        const credentials = socialCredentialSchema.parse(openJson<unknown>(deliveryClaim.credential_ciphertext, flowSocialCredentialKey));
        const recipient = openJson<{ value: string }>(deliveryClaim.recipient_ciphertext, flowSocialCredentialKey).value;
        const replyToken = deliveryClaim.reply_token_ciphertext
          ? openJson<{ value: string }>(deliveryClaim.reply_token_ciphertext, flowSocialCredentialKey).value : null;
        const input = flowMessagesToSocialReplyInput({ recipient, replyToken,
          messages: deliveryClaim.response_json.messages as StructuredFlowMessage[] });
        const rendered = resumeSocialReply(renderSocialReply(deliveryClaim.channel, input), deliveryClaim.delivered_part_count);
        attemptedCount = "body" in rendered ? rendered.body.messages.length : rendered.bodies.length;
        const delivered = await aiSocialDelivery.deliver(deliveryClaim.channel, credentials, rendered);
        await flowSocialWorker.finishDelivery({ deliveryId: deliveryClaim.delivery_id, delivered: true,
          externalMessageIds: delivered.externalMessageIds, completedPartCount: delivered.deliveredCount, safeErrorCode: null });
        emitChannelDeliveryResult({ product: "flowbot", channel: deliveryClaim.channel, outcome: "succeeded",
          attemptCount: deliveryClaim.attempt_count });
        recordSocialResponseLatency("flowbot", deliveryClaim.channel, deliveryClaim.inbound_occurred_at, replyToken !== null);
        console.info("flow_social_delivery_succeeded", { deliveryId: deliveryClaim.delivery_id, channel: deliveryClaim.channel });
      } catch (error) {
        const partial = error instanceof SocialDeliveryError ? error : null;
        const code = error instanceof Error ? error.message.slice(0, 100) : "channel_delivery_failed";
        const deadLetter = ["credential_reauthorization_required", "flow_social_authority_unavailable"].includes(code) || deliveryClaim.attempt_count >= 10;
        await flowSocialWorker.finishDelivery({ deliveryId: deliveryClaim.delivery_id, delivered: false,
          externalMessageIds: partial?.externalMessageIds ?? [], completedPartCount: partial?.deliveredCount ?? 0,
          safeErrorCode: code, deadLetter }).catch(() => undefined);
        emitChannelDeliveryResult({ product: "flowbot", channel: deliveryClaim.channel, outcome: "failed",
          errorClass: deliveryErrorClass(code), deadLetter, attemptCount: deliveryClaim.attempt_count });
        console.warn("flow_social_delivery_failed", { deliveryId: deliveryClaim.delivery_id, channel: deliveryClaim.channel, code, attemptedCount, deadLetter });
      }
    }
  }
  if (env.AI_WORKER_ENABLED === "true" && delivery && aiNotificationKey) {
    const notification = await runAiChatMerchantEmail(aiChatNotificationWorker, delivery, aiNotificationKey);
    if (notification.status !== "idle") console.info("ai_chat_notification_result", notification);
  }
  if (env.KNOWLEDGE_WORKER_ENABLED === "true") {
    const processed = await runKnowledgeIngestionBatch(knowledgeWorker, {
      bucket: env.KNOWLEDGE_OBJECT_BUCKET!, malwareScannerEndpoint: env.MALWARE_SCANNER_ENDPOINT!,
      malwareScannerToken: env.MALWARE_SCANNER_TOKEN!,
    });
    if (processed > 0) console.info("knowledge_ingestion_batch_complete", { processed });
  }
  if (env.SUPPORT_ATTACHMENT_WORKER_ENABLED === "true") {
    const processed = await runSupportAttachmentBatch(supportAttachmentWorker, {
      bucket: env.KNOWLEDGE_OBJECT_BUCKET!, malwareScannerEndpoint: env.MALWARE_SCANNER_ENDPOINT!,
      malwareScannerToken: env.MALWARE_SCANNER_TOKEN!,
    });
    if (processed > 0) console.info("support_attachment_batch_complete", { processed });
  }
  if (env.APPOINTMENT_SYNC_WORKER_ENABLED === "true" && appointmentSyncKey) {
    const claim = await appointmentSyncWorker.claim();
    if (claim) {
      try {
        const externalEventRef = await deliverAppointmentSync(claim, appointmentSyncKey);
        if (!(await appointmentSyncWorker.finish(claim.job_id, { succeeded: true, externalEventRef }))) {
          throw new Error("calendar_job_state_conflict");
        }
        console.info("appointment_sync_succeeded", { jobId: claim.job_id, operation: claim.operation });
      } catch (error) {
        const safeErrorCode = appointmentSyncErrorCode(error);
        await appointmentSyncWorker.finish(claim.job_id, { succeeded: false, safeErrorCode }).catch(() => undefined);
        console.warn("appointment_sync_failed", { jobId: claim.job_id, operation: claim.operation, safeErrorCode });
      }
    }
  }
  if (env.AI_INTEGRATION_WORKER_ENABLED === "true" && aiIntegrationKey) {
    const claim = await aiIntegrationWorker.claim();
    if (claim) {
      try {
        await deliverAiIntegration(claim, aiIntegrationKey);
        await aiIntegrationWorker.finish(claim.job_id, true);
        console.info("ai_integration_delivery_succeeded", { jobId: claim.job_id, kind: claim.integration_kind });
      } catch (error) {
        const code = error instanceof Error && /^[a-z0-9_]{2,100}$/.test(error.message) ? error.message : "integration_delivery_failed";
        await aiIntegrationWorker.finish(claim.job_id, false, code);
        console.warn("ai_integration_delivery_failed", { jobId: claim.job_id, kind: claim.integration_kind, code });
      }
    }
  }
  if (env.AI_SOCIAL_WORKER_ENABLED === "true" && aiSocialWorker && aiTextGateway) {
    const claimed = await aiSocialWorker.claim();
    if (claimed) {
      try {
        if (claimed.eventType !== "inbound.message") {
          if (!(await aiSocialWorker.applyControlEvent(claimed.outboxId))) {
            throw new Error("social_control_event_failed");
          }
        } else if (!claimed.processingAllowed) {
          await aiSocialWorker.finish(claimed.outboxId, false, "social_authority_unavailable", true);
        } else if (!claimed.text) {
          await aiSocialWorker.finish(claimed.outboxId, false, "social_message_empty", true);
        } else {
          const context = await aiSocialWorker.beginTurn(claimed);
          if (context.replayResponse) {
            await aiSocialWorker.finish(claimed.outboxId, true, null);
          } else {
            const generated = await generateAiTurn({
              gateway: aiTextGateway, inputId: claimed.receiptId,
              message: claimed.text, context,
            });
            await aiSocialWorker.commitTurn({
              outboxId: claimed.outboxId, output: generated.output,
              publicResponse: generated.publicResponse, nativeUsage: generated.nativeUsage,
            });
          }
          console.info("ai_social_inbound_processed", { receiptId: claimed.receiptId, channel: claimed.channel });
        }
      } catch (error) {
        const errorCode = socialErrorCode(error);
        const deadLetter = terminalSocialError(errorCode) || claimed.attemptCount >= 10;
        if (deadLetter && claimed.eventType === "inbound.message") {
          await aiSocialWorker.failTurn(claimed.outboxId, errorCode).catch(() => undefined);
        }
        await aiSocialWorker.finish(claimed.outboxId, false, errorCode, deadLetter).catch(() => undefined);
        console.warn("ai_social_inbound_failed", {
          receiptId: claimed.receiptId, channel: claimed.channel,
          errorCode, deadLetter,
        });
      }
    }
    const deliveryClaim = await aiSocialWorker.claimDelivery();
    if (deliveryClaim) {
      const feeClassification = deliveryClaim.channel === "line"
        ? deliveryClaim.replyToken ? "reply" as const : "push" as const
        : "service_window_reply" as const;
      let attemptedQuantity = 0;
      try {
        if (!deliveryClaim.deliveryAllowed || !deliveryClaim.recipient || !deliveryClaim.credentials) {
          const safeErrorCode = deliveryClaim.serviceWindowOpen
            ? "social_authority_unavailable" : "social_service_window_closed";
          await aiSocialWorker.finishDelivery({
            deliveryId: deliveryClaim.deliveryId, delivered: false, externalMessageIds: [],
            feeClassification, attemptedQuantity: 0,
            safeErrorCode, deadLetter: true,
          });
        } else {
          const credentials = socialCredentialSchema.parse(deliveryClaim.credentials);
          const rendered = renderSocialReply(deliveryClaim.channel, {
            recipient: deliveryClaim.recipient, replyToken: deliveryClaim.replyToken,
            text: socialResponseText(deliveryClaim.response), quickReplies: deliveryClaim.response.quickReplies,
          });
          const pendingRendered = resumeSocialReply(rendered, deliveryClaim.deliveredPartCount);
          attemptedQuantity = "body" in pendingRendered
            ? pendingRendered.body.messages.length : pendingRendered.bodies.length;
          const result = await aiSocialDelivery.deliver(
            deliveryClaim.channel, credentials, pendingRendered,
          );
          await aiSocialWorker.finishDelivery({
            deliveryId: deliveryClaim.deliveryId, delivered: true,
            externalMessageIds: result.externalMessageIds,
            feeClassification, attemptedQuantity,
            completedPartCount: result.deliveredCount, safeErrorCode: null,
          });
          emitChannelDeliveryResult({ product: "ai_chat", channel: deliveryClaim.channel, outcome: "succeeded",
            attemptCount: deliveryClaim.attemptCount });
          recordSocialResponseLatency("ai_chat", deliveryClaim.channel, deliveryClaim.inboundOccurredAt,
            deliveryClaim.replyToken !== null);
          console.info("ai_social_delivery_succeeded", {
            deliveryId: deliveryClaim.deliveryId, channel: deliveryClaim.channel,
          });
        }
      } catch (error) {
        const partial = error instanceof SocialDeliveryError ? error : null;
        const code = error instanceof z.ZodError ? "credential_reauthorization_required"
          : error instanceof Error && [
          "credential_reauthorization_required", "channel_rate_limited", "channel_delivery_failed",
        ].includes(error.message) ? error.message : "channel_delivery_failed";
        const deadLetter = code === "credential_reauthorization_required" || deliveryClaim.attemptCount >= 10;
        await aiSocialWorker.finishDelivery({
          deliveryId: deliveryClaim.deliveryId, delivered: false,
          externalMessageIds: partial?.externalMessageIds ?? [],
          feeClassification, attemptedQuantity: partial?.attemptedCount ?? attemptedQuantity,
          completedPartCount: partial?.deliveredCount ?? 0,
          safeErrorCode: code, deadLetter,
        }).catch(() => undefined);
        emitChannelDeliveryResult({ product: "ai_chat", channel: deliveryClaim.channel, outcome: "failed",
          errorClass: deliveryErrorClass(code), deadLetter, attemptCount: deliveryClaim.attemptCount });
        console.warn("ai_social_delivery_failed", {
          deliveryId: deliveryClaim.deliveryId, channel: deliveryClaim.channel, code, deadLetter,
        });
      }
    }
  }
  if (env.EMAIL_WORKER_ONCE === "true") break;
  await new Promise((resolve) => setTimeout(resolve, env.EMAIL_WORKER_INTERVAL_MS));
} while (!stopping);

await client.end({ timeout: 5 });
await new Promise<void>((resolve) => healthServer.close(() => resolve()));
