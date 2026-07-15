import { parse32ByteSecret } from "@djay/auth";
import { AiTextRuntimeError, generateAiTurn } from "@djay/ai-chat-runtime";
import {
  AiChatNotificationWorkerStore, AiSocialWorkerStore, createDatabaseClient, FlowbotNotificationWorkerStore, FlowbotWorkerStore,
  PostgresEmailOutboxStore, PrivacyStore, VoiceReaperStore,
} from "@djay/db";
import { createHttpEmailDelivery, runAiChatMerchantEmail, runEmailBatch, runFlowbotMerchantEmail } from "@djay/notifications";
import { createHttpTextProviderGateway, ProviderGatewayError } from "@djay/provider-gateway";
import { createSocialDeliveryClient, renderSocialReply, resumeSocialReply, SocialDeliveryError, socialCredentialSchema } from "@djay/channel-adapters";
import { z } from "zod";
import { deliverFlowbotIntegration } from "./flowbot-integration";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
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
  AI_WORKER_ENABLED: z.enum(["true", "false"]).default("false"),
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
}).passthrough();

const env = envSchema.parse(process.env);
if (env.NODE_ENV === "production" && env.EMAIL_DELIVERY_MODE !== "http") throw new Error("EMAIL_DELIVERY_MODE=http is required in production.");
if (env.NODE_ENV === "production" && env.PRIVACY_WORKER_ENABLED !== "true") throw new Error("PRIVACY_WORKER_ENABLED=true is required in production.");
if (env.NODE_ENV === "production" && env.FLOWBOT_WORKER_ENABLED !== "true") throw new Error("FLOWBOT_WORKER_ENABLED=true is required in production.");
if (env.NODE_ENV === "production" && env.AI_WORKER_ENABLED !== "true") throw new Error("AI_WORKER_ENABLED=true is required in production.");
if (env.NODE_ENV === "production" && env.AI_SOCIAL_WORKER_ENABLED !== "true") throw new Error("AI_SOCIAL_WORKER_ENABLED=true is required in production.");
if (env.EMAIL_DELIVERY_MODE === "http" && (!env.EMAIL_DELIVERY_ENDPOINT || !env.EMAIL_DELIVERY_API_TOKEN || !env.EMAIL_FROM || !env.AUTH_EMAIL_ENVELOPE_KEY)) {
  throw new Error("HTTP email delivery configuration is incomplete.");
}
if (env.PRIVACY_WORKER_ENABLED === "true" && !env.PRIVACY_EXPORT_KEY) throw new Error("PRIVACY_EXPORT_KEY is required when privacy processing is enabled.");
if (env.FLOWBOT_WORKER_ENABLED === "true" && !env.FLOWBOT_INTEGRATION_ENVELOPE_KEY) throw new Error("FLOWBOT_INTEGRATION_ENVELOPE_KEY is required when FlowBot processing is enabled.");
if (env.FLOWBOT_WORKER_ENABLED === "true" && !env.FLOWBOT_NOTIFICATION_ENVELOPE_KEY) throw new Error("FLOWBOT_NOTIFICATION_ENVELOPE_KEY is required when FlowBot processing is enabled.");
if (env.AI_WORKER_ENABLED === "true" && !env.AI_NOTIFICATION_ENVELOPE_KEY) throw new Error("AI_NOTIFICATION_ENVELOPE_KEY is required when AI processing is enabled.");
if (env.AI_SOCIAL_WORKER_ENABLED === "true" && (!env.AI_SOCIAL_CREDENTIAL_ENVELOPE_KEY
  || !env.AI_TEXT_GATEWAY_ENDPOINT || !env.AI_TEXT_GATEWAY_SERVICE_TOKEN)) {
  throw new Error("AI social worker credential and text gateway configuration is incomplete.");
}

const client = createDatabaseClient(env.WORKER_DATABASE_URL);
const emailStore = new PostgresEmailOutboxStore(client);
const privacyStore = new PrivacyStore(client);
const flowbotWorker = new FlowbotWorkerStore(client);
const flowbotNotificationWorker = new FlowbotNotificationWorkerStore(client);
const aiChatNotificationWorker = new AiChatNotificationWorkerStore(client);
const delivery = env.EMAIL_DELIVERY_MODE === "http" ? createHttpEmailDelivery({
  endpoint: env.EMAIL_DELIVERY_ENDPOINT!, apiToken: env.EMAIL_DELIVERY_API_TOKEN!, from: env.EMAIL_FROM!,
}) : null;
const emailEnvelopeKey = env.AUTH_EMAIL_ENVELOPE_KEY ? parse32ByteSecret(env.AUTH_EMAIL_ENVELOPE_KEY, "AUTH_EMAIL_ENVELOPE_KEY") : null;
const privacyExportKey = env.PRIVACY_EXPORT_KEY ? parse32ByteSecret(env.PRIVACY_EXPORT_KEY, "PRIVACY_EXPORT_KEY") : null;
const flowbotIntegrationKey = env.FLOWBOT_INTEGRATION_ENVELOPE_KEY ? parse32ByteSecret(env.FLOWBOT_INTEGRATION_ENVELOPE_KEY, "FLOWBOT_INTEGRATION_ENVELOPE_KEY") : null;
const flowbotNotificationKey = env.FLOWBOT_NOTIFICATION_ENVELOPE_KEY ? parse32ByteSecret(env.FLOWBOT_NOTIFICATION_ENVELOPE_KEY, "FLOWBOT_NOTIFICATION_ENVELOPE_KEY") : null;
const aiNotificationKey = env.AI_NOTIFICATION_ENVELOPE_KEY ? parse32ByteSecret(env.AI_NOTIFICATION_ENVELOPE_KEY, "AI_NOTIFICATION_ENVELOPE_KEY") : null;
const aiSocialCredentialKey = env.AI_SOCIAL_CREDENTIAL_ENVELOPE_KEY
  ? parse32ByteSecret(env.AI_SOCIAL_CREDENTIAL_ENVELOPE_KEY, "AI_SOCIAL_CREDENTIAL_ENVELOPE_KEY") : null;
const aiSocialWorker = aiSocialCredentialKey ? new AiSocialWorkerStore(client, aiSocialCredentialKey) : null;
const voiceReaper = new VoiceReaperStore(client);
const aiTextGateway = env.AI_TEXT_GATEWAY_ENDPOINT && env.AI_TEXT_GATEWAY_SERVICE_TOKEN
  ? createHttpTextProviderGateway({
    endpoint: env.AI_TEXT_GATEWAY_ENDPOINT, serviceToken: env.AI_TEXT_GATEWAY_SERVICE_TOKEN,
  }) : null;
const aiSocialDelivery = createSocialDeliveryClient({
  lineApiBaseUrl: env.AI_SOCIAL_LINE_API_BASE_URL,
  metaGraphBaseUrl: env.AI_SOCIAL_META_GRAPH_BASE_URL,
});
let stopping = false;

function socialErrorCode(error: unknown) {
  if (error instanceof AiTextRuntimeError || error instanceof ProviderGatewayError) return error.code;
  if (error instanceof z.ZodError) return "structured_output_invalid";
  const code = error instanceof Error ? error.message : "social_processing_failed";
  const allowed = new Set([
    "structured_output_invalid", "action_not_entitled", "grounding_invalid",
    "gateway_invalid_response", "ai_social_turn_not_available", "ai_quota_unavailable",
    "ai_safety_cap", "ai_social_automation_suspended", "invalid_ai_social_turn_request",
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
    "gateway_invalid_response", "ai_social_turn_not_available", "ai_safety_cap",
    "ai_social_automation_suspended", "invalid_ai_social_turn_request",
    "ai_social_subject_not_active", "ai_social_idempotency_conflict",
    "ai_social_turn_not_found", "ai_social_turn_not_committable",
    "invalid_ai_structured_output", "ai_action_not_allowed", "ai_lead_action_required",
    "ai_action_not_entitled", "ai_notification_profile_unavailable",
  ]).has(code);
}

process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

do {
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
  if (env.AI_WORKER_ENABLED === "true" && delivery && aiNotificationKey) {
    const notification = await runAiChatMerchantEmail(aiChatNotificationWorker, delivery, aiNotificationKey);
    if (notification.status !== "idle") console.info("ai_chat_notification_result", notification);
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
            text: deliveryClaim.response.text, quickReplies: deliveryClaim.response.quickReplies,
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
