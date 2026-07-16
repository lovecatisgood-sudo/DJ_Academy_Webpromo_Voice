import type { TenantContext } from "@djay/tenancy";
import type { DatabaseClient, DatabaseTransaction } from "./client";
import { withTenantTransaction } from "./scoped-transaction";

export type OnboardingStage = "account_created" | "business_profile" | "product_selection" | "ready";
type OnboardingProductKey = "flowbot" | "ai_chat" | "voice";

type OnboardingRecord = Readonly<{
  tenant_id: string;
  business_name: string;
  slug: string;
  locale: string;
  timezone: string;
  stage: OnboardingStage;
  readiness: Readonly<{
    businessProfile: boolean;
    productSelected: boolean;
    activeAccess: boolean;
    selectedProducts: readonly OnboardingProductKey[];
    configuredProducts: readonly OnboardingProductKey[];
    testedProducts: readonly OnboardingProductKey[];
    launchReadyProducts: readonly OnboardingProductKey[];
  }>;
}>;

export function deriveOnboardingStage(readiness: Readonly<{
  businessProfile: boolean; productSelected: boolean; launchReady: boolean;
}>): OnboardingStage {
  return readiness.launchReady ? "ready"
    : readiness.productSelected ? "product_selection"
      : readiness.businessProfile ? "business_profile" : "account_created";
}

async function onboardingRecord(sql: DatabaseTransaction, tenantId: string): Promise<OnboardingRecord | null> {
  const tenantRows = await sql<{
    tenant_id: string; business_name: string; slug: string; locale: string; timezone: string;
  }[]>`
    SELECT id AS tenant_id, business_name, slug, locale, timezone
    FROM tenancy.tenants WHERE id = ${tenantId}::uuid
  `;
  const tenant = tenantRows[0];
  if (!tenant) return null;

  const subscriptions = await sql<{
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
  const facts = await sql<{
    productKey: OnboardingProductKey; configured: boolean; tested: boolean; deployed: boolean;
  }[]>`
    SELECT 'flowbot'::text AS "productKey",
      EXISTS (
        SELECT 1 FROM tenancy.flow_bots bot
        WHERE bot.tenant_id = ${tenantId}::uuid AND bot.status = 'active'
          AND bot.current_published_version_id IS NOT NULL
      ) AS configured,
      EXISTS (
        SELECT 1 FROM tenancy.flow_executions execution
        JOIN tenancy.flow_deployments deployment
          ON deployment.tenant_id = execution.tenant_id
          AND deployment.id = execution.deployment_id
        JOIN tenancy.flow_bots bot
          ON bot.tenant_id = deployment.tenant_id AND bot.id = deployment.bot_id
        WHERE execution.tenant_id = ${tenantId}::uuid
          AND execution.status = 'completed' AND deployment.status = 'active'
          AND bot.current_published_version_id = execution.flow_version_id
      ) AS tested,
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
      EXISTS (
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
      ) AS tested,
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
      EXISTS (
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
      ) AS tested,
      EXISTS (
        SELECT 1 FROM tenancy.voice_deployments deployment
        JOIN tenancy.ai_agents agent
          ON agent.tenant_id = deployment.tenant_id AND agent.id = deployment.agent_id
        WHERE deployment.tenant_id = ${tenantId}::uuid AND deployment.status = 'active'
          AND agent.current_published_playbook_version_id IS NOT NULL
      ) AS deployed
  `;
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
  const businessProfile = Boolean(tenant.business_name.trim() && tenant.locale.trim() && tenant.timezone.trim());
  const stage = deriveOnboardingStage({
    businessProfile, productSelected: selectedProducts.length > 0,
    launchReady: launchReadyProducts.length > 0,
  });
  return {
    ...tenant,
    stage,
    readiness: {
      businessProfile,
      productSelected: selectedProducts.length > 0,
      activeAccess: activeProducts.size > 0,
      selectedProducts,
      configuredProducts,
      testedProducts,
      launchReadyProducts,
    },
  };
}

export class TenantWorkspaceStore {
  constructor(private readonly client: DatabaseClient) {}

  async getOnboarding(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      return onboardingRecord(sql, context.tenantId);
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
      return { members, invitations, transfers };
    });
  }
}
