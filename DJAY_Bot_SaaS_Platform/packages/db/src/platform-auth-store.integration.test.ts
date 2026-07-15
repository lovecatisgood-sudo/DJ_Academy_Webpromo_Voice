import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createOpaqueToken, hashPassword } from "@djay/auth";
import {
  bootstrapPlatformOwner,
  createPlatformAuthService,
  generateTotpCode,
} from "@djay/platform-auth";
import { createDatabaseClient } from "./client";
import { PostgresPlatformAuthStore } from "./platform-auth-store";

const databaseUrl = process.env.PLATFORM_DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const enabled = Boolean(databaseUrl && adminUrl);
const platformClient = enabled ? createDatabaseClient(databaseUrl!) : null;
const adminClient = enabled ? createDatabaseClient(adminUrl!) : null;

afterAll(async () => {
  await platformClient?.end();
  await adminClient?.end();
});

describe.runIf(enabled)("platform identity repository", () => {
  it("bootstraps once and requires a single-use TOTP challenge for every session", async () => {
    const store = new PostgresPlatformAuthStore(platformClient!);
    const mfaEncryptionKey = randomBytes(32);
    const recoveryHashKey = randomBytes(32);
    const input = {
      email: "platform-owner@example.test",
      displayName: "Platform Owner",
      password: "platform integration password",
      requestId: "platform-bootstrap-test",
    };
    const bootstrapResults = await Promise.all([
      bootstrapPlatformOwner(store, input, { mfaEncryptionKey, recoveryHashKey }),
      bootstrapPlatformOwner(store, input, { mfaEncryptionKey, recoveryHashKey }),
    ]);
    expect(bootstrapResults.map((result) => result.status).sort()).toEqual(["already_completed", "created"]);
    const created = bootstrapResults.find((result) => result.status === "created");
    if (!created || created.status !== "created") throw new Error("Expected bootstrap output.");
    const secret = new URL(created.otpauthUrl).searchParams.get("secret");
    expect(secret).toBeTruthy();
    expect(created.recoveryCodes).toHaveLength(8);

    const service = createPlatformAuthService(store, {
      dummyPasswordHash: await hashPassword("platform dummy integration password"),
      mfaEncryptionKey,
      recoveryHashKey,
    });
    await expect(service.startLogin({
      email: input.email,
      password: "wrong platform password",
      requestId: "platform-login-wrong",
    })).resolves.toEqual({ status: "invalid_credentials" });
    const challenge = await service.startLogin({
      email: input.email,
      password: input.password,
      requestId: "platform-login-valid",
    });
    expect(challenge.status).toBe("mfa_required");
    if (challenge.status !== "mfa_required") throw new Error("Expected MFA challenge.");
    await expect(service.completeMfa({
      challengeToken: challenge.challengeToken,
      code: "000000",
      requestId: "platform-mfa-wrong",
    })).resolves.toEqual({ status: "invalid_challenge" });
    const code = generateTotpCode(secret!, new Date());
    const authenticated = await service.completeMfa({
      challengeToken: challenge.challengeToken,
      code,
      requestId: "platform-mfa-valid",
    });
    expect(authenticated.status).toBe("authenticated");
    if (authenticated.status !== "authenticated") throw new Error("Expected platform session.");
    await expect(service.completeMfa({
      challengeToken: challenge.challengeToken,
      code,
      requestId: "platform-mfa-replay",
    })).resolves.toEqual({ status: "invalid_challenge" });
    await expect(service.current(authenticated.sessionToken)).resolves.toMatchObject({
      role: "platform_owner",
      displayName: "Platform Owner",
    });
    await expect(service.current(createOpaqueToken())).resolves.toBeNull();
    await expect(store.healthSummary()).resolves.toMatchObject({
      platformUsers: 1, activeSessions: 1,
      socialChannels: [
        expect.objectContaining({ channel: "line", activeConnections: 0, queuedInbound: 0 }),
        expect.objectContaining({ channel: "whatsapp", activeConnections: 0, queuedInbound: 0 }),
        expect.objectContaining({ channel: "messenger", activeConnections: 0, queuedInbound: 0 }),
      ],
    });
    await service.logout(authenticated.sessionToken);
    await expect(service.current(authenticated.sessionToken)).resolves.toBeNull();

    const counts = await adminClient!<{ users: number; owners: number; factors: number; recovery_codes: number }[]>`
      SELECT
        (SELECT count(*)::int FROM platform.users) AS users,
        (SELECT count(*)::int FROM platform.role_assignments WHERE role = 'platform_owner') AS owners,
        (SELECT count(*)::int FROM platform.mfa_factors WHERE verified_at IS NOT NULL) AS factors,
        (SELECT count(*)::int FROM platform.mfa_recovery_codes) AS recovery_codes
    `;
    expect(counts[0]).toEqual({ users: 1, owners: 1, factors: 1, recovery_codes: 8 });
  });
});
