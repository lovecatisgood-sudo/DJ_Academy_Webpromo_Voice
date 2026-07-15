import { randomUUID } from "node:crypto";
import { createOpaqueToken, hashOpaqueToken, verifyPassword } from "./crypto";
import { loginInputSchema, type LoginInput, type LoginResponse } from "./contracts";
import type { AuthStore } from "./store";

export type LoginServiceConfig = Readonly<{
  dummyPasswordHash: string;
  idleTtlMs?: number;
  absoluteTtlMs?: number;
  challengeTtlMs?: number;
}>;

export function createLoginService(store: AuthStore, config: LoginServiceConfig) {
  const idleTtlMs = config.idleTtlMs ?? 12 * 60 * 60 * 1000;
  const absoluteTtlMs = config.absoluteTtlMs ?? 30 * 24 * 60 * 60 * 1000;
  const challengeTtlMs = config.challengeTtlMs ?? 5 * 60 * 1000;

  return async function login(input: LoginInput): Promise<LoginResponse> {
    const parsed = loginInputSchema.parse(input);
    const identity = await store.findLoginIdentity(parsed.email.trim().toLowerCase());
    const passwordValid = await verifyPassword(
      parsed.password,
      identity?.passwordHash ?? config.dummyPasswordHash,
    );
    if (!identity || !passwordValid || identity.workspaces.length === 0) {
      return Object.freeze({ status: "invalid_credentials" as const });
    }

    if (identity.mfaEnabled) {
      const challengeToken = createOpaqueToken();
      const now = new Date();
      const challengeExpiresAt = new Date(now.getTime() + challengeTtlMs);
      await store.createTenantLoginChallenge({
        challengeId: randomUUID(),
        userId: identity.userId,
        tokenHash: hashOpaqueToken(challengeToken),
        now,
        expiresAt: challengeExpiresAt,
        requestId: parsed.requestId,
      });
      return Object.freeze({ status: "mfa_required" as const, challengeToken, challengeExpiresAt });
    }

    const now = Date.now();
    const sessionToken = createOpaqueToken();
    const selectedTenantId = identity.workspaces.length === 1 ? identity.workspaces[0]!.tenantId : null;
    const idleExpiresAt = new Date(now + idleTtlMs);
    const absoluteExpiresAt = new Date(now + absoluteTtlMs);
    const reauthenticatedAt = new Date(now);
    await store.createSession({
      sessionId: randomUUID(),
      userId: identity.userId,
      tokenHash: hashOpaqueToken(sessionToken),
      familyId: randomUUID(),
      selectedTenantId,
      idleExpiresAt,
      absoluteExpiresAt,
      reauthenticatedAt,
      requestId: parsed.requestId,
    });

    return Object.freeze({
      status: "authenticated" as const,
      sessionToken,
      idleExpiresAt,
      absoluteExpiresAt,
      selectedTenantId,
      workspaces: identity.workspaces,
    });
  };
}
