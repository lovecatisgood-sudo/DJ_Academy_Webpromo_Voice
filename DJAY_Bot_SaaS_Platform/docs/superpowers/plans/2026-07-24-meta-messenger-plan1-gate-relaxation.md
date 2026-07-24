# Meta Messenger — Plan 1: Social entitlement gate relaxation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Authorize FlowBot social connections for **Premium** tenants *and* **Basic tenants who hold an active `additional_social_channel` add-on**, replacing the hard-coded `flowbot_premium`-only gate — so the later Meta self-serve flow can be used by both.

**Architecture:** The social gate is enforced in 4 places: the TS connection-create query, the TS worker `preparedTurnSchema`, and three SECURITY-DEFINER SQL functions (`flow_social_runtime_connection`, `claim_flow_social_inbound`, `prepare_flow_social_turn`). We relax all of them from "plan_key = 'flowbot_premium' AND channel.social = true" to "product_key = 'flowbot' AND (channel.social = true OR active additional_social_channel add-on)". SQL functions are already applied, so we ship a new `CREATE OR REPLACE` migration rather than editing history.

**Tech Stack:** TypeScript, PostgreSQL (plpgsql SECURITY DEFINER functions), `postgres` (porsager) tagged-template client, Vitest (DB-gated integration tests via `describe.runIf`).

## Global Constraints

- New product work stays in `DJAY_Bot_SaaS_Platform/` — root app untouched.
- Provider/model names never exposed on any surface (not relevant to this plan, but holds).
- Migrations are append-only: never edit an applied migration; add a new numbered file.
- This plan is the entitlement **mechanism** only. The catalog price change (Basic 100k conversations, add-on 299→1,500 THB) is a **separate** pricing slice (see `flowbot-pricing-model-2026-07` memory) and is NOT required here — the integration test seeds its own entitlement snapshot + add-on row directly.
- The reusable relaxed authorization predicate (call it **SOCIAL_GATE**), where `<snap>` is the entitlement-snapshot alias in each query:
  ```sql
  (<snap>.resolved_json->'entitlements'->>'channel.social' = 'true'
   OR EXISTS (
     SELECT 1 FROM tenancy.subscription_add_ons social_add_on
     WHERE social_add_on.tenant_id = <snap>.tenant_id
       AND social_add_on.subscription_id = <snap>.subscription_id
       AND social_add_on.add_on_key = 'additional_social_channel'
       AND social_add_on.status IN ('active', 'scheduled_end')
       AND social_add_on.effective_from <= now()
       AND (social_add_on.effective_until IS NULL OR social_add_on.effective_until > now())
   ))
  ```
  and the plan-restriction join changes from `... AND plan.plan_key = 'flowbot_premium'` to `... AND plan.product_key = 'flowbot'`.

---

### Task 1: Failing integration test — Basic + social add-on is authorized

**Files:**
- Modify/Test: `packages/db/src/flowbot-social-store.integration.test.ts`

**Interfaces:**
- Consumes: `FlowSocialConnectionStore.create(context, {botId, channel, name, externalAccountRef, credentials, envelopeKey})` → `{status:"created"|"not_entitled"|..., connectionId?, webhookKey?}`; `FlowBotStore` (createBot/updateDraft/publish); existing helpers in the test file.
- Produces: a new `provisionBasicWithSocialAddOn(tenantId, {withAddOn})` helper and two `it(...)` cases used only within this test file.

- [ ] **Step 1: Add the Basic-authority helper**

Add below `provisionCurrentAdvancedAuthority` (after line 58). Basic entitlements mirror the `flowbot_basic` catalog row (`channel.social:false`, `flow.nodes.advanced:false`); `withAddOn` optionally inserts an active `additional_social_channel` add-on.

```ts
async function provisionBasicWithSocialAddOn(tenantId: string, options: { withAddOn: boolean }) {
  const subscriptionId = randomUUID();
  const snapshotId = randomUUID();
  const planVersionId = "62000000-0000-4000-8000-000000000101"; // flowbot_basic
  const resolved = {
    tenantId, subscriptionId, productKey: "flowbot", publicPlanKey: "flowbot_basic", planVersionId,
    accessMode: "active",
    entitlements: {
      "channel.web": true, "channel.social": false, "ai.enabled": false,
      "flow.nodes.core": true, "flow.nodes.advanced": false, "flow.forms": true,
      "flow.versioning": true, "flow.lead_capture": true, "flow.email_notification": true,
      "flow.team_routing": "limited", "flow.webhook": false, "branding.remove": false,
      "analytics.level": "basic", "support.level": "standard",
    },
    allowances: { flow_execution: 100_000 }, overageRatesMinor: { flow_execution: null },
    limits: { active_bots: 1, workspaces: 1, topics: 150, seats: 1, social_channels: 0 },
    resolvedAt: new Date().toISOString(),
  };
  await adminClient!`
    UPDATE tenancy.product_subscriptions SET status = 'cancelled', cancelled_at = now()
    WHERE tenant_id = ${tenantId}::uuid AND product_key = 'flowbot' AND status <> 'cancelled'
  `;
  await adminClient!`
    INSERT INTO tenancy.product_subscriptions
      (id, tenant_id, product_key, plan_version_id, status, period_start, period_end)
    VALUES (${subscriptionId}::uuid, ${tenantId}::uuid, 'flowbot', ${planVersionId}::uuid,
      'active', now(), now() + interval '1 year')
  `;
  await adminClient!`
    INSERT INTO tenancy.entitlement_snapshots
      (id, tenant_id, subscription_id, product_key, plan_version_id, subscription_status,
       access_mode, resolved_json, resolution_hash)
    VALUES (${snapshotId}::uuid, ${tenantId}::uuid, ${subscriptionId}::uuid, 'flowbot',
      ${planVersionId}::uuid, 'active', 'active', ${adminClient!.json(resolved)}, digest(${snapshotId}, 'sha256'))
  `;
  await adminClient!`
    INSERT INTO tenancy.quota_accounts
      (tenant_id, subscription_id, product_key, customer_unit, period_start, period_end,
       included_quantity, safety_cap_quantity)
    VALUES (${tenantId}::uuid, ${subscriptionId}::uuid, 'flowbot', 'flow_execution',
      now() - interval '1 minute', now() + interval '1 year', 100000, 100000)
  `;
  if (options.withAddOn) {
    await adminClient!`
      INSERT INTO tenancy.subscription_add_ons
        (tenant_id, subscription_id, add_on_key, quantity, status, effective_from)
      VALUES (${tenantId}::uuid, ${subscriptionId}::uuid, 'additional_social_channel', 1, 'active', now() - interval '1 minute')
    `;
  }
}
```

- [ ] **Step 2: Add the positive + negative test cases**

Add these two `it(...)` blocks inside the `describe.runIf(enabled)(...)` block (after the existing test, before the closing `});` on line 124). They use fresh tenant IDs so they don't collide with the premium test.

```ts
it("authorizes a Basic tenant holding an active additional_social_channel add-on", async () => {
  const context = createTenantContext({ tenantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb20",
    userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2", membershipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb21",
    sessionId: randomUUID(), role: "tenant_master_admin", requestId: `flow-social-basic-${randomUUID()}` });
  await provisionBasicWithSocialAddOn(context.tenantId, { withAddOn: true });
  await adminClient!`UPDATE tenancy.flow_bots SET status = 'archived', updated_at = now()
    WHERE tenant_id = ${context.tenantId}::uuid AND status <> 'archived'`;
  const flow = new FlowBotStore(tenantClient!);
  const created = await flow.createBot(context, { name: "Basic LINE assistant", defaultLanguage: "en" });
  if (created.status !== "created") throw new Error("Expected Flow bot.");
  const draft = await flow.getDraft(context, created.botId); const root = randomUUID(); const end = randomUUID(); const option = randomUUID();
  await flow.updateDraft(context, created.botId, { revision: draft!.revision, definition: {
    schemaVersion: 1, flowVersionId: randomUUID(), rootNodeId: root, keywords: [], nodes: {
      [root]: { id: root, type: "options", title: "Department", prompt: { th: "เลือกทีม", en: "Choose a team" },
        options: [{ id: option, label: { th: "ฝ่ายขาย", en: "Sales" }, targetNodeId: end }] },
      [end]: { id: end, type: "end", title: "Done", message: { th: "ทีมงานจะติดต่อกลับ", en: "The team will follow up." } },
    } } });
  await flow.publish(context, created.botId);
  const connections = new FlowSocialConnectionStore(tenantClient!);
  const connected = await connections.create(context, { botId: created.botId, channel: "line", name: "Basic LINE OA",
    externalAccountRef: `line-${randomUUID()}`,
    credentials: { channel: "line", channelAccessToken: "line-access-token-value", channelSecret: "line-channel-secret-value" }, envelopeKey });
  expect(connected.status).toBe("created");
});

it("rejects a Basic tenant with no social add-on", async () => {
  const context = createTenantContext({ tenantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb30",
    userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3", membershipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb31",
    sessionId: randomUUID(), role: "tenant_master_admin", requestId: `flow-social-basic-none-${randomUUID()}` });
  await provisionBasicWithSocialAddOn(context.tenantId, { withAddOn: false });
  await adminClient!`UPDATE tenancy.flow_bots SET status = 'archived', updated_at = now()
    WHERE tenant_id = ${context.tenantId}::uuid AND status <> 'archived'`;
  const flow = new FlowBotStore(tenantClient!);
  const created = await flow.createBot(context, { name: "Basic no-addon", defaultLanguage: "en" });
  if (created.status !== "created") throw new Error("Expected Flow bot.");
  const draft = await flow.getDraft(context, created.botId); const root = randomUUID(); const end = randomUUID();
  await flow.updateDraft(context, created.botId, { revision: draft!.revision, definition: {
    schemaVersion: 1, flowVersionId: randomUUID(), rootNodeId: root, keywords: [], nodes: {
      [root]: { id: root, type: "end", title: "Done", message: { th: "ปิด", en: "Closed" } },
    } } });
  await flow.publish(context, created.botId);
  const connections = new FlowSocialConnectionStore(tenantClient!);
  const rejected = await connections.create(context, { botId: created.botId, channel: "line", name: "Blocked LINE OA",
    externalAccountRef: `line-${randomUUID()}`,
    credentials: { channel: "line", channelAccessToken: "line-access-token-value", channelSecret: "line-channel-secret-value" }, envelopeKey });
  expect(rejected.status).toBe("not_entitled");
});
```

- [ ] **Step 3: Run the tests and confirm the positive case FAILS**

Run (DB env vars required — the suite self-skips without them):
```bash
cd packages/db && TENANT_DATABASE_URL=$TENANT_DATABASE_URL FLOWBOT_DATABASE_URL=$FLOWBOT_DATABASE_URL \
  WORKER_DATABASE_URL=$WORKER_DATABASE_URL ADMIN_DATABASE_URL=$ADMIN_DATABASE_URL \
  pnpm vitest run src/flowbot-social-store.integration.test.ts
```
Expected: the "authorizes a Basic tenant…" case **FAILS** (`connected.status` is `"not_entitled"`, not `"created"`) because the create gate still requires `flowbot_premium`. The "rejects a Basic tenant with no social add-on" case **passes**.

---

### Task 2: Relax the gate (TS create query, worker schema, SQL functions) to green

**Files:**
- Create: `packages/db/migrations/0082_flowbot_social_gate_relaxation.sql`
- Modify: `packages/db/src/flowbot-social-store.ts:34-51` (create query) and `:143` (`preparedTurnSchema.planKey`)

**Interfaces:**
- Consumes: `SOCIAL_GATE` predicate + `product_key='flowbot'` join change (Global Constraints).
- Produces: relaxed authorization across all four enforcement points; no signature changes — `create()` and the worker schemas keep their existing shapes, only widening who is authorized.

- [ ] **Step 1: Relax the TS create query**

In `packages/db/src/flowbot-social-store.ts`, replace the `plan.plan_key = 'flowbot_premium'` join and the `channel.social = 'true'` WHERE clause inside the `authority` query (currently lines 43-50). New query body (the `CASE … socialChannelLimit` block at lines 36-42 is unchanged):

```ts
        FROM tenancy.entitlement_snapshots snapshot
        JOIN tenancy.product_subscriptions subscription ON subscription.tenant_id = snapshot.tenant_id
          AND subscription.id = snapshot.subscription_id AND subscription.status IN ('active', 'trialing', 'scheduled_change')
        JOIN catalog.plan_versions version ON version.id = snapshot.plan_version_id
        JOIN catalog.plans plan ON plan.id = version.plan_id AND plan.product_key = 'flowbot'
        WHERE snapshot.tenant_id = ${context.tenantId}::uuid AND snapshot.product_key = 'flowbot'
          AND snapshot.access_mode = 'active'
          AND (snapshot.resolved_json->'entitlements'->>'channel.social' = 'true'
            OR EXISTS (SELECT 1 FROM tenancy.subscription_add_ons social_add_on
              WHERE social_add_on.tenant_id = snapshot.tenant_id AND social_add_on.subscription_id = snapshot.subscription_id
                AND social_add_on.add_on_key = 'additional_social_channel' AND social_add_on.status IN ('active', 'scheduled_end')
                AND social_add_on.effective_from <= now() AND (social_add_on.effective_until IS NULL OR social_add_on.effective_until > now())))
        ORDER BY snapshot.created_at DESC, snapshot.id DESC LIMIT 1
```

- [ ] **Step 2: Relax the worker preparedTurnSchema planKey**

In `packages/db/src/flowbot-social-store.ts:143`, change:
```ts
  authority_json: z.object({ planKey: z.literal("flowbot_premium"), accessMode: z.literal("active"),
```
to:
```ts
  authority_json: z.object({ planKey: z.enum(["flowbot_basic", "flowbot_premium"]), accessMode: z.literal("active"),
```

- [ ] **Step 3: Create the SQL relaxation migration**

Create `packages/db/migrations/0082_flowbot_social_gate_relaxation.sql`. It `CREATE OR REPLACE`s the three functions verbatim from `0067`/`0068` with ONLY the plan-join and channel.social predicate relaxed (bodies preserved otherwise), then re-applies REVOKE/GRANT.

```sql
-- Relax FlowBot social authorization from flowbot_premium-only to
-- product_key='flowbot' AND (channel.social OR active additional_social_channel add-on).
-- Bodies copied from 0067_flowbot_social_transport.sql and 0068_flowbot_social_workers.sql;
-- only the plan-restriction join and the channel.social predicate are changed.

CREATE OR REPLACE FUNCTION tenancy.flow_social_runtime_connection(target_webhook_key_hash bytea, target_channel text)
RETURNS TABLE (connection_id uuid, tenant_id uuid, channel text, credential_ciphertext text, credential_key_version integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, tenancy, catalog AS $$
  SELECT connection.id, connection.tenant_id, connection.channel,
         connection.credential_ciphertext, connection.credential_key_version
  FROM tenancy.flow_social_connections connection
  JOIN tenancy.flow_deployments deployment ON deployment.tenant_id = connection.tenant_id AND deployment.id = connection.deployment_id
  JOIN tenancy.flow_bots bot ON bot.tenant_id = connection.tenant_id AND bot.id = connection.bot_id
  WHERE octet_length(target_webhook_key_hash) = 32 AND target_channel IN ('line', 'messenger')
    AND connection.webhook_key_hash = target_webhook_key_hash AND connection.channel = target_channel
    AND connection.status = 'active' AND deployment.status = 'active' AND bot.status = 'active'
    AND bot.current_published_version_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM tenancy.entitlement_snapshots snapshot
      JOIN tenancy.product_subscriptions subscription ON subscription.tenant_id = snapshot.tenant_id
        AND subscription.id = snapshot.subscription_id AND subscription.status IN ('active', 'trialing', 'scheduled_change')
      JOIN catalog.plan_versions version ON version.id = snapshot.plan_version_id
      JOIN catalog.plans plan ON plan.id = version.plan_id AND plan.product_key = 'flowbot'
      WHERE snapshot.tenant_id = connection.tenant_id AND snapshot.product_key = 'flowbot'
        AND snapshot.access_mode = 'active'
        AND (snapshot.resolved_json->'entitlements'->>'channel.social' = 'true'
          OR EXISTS (SELECT 1 FROM tenancy.subscription_add_ons social_add_on
            WHERE social_add_on.tenant_id = snapshot.tenant_id AND social_add_on.subscription_id = snapshot.subscription_id
              AND social_add_on.add_on_key = 'additional_social_channel' AND social_add_on.status IN ('active', 'scheduled_end')
              AND social_add_on.effective_from <= now() AND (social_add_on.effective_until IS NULL OR social_add_on.effective_until > now())))
    )
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION tenancy.claim_flow_social_inbound(claim_time timestamptz, stale_before timestamptz)
RETURNS TABLE (outbox_id uuid, receipt_id uuid, tenant_id uuid, connection_id uuid, channel text,
  event_type text, subject_hash bytea, normalized_json jsonb, credential_ciphertext text,
  attempt_count integer, processing_allowed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy, catalog AS $$
BEGIN
  IF session_user <> 'djay_worker' OR current_setting('app.service', true) IS DISTINCT FROM 'flow_social_worker' THEN
    RAISE EXCEPTION 'Flow social worker context required'; END IF;
  RETURN QUERY WITH candidate AS (
    SELECT candidate_outbox.id FROM tenancy.outbox candidate_outbox
    WHERE candidate_outbox.topic = 'flowbot.social.inbound.received' AND candidate_outbox.available_at <= claim_time
      AND candidate_outbox.attempt_count < 10 AND (candidate_outbox.status IN ('pending', 'failed')
        OR (candidate_outbox.status = 'processing' AND candidate_outbox.locked_at < stale_before))
    ORDER BY candidate_outbox.available_at, candidate_outbox.created_at, candidate_outbox.id
    FOR UPDATE SKIP LOCKED LIMIT 1
  ), claimed AS (
    UPDATE tenancy.outbox target SET status = 'processing', locked_at = claim_time,
      attempt_count = target.attempt_count + 1, last_error_code = NULL FROM candidate
    WHERE target.id = candidate.id RETURNING target.*
  )
  SELECT claimed.id, receipt.id, claimed.tenant_id, connection.id, receipt.channel,
    receipt.event_type, receipt.subject_hash, receipt.normalized_json,
    CASE WHEN connection.status = 'active' THEN connection.credential_ciphertext ELSE NULL END,
    claimed.attempt_count,
    COALESCE(receipt.disposition = 'accepted' AND connection.status = 'active'
      AND deployment.status = 'active' AND bot.status = 'active' AND bot.current_published_version_id IS NOT NULL
      AND receipt.normalized_json->>'subjectCiphertext' IS NOT NULL
      AND EXISTS (SELECT 1 FROM tenancy.entitlement_snapshots snapshot
        JOIN tenancy.product_subscriptions subscription ON subscription.tenant_id = snapshot.tenant_id
          AND subscription.id = snapshot.subscription_id AND subscription.status IN ('active', 'trialing', 'scheduled_change')
        JOIN catalog.plan_versions version ON version.id = snapshot.plan_version_id
        JOIN catalog.plans plan ON plan.id = version.plan_id AND plan.product_key = 'flowbot'
        WHERE snapshot.tenant_id = claimed.tenant_id AND snapshot.product_key = 'flowbot'
          AND snapshot.access_mode = 'active'
          AND (snapshot.resolved_json->'entitlements'->>'channel.social' = 'true'
            OR EXISTS (SELECT 1 FROM tenancy.subscription_add_ons social_add_on
              WHERE social_add_on.tenant_id = snapshot.tenant_id AND social_add_on.subscription_id = snapshot.subscription_id
                AND social_add_on.add_on_key = 'additional_social_channel' AND social_add_on.status IN ('active', 'scheduled_end')
                AND social_add_on.effective_from <= now() AND (social_add_on.effective_until IS NULL OR social_add_on.effective_until > now())))), false)
  FROM claimed
  JOIN tenancy.flow_social_receipts receipt ON receipt.tenant_id = claimed.tenant_id
    AND receipt.id = NULLIF(claimed.payload->>'receiptId', '')::uuid
  JOIN tenancy.flow_social_connections connection ON connection.tenant_id = receipt.tenant_id AND connection.id = receipt.connection_id
  JOIN tenancy.flow_deployments deployment ON deployment.tenant_id = connection.tenant_id AND deployment.id = connection.deployment_id
  JOIN tenancy.flow_bots bot ON bot.tenant_id = connection.tenant_id AND bot.id = connection.bot_id;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.prepare_flow_social_turn(
  target_outbox_id uuid, target_contact_id uuid, target_conversation_id uuid,
  target_execution_id uuid, target_reservation_id uuid, target_session_hash bytea,
  target_subject_ciphertext text
)
RETURNS TABLE (tenant_id uuid, deployment_id uuid, execution_id uuid, flow_version_id uuid,
  snapshot_json jsonb, state_json jsonb, authority_json jsonb, next_input_sequence integer,
  session_token_hash bytea, is_new boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy, catalog AS $$
DECLARE runtime record; subject_record record; quota record; initial_state jsonb; create_execution boolean;
BEGIN
  IF session_user <> 'djay_worker' OR current_setting('app.service', true) IS DISTINCT FROM 'flow_social_worker'
    OR octet_length(target_session_hash) <> 32 OR char_length(target_subject_ciphertext) NOT BETWEEN 32 AND 16384 THEN
    RAISE EXCEPTION 'Flow social worker context required'; END IF;
  SELECT outbox.tenant_id, receipt.id AS receipt_id, receipt.connection_id, receipt.channel,
    receipt.subject_hash, connection.deployment_id, connection.bot_id, bot.default_language,
    version.id AS version_id, version.snapshot_json, snapshot.id AS snapshot_id,
    snapshot.subscription_id, snapshot.resolved_json, plan.plan_key
  INTO runtime FROM tenancy.outbox outbox
  JOIN tenancy.flow_social_receipts receipt ON receipt.tenant_id = outbox.tenant_id
    AND receipt.id = NULLIF(outbox.payload->>'receiptId', '')::uuid
  JOIN tenancy.flow_social_connections connection ON connection.tenant_id = receipt.tenant_id
    AND connection.id = receipt.connection_id AND connection.status = 'active'
  JOIN tenancy.flow_deployments deployment ON deployment.tenant_id = connection.tenant_id
    AND deployment.id = connection.deployment_id AND deployment.status = 'active'
  JOIN tenancy.flow_bots bot ON bot.tenant_id = connection.tenant_id AND bot.id = connection.bot_id AND bot.status = 'active'
  JOIN tenancy.flow_versions version ON version.tenant_id = bot.tenant_id
    AND version.id = bot.current_published_version_id AND version.status = 'published'
  JOIN LATERAL (SELECT candidate.* FROM tenancy.entitlement_snapshots candidate
    JOIN tenancy.product_subscriptions subscription ON subscription.tenant_id = candidate.tenant_id
      AND subscription.id = candidate.subscription_id AND subscription.status IN ('active', 'trialing', 'scheduled_change')
    WHERE candidate.tenant_id = connection.tenant_id AND candidate.product_key = 'flowbot'
      AND candidate.access_mode = 'active'
      AND candidate.resolved_json->'entitlements'->>'ai.enabled' = 'false'
      AND (candidate.resolved_json->'entitlements'->>'channel.social' = 'true'
        OR EXISTS (SELECT 1 FROM tenancy.subscription_add_ons social_add_on
          WHERE social_add_on.tenant_id = candidate.tenant_id AND social_add_on.subscription_id = candidate.subscription_id
            AND social_add_on.add_on_key = 'additional_social_channel' AND social_add_on.status IN ('active', 'scheduled_end')
            AND social_add_on.effective_from <= now() AND (social_add_on.effective_until IS NULL OR social_add_on.effective_until > now())))
    ORDER BY candidate.created_at DESC, candidate.id DESC LIMIT 1) snapshot ON true
  JOIN catalog.plan_versions plan_version ON plan_version.id = snapshot.plan_version_id
  JOIN catalog.plans plan ON plan.id = plan_version.plan_id AND plan.product_key = 'flowbot'
  WHERE outbox.id = target_outbox_id AND outbox.topic = 'flowbot.social.inbound.received'
    AND outbox.status = 'processing' AND receipt.event_type = 'inbound.message'
    AND receipt.disposition = 'accepted' LIMIT 1;
  IF runtime IS NULL THEN RAISE EXCEPTION 'flow_social_turn_not_available'; END IF;
  SELECT subject.* INTO subject_record FROM tenancy.flow_social_subjects subject
    WHERE subject.tenant_id = runtime.tenant_id AND subject.connection_id = runtime.connection_id
      AND subject.subject_hash = runtime.subject_hash FOR UPDATE;
  create_execution := subject_record IS NULL OR NOT EXISTS (
    SELECT 1 FROM tenancy.flow_executions execution WHERE execution.tenant_id = runtime.tenant_id
      AND execution.id = subject_record.execution_id AND execution.status NOT IN ('completed', 'failed', 'expired')
      AND execution.expires_at > now());
  IF subject_record IS NOT NULL AND subject_record.status <> 'active' THEN RAISE EXCEPTION 'flow_social_subject_not_active'; END IF;
  IF create_execution THEN
    SELECT account.id, account.reserved_quantity, account.settled_quantity, account.safety_cap_quantity
    INTO quota FROM tenancy.quota_accounts account WHERE account.tenant_id = runtime.tenant_id
      AND account.subscription_id = runtime.subscription_id AND account.product_key = 'flowbot'
      AND account.customer_unit = 'flow_execution' AND now() >= account.period_start AND now() < account.period_end
    ORDER BY account.period_start DESC LIMIT 1 FOR UPDATE;
    IF quota IS NULL THEN RAISE EXCEPTION 'flowbot_quota_unavailable'; END IF;
    IF quota.safety_cap_quantity IS NOT NULL AND quota.reserved_quantity + quota.settled_quantity + 1 > quota.safety_cap_quantity THEN
      RAISE EXCEPTION 'flowbot_safety_cap'; END IF;
    IF subject_record IS NULL THEN
      INSERT INTO tenancy.contacts (id, tenant_id, display_name, locale) VALUES (target_contact_id, runtime.tenant_id,
        CASE runtime.channel WHEN 'line' THEN 'LINE visitor' ELSE 'Messenger visitor' END, runtime.default_language);
    ELSE target_contact_id := subject_record.contact_id; END IF;
    INSERT INTO tenancy.conversations (id, tenant_id, contact_id, product_key, public_plan_key,
      entitlement_snapshot_id, channel_kind, automation_mode) VALUES (target_conversation_id, runtime.tenant_id,
      target_contact_id, 'flowbot', runtime.plan_key, runtime.snapshot_id, runtime.channel, 'flowbot');
    UPDATE tenancy.quota_accounts account
    SET reserved_quantity = account.reserved_quantity + 1, updated_at = now()
    WHERE account.tenant_id = runtime.tenant_id AND account.id = quota.id;
    INSERT INTO tenancy.usage_reservations (id, tenant_id, quota_account_id, entitlement_snapshot_id,
      operation_id, idempotency_key, requested_quantity, reserved_quantity, status)
    VALUES (target_reservation_id, runtime.tenant_id, quota.id, runtime.snapshot_id, target_execution_id::text,
      'flowbot:social:start:' || target_execution_id::text, 1, 1, 'reserved');
    INSERT INTO tenancy.usage_events (tenant_id, subscription_id, entitlement_snapshot_id, reservation_id,
      product_key, operation_id, event_type, customer_unit, customer_quantity, idempotency_key, occurred_at)
    VALUES (runtime.tenant_id, runtime.subscription_id, runtime.snapshot_id, target_reservation_id, 'flowbot',
      target_execution_id::text, 'reserved', 'flow_execution', 1,
      'flowbot:social:start:' || target_execution_id::text || ':reserved', now());
    initial_state := jsonb_build_object('currentNodeId', null, 'status', 'active', 'lang', runtime.default_language,
      'variables', '{}'::jsonb, 'subflowStack', '[]'::jsonb);
    INSERT INTO tenancy.flow_executions (id, tenant_id, deployment_id, bot_id, flow_version_id,
      conversation_id, entitlement_snapshot_id, usage_reservation_id, session_token_hash, state_json, expires_at)
    VALUES (target_execution_id, runtime.tenant_id, runtime.deployment_id, runtime.bot_id, runtime.version_id,
      target_conversation_id, runtime.snapshot_id, target_reservation_id, target_session_hash, initial_state, now() + interval '30 days');
    IF subject_record IS NULL THEN
      INSERT INTO tenancy.flow_social_subjects (tenant_id, connection_id, subject_hash,
        external_subject_ciphertext, contact_id, conversation_id, execution_id)
      VALUES (runtime.tenant_id, runtime.connection_id, runtime.subject_hash, target_subject_ciphertext,
        target_contact_id, target_conversation_id, target_execution_id);
    ELSE
      UPDATE tenancy.flow_social_subjects SET external_subject_ciphertext = target_subject_ciphertext,
        conversation_id = target_conversation_id, execution_id = target_execution_id,
        last_seen_at = now(), updated_at = now() WHERE id = subject_record.id;
    END IF;
  ELSE
    target_execution_id := subject_record.execution_id;
    UPDATE tenancy.flow_social_subjects SET external_subject_ciphertext = target_subject_ciphertext,
      last_seen_at = now(), updated_at = now() WHERE id = subject_record.id;
  END IF;
  RETURN QUERY SELECT runtime.tenant_id, runtime.deployment_id, execution.id, execution.flow_version_id,
    runtime.snapshot_json, execution.state_json,
    jsonb_build_object('planKey', runtime.plan_key, 'accessMode', runtime.resolved_json->>'accessMode',
      'entitlements', COALESCE(runtime.resolved_json->'entitlements', '{}'::jsonb),
      'limits', COALESCE(runtime.resolved_json->'limits', '{}'::jsonb)), execution.next_input_sequence,
    execution.session_token_hash, create_execution
  FROM tenancy.flow_executions execution WHERE execution.tenant_id = runtime.tenant_id AND execution.id = target_execution_id;
END
$$;

REVOKE ALL ON FUNCTION tenancy.flow_social_runtime_connection(bytea, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.claim_flow_social_inbound(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.prepare_flow_social_turn(uuid, uuid, uuid, uuid, uuid, bytea, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.flow_social_runtime_connection(bytea, text) TO djay_flowbot_runtime;
GRANT EXECUTE ON FUNCTION tenancy.claim_flow_social_inbound(timestamptz, timestamptz) TO djay_worker;
GRANT EXECUTE ON FUNCTION tenancy.prepare_flow_social_turn(uuid, uuid, uuid, uuid, uuid, bytea, text) TO djay_worker;
```

> Note for the implementer: confirm the exact GRANT roles for `flow_social_runtime_connection` by grepping the original grant in `0067_flowbot_social_transport.sql` (search `GRANT EXECUTE ON FUNCTION tenancy.flow_social_runtime_connection`) and reproduce them exactly — the runtime role name must match what `FlowSocialRuntimeStore` connects as. Do not broaden grants.

- [ ] **Step 4: Apply the migration + re-run tests (expect PASS)**

Run the project's migration runner, then the test:
```bash
cd packages/db && pnpm migrate   # or: node ../../scripts/migrate.mjs — confirm the repo's migrate command
TENANT_DATABASE_URL=$TENANT_DATABASE_URL FLOWBOT_DATABASE_URL=$FLOWBOT_DATABASE_URL \
  WORKER_DATABASE_URL=$WORKER_DATABASE_URL ADMIN_DATABASE_URL=$ADMIN_DATABASE_URL \
  pnpm vitest run src/flowbot-social-store.integration.test.ts
```
Expected: all three cases PASS — the premium test still green (no regression), "authorizes a Basic tenant…" now green, "rejects a Basic tenant with no social add-on" green.

- [ ] **Step 5: Typecheck + broader guard**

```bash
cd packages/db && pnpm typecheck && pnpm vitest run src/migration-invariants.test.ts
```
Expected: typecheck passes; migration-invariants passes (we added a new migration, did not edit the locked catalog seed).

- [ ] **Step 6: Commit**

```bash
git add packages/db/migrations/0082_flowbot_social_gate_relaxation.sql \
        packages/db/src/flowbot-social-store.ts \
        packages/db/src/flowbot-social-store.integration.test.ts
git commit -m "feat(flowbot-social): authorize Basic+social-add-on tenants, not premium-only

Relax the FlowBot social gate across the TS create query, the worker
preparedTurnSchema, and the three SECURITY-DEFINER SQL functions
(flow_social_runtime_connection, claim_flow_social_inbound,
prepare_flow_social_turn) from plan_key='flowbot_premium' to
product_key='flowbot' AND (channel.social OR active additional_social_channel
add-on). Adds integration coverage for Basic-with-add-on (authorized) and
Basic-without-add-on (rejected).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage:** Implements spec §3 (gate = entitlement not plan identity) and §7.4 (relax the premium hard-codes incl. SQL functions). The worker-store `:12/:24` premium literals are intentionally left (timer/dispatch = advanced nodes, premium-only by entitlement; a Basic flow cannot emit them).
- **Placeholders:** none — full SQL bodies and TS diffs included. Two implementer confirmations are explicit and bounded: the repo's exact `migrate` command (Step 4) and the original GRANT roles for `flow_social_runtime_connection` (Step 3 note).
- **Type consistency:** `planKey` widened to `z.enum(["flowbot_basic","flowbot_premium"])` matches `flowbot-runtime-store.ts:17`'s existing enum; `create()` return shape unchanged; add-on columns match `0045` schema.
- **Scope:** self-contained and independently testable; no dependency on the catalog price slice.
