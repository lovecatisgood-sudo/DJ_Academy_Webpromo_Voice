import { randomUUID } from "node:crypto";
import { createTenantContext } from "@djay/tenancy";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabaseClient } from "./client";
import { PurchaseIntentStore } from "./purchase-intent-store";

const tenantUrl = process.env.TENANT_DATABASE_URL;
const authUrl = process.env.AUTH_DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const enabled = Boolean(tenantUrl && authUrl && adminUrl);
const tenantClient = enabled ? createDatabaseClient(tenantUrl!) : null;
const authClient = enabled ? createDatabaseClient(authUrl!) : null;
const adminClient = enabled ? createDatabaseClient(adminUrl!) : null;

afterAll(async () => {
  await tenantClient?.end();
  await authClient?.end();
  await adminClient?.end();
});

describe.runIf(enabled)("purchase intents (Phase 3)", () => {
  it("creates, attaches on verify, resolves, and consumes idempotently", async () => {
    const now = new Date("2026-07-22T12:00:00Z");
    const registrationId = randomUUID();
    const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10";
    const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
    const membershipId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11";
    const checkoutIntentId = randomUUID();

    await adminClient!`
      INSERT INTO identity.signup_intents (
        id, idempotency_key, request_hash, email_normalized, display_name,
        business_name, password_hash, locale, timezone, terms_version,
        privacy_version, selected_plan_key, status, requested_at, expires_at
      ) VALUES (
        ${registrationId}::uuid,
        ${randomUUID()}::uuid,
        decode(repeat('ab', 32), 'hex'),
        ${`purchase-intent-${registrationId}@example.test`},
        'Purchase Intent Owner',
        'Purchase Intent Co',
        'x',
        'en',
        'Asia/Bangkok',
        '2026-01',
        '2026-01',
        'flowbot_basic',
        'verification_pending',
        -- requested_at is pinned to the same fixed clock as expires_at. It defaults
        -- to now(), so relying on that default made this a time bomb: the constraint
        -- CHECK (expires_at > requested_at) began failing once the wall clock passed
        -- the hardcoded test date, which happened the day after this was written.
        ${now},
        ${new Date(now.getTime() + 24 * 60 * 60 * 1000)}
      )
    `;

    const authStore = new PurchaseIntentStore(authClient!);
    const created = await authStore.createPurchaseIntent({
      planKey: "flowbot_basic",
      registrationId,
      now,
    });
    expect(created).toMatchObject({ status: "created" });
    if (created.status !== "created") throw new Error("expected created");

    await expect(authStore.attachPurchaseIntentToTenant({
      tenantId, registrationId, now,
    })).resolves.toEqual({ status: "attached" });
    await expect(authStore.attachPurchaseIntentToTenant({
      tenantId, registrationId, now,
    })).resolves.toEqual({ status: "already_attached" });

    const tenantStore = new PurchaseIntentStore(tenantClient!);
    const context = createTenantContext({
      tenantId, userId, membershipId,
      sessionId: randomUUID(), role: "tenant_master_admin",
      requestId: "purchase-intent-resolve",
    });

    await expect(tenantStore.resolvePurchaseIntentForCheckout(context, created.intentId, now))
      .resolves.toMatchObject({
        status: "ready",
        planKey: "flowbot_basic",
        planVersionId: created.planVersionId,
      });

    const foreign = createTenantContext({
      tenantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10",
      userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
      membershipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb11",
      sessionId: randomUUID(), role: "tenant_master_admin",
      requestId: "purchase-intent-cross-tenant",
    });
    await expect(tenantStore.resolvePurchaseIntentForCheckout(foreign, created.intentId, now))
      .resolves.toEqual({ status: "unavailable" });

    await expect(tenantStore.consumePurchaseIntent({
      context, intentId: created.intentId, checkoutIntentId, now,
    })).resolves.toEqual({ status: "consumed" });
    await expect(tenantStore.consumePurchaseIntent({
      context, intentId: created.intentId, checkoutIntentId, now,
    })).resolves.toEqual({ status: "replayed" });
    await expect(tenantStore.consumePurchaseIntent({
      context, intentId: created.intentId, checkoutIntentId: randomUUID(), now,
    })).resolves.toEqual({ status: "conflict" });
    await expect(tenantStore.resolvePurchaseIntentForCheckout(context, created.intentId, now))
      .resolves.toEqual({ status: "unavailable" });
  });

  it("does not consume a pending trial intent during paid checkout", async () => {
    const now = new Date("2026-08-17T12:00:00Z");
    const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10";
    const context = createTenantContext({
      tenantId,
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11",
      sessionId: randomUUID(),
      role: "tenant_master_admin",
      requestId: "paid-checkout-excludes-trial",
    });
    const store = new PurchaseIntentStore(tenantClient!);
    const intentId = randomUUID();
    await adminClient!`
      INSERT INTO billing.purchase_intents (
        id, tenant_id, plan_key, plan_version_id, commerce_intent,
        status, created_at, expires_at
      )
      SELECT ${intentId}::uuid, ${tenantId}::uuid, plan.plan_key, version.id,
        'trial', 'open', ${now}, ${new Date(now.getTime() + 72 * 60 * 60 * 1000)}
      FROM catalog.plan_versions version
      JOIN catalog.plans plan ON plan.id = version.plan_id
      WHERE plan.plan_key = 'ai_chat_basic'
      ORDER BY version.version DESC
      LIMIT 1
    `;

    await expect(store.consumeOpenPurchaseIntentForPlan({
      context,
      planKey: "ai_chat_basic",
      checkoutIntentId: randomUUID(),
      now,
    })).resolves.toEqual({ status: "none" });
    await expect(store.resolvePurchaseIntentForCheckout(context, intentId, now))
      .resolves.toMatchObject({ status: "ready", commerceIntent: "trial" });
  });
});
