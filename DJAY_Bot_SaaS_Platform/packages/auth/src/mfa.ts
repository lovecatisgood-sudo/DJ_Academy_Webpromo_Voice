import { createHmac, randomBytes, randomUUID } from "node:crypto";
import {
  createOpaqueToken,
  hashOpaqueToken,
  openJson,
  sealJson,
} from "./crypto";
import { createTotpSecret, verifyTotpCode } from "./totp";
import type { AuthStore } from "./store";
import { z } from "zod";

const loginMfaSchema = z.object({
  challengeToken: z.string().min(32).max(256),
  code: z.string().regex(/^\d{6}$/),
  requestId: z.string().min(8).max(128),
}).strict();

const enrollmentVerificationSchema = z.object({
  factorId: z.uuid(),
  code: z.string().regex(/^\d{6}$/),
  requestId: z.string().min(8).max(128),
}).strict();

export type TenantMfaConfig = Readonly<{
  encryptionKey: Buffer;
  recoveryHashKey: Buffer;
  issuer?: string;
  idleTtlMs?: number;
  absoluteTtlMs?: number;
}>;

export function createTenantMfaService(store: AuthStore, config: TenantMfaConfig) {
  const idleTtlMs = config.idleTtlMs ?? 12 * 60 * 60 * 1000;
  const absoluteTtlMs = config.absoluteTtlMs ?? 30 * 24 * 60 * 60 * 1000;
  return {
    async completeLogin(input: unknown) {
      const parsed = loginMfaSchema.parse(input);
      const now = new Date();
      const tokenHash = hashOpaqueToken(parsed.challengeToken);
      const challenge = await store.resolveTenantLoginChallenge(tokenHash, now);
      if (!challenge) return { status: "invalid_challenge" as const };
      const secret = openJson<{ secret: string }>(challenge.secretEnvelope, config.encryptionKey).secret;
      if (!verifyTotpCode(secret, parsed.code, now)) return { status: "invalid_challenge" as const };
      const sessionToken = createOpaqueToken();
      const idleExpiresAt = new Date(now.getTime() + idleTtlMs);
      const absoluteExpiresAt = new Date(now.getTime() + absoluteTtlMs);
      const selectedTenantId = challenge.workspaces.length === 1 ? challenge.workspaces[0]!.tenantId : null;
      const completed = await store.completeTenantMfaLogin({
        challengeTokenHash: tokenHash,
        sessionId: randomUUID(),
        sessionTokenHash: hashOpaqueToken(sessionToken),
        familyId: randomUUID(),
        selectedTenantId,
        now,
        idleExpiresAt,
        absoluteExpiresAt,
        requestId: parsed.requestId,
      });
      return completed ? {
        status: "authenticated" as const,
        sessionToken,
        idleExpiresAt,
        selectedTenantId,
        workspaces: challenge.workspaces,
      } : { status: "invalid_challenge" as const };
    },

    async startEnrollment(userId: string, requestId: string, emailLabel: string) {
      const secret = createTotpSecret();
      const factorId = randomUUID();
      await store.createMfaEnrollment({
        userId,
        factorId,
        secretEnvelope: sealJson({ secret }, config.encryptionKey),
        now: new Date(),
        requestId,
      });
      const issuer = config.issuer ?? "DJAY Bot";
      const label = encodeURIComponent(`${issuer}:${emailLabel}`);
      return {
        factorId,
        otpauthUrl: `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`,
      };
    },

    async verifyEnrollment(userId: string, sessionId: string, input: unknown) {
      const parsed = enrollmentVerificationSchema.parse(input);
      const enrollment = await store.getMfaEnrollment(userId, parsed.factorId);
      if (!enrollment || enrollment.verifiedAt) return { status: "invalid_challenge" as const };
      const secret = openJson<{ secret: string }>(enrollment.secretEnvelope, config.encryptionKey).secret;
      const now = new Date();
      if (!verifyTotpCode(secret, parsed.code, now)) return { status: "invalid_challenge" as const };
      const recoveryCodes = Array.from({ length: 8 }, () => randomBytes(9).toString("base64url"));
      const completed = await store.completeMfaEnrollment({
        userId,
        factorId: parsed.factorId,
        sessionId,
        recoveryCodeHashes: recoveryCodes.map((code) => createHmac("sha256", config.recoveryHashKey).update(code).digest()),
        now,
        requestId: parsed.requestId,
      });
      return completed
        ? { status: "verified" as const, recoveryCodes }
        : { status: "invalid_challenge" as const };
    },
  };
}
