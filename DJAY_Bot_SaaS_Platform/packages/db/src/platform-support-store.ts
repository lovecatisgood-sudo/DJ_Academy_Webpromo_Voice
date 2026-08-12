import { randomUUID } from "node:crypto";
import type { PlatformContext } from "@djay/tenancy";
import type { DatabaseClient } from "./client";
import { withPlatformTransaction } from "./scoped-transaction";

export class PlatformSupportStore {
  constructor(private readonly client: DatabaseClient) {}

  async listTenants(context: PlatformContext) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => sql<{
      id: string; businessName: string; slug: string; status: string;
    }[]>`
      SELECT id, business_name AS "businessName", slug, status
      FROM tenancy.tenants ORDER BY business_name, id LIMIT 1000
    `);
  }

  async tenant360(context: PlatformContext, tenantId: string) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ overview: Record<string, unknown> | null }[]>`
        SELECT platform.get_tenant_360(${tenantId}::uuid) AS overview
      `;
      return rows[0]?.overview ?? null;
    });
  }

  async incidentBoard(context: PlatformContext, input: Readonly<{ tenantId?: string; status?: "open" | "investigating" | "monitoring" | "resolved" }>) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const [incidents, tenants, operators] = await Promise.all([
        sql<{ result: readonly Record<string, unknown>[] }[]>`
          SELECT platform.get_tenant_incidents(${input.tenantId ?? null}::uuid, ${input.status ?? null}::text) AS result
        `,
        sql<{ result: readonly { id: string; businessName: string }[] }[]>`
          SELECT platform.get_incident_tenants() AS result
        `,
        sql<{ result: readonly { id: string; displayName: string; role: string }[] }[]>`
          SELECT platform.get_incident_operators() AS result
        `,
      ]);
      return Object.freeze({ incidents: incidents[0]?.result ?? [], tenants: tenants[0]?.result ?? [], operators: operators[0]?.result ?? [] });
    });
  }

  async openIncident(context: PlatformContext, input: Readonly<{
    tenantId: string; category: string; severity: string; affectedProduct: string; summary: string; idempotencyKey: string;
  }>) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ id: string }[]>`
        SELECT platform.open_tenant_incident(${input.tenantId}::uuid, ${input.category},
          ${input.severity}, ${input.affectedProduct}, ${input.summary}, ${input.idempotencyKey}::uuid) AS id
      `;
      return { status: "opened" as const, incidentId: rows[0]!.id };
    });
  }

  async transitionIncident(context: PlatformContext, input: Readonly<{
    incidentId: string; status: "investigating" | "monitoring" | "resolved"; note: string;
  }>) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ status: string }[]>`
        SELECT platform.transition_tenant_incident(${input.incidentId}::uuid, ${input.status}, ${input.note}) AS status
      `;
      return { status: rows[0]!.status };
    });
  }

  async assignIncident(context: PlatformContext, input: Readonly<{
    incidentId: string; ownerPlatformUserId: string; note: string;
  }>) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ ownerPlatformUserId: string }[]>`
        SELECT platform.assign_tenant_incident(${input.incidentId}::uuid,
          ${input.ownerPlatformUserId}::uuid, ${input.note}) AS "ownerPlatformUserId"
      `;
      return { status: "assigned" as const, ownerPlatformUserId: rows[0]!.ownerPlatformUserId };
    });
  }

  async listGrants(context: PlatformContext) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => sql<{
      id: string; tenantId: string; businessName: string; requestedByPlatformUserId: string;
      approvedByPlatformUserId: string | null; reason: string; status: string;
      startsAt: Date; expiresAt: Date; createdAt: Date;
    }[]>`
      SELECT grant_record.id, grant_record.tenant_id AS "tenantId", tenant.business_name AS "businessName",
             grant_record.requested_by_platform_user_id AS "requestedByPlatformUserId",
             grant_record.approved_by_platform_user_id AS "approvedByPlatformUserId",
             grant_record.reason,
             CASE WHEN grant_record.status IN ('active', 'approved') AND grant_record.expires_at <= now()
               THEN 'expired' ELSE grant_record.status END AS status,
             grant_record.starts_at AS "startsAt", grant_record.expires_at AS "expiresAt",
             grant_record.created_at AS "createdAt"
      FROM tenancy.support_access_grants grant_record
      JOIN tenancy.tenants tenant ON tenant.id = grant_record.tenant_id
      ORDER BY grant_record.created_at DESC LIMIT 500
    `);
  }

  async requestGrant(context: PlatformContext, input: Readonly<{ tenantId: string; reason: string; durationMinutes: number }>) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const grantId = randomUUID();
      const rows = await sql<{ id: string }[]>`
        INSERT INTO tenancy.support_access_grants (
          id, tenant_id, requested_by_platform_user_id, reason, status, starts_at, expires_at
        ) SELECT ${grantId}::uuid, tenant.id, ${context.platformUserId}::uuid, ${input.reason},
          'requested', now(), now() + (${input.durationMinutes}::text || ' minutes')::interval
        FROM tenancy.tenants tenant WHERE tenant.id = ${input.tenantId}::uuid AND tenant.status = 'active'
        RETURNING id
      `;
      if (!rows[0]) return { status: "not_found" as const };
      await sql`
        INSERT INTO platform.audit_logs (
          actor_platform_user_id, action, target_type, target_id, request_id, result, metadata
        ) VALUES (
          ${context.platformUserId}::uuid, 'support_access.requested', 'support_access_grant',
          ${grantId}, ${context.requestId}, 'succeeded',
          ${sql.json({ tenantId: input.tenantId, durationMinutes: input.durationMinutes })}
        )
      `;
      return { status: "requested" as const, grantId };
    });
  }

  async approveGrant(context: PlatformContext, grantId: string) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ tenant_id: string }[]>`
        UPDATE tenancy.support_access_grants SET
          approved_by_platform_user_id = ${context.platformUserId}::uuid,
          approved_at = now(), status = 'active'
        WHERE id = ${grantId}::uuid AND status = 'requested'
          AND requested_by_platform_user_id <> ${context.platformUserId}::uuid
          AND starts_at <= now() AND expires_at > now()
        RETURNING tenant_id
      `;
      if (!rows[0]) return { status: "not_approvable" as const };
      await sql`
        INSERT INTO platform.audit_logs (
          actor_platform_user_id, action, target_type, target_id, request_id, result, metadata
        ) VALUES (
          ${context.platformUserId}::uuid, 'support_access.approved', 'support_access_grant',
          ${grantId}, ${context.requestId}, 'succeeded', ${sql.json({ tenantId: rows[0].tenant_id })}
        )
      `;
      return { status: "active" as const };
    });
  }

  async revokeGrant(context: PlatformContext, grantId: string) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ tenant_id: string }[]>`
        UPDATE tenancy.support_access_grants SET status = 'revoked', revoked_at = now()
        WHERE id = ${grantId}::uuid AND status IN ('requested', 'approved', 'active')
        RETURNING tenant_id
      `;
      if (!rows[0]) return { status: "not_found" as const };
      await sql`
        INSERT INTO platform.audit_logs (
          actor_platform_user_id, action, target_type, target_id, request_id, result, metadata
        ) VALUES (
          ${context.platformUserId}::uuid, 'support_access.revoked', 'support_access_grant',
          ${grantId}, ${context.requestId}, 'succeeded', ${sql.json({ tenantId: rows[0].tenant_id })}
        )
      `;
      return { status: "revoked" as const };
    });
  }
}
