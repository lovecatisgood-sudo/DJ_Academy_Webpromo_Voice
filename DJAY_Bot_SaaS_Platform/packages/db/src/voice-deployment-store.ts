import { randomUUID } from "node:crypto";
import { createOpaqueToken, hashOpaqueToken } from "@djay/auth";
import type { TenantContext } from "@djay/tenancy";
import type postgres from "postgres";
import type { DatabaseClient } from "./client";
import { withTenantTransaction } from "./scoped-transaction";

function validOrigin(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1")
      && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash ? url.origin : null;
  } catch { return null; }
}

async function hasBasicAuthority(sql: postgres.TransactionSql, tenantId: string) {
  const rows = await sql<{ allowed: boolean }[]>`
    SELECT true AS allowed
    FROM tenancy.entitlement_snapshots snapshot
    JOIN tenancy.product_subscriptions subscription
      ON subscription.tenant_id = snapshot.tenant_id AND subscription.id = snapshot.subscription_id
      AND subscription.status IN ('active', 'trialing', 'scheduled_change')
    JOIN catalog.plan_versions version ON version.id = snapshot.plan_version_id
    JOIN catalog.plans plan ON plan.id = version.plan_id
      AND plan.product_key = 'voice' AND plan.plan_key = 'voice_basic_gen1'
    WHERE snapshot.tenant_id = ${tenantId}::uuid AND snapshot.product_key = 'voice'
      AND snapshot.access_mode = 'active'
      AND snapshot.resolved_json->'entitlements'->>'voice.enabled' = 'true'
      AND snapshot.resolved_json->'entitlements'->>'voice.capability_profile' = 'voice_gen1'
    ORDER BY snapshot.created_at DESC, snapshot.id DESC LIMIT 1
  `;
  return Boolean(rows[0]?.allowed);
}

export class VoiceDeploymentStore {
  constructor(private readonly client: DatabaseClient) {}

  async list(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => ({
      capability: await hasBasicAuthority(sql, context.tenantId) ? {
        enabled: true as const, publicLabel: "First-Generation Voice Engine" as const,
      } : null,
      deployments: await sql<{
        id: string; name: string; keyPrefix: string; allowedOrigins: string[];
        defaultLocale: "th" | "en"; maxCallSeconds: number; reconnectWindowSeconds: number;
        status: "active" | "disabled" | "revoked"; createdAt: Date; updatedAt: Date;
      }[]>`
        SELECT id, name, key_prefix AS "keyPrefix", allowed_origins AS "allowedOrigins",
               default_locale AS "defaultLocale", max_call_seconds AS "maxCallSeconds",
               reconnect_window_seconds AS "reconnectWindowSeconds", status,
               created_at AS "createdAt", updated_at AS "updatedAt"
        FROM tenancy.voice_deployments WHERE tenant_id = ${context.tenantId}::uuid
        ORDER BY created_at DESC, id DESC
      `,
    }));
  }

  async create(context: TenantContext, input: Readonly<{
    name: string; allowedOrigins: readonly string[]; defaultLocale: "th" | "en";
    greetingTh: string; greetingEn: string; automatedDisclosureTh: string;
    automatedDisclosureEn: string; maxCallSeconds: number; reconnectWindowSeconds: number;
  }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      if (!(await hasBasicAuthority(sql, context.tenantId))) return { status: "not_entitled" as const };
      const origins = [...new Set(input.allowedOrigins.map(validOrigin))];
      if (!origins.length || origins.some((origin) => origin === null)) return { status: "validation_failed" as const };
      const deploymentId = randomUUID();
      const deploymentKey = `djay_voice_deploy_${createOpaqueToken()}`;
      await sql`
        INSERT INTO tenancy.voice_deployments (
          id, tenant_id, name, deployment_key_hash, key_prefix, allowed_origins,
          default_locale, greeting_th, greeting_en, automated_disclosure_th,
          automated_disclosure_en, max_call_seconds, reconnect_window_seconds,
          created_by_membership_id
        ) VALUES (
          ${deploymentId}::uuid, ${context.tenantId}::uuid, ${input.name},
          ${hashOpaqueToken(deploymentKey)}, ${deploymentKey.slice(0, 20)}, ${origins as string[]},
          ${input.defaultLocale}, ${input.greetingTh}, ${input.greetingEn},
          ${input.automatedDisclosureTh}, ${input.automatedDisclosureEn},
          ${input.maxCallSeconds}, ${input.reconnectWindowSeconds}, ${context.membershipId}::uuid
        )
      `;
      await sql`
        INSERT INTO tenancy.audit_logs (
          tenant_id, actor_user_id, actor_membership_id, action, target_type,
          target_id, request_id, result, metadata
        ) VALUES (
          ${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid,
          'voice.deployment.created', 'voice_deployment', ${deploymentId}, ${context.requestId},
          'succeeded', ${sql.json({ allowedOriginCount: origins.length, publicLabel: "First-Generation Voice Engine" })}
        )
      `;
      return { status: "created" as const, deploymentId, deploymentKey };
    });
  }

  async changeStatus(context: TenantContext, deploymentId: string, action: "enable" | "disable" | "revoke") {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ status: "active" | "disabled" | "revoked" }[]>`
        SELECT status FROM tenancy.voice_deployments
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${deploymentId}::uuid FOR UPDATE
      `;
      const current = rows[0];
      if (!current) return { status: "not_found" as const };
      if (current.status === "revoked") return { status: action === "revoke" ? "unchanged" as const : "not_allowed" as const };
      if (action === "enable" && !(await hasBasicAuthority(sql, context.tenantId))) return { status: "not_entitled" as const };
      const next = action === "enable" ? "active" : action === "disable" ? "disabled" : "revoked";
      if (current.status === next) return { status: "unchanged" as const };
      await sql`
        UPDATE tenancy.voice_deployments SET status = ${next}, updated_at = now(),
          revoked_at = CASE WHEN ${next} = 'revoked' THEN now() ELSE NULL END
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${deploymentId}::uuid
      `;
      await sql`
        INSERT INTO tenancy.audit_logs (
          tenant_id, actor_user_id, actor_membership_id, action, target_type,
          target_id, request_id, result, metadata
        ) VALUES (
          ${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid,
          ${`voice.deployment.${action}`}, 'voice_deployment', ${deploymentId}, ${context.requestId},
          'succeeded', ${sql.json({ from: current.status, to: next })}
        )
      `;
      return { status: "updated" as const, deploymentStatus: next };
    });
  }
}
