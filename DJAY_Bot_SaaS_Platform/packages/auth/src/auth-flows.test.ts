import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { hashPassword, openJson } from "./crypto";
import { createLoginService } from "./login";
import { createRecoveryService } from "./recovery";
import type {
  AuthStore,
  CompleteRecoveryCommand,
  CreateRecoveryIntentCommand,
  CreateSessionCommand,
  CreateSignupIntentCommand,
  ProvisionSignupCommand,
} from "./store";

class AuthFlowStore implements AuthStore {
  passwordHash = "";
  session?: CreateSessionCommand;
  recovery?: CreateRecoveryIntentCommand;
  completed?: CompleteRecoveryCommand;

  async createSignupIntent(_command: CreateSignupIntentCommand) { return { status: "email_already_pending" as const }; }
  async provisionSignup(_command: ProvisionSignupCommand) { return { status: "invalid_or_expired" as const }; }
  async findLoginIdentity(email: string) {
    if (email !== "owner@example.test") return null;
    return {
      userId: "11111111-1111-4111-8111-111111111111",
      passwordHash: this.passwordHash,
      mfaEnabled: false,
      workspaces: [{
        tenantId: "22222222-2222-4222-8222-222222222222",
        slug: "owner-business",
        businessName: "Owner Business",
        membershipId: "33333333-3333-4333-8333-333333333333",
        role: "tenant_master_admin" as const,
      }],
    };
  }
  async createSession(command: CreateSessionCommand) { this.session = command; }
  async createRecoveryIntent(command: CreateRecoveryIntentCommand) { this.recovery = command; }
  async completeRecovery(command: CompleteRecoveryCommand) {
    this.completed = command;
    return "completed" as const;
  }
  async consumeRateLimit() { return { allowed: true, retryAfterSeconds: 0 }; }
  async resolveSession() { return null; }
  async listUserSessions() { return []; }
  async revokeUserSession() { return false; }
  async rotateWorkspaceSession() { return false; }
  async revokeSession() {}
  async createTenantInvitation() { return { status: "not_found" as const }; }
  async acceptTenantInvitation() { return { status: "invalid_or_expired" as const }; }
  async createOwnershipTransfer() { return { status: "not_found" as const }; }
  async acceptOwnershipTransfer() { return { status: "not_found" as const }; }
  async cancelOwnershipTransfer() { return { status: "not_found" as const }; }
  async createTenantLoginChallenge() {}
  async resolveTenantLoginChallenge() { return null; }
  async completeTenantMfaLogin() { return false; }
  async createMfaEnrollment() {}
  async getMfaEnrollment() { return null; }
  async completeMfaEnrollment() { return false; }
  async resendVerification() {}
}

describe("login and recovery services", () => {
  const store = new AuthFlowStore();
  let dummyPasswordHash = "";

  beforeAll(async () => {
    store.passwordHash = await hashPassword("correct test password");
    dummyPasswordHash = await hashPassword("dummy timing password");
  });

  it("creates a hashed revocable session after valid credentials", async () => {
    const login = createLoginService(store, { dummyPasswordHash });
    const result = await login({
      email: "OWNER@example.test",
      password: "correct test password",
      requestId: "request-login-1",
    });
    expect(result.status).toBe("authenticated");
    if (result.status !== "authenticated") throw new Error("Expected authenticated result.");
    expect(result.selectedTenantId).toBe("22222222-2222-4222-8222-222222222222");
    expect(store.session?.tokenHash).toHaveLength(32);
    expect(store.session?.tokenHash.toString("utf8")).not.toContain(result.sessionToken);
  });

  it("returns the same invalid result for unknown email and wrong password", async () => {
    const login = createLoginService(store, { dummyPasswordHash });
    await expect(login({
      email: "missing@example.test",
      password: "wrong",
      requestId: "request-login-2",
    })).resolves.toEqual({ status: "invalid_credentials" });
    await expect(login({
      email: "owner@example.test",
      password: "wrong",
      requestId: "request-login-3",
    })).resolves.toEqual({ status: "invalid_credentials" });
  });

  it("encrypts recovery delivery and hashes the replacement password", async () => {
    const envelopeKey = randomBytes(32);
    const recovery = createRecoveryService(store, {
      publicAppUrl: "https://signup.example.test",
      emailEnvelopeKey: envelopeKey,
    });
    const requested = await recovery.request({
      email: "OWNER@example.test",
      requestId: "request-recovery-1",
    });
    expect(requested.message).not.toContain("OWNER@example.test");
    expect(store.recovery?.tokenHash).toHaveLength(32);
    const payload = openJson<{ recoveryUrl: string }>(store.recovery!.outboxPayloadCiphertext, envelopeKey);
    const token = new URL(payload.recoveryUrl).searchParams.get("token");
    expect(token).toBeTruthy();

    const completed = await recovery.complete({
      token,
      newPassword: "replacement password 123",
      requestId: "request-recovery-2",
    });
    expect(completed.status).toBe("completed");
    expect(store.completed?.passwordHash).not.toContain("replacement password 123");
  });
});
