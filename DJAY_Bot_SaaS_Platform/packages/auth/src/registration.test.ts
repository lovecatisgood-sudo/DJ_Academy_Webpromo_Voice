import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { openJson } from "./crypto";
import { createRegistrationService } from "./registration";
import type {
  AuthStore,
  CompleteRecoveryCommand,
  CreateRecoveryIntentCommand,
  CreateSessionCommand,
  CreateSignupIntentCommand,
  ProvisionSignupCommand,
} from "./store";

class MemoryStore implements AuthStore {
  signup?: CreateSignupIntentCommand;
  provision?: ProvisionSignupCommand;

  async createSignupIntent(command: CreateSignupIntentCommand) {
    this.signup = command;
    return { status: "created" as const, intentId: command.intentId };
  }

  async provisionSignup(command: ProvisionSignupCommand) {
    this.provision = command;
    return { status: "provisioned" as const, tenantId: command.tenantId, userId: command.userId };
  }

  async findLoginIdentity() { return null; }
  async createSession(_command: CreateSessionCommand) {}
  async createRecoveryIntent(_command: CreateRecoveryIntentCommand) {}
  async completeRecovery(_command: CompleteRecoveryCommand) { return "invalid_or_expired" as const; }
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

const registration = {
  idempotencyKey: "55555555-5555-4555-8555-555555555555",
  name: "Suda Owner",
  email: "OWNER@Example.com",
  businessName: "Suda Services",
  password: "a strong test password",
  locale: "en" as const,
  timezone: "Asia/Bangkok",
  selectedPlanKey: "flowbot_basic" as const,
  termsVersion: "terms-1",
  privacyVersion: "privacy-1",
  acceptTerms: true as const,
  acceptPrivacy: true as const,
};

describe("registration service", () => {
  it("stores only a token hash and encrypted email payload", async () => {
    const store = new MemoryStore();
    const envelopeKey = randomBytes(32);
    const service = createRegistrationService(store, {
      publicAppUrl: "https://app.example.test",
      legalVersions: { termsVersion: "terms-1", privacyVersion: "privacy-1" },
      requestHashKey: randomBytes(32),
      emailEnvelopeKey: envelopeKey,
    });

    const response = await service.register(registration);
    expect(response.accepted).toBe(true);
    expect(response.message).not.toContain("OWNER@Example.com");
    expect(store.signup?.emailNormalized).toBe("owner@example.com");
    expect(store.signup?.selectedPlanKey).toBe("flowbot_basic");
    expect(store.signup?.passwordHash).not.toContain(registration.password);
    expect(store.signup?.tokenHash).toHaveLength(32);
    expect(store.signup?.outboxPayloadCiphertext).not.toContain("token=");

    const payload = openJson<{ verificationUrl: string }>(store.signup!.outboxPayloadCiphertext, envelopeKey);
    expect(payload.verificationUrl).toContain("/verify-email?token=");
    const rawToken = new URL(payload.verificationUrl).searchParams.get("token");
    expect(rawToken).toBeTruthy();
    expect(Buffer.from(rawToken!, "utf8").equals(store.signup!.tokenHash)).toBe(false);
  });

  it("uses a keyed request hash that changes with password input", async () => {
    const store = new MemoryStore();
    const service = createRegistrationService(store, {
      publicAppUrl: "https://app.example.test",
      legalVersions: { termsVersion: "terms-1", privacyVersion: "privacy-1" },
      requestHashKey: randomBytes(32),
      emailEnvelopeKey: randomBytes(32),
    });
    await service.register(registration);
    const firstHash = Buffer.from(store.signup!.requestHash);
    await service.register({ ...registration, password: "a different strong password" });
    expect(store.signup!.requestHash.equals(firstHash)).toBe(false);
  });

  it("fails closed before persistence when the accepted legal versions are stale", async () => {
    const store = new MemoryStore();
    const service = createRegistrationService(store, {
      publicAppUrl: "https://app.example.test",
      legalVersions: { termsVersion: "terms-2", privacyVersion: "privacy-2" },
      requestHashKey: randomBytes(32),
      emailEnvelopeKey: randomBytes(32),
    });
    await expect(service.register(registration)).resolves.toEqual({
      accepted: false,
      status: "legal_version_changed",
      message: "The service terms or privacy notice changed. Review the current documents and accept them again.",
    });
    expect(store.signup).toBeUndefined();
  });

  it("keeps verification available while new registration authority is paused", async () => {
    const store = new MemoryStore();
    const service = createRegistrationService(store, {
      publicAppUrl: "https://app.example.test",
      legalVersions: null,
      requestHashKey: randomBytes(32),
      emailEnvelopeKey: randomBytes(32),
    });
    await expect(service.register(registration)).resolves.toMatchObject({
      accepted: false,
      status: "registration_unavailable",
    });
    const token = randomBytes(32).toString("base64url");
    await expect(service.verify({ token, requestId: "request-verify-paused" })).resolves.toMatchObject({
      status: "verified",
    });
  });

  it("hashes verification input before provisioning", async () => {
    const store = new MemoryStore();
    const service = createRegistrationService(store, {
      publicAppUrl: "https://app.example.test",
      legalVersions: { termsVersion: "terms-1", privacyVersion: "privacy-1" },
      requestHashKey: randomBytes(32),
      emailEnvelopeKey: randomBytes(32),
    });
    const token = randomBytes(32).toString("base64url");
    const result = await service.verify({ token, requestId: "request-verify-1" });
    expect(result.status).toBe("verified");
    expect(store.provision?.tokenHash).toHaveLength(32);
    expect(store.provision?.tokenHash.toString("utf8")).not.toContain(token);
  });
});
