import type { TenantContext } from "@djay/tenancy";
import type { DatabaseClient } from "./client";
import { withTenantTransaction } from "./scoped-transaction";

export type OnboardingStage = "account_created" | "business_profile" | "product_selection" | "ready";

export class TenantWorkspaceStore {
  constructor(private readonly client: DatabaseClient) {}

  async getOnboarding(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{
        tenant_id: string;
        business_name: string;
        slug: string;
        locale: string;
        timezone: string;
        stage: OnboardingStage;
      }[]>`
        SELECT tenant.id AS tenant_id, tenant.business_name, tenant.slug,
               tenant.locale, tenant.timezone, onboarding.stage
        FROM tenancy.tenants tenant
        JOIN tenancy.tenant_onboarding onboarding ON onboarding.tenant_id = tenant.id
        WHERE tenant.id = ${context.tenantId}::uuid
      `;
      return rows[0] ?? null;
    });
  }

  async updateOnboarding(context: TenantContext, stage: OnboardingStage) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ stage: OnboardingStage }[]>`
        UPDATE tenancy.tenant_onboarding
        SET stage = ${stage},
            profile_completed_at = CASE
              WHEN ${stage} IN ('business_profile', 'product_selection', 'ready')
                THEN COALESCE(profile_completed_at, now())
              ELSE profile_completed_at
            END,
            product_selected_at = CASE
              WHEN ${stage} IN ('product_selection', 'ready')
                THEN COALESCE(product_selected_at, now())
              ELSE product_selected_at
            END,
            completed_at = CASE WHEN ${stage} = 'ready' THEN COALESCE(completed_at, now()) ELSE completed_at END,
            updated_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid
        RETURNING stage
      `;
      return rows[0] ?? null;
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
