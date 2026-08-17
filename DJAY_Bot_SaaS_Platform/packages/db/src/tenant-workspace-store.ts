import { randomUUID } from "node:crypto";
import { convertClaimedBuilderFlow } from "@djay/flowbot-migration";
import type { TenantContext, TenantRole } from "@djay/tenancy";
import type { DatabaseClient, DatabaseTransaction } from "./client";
import { withTenantTransaction } from "./scoped-transaction";

export type OnboardingStage = "account_created" | "business_profile" | "product_selection" | "ready";
export type ManagedTenantRole = Exclude<TenantRole, "tenant_master_admin" | "tenant_readonly_support">;
type OnboardingProductKey = "flowbot" | "ai_chat" | "voice";
export const currentMerchantOnboardingVersion = 1;
export const currentMerchantGuidelinesVersion = "merchant-guidelines-v1";

export type OnboardingChecklistStep = Readonly<{
  key: string;
  label: string;
  detail: string;
  complete: boolean;
  nextHref?: string;
  nextLabel?: string;
}>;

export type OnboardingPrimaryAction = Readonly<{
  href: string;
  label: string;
}>;

type OnboardingRecord = Readonly<{
  tenant_id: string;
  business_name: string;
  slug: string;
  locale: string;
  timezone: string;
  accountOnboarding: Readonly<{
    version: number;
    currentVersion: number;
    guidelinesVersion: string | null;
    complete: boolean;
    claimedProduct: OnboardingProductKey | null;
  }>;
  preferences: Readonly<{
    businessGoal: "answer_questions" | "capture_leads" | "recommend_products" | "book_appointments" | "customer_support" | null;
    industry: "retail" | "services" | "restaurant" | "education" | "property" | "health" | "other" | null;
    firstProduct: OnboardingProductKey | null;
    launchChannel: "website" | null;
    complete: boolean;
    conversationExamplesReviewed: boolean;
  }>;
  stage: OnboardingStage;
  readiness: Readonly<{
    businessProfile: boolean;
    productSelected: boolean;
    activeAccess: boolean;
    selectedProducts: readonly OnboardingProductKey[];
    configuredProducts: readonly OnboardingProductKey[];
    testedProducts: readonly OnboardingProductKey[];
    launchReadyProducts: readonly OnboardingProductKey[];
    productStates: readonly Readonly<{
      productKey: OnboardingProductKey; activeAccess: boolean; configured: boolean;
      tested: boolean; deployed: boolean; launchReady: boolean;
      nextAction: "activate" | "configure" | "deploy" | "test" | "operate";
    }>[];
  }>;
  checklist: readonly OnboardingChecklistStep[];
  primaryAction: OnboardingPrimaryAction | null;
}>;

export function deriveOnboardingStage(readiness: Readonly<{
  businessProfile: boolean; productSelected: boolean; launchReady: boolean;
}>): OnboardingStage {
  return readiness.launchReady ? "ready"
    : readiness.productSelected ? "product_selection"
      : readiness.businessProfile ? "business_profile" : "account_created";
}

function productStudioHref(
  productKey: OnboardingProductKey,
  nextAction: "activate" | "configure" | "deploy" | "test" | "operate",
): string {
  if (productKey === "flowbot" && (nextAction === "configure" || nextAction === "deploy" || nextAction === "test")) {
    return "/workspace/setup";
  }
  return productKey === "ai_chat" ? "/workspace/ai-chat"
    : productKey === "voice" ? "/workspace/voice"
      : "/workspace/flowbot";
}

function productTitle(productKey: OnboardingProductKey): string {
  return productKey === "ai_chat" ? "AI Text Bot"
    : productKey === "voice" ? "AI Voice Bot"
      : "Flow Bot";
}

type LatestBuilderClaim = Readonly<{
  id: string;
  productFamily: "flow" | "text" | "voice";
  sourceRevision: number;
  state: unknown;
  materializedFlowBotId: string | null;
}>;

async function materializeClaimedFlow(
  sql: DatabaseTransaction,
  context: TenantContext,
  claim: LatestBuilderClaim,
) {
  if (claim.productFamily !== "flow" || claim.materializedFlowBotId) return;
  const existing = await sql<{ id: string }[]>`
    SELECT id FROM tenancy.flow_bots
    WHERE tenant_id = ${context.tenantId}::uuid AND status <> 'archived'
    ORDER BY created_at, id LIMIT 1
  `;
  if (existing[0]) return;

  const draftVersionId = randomUUID();
  const converted = convertClaimedBuilderFlow(claim.state, draftVersionId);
  if (converted.status !== "converted") {
    await sql`INSERT INTO tenancy.audit_logs (
      tenant_id, actor_user_id, actor_membership_id, action, target_type, target_id,
      request_id, result, metadata
    ) VALUES (
      ${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid,
      'tenant.builder_flow_materialization', 'builder_draft_claim', ${claim.id},
      ${context.requestId}, 'failed', ${sql.json({ reasonCode: converted.reasonCode, sourceRevision: claim.sourceRevision })}
    )`;
    return;
  }

  const botId = randomUUID();
  await sql`
    INSERT INTO tenancy.flow_bots (id, tenant_id, name, default_language, created_by_membership_id)
    VALUES (${botId}::uuid, ${context.tenantId}::uuid, ${converted.botName},
      ${converted.defaultLanguage}, ${context.membershipId}::uuid)
  `;
  await sql`
    INSERT INTO tenancy.flow_drafts (tenant_id, bot_id, definition_json, updated_by_membership_id)
    VALUES (${context.tenantId}::uuid, ${botId}::uuid, ${sql.json(converted.snapshot)}, ${context.membershipId}::uuid)
  `;
  await sql`
    UPDATE tenancy.builder_draft_claims
    SET materialized_flow_bot_id = ${botId}::uuid, materialized_at = now()
    WHERE tenant_id = ${context.tenantId}::uuid AND id = ${claim.id}::uuid
      AND materialized_flow_bot_id IS NULL
  `;
  await sql`INSERT INTO tenancy.audit_logs (
    tenant_id, actor_user_id, actor_membership_id, action, target_type, target_id,
    request_id, result, metadata
  ) VALUES (
    ${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid,
    'tenant.builder_flow_materialized', 'flow_bot', ${botId}, ${context.requestId},
    'succeeded', ${sql.json({
      sourceClaimId: claim.id, sourceRevision: claim.sourceRevision,
      warnings: converted.warnings, publicationState: "draft",
    })}
  )`;
}

export function buildOnboardingChecklist(input: Readonly<{
  businessProfile: boolean;
  launchPreferences?: boolean;
  productSelected: boolean;
  activeAccess: boolean;
  launchReadyProducts: readonly OnboardingProductKey[];
  productStates: readonly Readonly<{
    productKey: OnboardingProductKey;
    nextAction: "activate" | "configure" | "deploy" | "test" | "operate";
  }>[];
}>): Readonly<{
  checklist: readonly OnboardingChecklistStep[];
  primaryAction: OnboardingPrimaryAction | null;
}> {
  const focus = input.productStates.find((state) => state.nextAction !== "operate")
    ?? input.productStates[0];
  const technicalComplete = input.launchReadyProducts.length > 0;
  let technicalHref: string | undefined;
  let technicalLabel: string | undefined;
  let technicalDetail = "Configure, deploy, and test a product before public rollout.";
  if (!technicalComplete && focus) {
    const studio = productStudioHref(focus.productKey, focus.nextAction);
    const title = productTitle(focus.productKey);
    if (focus.nextAction === "activate") {
      technicalHref = "/workspace/usage";
      technicalLabel = "Continue to payment";
      technicalDetail = `${title} is selected; complete payment or activation before technical launch.`;
    } else if (focus.nextAction === "configure") {
      technicalHref = studio;
      technicalLabel = `Configure ${title}`;
      technicalDetail = `${title} needs a current published configuration.`;
    } else if (focus.nextAction === "deploy") {
      technicalHref = studio;
      technicalLabel = `Deploy ${title}`;
      technicalDetail = `${title} needs an active deployment for the current published version.`;
    } else if (focus.nextAction === "test") {
      technicalHref = studio;
      technicalLabel = `Test ${title}`;
      technicalDetail = `${title} needs a successful current-version customer journey test.`;
    }
  } else if (!technicalComplete && !input.productSelected) {
    technicalHref = "/workspace/usage";
    technicalLabel = "Choose product";
  } else if (technicalComplete) {
    technicalDetail = "At least one product has current configuration, deployment, and successful test evidence.";
  }

  const checklist: OnboardingChecklistStep[] = [
    {
      key: "account",
      label: "Account secured",
      detail: "Email verification and workspace ownership are complete.",
      complete: true,
    },
    {
      key: "goal",
      label: "Business goal",
      detail: input.launchPreferences === false
        ? "Choose the main customer outcome, industry, and first website bot."
        : "The workspace has a goal, industry, and first website bot.",
      complete: input.launchPreferences !== false,
      ...(input.launchPreferences === false ? { nextHref: "/workspace/setup", nextLabel: "Choose business goal" } : {}),
    },
    {
      key: "business",
      label: "Business profile",
      detail: input.businessProfile
        ? "Business name, language, and timezone are available."
        : "Complete the required business details.",
      complete: input.businessProfile,
      ...(input.businessProfile ? {} : { nextHref: "/workspace/setup", nextLabel: "Complete profile" }),
    },
    {
      key: "product",
      label: "Product access",
      detail: input.productSelected
        ? input.activeAccess
          ? "A selected product has active access."
          : "Product preference saved. Complete payment to activate access (pilot comps use Platform activation)."
        : "No product has been selected for this workspace.",
      complete: input.activeAccess,
      ...(input.activeAccess ? {} : {
        nextHref: "/workspace/usage",
        nextLabel: input.productSelected ? "Continue to payment" : "Choose product",
      }),
    },
    {
      key: "technical",
      label: "Technical launch readiness",
      detail: technicalDetail,
      complete: technicalComplete,
      ...(technicalComplete || !technicalHref ? {} : {
        nextHref: technicalHref,
        nextLabel: technicalLabel ?? "Continue setup",
      }),
    },
  ];

  const primary = checklist.find((step) => !step.complete && step.nextHref);
  return {
    checklist,
    primaryAction: primary?.nextHref
      ? { href: primary.nextHref, label: primary.nextLabel ?? "Continue setup" }
      : null,
  };
}

async function onboardingRecord(sql: DatabaseTransaction, tenantId: string): Promise<OnboardingRecord | null> {
  const tenantRowsPromise = sql<{
    tenant_id: string; business_name: string; slug: string; locale: string; timezone: string;
    businessGoal: OnboardingRecord["preferences"]["businessGoal"];
    industry: OnboardingRecord["preferences"]["industry"];
    firstProduct: OnboardingRecord["preferences"]["firstProduct"];
    launchChannel: OnboardingRecord["preferences"]["launchChannel"];
    preferencesComplete: boolean;
    conversationExamplesReviewed: boolean;
    merchantOnboardingVersion: number;
    guidelinesVersion: string | null;
    guidelinesAccepted: boolean;
    claimedProduct: OnboardingProductKey | null;
  }[]>`
    SELECT tenant.id AS tenant_id, tenant.business_name, tenant.slug, tenant.locale, tenant.timezone,
      onboarding.business_goal AS "businessGoal", onboarding.industry,
      onboarding.first_product AS "firstProduct",
      onboarding.launch_channel AS "launchChannel",
      onboarding.preferences_completed_at IS NOT NULL AS "preferencesComplete",
      onboarding.merchant_onboarding_version AS "merchantOnboardingVersion",
      onboarding.guidelines_version AS "guidelinesVersion",
      onboarding.guidelines_accepted_at IS NOT NULL AS "guidelinesAccepted",
      latest_claim."claimedProduct",
      EXISTS (
        SELECT 1 FROM tenancy.audit_logs audit
        WHERE audit.tenant_id = tenant.id
          AND audit.action = 'tenant.onboarding_conversations_reviewed'
          AND audit.result = 'succeeded'
      ) AS "conversationExamplesReviewed"
    FROM tenancy.tenants tenant JOIN tenancy.tenant_onboarding onboarding ON onboarding.tenant_id = tenant.id
    LEFT JOIN LATERAL (
      SELECT CASE claim.product_family
        WHEN 'flow' THEN 'flowbot' WHEN 'text' THEN 'ai_chat' WHEN 'voice' THEN 'voice'
      END::text AS "claimedProduct"
      FROM tenancy.builder_draft_claims claim
      WHERE claim.tenant_id = tenant.id
      ORDER BY claim.claimed_at DESC, claim.id DESC LIMIT 1
    ) latest_claim ON true
    WHERE tenant.id = ${tenantId}::uuid
  `;
  const subscriptionsPromise = sql<{
    productKey: OnboardingProductKey; active: boolean;
  }[]>`
    SELECT subscription.product_key AS "productKey",
           bool_or(COALESCE(snapshot.access_mode, 'none') = 'active') AS active
    FROM tenancy.product_subscriptions subscription
    LEFT JOIN LATERAL (
      SELECT access_mode FROM tenancy.entitlement_snapshots candidate
      WHERE candidate.tenant_id = subscription.tenant_id
        AND candidate.subscription_id = subscription.id
      ORDER BY candidate.created_at DESC, candidate.id DESC LIMIT 1
    ) snapshot ON true
    WHERE subscription.tenant_id = ${tenantId}::uuid
    GROUP BY subscription.product_key ORDER BY subscription.product_key
  `;
  const factsPromise = sql<{
    productKey: OnboardingProductKey; configured: boolean; tested: boolean; deployed: boolean;
  }[]>`
    SELECT 'flowbot'::text AS "productKey",
      EXISTS (
        SELECT 1 FROM tenancy.flow_bots bot
        WHERE bot.tenant_id = ${tenantId}::uuid AND bot.status = 'active'
          AND bot.current_published_version_id IS NOT NULL
      ) AS configured,
      (EXISTS (
        SELECT 1 FROM tenancy.flow_executions execution
        JOIN tenancy.flow_deployments deployment
          ON deployment.tenant_id = execution.tenant_id
          AND deployment.id = execution.deployment_id
        JOIN tenancy.flow_bots bot
          ON bot.tenant_id = deployment.tenant_id AND bot.id = deployment.bot_id
        WHERE execution.tenant_id = ${tenantId}::uuid
          AND execution.status = 'completed' AND deployment.status = 'active'
          AND bot.current_published_version_id = execution.flow_version_id
      ) OR EXISTS (
        SELECT 1 FROM tenancy.bot_regression_runs run
        JOIN tenancy.flow_bots bot ON bot.tenant_id = run.tenant_id AND bot.id = run.subject_id
        WHERE run.tenant_id = ${tenantId}::uuid AND run.product_key = 'flowbot' AND run.status = 'passed'
          AND run.artifact_version_id = bot.current_published_version_id
      )) AS tested,
      EXISTS (
        SELECT 1 FROM tenancy.flow_deployments deployment
        JOIN tenancy.flow_bots bot
          ON bot.tenant_id = deployment.tenant_id AND bot.id = deployment.bot_id
        WHERE deployment.tenant_id = ${tenantId}::uuid AND deployment.status = 'active'
          AND bot.current_published_version_id IS NOT NULL
      ) AS deployed
    UNION ALL
    SELECT 'ai_chat'::text AS "productKey",
      EXISTS (
        SELECT 1 FROM tenancy.ai_agents agent
        WHERE agent.tenant_id = ${tenantId}::uuid AND agent.status = 'active'
          AND agent.current_published_playbook_version_id IS NOT NULL
      ) AS configured,
      (EXISTS (
        SELECT 1 FROM tenancy.ai_turns turn
        JOIN tenancy.ai_sessions session
          ON session.tenant_id = turn.tenant_id AND session.id = turn.session_id
        JOIN tenancy.ai_deployments deployment
          ON deployment.tenant_id = session.tenant_id AND deployment.id = session.deployment_id
        JOIN tenancy.ai_agents agent
          ON agent.tenant_id = session.tenant_id AND agent.id = session.agent_id
        WHERE turn.tenant_id = ${tenantId}::uuid AND turn.status = 'completed'
          AND deployment.status = 'active'
          AND agent.current_published_playbook_version_id = session.playbook_version_id
      ) OR EXISTS (
        SELECT 1 FROM tenancy.bot_regression_runs run
        JOIN tenancy.ai_agents agent ON agent.tenant_id = run.tenant_id AND agent.id = run.subject_id
        WHERE run.tenant_id = ${tenantId}::uuid AND run.product_key = 'ai_chat' AND run.status = 'passed'
          AND run.artifact_version_id = agent.current_published_playbook_version_id
      )) AS tested,
      EXISTS (
        SELECT 1 FROM tenancy.ai_deployments deployment
        JOIN tenancy.ai_agents agent
          ON agent.tenant_id = deployment.tenant_id AND agent.id = deployment.agent_id
        WHERE deployment.tenant_id = ${tenantId}::uuid AND deployment.status = 'active'
          AND agent.current_published_playbook_version_id IS NOT NULL
      ) AS deployed
    UNION ALL
    SELECT 'voice'::text AS "productKey",
      EXISTS (
        SELECT 1 FROM tenancy.voice_deployments deployment
        JOIN tenancy.ai_agents agent
          ON agent.tenant_id = deployment.tenant_id AND agent.id = deployment.agent_id
        WHERE deployment.tenant_id = ${tenantId}::uuid AND deployment.status = 'active'
          AND agent.current_published_playbook_version_id IS NOT NULL
      ) AS configured,
      (EXISTS (
        SELECT 1 FROM tenancy.voice_turns turn
        JOIN tenancy.voice_sessions session
          ON session.tenant_id = turn.tenant_id AND session.id = turn.session_id
        JOIN tenancy.voice_deployments deployment
          ON deployment.tenant_id = session.tenant_id AND deployment.id = session.deployment_id
        JOIN tenancy.ai_agents agent
          ON agent.tenant_id = session.tenant_id AND agent.id = session.agent_id
        WHERE turn.tenant_id = ${tenantId}::uuid AND turn.status = 'completed'
          AND session.status = 'ended' AND deployment.status = 'active'
          AND agent.current_published_playbook_version_id = session.playbook_version_id
      ) OR EXISTS (
        SELECT 1 FROM tenancy.bot_regression_runs run
        JOIN tenancy.voice_deployments deployment ON deployment.tenant_id = run.tenant_id AND deployment.id = run.subject_id
        JOIN tenancy.ai_agents agent ON agent.tenant_id = deployment.tenant_id AND agent.id = deployment.agent_id
        WHERE run.tenant_id = ${tenantId}::uuid AND run.product_key = 'voice' AND run.status = 'passed'
          AND run.artifact_version_id = agent.current_published_playbook_version_id
      )) AS tested,
      EXISTS (
        SELECT 1 FROM tenancy.voice_deployments deployment
        JOIN tenancy.ai_agents agent
          ON agent.tenant_id = deployment.tenant_id AND agent.id = deployment.agent_id
        WHERE deployment.tenant_id = ${tenantId}::uuid AND deployment.status = 'active'
          AND agent.current_published_playbook_version_id IS NOT NULL
      ) AS deployed
  `;
  const [tenantRows, subscriptions, facts] = await Promise.all([
    tenantRowsPromise, subscriptionsPromise, factsPromise,
  ]);
  const tenant = tenantRows[0];
  if (!tenant) return null;
  const factByProduct = new Map(facts.map((fact) => [fact.productKey, fact]));
  const selectedProducts = subscriptions.map((subscription) => subscription.productKey);
  const activeProducts = new Set(subscriptions.filter((subscription) => subscription.active)
    .map((subscription) => subscription.productKey));
  const configuredProducts = selectedProducts.filter((product) => factByProduct.get(product)?.configured);
  const testedProducts = selectedProducts.filter((product) => factByProduct.get(product)?.tested);
  const launchReadyProducts = selectedProducts.filter((product) => {
    const fact = factByProduct.get(product);
    return activeProducts.has(product) && fact?.configured && fact.tested && fact.deployed;
  });
  const onboardingProducts = Array.from(new Set([
    ...(tenant.firstProduct ? [tenant.firstProduct] : []),
    ...selectedProducts,
  ]));
  const productStates = onboardingProducts.map((productKey) => {
    const fact = factByProduct.get(productKey);
    const activeAccess = activeProducts.has(productKey);
    const configured = fact?.configured === true; const tested = fact?.tested === true; const deployed = fact?.deployed === true;
    const launchReady = activeAccess && configured && tested && deployed;
    const nextAction = !activeAccess ? "activate" as const : !configured ? "configure" as const
      : !deployed ? "deploy" as const : !tested ? "test" as const : "operate" as const;
    return { productKey, activeAccess, configured, tested, deployed, launchReady, nextAction };
  });
  const businessProfile = Boolean(tenant.business_name.trim() && tenant.locale.trim() && tenant.timezone.trim());
  const stage = deriveOnboardingStage({
    businessProfile, productSelected: selectedProducts.length > 0,
    launchReady: launchReadyProducts.length > 0,
  });
  const readiness = {
    businessProfile,
    launchPreferences: tenant.preferencesComplete,
    productSelected: selectedProducts.length > 0,
    activeAccess: activeProducts.size > 0,
    selectedProducts,
    configuredProducts,
    testedProducts,
    launchReadyProducts,
    productStates,
  };
  const { checklist, primaryAction } = buildOnboardingChecklist(readiness);
  return {
    tenant_id: tenant.tenant_id, business_name: tenant.business_name, slug: tenant.slug,
    locale: tenant.locale, timezone: tenant.timezone,
    accountOnboarding: {
      version: tenant.merchantOnboardingVersion,
      currentVersion: currentMerchantOnboardingVersion,
      guidelinesVersion: tenant.guidelinesVersion,
      complete: tenant.merchantOnboardingVersion >= currentMerchantOnboardingVersion
        && tenant.guidelinesAccepted && tenant.preferencesComplete,
      claimedProduct: tenant.claimedProduct,
    },
    preferences: {
      businessGoal: tenant.businessGoal, industry: tenant.industry,
      firstProduct: tenant.firstProduct, launchChannel: tenant.launchChannel,
      complete: tenant.preferencesComplete,
      conversationExamplesReviewed: tenant.conversationExamplesReviewed,
    },
    stage,
    readiness,
    checklist,
    primaryAction,
  };
}

export class TenantWorkspaceStore {
  constructor(private readonly client: DatabaseClient) {}

  async getOnboarding(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      return onboardingRecord(sql, context.tenantId);
    });
  }

  async completeMerchantOnboarding(context: TenantContext, input: Readonly<{
    version: number;
    acceptedGuidelines: true;
    businessGoal: "answer_questions" | "capture_leads" | "recommend_products" | "book_appointments" | "customer_support";
    industry: "retail" | "services" | "restaurant" | "education" | "property" | "health" | "other";
  }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      if (input.version !== currentMerchantOnboardingVersion || input.acceptedGuidelines !== true) {
        return { status: "version_mismatch" as const };
      }
      const rows = await sql<{
        version: number; completedAt: Date | null;
      }[]>`
        SELECT onboarding.merchant_onboarding_version AS version,
          onboarding.preferences_completed_at AS "completedAt"
        FROM tenancy.tenant_onboarding onboarding
        WHERE onboarding.tenant_id = ${context.tenantId}::uuid
        FOR UPDATE OF onboarding
      `;
      const existing = rows[0];
      if (!existing) return { status: "not_found" as const };
      const claims = await sql<LatestBuilderClaim[]>`
        SELECT id, product_family AS "productFamily", source_revision AS "sourceRevision",
          state_json AS state, materialized_flow_bot_id AS "materializedFlowBotId"
        FROM tenancy.builder_draft_claims
        WHERE tenant_id = ${context.tenantId}::uuid
        ORDER BY claimed_at DESC, id DESC LIMIT 1
        FOR UPDATE
      `;
      const claim = claims[0];
      const claimedProduct: OnboardingProductKey | null = claim?.productFamily === "flow" ? "flowbot"
        : claim?.productFamily === "text" ? "ai_chat"
          : claim?.productFamily === "voice" ? "voice" : null;
      if (claim) await materializeClaimedFlow(sql, context, claim);
      if (existing.version >= currentMerchantOnboardingVersion && existing.completedAt) {
        const onboarding = await onboardingRecord(sql, context.tenantId);
        return { status: "already_completed" as const, onboarding };
      }
      if (!claimedProduct) return { status: "claim_required" as const };
      await sql`
        UPDATE tenancy.tenant_onboarding SET
          business_goal = ${input.businessGoal}, industry = ${input.industry},
          first_product = ${claimedProduct}, launch_channel = 'website',
          preferences_completed_at = COALESCE(preferences_completed_at, now()),
          merchant_onboarding_version = ${currentMerchantOnboardingVersion},
          guidelines_version = ${currentMerchantGuidelinesVersion},
          guidelines_accepted_at = COALESCE(guidelines_accepted_at, now()),
          updated_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid
      `;
      await sql`INSERT INTO tenancy.audit_logs (
        tenant_id, actor_user_id, actor_membership_id, action, target_type, target_id,
        request_id, result, metadata
      ) VALUES (
        ${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid,
        'tenant.merchant_onboarding_completed', 'tenant', ${context.tenantId}, ${context.requestId},
        'succeeded', ${sql.json({
          version: currentMerchantOnboardingVersion,
          guidelinesVersion: currentMerchantGuidelinesVersion,
          businessGoal: input.businessGoal,
          industry: input.industry,
          firstProduct: claimedProduct,
        })}
      )`;
      const onboarding = await onboardingRecord(sql, context.tenantId);
      return { status: "completed" as const, onboarding };
    });
  }

  async refreshOnboarding(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const record = await onboardingRecord(sql, context.tenantId);
      if (!record) return null;
      await sql`
        UPDATE tenancy.tenant_onboarding
        SET stage = ${record.stage},
            profile_completed_at = CASE
              WHEN ${record.readiness.businessProfile}
                THEN COALESCE(profile_completed_at, now())
              ELSE NULL
            END,
            product_selected_at = CASE
              WHEN ${record.readiness.productSelected}
                THEN COALESCE(product_selected_at, now())
              ELSE NULL
            END,
            completed_at = CASE
              WHEN ${record.readiness.launchReadyProducts.length > 0}
                THEN COALESCE(completed_at, now())
              ELSE NULL
            END,
            updated_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid
      `;
      return record;
    });
  }

  async updateOnboardingPreferences(context: TenantContext, input: Readonly<{
    businessGoal: "answer_questions" | "capture_leads" | "recommend_products" | "book_appointments" | "customer_support";
    industry: "retail" | "services" | "restaurant" | "education" | "property" | "health" | "other";
    firstProduct: OnboardingProductKey;
  }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ tenantId: string }[]>`UPDATE tenancy.tenant_onboarding SET
        business_goal = ${input.businessGoal}, industry = ${input.industry},
        first_product = ${input.firstProduct}, launch_channel = 'website',
        preferences_completed_at = COALESCE(preferences_completed_at, now()), updated_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid RETURNING tenant_id AS "tenantId"`;
      if (!rows[0]) return { status: "not_found" as const };
      await sql`INSERT INTO tenancy.audit_logs (
        tenant_id, actor_user_id, actor_membership_id, action, target_type, target_id,
        request_id, result, metadata
      ) VALUES (
        ${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid,
        'tenant.onboarding_preferences_updated', 'tenant', ${context.tenantId}, ${context.requestId},
        'succeeded', ${sql.json(input)}
      )`;
      const onboarding = await onboardingRecord(sql, context.tenantId);
      return onboarding ? { status: "updated" as const, onboarding } : { status: "not_found" as const };
    });
  }

  async markConversationExamplesReviewed(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const existing = await onboardingRecord(sql, context.tenantId);
      if (!existing) return { status: "not_found" as const };
      if (!existing.preferences.conversationExamplesReviewed) {
        await sql`INSERT INTO tenancy.audit_logs (
          tenant_id, actor_user_id, actor_membership_id, action, target_type, target_id,
          request_id, result, metadata
        ) VALUES (
          ${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid,
          'tenant.onboarding_conversations_reviewed', 'tenant', ${context.tenantId},
          ${context.requestId}, 'succeeded', ${sql.json({ surface: "guided_setup" })}
        )`;
      }
      const onboarding = await onboardingRecord(sql, context.tenantId);
      return onboarding ? { status: "updated" as const, onboarding } : { status: "not_found" as const };
    });
  }

  async updateBusinessProfile(context: TenantContext, input: Readonly<{
    businessName: string;
    locale: "en" | "th";
    timezone: string;
  }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: input.timezone }).format(new Date());
      } catch {
        return { status: "invalid_timezone" as const };
      }
      const businessName = input.businessName.trim();
      if (businessName.length < 2 || businessName.length > 200) {
        return { status: "validation_failed" as const };
      }
      await sql`
        UPDATE tenancy.tenants
        SET business_name = ${businessName},
            locale = ${input.locale},
            timezone = ${input.timezone},
            updated_at = now()
        WHERE id = ${context.tenantId}::uuid
      `;
      await sql`
        INSERT INTO tenancy.audit_logs (
          tenant_id, actor_user_id, actor_membership_id, action, target_type,
          target_id, request_id, result, metadata
        ) VALUES (
          ${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid,
          'tenant.profile_updated', 'tenant', ${context.tenantId},
          ${context.requestId}, 'succeeded',
          ${sql.json({ locale: input.locale, timezone: input.timezone })}
        )
      `;
      const record = await onboardingRecord(sql, context.tenantId);
      if (!record) return { status: "not_found" as const };
      await sql`
        UPDATE tenancy.tenant_onboarding
        SET stage = ${record.stage},
            profile_completed_at = CASE
              WHEN ${record.readiness.businessProfile}
                THEN COALESCE(profile_completed_at, now())
              ELSE NULL
            END,
            updated_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid
      `;
      return { status: "updated" as const, onboarding: record };
    });
  }

  async getTeamOverview(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const members = await sql<{
        membership_id: string;
        user_id: string;
        display_name: string;
        email_normalized: string;
        membership_role: string;
        membership_status: string;
        accepted_at: Date | null;
      }[]>`SELECT * FROM tenancy.current_tenant_team()`;
      const invitations = await sql<{
        id: string;
        email_normalized: string;
        role: string;
        status: string;
        expires_at: Date;
        created_at: Date;
      }[]>`
        SELECT id, email_normalized, role, status, expires_at, created_at
        FROM tenancy.membership_invitations
        WHERE tenant_id = ${context.tenantId}::uuid AND status = 'pending'
        ORDER BY created_at DESC
      `;
      const transfers = await sql<{
        id: string;
        from_membership_id: string;
        to_membership_id: string;
        status: string;
        expires_at: Date;
        created_at: Date;
      }[]>`
        SELECT id, from_membership_id, to_membership_id, status, expires_at, created_at
        FROM tenancy.ownership_transfers
        WHERE tenant_id = ${context.tenantId}::uuid AND status = 'pending'
        ORDER BY created_at DESC
      `;
      const capacityRows = await sql<{ allowed: boolean; seatLimit: number; occupied: number }[]>`
        SELECT allowed, seat_limit AS "seatLimit", occupied FROM tenancy.administrator_seat_capacity(false)
      `;
      return {
        members, invitations, transfers,
        capacity: capacityRows[0] ?? { allowed: false, seatLimit: 0, occupied: members.length + invitations.length },
      };
    });
  }

  async changeMembershipRole(context: TenantContext, input: Readonly<{
    membershipId: string; role: ManagedTenantRole;
  }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ status: "role_changed" | "not_authorized" | "not_found" | "owner_protected" | "invalid_role" }[]>`
        SELECT tenancy.manage_membership(
          ${input.membershipId}::uuid, ${input.role}, false, ${context.requestId}
        ) AS status
      `;
      return { status: rows[0]!.status };
    });
  }

  async revokeMembership(context: TenantContext, membershipId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ status: "revoked" | "not_authorized" | "not_found" | "owner_protected" }[]>`
        SELECT tenancy.manage_membership(
          ${membershipId}::uuid, NULL, true, ${context.requestId}
        ) AS status
      `;
      return { status: rows[0]!.status };
    });
  }
}
