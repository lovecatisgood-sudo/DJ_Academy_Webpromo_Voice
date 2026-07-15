import { randomUUID } from "node:crypto";
import { createPlatformContext } from "@djay/tenancy";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabaseClient } from "./client";
import { PlatformVoiceOperationsStore } from "./voice-operations-store";

const platformUrl = process.env.PLATFORM_DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const enabled = Boolean(platformUrl && adminUrl);
const platformClient = enabled ? createDatabaseClient(platformUrl!) : null;
const adminClient = enabled ? createDatabaseClient(adminUrl!) : null;

afterAll(async () => {
  await platformClient?.end();
  await adminClient?.end();
});

describe.runIf(enabled)("P7 Voice platform runtime controls", () => {
  it("keeps the control function-only, role-bound, recently auditable, and reversible", async () => {
    const ownerId = randomUUID();
    const supportId = randomUUID();
    await adminClient!`
      INSERT INTO platform.users (id, email_normalized, display_name, password_hash, status)
      VALUES (${ownerId}::uuid, ${`${ownerId}@example.test`}, 'Voice operator', 'test-hash', 'active'),
             (${supportId}::uuid, ${`${supportId}@example.test`}, 'Support operator', 'test-hash', 'active')
    `;
    await adminClient!`
      INSERT INTO platform.role_assignments (platform_user_id, role)
      VALUES (${ownerId}::uuid, 'platform_owner'), (${supportId}::uuid, 'platform_support')
    `;
    const owner = createPlatformContext({
      platformUserId: ownerId, sessionId: randomUUID(), role: "platform_owner",
      requestId: `voice-control-${randomUUID()}`, reauthenticatedAt: new Date(),
    });
    const support = createPlatformContext({
      platformUserId: supportId, sessionId: randomUUID(), role: "platform_support",
      requestId: `voice-control-${randomUUID()}`, reauthenticatedAt: new Date(),
    });
    const store = new PlatformVoiceOperationsStore(platformClient!);

    await expect(platformClient!`SELECT * FROM platform.voice_runtime_controls`).rejects.toThrow();
    await expect(store.getControl(support)).rejects.toThrow(/platform_voice_operations_required/);
    await expect(store.setControl(owner, { mode: "emergency_stop", reasonCode: "integration_incident" }))
      .resolves.toMatchObject({ mode: "emergency_stop", reasonCode: "integration_incident" });
    await expect(store.setControl(owner, { mode: "running", reasonCode: "integration_recovered" }))
      .resolves.toMatchObject({ mode: "running", reasonCode: "integration_recovered" });
    await expect(store.getControl(owner)).resolves.toMatchObject({ mode: "running" });

    const audits = await adminClient!<{ count: number }[]>`
      SELECT count(*)::int AS count FROM platform.audit_logs
      WHERE actor_platform_user_id = ${ownerId}::uuid AND action = 'voice.runtime_control_changed'
    `;
    expect(audits[0]?.count).toBe(2);
  });
});
