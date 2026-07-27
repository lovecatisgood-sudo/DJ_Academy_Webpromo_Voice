import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabaseClient, type DatabaseClient } from "./client";

/**
 * Migration 0086 — AI Chat social gate parity with FlowBot's 0082.
 *
 * The five AI social SECURITY DEFINER functions used to require `plan_key = 'ai_chat_premium'`,
 * so an AI Chat Starter tenant who bought the `additional_social_channel` add-on was charged and
 * then refused at the database boundary. 0086 replaced that with
 * `tenancy.ai_social_channel_entitled(...)`, which is what this suite pins.
 *
 * ## What this proves, and what it does not
 *
 * It exercises the commercial rule directly: which plan/add-on combinations are entitled, and
 * that the helper cannot be used to probe another tenant. It does NOT re-verify that each of the
 * five functions calls the helper — that is established by the mechanical diff recorded in 0086
 * (every block differs from its source by exactly the four substituted lines) and by
 * `migration-function-lineage.test.ts`, which asserts no clause was lost in the recreation.
 *
 * Runs against the disposable PostgreSQL 16 container from `scripts/test-db-integration.sh`,
 * never a hosted database.
 *
 * Fixture rules, matching the sibling suites: the only tenants that exist are the two in
 * `packages/db/tests/seed.sql` and `p9-restore-assert.sql` pins that count at exactly 2, so this
 * suite creates no tenants and no memberships.
 */

const enabled = Boolean(process.env.ADMIN_DATABASE_URL && process.env.TENANT_DATABASE_URL);

// Seeded tenants A and B.
const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10";
const otherTenantId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10";

let adminClient: DatabaseClient | null = null;
let tenantClient: DatabaseClient | null = null;
let subscriptionId = "";

/** The `resolved_json` shape the helper reads. `social` toggles the plan-level entitlement. */
function resolved(social: boolean) {
  return { entitlements: { "channel.social": social, "channel.line": true } };
}

/** Ask the helper directly, as the platform superuser (no tenant-context guard applies). */
async function entitled(social: boolean): Promise<boolean> {
  const rows = await adminClient!<{ result: boolean }[]>`
    SELECT tenancy.ai_social_channel_entitled(
      ${tenantId}::uuid, ${subscriptionId}::uuid, ${adminClient!.json(resolved(social))}
    ) AS result
  `;
  return rows[0]!.result;
}

async function grantAddOn(options: { status: string; effectiveUntil: string | null }) {
  await adminClient!`
    INSERT INTO tenancy.subscription_add_ons
      (tenant_id, subscription_id, add_on_key, quantity, status, effective_from, effective_until)
    VALUES (${tenantId}::uuid, ${subscriptionId}::uuid, 'additional_social_channel', 1,
      ${options.status}, now() - interval '1 hour',
      ${options.effectiveUntil}::timestamptz)
  `;
}

beforeAll(async () => {
  if (!enabled) return;
  adminClient = createDatabaseClient(process.env.ADMIN_DATABASE_URL!);
  tenantClient = createDatabaseClient(process.env.TENANT_DATABASE_URL!);

  /*
   * Borrow one of the seeded tenant's existing subscriptions rather than creating one.
   *
   * `subscription_add_ons` has a composite foreign key to
   * `product_subscriptions(tenant_id, id)`, so an add-on needs a real subscription. But
   * creating one means first cancelling the live one to satisfy
   * `tenancy_one_live_subscription_per_product` — and an earlier version of this suite did
   * exactly that, left the replacement behind, and broke the Voice/Text legacy migration
   * rehearsal that runs later against the same shared database.
   *
   * Reading an existing row keeps this suite a pure reader of commercial state. The helper
   * under test does not care which product the subscription belongs to; it only matches
   * add-on rows by (tenant_id, subscription_id).
   */
  const rows = await adminClient<{ id: string }[]>`
    SELECT id FROM tenancy.product_subscriptions
    WHERE tenant_id = ${tenantId}::uuid
    ORDER BY created_at DESC, id DESC LIMIT 1
  `;
  if (!rows[0]) throw new Error("seeded tenant has no subscription to attach an add-on to");
  subscriptionId = rows[0].id;
});

afterAll(async () => {
  // Clean up before closing the clients — a second afterAll would race this one.
  if (enabled && adminClient) {
    await adminClient`
      DELETE FROM tenancy.subscription_add_ons
      WHERE tenant_id = ${tenantId}::uuid AND add_on_key = 'additional_social_channel'
    `;
  }
  await Promise.all([adminClient?.end(), tenantClient?.end()]);
});

beforeEach(async () => {
  if (!enabled) return;
  // Only the add-on varies between cases; the borrowed subscription is left untouched.
  await adminClient!`
    DELETE FROM tenancy.subscription_add_ons
    WHERE tenant_id = ${tenantId}::uuid AND add_on_key = 'additional_social_channel'
  `;
});

describe.skipIf(!enabled)("0086 AI Chat social gate parity", () => {
  it("refuses a Starter plan with no social entitlement and no add-on", async () => {
    expect(await entitled(false)).toBe(false);
  });

  it("allows a plan whose entitlements already include social", async () => {
    expect(await entitled(true)).toBe(true);
  });

  it("allows a Starter plan that bought the additional_social_channel add-on", async () => {
    // The defect this migration fixes: before 0086 this combination was charged and refused.
    await grantAddOn({ status: "active", effectiveUntil: null });
    expect(await entitled(false)).toBe(true);
  });

  it("keeps serving a scheduled_end add-on until its effective_until passes", async () => {
    // The merchant has paid through the end of the term; service must not stop early.
    await grantAddOn({ status: "scheduled_end", effectiveUntil: new Date(Date.now() + 86_400_000).toISOString() });
    expect(await entitled(false)).toBe(true);
  });

  it("stops serving an add-on once effective_until has passed", async () => {
    await grantAddOn({ status: "active", effectiveUntil: new Date(Date.now() - 60_000).toISOString() });
    expect(await entitled(false)).toBe(false);
  });

  it("ignores an ended add-on", async () => {
    // Valid statuses are pending | active | scheduled_end | ended (migration 0045). Only
    // 'active' and 'scheduled_end' confer service.
    await grantAddOn({ status: "ended", effectiveUntil: null });
    expect(await entitled(false)).toBe(false);
  });

  it("ignores a pending add-on that has not been paid for yet", async () => {
    await grantAddOn({ status: "pending", effectiveUntil: null });
    expect(await entitled(false)).toBe(false);
  });

  it("refuses to answer for a tenant other than the caller's own", async () => {
    // The helper is SECURITY DEFINER and takes the tenant as a parameter, so without this guard
    // the tenant role could learn whether ANY tenant holds a paid add-on. Cross-tenant probing
    // must fail closed rather than return a boolean.
    await expect(
      tenantClient!.begin(async (sql) => {
        await sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
        return sql`
          SELECT tenancy.ai_social_channel_entitled(
            ${otherTenantId}::uuid, ${subscriptionId}::uuid, ${tenantClient!.json(resolved(false))}
          ) AS result
        `;
      }),
    ).rejects.toThrow(/ai_social_entitlement_tenant_context_required/);
  });
});
