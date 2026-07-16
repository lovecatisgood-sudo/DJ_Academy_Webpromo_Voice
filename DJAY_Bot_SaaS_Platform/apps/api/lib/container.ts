import {
  createLoginService,
  createInvitationService,
  createOwnershipService,
  createRecoveryService,
  createRegistrationService,
  createSessionService,
  createTenantMfaService,
  hashPassword,
  parse32ByteSecret,
} from "@djay/auth";
import { AiTextRuntime } from "@djay/ai-chat-runtime";
import { createSocialDeliveryClient } from "@djay/channel-adapters";
import {
  AiChatRuntimeStore,
  AiChatStore,
  AiSocialConnectionStore,
  AiSocialRuntimeStore,
  createDatabaseClient,
  DatabaseReadinessProbe,
  BillingWebhookStore,
  FlowBotStore,
  TenantFlowbotNotificationStore,
  TenantAiNotificationStore,
  FlowbotRuntimeStore,
  PlatformFlowbotIntegrationStore,
  PlatformCommerceStore,
  PlatformOperationsStore,
  PlatformRecoveryStore,
  PlatformVoiceOperationsStore,
  PlatformSupportStore,
  PostgresAuthStore,
  PostgresCatalogStore,
  PostgresPlatformAuthStore,
  PrivacyStore,
  TenantCommerceStore,
  TenantFlowbotIntegrationStore,
  SharedDomainStore,
  TenantWorkspaceStore,
  VoiceRuntimeStore,
  VoiceDeploymentStore,
} from "@djay/db";
import { createPlatformAuthService } from "@djay/platform-auth";
import { createHttpTextProviderGateway } from "@djay/provider-gateway";
import { z } from "zod";
import { assertApiProductionUrlPolicy } from "./environment-policy";
import { loadLegalDocuments } from "./legal-documents";

const envSchema = z.object({
  AUTH_DATABASE_URL: z.string().url(),
  TENANT_DATABASE_URL: z.string().url(),
  PLATFORM_DATABASE_URL: z.string().url(),
  PUBLIC_APP_URL: z.string().url(),
  TENANT_APP_URL: z.string().url(),
  PLATFORM_APP_URL: z.string().url(),
  API_APP_URL: z.string().url().optional(),
  AUTH_REQUEST_HASH_KEY: z.string().min(40),
  AUTH_EMAIL_ENVELOPE_KEY: z.string().min(40),
  AUTH_RATE_LIMIT_KEY: z.string().min(40),
  AUTH_MFA_ENCRYPTION_KEY: z.string().min(40),
  AUTH_MFA_RECOVERY_HASH_KEY: z.string().min(40),
  PLATFORM_MFA_ENCRYPTION_KEY: z.string().min(40),
  PLATFORM_RECOVERY_HASH_KEY: z.string().min(40),
  BILLING_DATABASE_URL: z.string().url().optional(),
  BILLING_WEBHOOK_SECRET: z.string().min(40).optional(),
  BILLING_WEBHOOK_ENVELOPE_KEY: z.string().min(40).optional(),
  PRIVACY_EXPORT_KEY: z.string().min(40).optional(),
  FLOWBOT_DATABASE_URL: z.string().url().optional(),
  FLOWBOT_INTEGRATION_ENVELOPE_KEY: z.string().min(40).optional(),
  FLOWBOT_NOTIFICATION_ENVELOPE_KEY: z.string().min(40).optional(),
  AI_DATABASE_URL: z.string().url().optional(),
  AI_TEXT_GATEWAY_ENDPOINT: z.string().url().optional(),
  AI_TEXT_GATEWAY_SERVICE_TOKEN: z.string().min(32).optional(),
  AI_NOTIFICATION_ENVELOPE_KEY: z.string().min(40).optional(),
  AI_SOCIAL_CREDENTIAL_ENVELOPE_KEY: z.string().min(40).optional(),
  AI_SOCIAL_SUBJECT_HASH_KEY: z.string().min(40).optional(),
  AI_SOCIAL_LINE_API_BASE_URL: z.string().url().default("https://api.line.me/"),
  AI_SOCIAL_META_GRAPH_BASE_URL: z.string().url().default("https://graph.facebook.com/v23.0/"),
  VOICE_DATABASE_URL: z.string().url().optional(),
  VOICE_RUNTIME_ENABLED: z.enum(["true", "false"]).default("false"),
  VOICE_GATEWAY_URL: z.string().url().refine((value) => ["ws:", "wss:"].includes(new URL(value).protocol)).optional(),
  VOICE_AUTHORIZATION_SERVICE_TOKEN: z.string().min(32).optional(),
  VOICE_SESSION_GRANT_TTL_SECONDS: z.coerce.number().int().min(15).max(300).default(60),
  VOICE_RECONNECT_MAX_ATTEMPTS: z.coerce.number().int().min(0).max(10).default(3),
  VOICE_RECONNECT_BACKOFF_MS: z.coerce.number().int().min(100).max(30_000).default(500),
  OPERATIONS_ENVIRONMENT: z.enum(["staging", "production"]).default("staging"),
  OPERATIONS_RELEASE_VERSION: z.string().trim().min(3).max(120).default("local-unreleased"),
  OPERATIONS_INGEST_TOKEN: z.string().min(32).optional(),
  LEGAL_DOCUMENTS_FILE: z.string().trim().min(1).optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
}).passthrough();

export type Services = Awaited<ReturnType<typeof buildServices>>;
let servicesPromise: Promise<Services> | undefined;

async function buildServices() {
  const env = envSchema.parse(process.env);
  assertApiProductionUrlPolicy(env);
  const client = createDatabaseClient(env.AUTH_DATABASE_URL);
  const tenantClient = createDatabaseClient(env.TENANT_DATABASE_URL);
  const platformClient = createDatabaseClient(env.PLATFORM_DATABASE_URL);
  const billingClient = env.BILLING_DATABASE_URL ? createDatabaseClient(env.BILLING_DATABASE_URL) : null;
  if (env.NODE_ENV === "production" && !env.PRIVACY_EXPORT_KEY) throw new Error("PRIVACY_EXPORT_KEY is required in production.");
  if (env.NODE_ENV === "production" && !env.FLOWBOT_DATABASE_URL) throw new Error("FLOWBOT_DATABASE_URL is required in production.");
  if (env.NODE_ENV === "production" && !env.FLOWBOT_INTEGRATION_ENVELOPE_KEY) throw new Error("FLOWBOT_INTEGRATION_ENVELOPE_KEY is required in production.");
  if (env.NODE_ENV === "production" && !env.FLOWBOT_NOTIFICATION_ENVELOPE_KEY) throw new Error("FLOWBOT_NOTIFICATION_ENVELOPE_KEY is required in production.");
  if (env.NODE_ENV === "production" && !env.AI_DATABASE_URL) throw new Error("AI_DATABASE_URL is required in production.");
  if (env.NODE_ENV === "production" && !env.AI_TEXT_GATEWAY_ENDPOINT) throw new Error("AI_TEXT_GATEWAY_ENDPOINT is required in production.");
  if (env.NODE_ENV === "production" && !env.AI_TEXT_GATEWAY_SERVICE_TOKEN) throw new Error("AI_TEXT_GATEWAY_SERVICE_TOKEN is required in production.");
  if (env.NODE_ENV === "production" && !env.AI_NOTIFICATION_ENVELOPE_KEY) throw new Error("AI_NOTIFICATION_ENVELOPE_KEY is required in production.");
  if (env.NODE_ENV === "production" && !env.AI_SOCIAL_CREDENTIAL_ENVELOPE_KEY) throw new Error("AI_SOCIAL_CREDENTIAL_ENVELOPE_KEY is required in production.");
  if (env.NODE_ENV === "production" && !env.AI_SOCIAL_SUBJECT_HASH_KEY) throw new Error("AI_SOCIAL_SUBJECT_HASH_KEY is required in production.");
  if (env.VOICE_RUNTIME_ENABLED === "true" && (!env.VOICE_DATABASE_URL || !env.VOICE_GATEWAY_URL || !env.VOICE_AUTHORIZATION_SERVICE_TOKEN)) {
    throw new Error("Voice database, gateway, and authorization configuration is required in production.");
  }
  if (env.NODE_ENV === "production" && !env.OPERATIONS_INGEST_TOKEN) {
    throw new Error("OPERATIONS_INGEST_TOKEN is required in production.");
  }
  const store = new PostgresAuthStore(client);
  const platformStore = new PostgresPlatformAuthStore(platformClient);
  const emailEnvelopeKey = parse32ByteSecret(env.AUTH_EMAIL_ENVELOPE_KEY, "AUTH_EMAIL_ENVELOPE_KEY");
  const aiRuntimeStore = env.AI_DATABASE_URL
    ? new AiChatRuntimeStore(createDatabaseClient(env.AI_DATABASE_URL))
    : null;
  const aiSocialCredentialKey = env.AI_SOCIAL_CREDENTIAL_ENVELOPE_KEY
    ? parse32ByteSecret(env.AI_SOCIAL_CREDENTIAL_ENVELOPE_KEY, "AI_SOCIAL_CREDENTIAL_ENVELOPE_KEY") : null;
  const aiSocialSubjectHashKey = env.AI_SOCIAL_SUBJECT_HASH_KEY
    ? parse32ByteSecret(env.AI_SOCIAL_SUBJECT_HASH_KEY, "AI_SOCIAL_SUBJECT_HASH_KEY") : null;
  const aiGateway = env.AI_TEXT_GATEWAY_ENDPOINT && env.AI_TEXT_GATEWAY_SERVICE_TOKEN
    ? createHttpTextProviderGateway({
      endpoint: env.AI_TEXT_GATEWAY_ENDPOINT,
      serviceToken: env.AI_TEXT_GATEWAY_SERVICE_TOKEN,
    })
    : null;
  const legalDocuments = loadLegalDocuments(env.LEGAL_DOCUMENTS_FILE);
  return {
    env,
    store,
    tenantWorkspace: new TenantWorkspaceStore(tenantClient),
    tenantCommerce: new TenantCommerceStore(tenantClient),
    sharedDomain: new SharedDomainStore(tenantClient),
    flowbot: new FlowBotStore(tenantClient),
    aiChat: new AiChatStore(tenantClient),
    tenantAiSocial: new AiSocialConnectionStore(tenantClient),
    tenantFlowbotNotifications: new TenantFlowbotNotificationStore(tenantClient),
    tenantAiNotifications: new TenantAiNotificationStore(tenantClient),
    tenantFlowbotIntegrations: new TenantFlowbotIntegrationStore(tenantClient),
    flowbotRuntime: env.FLOWBOT_DATABASE_URL ? new FlowbotRuntimeStore(
      createDatabaseClient(env.FLOWBOT_DATABASE_URL),
      env.FLOWBOT_INTEGRATION_ENVELOPE_KEY
        ? parse32ByteSecret(env.FLOWBOT_INTEGRATION_ENVELOPE_KEY, "FLOWBOT_INTEGRATION_ENVELOPE_KEY")
        : null,
    ) : null,
    aiChatRuntimeStore: aiRuntimeStore,
    aiSocialRuntime: env.AI_DATABASE_URL && aiSocialCredentialKey
      ? new AiSocialRuntimeStore(createDatabaseClient(env.AI_DATABASE_URL), aiSocialCredentialKey)
      : null,
    aiSocialCredentialKey,
    aiSocialSubjectHashKey,
    aiSocialDelivery: createSocialDeliveryClient({
      lineApiBaseUrl: env.AI_SOCIAL_LINE_API_BASE_URL,
      metaGraphBaseUrl: env.AI_SOCIAL_META_GRAPH_BASE_URL,
    }),
    aiChatRuntime: aiRuntimeStore && aiGateway ? new AiTextRuntime(aiRuntimeStore, aiGateway) : null,
    voiceRuntime: env.VOICE_RUNTIME_ENABLED === "true" && env.VOICE_DATABASE_URL
      ? new VoiceRuntimeStore(createDatabaseClient(env.VOICE_DATABASE_URL)) : null,
    voiceDeployments: new VoiceDeploymentStore(tenantClient),
    aiTextGateway: aiGateway,
    privacy: new PrivacyStore(tenantClient),
    privacyExportKey: env.PRIVACY_EXPORT_KEY
      ? parse32ByteSecret(env.PRIVACY_EXPORT_KEY, "PRIVACY_EXPORT_KEY") : null,
    catalog: new PostgresCatalogStore(client),
    databaseReadiness: new DatabaseReadinessProbe(client),
    platformCommerce: new PlatformCommerceStore(platformClient),
    platformOperations: new PlatformOperationsStore(platformClient),
    platformRecovery: new PlatformRecoveryStore(platformClient),
    platformVoiceOperations: new PlatformVoiceOperationsStore(platformClient),
    platformSupport: new PlatformSupportStore(platformClient),
    platformFlowbotIntegrations: new PlatformFlowbotIntegrationStore(platformClient),
    flowbotIntegrationEnvelopeKey: env.FLOWBOT_INTEGRATION_ENVELOPE_KEY
      ? parse32ByteSecret(env.FLOWBOT_INTEGRATION_ENVELOPE_KEY, "FLOWBOT_INTEGRATION_ENVELOPE_KEY")
      : null,
    flowbotNotificationEnvelopeKey: env.FLOWBOT_NOTIFICATION_ENVELOPE_KEY
      ? parse32ByteSecret(env.FLOWBOT_NOTIFICATION_ENVELOPE_KEY, "FLOWBOT_NOTIFICATION_ENVELOPE_KEY")
      : null,
    aiNotificationEnvelopeKey: env.AI_NOTIFICATION_ENVELOPE_KEY
      ? parse32ByteSecret(env.AI_NOTIFICATION_ENVELOPE_KEY, "AI_NOTIFICATION_ENVELOPE_KEY")
      : null,
    billingWebhook: billingClient ? new BillingWebhookStore(billingClient) : null,
    billingWebhookSecret: env.BILLING_WEBHOOK_SECRET
      ? parse32ByteSecret(env.BILLING_WEBHOOK_SECRET, "BILLING_WEBHOOK_SECRET") : null,
    billingWebhookEnvelopeKey: env.BILLING_WEBHOOK_ENVELOPE_KEY
      ? parse32ByteSecret(env.BILLING_WEBHOOK_ENVELOPE_KEY, "BILLING_WEBHOOK_ENVELOPE_KEY") : null,
    platformStore,
    rateLimitKey: parse32ByteSecret(env.AUTH_RATE_LIMIT_KEY, "AUTH_RATE_LIMIT_KEY"),
    legalDocuments,
    registration: createRegistrationService(store, {
      publicAppUrl: env.PUBLIC_APP_URL,
      legalVersions: legalDocuments ? {
        termsVersion: legalDocuments.terms.version,
        privacyVersion: legalDocuments.privacy.version,
      } : null,
      requestHashKey: parse32ByteSecret(env.AUTH_REQUEST_HASH_KEY, "AUTH_REQUEST_HASH_KEY"),
      emailEnvelopeKey,
    }),
    invitations: createInvitationService(store, {
      publicAppUrl: env.PUBLIC_APP_URL,
      emailEnvelopeKey,
    }),
    ownership: createOwnershipService(store, {
      tenantAppUrl: env.TENANT_APP_URL,
      emailEnvelopeKey,
    }),
    login: createLoginService(store, {
      dummyPasswordHash: await hashPassword("djay-invalid-credential-timing-value"),
    }),
    recovery: createRecoveryService(store, {
      publicAppUrl: env.PUBLIC_APP_URL,
      emailEnvelopeKey,
    }),
    session: createSessionService(store),
    tenantMfa: createTenantMfaService(store, {
      encryptionKey: parse32ByteSecret(env.AUTH_MFA_ENCRYPTION_KEY, "AUTH_MFA_ENCRYPTION_KEY"),
      recoveryHashKey: parse32ByteSecret(env.AUTH_MFA_RECOVERY_HASH_KEY, "AUTH_MFA_RECOVERY_HASH_KEY"),
    }),
    platformAuth: createPlatformAuthService(platformStore, {
      dummyPasswordHash: await hashPassword("djay-invalid-platform-credential-timing-value"),
      mfaEncryptionKey: parse32ByteSecret(env.PLATFORM_MFA_ENCRYPTION_KEY, "PLATFORM_MFA_ENCRYPTION_KEY"),
      recoveryHashKey: parse32ByteSecret(env.PLATFORM_RECOVERY_HASH_KEY, "PLATFORM_RECOVERY_HASH_KEY"),
    }),
  };
}

export function getServices(): Promise<Services> {
  servicesPromise ??= buildServices();
  return servicesPromise;
}
