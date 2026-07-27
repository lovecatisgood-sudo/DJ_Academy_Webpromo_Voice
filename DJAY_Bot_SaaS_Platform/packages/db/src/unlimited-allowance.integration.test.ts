import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabaseClient, type DatabaseClient } from "./client";

/**
 * Migration 0085 — `included_quantity IS NULL` means UNLIMITED, not zero.
 *
 * The catalog convention for an unlimited allowance is `allowances.<unit>: null`, which lands in
 * `tenancy.quota_accounts.included_quantity` as NULL. Both funding paths previously wrapped it in
 * `COALESCE(account.included_quantity, 0)`, so unlimited collapsed to an allowance of zero and
 * every reservation was refused as `allowance_exhausted`. This suite pins the corrected meaning
 * in both paths so the defect cannot silently return.
 *
 * Runs against the disposable PostgreSQL 16 container from `scripts/test-db-integration.sh`,
 * never a hosted database.
 *
 * Fixture rules, matching the sibling suites: the only tenants that exist are the two in
 * `packages/db/tests/seed.sql`, and `packages/db/tests/p9-restore-assert.sql` pins that count at
 * exactly 2 — so this suite creates no tenants and no memberships, and provisions only a
 * subscription, an entitlement snapshot, and a quota account for a seeded tenant.
 */

const enabled = Boolean(process.env.FLOWBOT_DATABASE_URL && process.env.ADMIN_DATABASE_URL);

// Seeded tenant A.
const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10";
const premiumPlanVersionId = "62000000-0000-4000-8000-000000000102";

/** Provisions fixtures and reads the ledger. */
let adminClient: DatabaseClient | null = null;
/**
 * Calls the funding authority.
 *
 * `reserve_customer_usage` refuses any caller outside the runtime roles with
 * `usage_funding_role_required`, so it must be invoked as one — `postgres` is rejected, which
 * is the guard behaving correctly. `djay_flowbot_runtime` is used rather than `djay_runtime`
 * because the latter additionally requires a matching `app.tenant_id` setting, and role
 * plumbing is not what this suite is testing.
 */
let flowbotClient: DatabaseClient | null = null;
let subscriptionId = "";
let snapshotId = "";

/**
 * Provision FlowBot authority with a caller-chosen included allowance.
 *
 * `includedQuantity: null` is the unlimited case under test; a number is the finite control.
 * `safetyCap` is separate on purpose — unlimited must still respect the abuse floor, and the
 * tests below assert that it does.
 */
async function provisionQuota(includedQuantity: number | null, safetyCap: number | null) {
  subscriptionId = randomUUID();
  snapshotId = randomUUID();
  const resolved = {
    tenantId, subscriptionId, productKey: "flowbot", publicPlanKey: "flowbot_premium",
    planVersionId: premiumPlanVersionId, accessMode: "active",
    entitlements: { "channel.web": true, "flow.nodes.core": true },
    allowances: { flow_execution: includedQuantity },
    overageRatesMinor: { flow_execution: null },
    limits: { active_bots: 3, workspaces: 1, topics: 500, seats: 3, social_channels: 5 },
    resolvedAt: new Date().toISOString(),
  };

  await adminClient!`
    UPDATE tenancy.product_subscriptions SET status = 'cancelled', cancelled_at = now()
    WHERE tenant_id = ${tenantId}::uuid AND product_key = 'flowbot' AND status <> 'cancelled'
  `;
  await adminClient!`
    INSERT INTO tenancy.product_subscriptions
      (id, tenant_id, product_key, plan_version_id, status, period_start, period_end)
    VALUES (${subscriptionId}::uuid, ${tenantId}::uuid, 'flowbot', ${premiumPlanVersionId}::uuid,
      'active', now(), now() + interval '1 year')
  `;
  await adminClient!`
    INSERT INTO tenancy.entitlement_snapshots
      (id, tenant_id, subscription_id, product_key, plan_version_id, subscription_status,
       access_mode, resolved_json, resolution_hash)
    VALUES (${snapshotId}::uuid, ${tenantId}::uuid, ${subscriptionId}::uuid, 'flowbot',
      ${premiumPlanVersionId}::uuid, 'active', 'active',
      ${adminClient!.json(resolved)}, digest(${snapshotId}, 'sha256'))
  `;
  await adminClient!`
    INSERT INTO tenancy.quota_accounts
      (tenant_id, subscription_id, product_key, customer_unit, period_start, period_end,
       included_quantity, safety_cap_quantity)
    VALUES (${tenantId}::uuid, ${subscriptionId}::uuid, 'flowbot', 'flow_execution',
      now() - interval '1 minute', now() + interval '1 year',
      ${includedQuantity}, ${safetyCap})
  `;
}

type Reservation = {
  status: string;
  reason_code: string | null;
  reserved_quantity: string;
  replayed: boolean;
};

/** Call the authority function the same way the runtime does. */
async function reserve(quantity: number): Promise<Reservation> {
  const rows = await flowbotClient!<Reservation[]>`
    SELECT status, reason_code, reserved_quantity, replayed
    FROM tenancy.reserve_customer_usage(
      ${tenantId}::uuid, ${subscriptionId}::uuid, ${snapshotId}::uuid, ${randomUUID()}::uuid,
      'flowbot', 'flow_execution', ${`op-${randomUUID()}`}, ${`idem-${randomUUID()}`}, ${quantity}
    )
  `;
  return rows[0]!;
}

/** The funding split recorded for a reservation, to prove WHICH source paid. */
async function fundingFor(idempotencyPrefix: string) {
  const rows = await adminClient!<{ funding_json: Record<string, number> }[]>`
    SELECT funding_json FROM tenancy.usage_reservations
    WHERE tenant_id = ${tenantId}::uuid AND idempotency_key LIKE ${`${idempotencyPrefix}%`}
    ORDER BY created_at DESC LIMIT 1
  `;
  return rows[0]?.funding_json ?? null;
}

beforeAll(async () => {
  if (!enabled) return;
  adminClient = createDatabaseClient(process.env.ADMIN_DATABASE_URL!);
  flowbotClient = createDatabaseClient(process.env.FLOWBOT_DATABASE_URL!);
});

afterAll(async () => {
  await Promise.all([adminClient?.end(), flowbotClient?.end()]);
});

/*
 * Deliberately no beforeEach cleanup.
 *
 * `tenancy.usage_events` is an append-only ledger — a trigger raises `usage_events is
 * immutable` on DELETE, which is correct: financial evidence must not be erasable, including
 * by tests. Isolation therefore comes from fresh identifiers rather than truncation:
 * `provisionQuota` mints a new subscription (and so a new quota account) per case, and every
 * reservation uses a fresh operation id and idempotency key.
 */

describe.skipIf(!enabled)("0085 unlimited included allowance", () => {
  it("funds a reservation far beyond any finite allowance when included_quantity IS NULL", async () => {
    // No safety cap: unlimited must mean unlimited.
    await provisionQuota(null, null);

    const result = await reserve(5_000_000);

    expect(result.status, "unlimited allowance must fund, not reject").toBe("reserved");
    expect(result.reason_code).toBeNull();
    expect(Number(result.reserved_quantity)).toBe(5_000_000);
  });

  it("attributes the whole reservation to included funding, not packs or overage", async () => {
    await provisionQuota(null, null);

    const idempotencyKey = `unlimited-${randomUUID()}`;
    await flowbotClient!`
      SELECT * FROM tenancy.reserve_customer_usage(
        ${tenantId}::uuid, ${subscriptionId}::uuid, ${snapshotId}::uuid, ${randomUUID()}::uuid,
        'flowbot', 'flow_execution', ${`op-${randomUUID()}`}, ${idempotencyKey}, ${1_000}
      )
    `;

    // The funding split is the real assertion: an unlimited plan must not silently consume
    // usage packs or accrue billable overage that the merchant never agreed to.
    expect(await fundingFor(idempotencyKey)).toEqual({ included: 1_000, packs: 0, overage: 0 });
  });

  it("keeps funding successive reservations — unlimited does not deplete", async () => {
    await provisionQuota(null, null);

    for (const quantity of [100_000, 250_000, 900_000]) {
      const result = await reserve(quantity);
      expect(result.status, `reserving ${quantity} after prior commitments`).toBe("reserved");
    }
  });

  it("still enforces the safety cap when the allowance is unlimited", async () => {
    // Unlimited is a commercial statement, not a licence to run away. The abuse floor stands.
    await provisionQuota(null, 1_000);

    const withinCap = await reserve(400);
    expect(withinCap.status).toBe("reserved");

    const overCap = await reserve(900);
    expect(overCap.status, "safety cap must still refuse").toBe("rejected");
    expect(overCap.reason_code).toBe("safety_cap");
  });

  it("still exhausts a finite allowance — the fix must not make every plan unlimited", async () => {
    // The control case. If a finite plan stopped exhausting, the fix would be a revenue leak
    // rather than a correction.
    //
    // The safety cap is set explicitly ABOVE the allowance so that `allowance_exhausted` is
    // what gets observed. Leaving it NULL would not test this: the pre-existing
    // `tenancy_quota_default_safety_cap` trigger (migration 0047) copies included_quantity into
    // an unset cap, so a finite plan would refuse with `safety_cap` first and the allowance
    // path would never be reached. That same trigger leaves the cap NULL when the allowance is
    // NULL, which is why unlimited plans are genuinely uncapped.
    await provisionQuota(500, 10_000);

    const first = await reserve(500);
    expect(first.status).toBe("reserved");

    const second = await reserve(1);
    expect(second.status, "finite allowance must still exhaust").toBe("rejected");
    expect(second.reason_code).toBe("allowance_exhausted");
  });

  it("rejects an unlimited-allowance reservation that is not entitled", async () => {
    await provisionQuota(null, null);
    // Cancelling the subscription must withdraw authority regardless of allowance shape —
    // "unlimited" must not become a bypass of the entitlement check.
    await adminClient!`
      UPDATE tenancy.product_subscriptions SET status = 'cancelled', cancelled_at = now()
      WHERE tenant_id = ${tenantId}::uuid AND id = ${subscriptionId}::uuid
    `;

    const result = await reserve(1);
    expect(result.status).toBe("rejected");
    expect(result.reason_code).toBe("not_entitled");
  });
});
