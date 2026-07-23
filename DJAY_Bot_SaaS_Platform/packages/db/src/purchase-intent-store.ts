import { randomUUID } from "node:crypto";
import type { PublicPlanKey } from "@djay/shared";
import type { TenantContext } from "@djay/tenancy";
import type { DatabaseClient } from "./client";
import { withTenantTransaction } from "./scoped-transaction";

const defaultTtlHours = 72;

export class PurchaseIntentStore {
  constructor(private readonly client: DatabaseClient) {}

  async createPurchaseIntent(input: Readonly<{
    planKey: PublicPlanKey;
    registrationId?: string;
    tenantId?: string;
    ttlHours?: number;
    now?: Date;
    intentId?: string;
  }>): Promise<
    | Readonly<{ status: "created"; intentId: string; planVersionId: string }>
    | Readonly<{ status: "plan_unavailable" }>
  > {
    const now = input.now ?? new Date();
    const ttlHours = input.ttlHours ?? defaultTtlHours;
    const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
    const intentId = input.intentId ?? randomUUID();

    const planRows = await this.client<{ plan_version_id: string }[]>`
      SELECT version.id AS plan_version_id
      FROM catalog.catalog_versions catalog_version
      JOIN catalog.plan_commercial_terms terms ON terms.catalog_version_id = catalog_version.id
      JOIN catalog.plan_versions version ON version.id = terms.plan_version_id
      JOIN catalog.plans plan ON plan.id = version.plan_id
      WHERE plan.plan_key = ${input.planKey}
        AND plan.status = 'active'
        AND catalog_version.status = 'active'
        AND catalog_version.effective_from <= ${now}
        AND (catalog_version.effective_to IS NULL OR catalog_version.effective_to > ${now})
        AND version.status = 'published'
        AND version.effective_from <= ${now}
        AND (version.effective_to IS NULL OR version.effective_to > ${now})
      ORDER BY version.version DESC
      LIMIT 1
    `;
    const planVersionId = planRows[0]?.plan_version_id;
    if (!planVersionId) return { status: "plan_unavailable" };

    await this.client`
      INSERT INTO billing.purchase_intents (
        id, registration_id, tenant_id, plan_key, plan_version_id,
        status, created_at, expires_at
      ) VALUES (
        ${intentId}::uuid,
        ${input.registrationId ?? null}::uuid,
        ${input.tenantId ?? null}::uuid,
        ${input.planKey},
        ${planVersionId}::uuid,
        'open',
        ${now},
        ${expiresAt}
      )
    `;

    return Object.freeze({ status: "created" as const, intentId, planVersionId });
  }

  async attachPurchaseIntentToTenant(input: Readonly<{
    tenantId: string;
    registrationId: string;
    now?: Date;
  }>): Promise<Readonly<{ status: "attached" | "none" | "already_attached" }>> {
    const now = input.now ?? new Date();
    const attached = await this.client<{ id: string }[]>`
      UPDATE billing.purchase_intents
      SET tenant_id = ${input.tenantId}::uuid
      WHERE registration_id = ${input.registrationId}::uuid
        AND status = 'open'
        AND expires_at > ${now}
        AND tenant_id IS NULL
      RETURNING id
    `;
    if (attached[0]) return { status: "attached" };

    const existing = await this.client<{ tenant_id: string }[]>`
      SELECT tenant_id
      FROM billing.purchase_intents
      WHERE registration_id = ${input.registrationId}::uuid
        AND status = 'open'
        AND expires_at > ${now}
      LIMIT 1
    `;
    if (!existing[0]) return { status: "none" };
    return existing[0].tenant_id === input.tenantId
      ? { status: "already_attached" }
      : { status: "none" };
  }

  async resolvePurchaseIntentForCheckout(
    context: TenantContext,
    intentId: string,
    now = new Date(),
  ): Promise<
    | Readonly<{ status: "ready"; planKey: PublicPlanKey; planVersionId: string }>
    | Readonly<{ status: "unavailable" }>
  > {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{
        plan_key: PublicPlanKey;
        plan_version_id: string;
      }[]>`
        SELECT plan_key, plan_version_id
        FROM billing.purchase_intents
        WHERE id = ${intentId}::uuid
          AND tenant_id = ${context.tenantId}::uuid
          AND status = 'open'
          AND expires_at > ${now}
          AND plan_version_id IS NOT NULL
        LIMIT 1
      `;
      const row = rows[0];
      if (!row?.plan_version_id) return { status: "unavailable" as const };
      return Object.freeze({
        status: "ready" as const,
        planKey: row.plan_key,
        planVersionId: row.plan_version_id,
      });
    });
  }

  async consumePurchaseIntent(input: Readonly<{
    context: TenantContext;
    intentId: string;
    checkoutIntentId: string;
    now?: Date;
  }>): Promise<Readonly<{ status: "consumed" | "replayed" | "unavailable" | "conflict" }>> {
    const now = input.now ?? new Date();
    return withTenantTransaction(this.client, input.context, async ({ sql }) => {
      const existing = await sql<{
        status: string;
        consumed_checkout_intent_id: string | null;
      }[]>`
        SELECT status, consumed_checkout_intent_id
        FROM billing.purchase_intents
        WHERE id = ${input.intentId}::uuid
          AND tenant_id = ${input.context.tenantId}::uuid
        FOR UPDATE
      `;
      const row = existing[0];
      if (!row) return { status: "unavailable" as const };
      if (row.status === "consumed") {
        if (row.consumed_checkout_intent_id === input.checkoutIntentId) {
          return { status: "replayed" as const };
        }
        return { status: "conflict" as const };
      }
      if (row.status !== "open") return { status: "unavailable" as const };

      const updated = await sql<{ id: string }[]>`
        UPDATE billing.purchase_intents
        SET status = 'consumed',
            consumed_at = ${now},
            consumed_checkout_intent_id = ${input.checkoutIntentId}::uuid
        WHERE id = ${input.intentId}::uuid
          AND tenant_id = ${input.context.tenantId}::uuid
          AND status = 'open'
          AND expires_at > ${now}
        RETURNING id
      `;
      return updated[0] ? { status: "consumed" as const } : { status: "unavailable" as const };
    });
  }

  async consumeOpenPurchaseIntentForPlan(input: Readonly<{
    context: TenantContext;
    planKey: PublicPlanKey;
    checkoutIntentId: string;
    now?: Date;
  }>): Promise<Readonly<{ status: "consumed" | "none" | "replayed" }>> {
    const now = input.now ?? new Date();
    return withTenantTransaction(this.client, input.context, async ({ sql }) => {
      const open = await sql<{ id: string }[]>`
        SELECT id
        FROM billing.purchase_intents
        WHERE tenant_id = ${input.context.tenantId}::uuid
          AND plan_key = ${input.planKey}
          AND status = 'open'
          AND expires_at > ${now}
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE
      `;
      const intentId = open[0]?.id;
      if (!intentId) {
        const replayed = await sql<{ id: string }[]>`
          SELECT id FROM billing.purchase_intents
          WHERE tenant_id = ${input.context.tenantId}::uuid
            AND consumed_checkout_intent_id = ${input.checkoutIntentId}::uuid
            AND status = 'consumed'
          LIMIT 1
        `;
        return replayed[0] ? { status: "replayed" as const } : { status: "none" as const };
      }
      await sql`
        UPDATE billing.purchase_intents
        SET status = 'consumed',
            consumed_at = ${now},
            consumed_checkout_intent_id = ${input.checkoutIntentId}::uuid
        WHERE id = ${intentId}::uuid
      `;
      return { status: "consumed" as const };
    });
  }
}
