import { randomUUID } from "node:crypto";
import { sealJson } from "@djay/auth";
import type { PlatformContext, TenantContext } from "@djay/tenancy";
import type { DatabaseClient } from "./client";
import { withPlatformTransaction, withTenantTransaction } from "./scoped-transaction";

export class TenantFlowbotIntegrationStore {
  constructor(private readonly client: DatabaseClient) {}

  async list(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => sql<{
      id: string; name: string; integrationKind: "external_api" | "google_sheets"; endpointCiphertext: string; allowedTemplateKeys: string[];
      status: string; createdAt: Date; approvedAt: Date | null;
    }[]>`
      SELECT id, name, integration_kind AS "integrationKind", endpoint_ciphertext AS "endpointCiphertext",
             allowed_template_keys AS "allowedTemplateKeys", status,
             created_at AS "createdAt", approved_at AS "approvedAt"
      FROM tenancy.flow_integration_profiles
      WHERE tenant_id = ${context.tenantId}::uuid
      ORDER BY created_at DESC, id DESC
    `);
  }

  async request(context: TenantContext, input: Readonly<{
    name: string; integrationKind?: "external_api" | "google_sheets"; endpoint: string; allowedTemplateKeys: readonly string[]; envelopeKey: Buffer;
  }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await sql<{ entitled: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM tenancy.entitlement_snapshots snapshot
          JOIN tenancy.product_subscriptions subscription
            ON subscription.tenant_id = snapshot.tenant_id AND subscription.id = snapshot.subscription_id
          WHERE snapshot.tenant_id = ${context.tenantId}::uuid
            AND snapshot.product_key = 'flowbot' AND snapshot.access_mode = 'active'
            AND subscription.status IN ('active', 'trialing', 'scheduled_change')
            AND (snapshot.resolved_json->'entitlements'->>'flow.webhook' = 'approved'
              OR (${input.integrationKind ?? "external_api"} = 'google_sheets'
                AND (snapshot.resolved_json->'entitlements'->>'integration.google_sheets')::boolean IS TRUE))
        ) AS entitled
      `;
      if (!authority[0]?.entitled) return { status: "not_entitled" as const };
      const integrationId = randomUUID();
      await sql`
        INSERT INTO tenancy.flow_integration_profiles (
          id, tenant_id, name, integration_kind, endpoint_ciphertext, allowed_template_keys,
          requested_by_membership_id
        ) VALUES (
          ${integrationId}::uuid, ${context.tenantId}::uuid, ${input.name}, ${input.integrationKind ?? "external_api"},
          ${sealJson({ url: input.endpoint }, input.envelopeKey)},
          ${input.allowedTemplateKeys as string[]}, ${context.membershipId}::uuid
        )
      `;
      await sql`
        INSERT INTO tenancy.audit_logs (
          tenant_id, actor_user_id, actor_membership_id, action, target_type,
          target_id, request_id, result, metadata
        ) VALUES (
          ${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid,
          'flowbot.integration_requested', 'flow_integration_profile', ${integrationId},
          ${context.requestId}, 'succeeded', ${sql.json({ integrationKind: input.integrationKind ?? "external_api", templateKeys: input.allowedTemplateKeys })}
        )
      `;
      return { status: "requested" as const, integrationId };
    });
  }
}

export class PlatformFlowbotIntegrationStore {
  constructor(private readonly client: DatabaseClient) {}

  async list(context: PlatformContext) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => sql<{
      id: string; tenantId: string; businessName: string; name: string; integrationKind: "external_api" | "google_sheets";
      endpointCiphertext: string; allowedTemplateKeys: string[]; status: string;
      createdAt: Date; approvedAt: Date | null;
    }[]>`
      SELECT profile.id, profile.tenant_id AS "tenantId", tenant.business_name AS "businessName",
             profile.name, profile.integration_kind AS "integrationKind", profile.endpoint_ciphertext AS "endpointCiphertext",
             profile.allowed_template_keys AS "allowedTemplateKeys", profile.status,
             profile.created_at AS "createdAt", profile.approved_at AS "approvedAt"
      FROM tenancy.flow_integration_profiles profile
      JOIN tenancy.tenants tenant ON tenant.id = profile.tenant_id
      ORDER BY profile.created_at DESC, profile.id DESC LIMIT 500
    `);
  }

  async approve(context: PlatformContext, integrationId: string) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ tenant_id: string }[]>`
        UPDATE tenancy.flow_integration_profiles
        SET status = 'approved', approved_by_platform_user_id = ${context.platformUserId}::uuid,
            approved_at = now(), updated_at = now()
        WHERE id = ${integrationId}::uuid AND status = 'requested'
        RETURNING tenant_id
      `;
      if (!rows[0]) return { status: "not_approvable" as const };
      await sql`
        INSERT INTO platform.audit_logs (
          actor_platform_user_id, action, target_type, target_id, request_id, result, metadata
        ) VALUES (
          ${context.platformUserId}::uuid, 'flowbot.integration_approved',
          'flow_integration_profile', ${integrationId}, ${context.requestId},
          'succeeded', ${sql.json({ tenantId: rows[0].tenant_id })}
        )
      `;
      return { status: "approved" as const };
    });
  }
}
