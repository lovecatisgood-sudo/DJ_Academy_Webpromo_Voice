import { createHmac, randomBytes, randomUUID } from "node:crypto";
import {
  createOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  openJson,
  sealJson,
  createTotpSecret,
  verifyTotpCode,
  verifyPassword,
} from "@djay/auth";
import { z } from "zod";
import type { PlatformAuthStore } from "./store";

export * from "./store";
export { encodeBase32, createTotpSecret, generateTotpCode, verifyTotpCode } from "@djay/auth";

const loginSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(128),
  requestId: z.string().min(8).max(128),
}).strict();

const mfaSchema = z.object({
  challengeToken: z.string().min(32).max(256),
  code: z.string().regex(/^\d{6}$/),
  requestId: z.string().min(8).max(128),
}).strict();

export type PlatformAuthConfig = Readonly<{
  dummyPasswordHash: string;
  mfaEncryptionKey: Buffer;
  recoveryHashKey: Buffer;
  challengeTtlMs?: number;
  idleTtlMs?: number;
  absoluteTtlMs?: number;
}>;

export function createPlatformAuthService(store: PlatformAuthStore, config: PlatformAuthConfig) {
  const challengeTtlMs = config.challengeTtlMs ?? 5 * 60 * 1000;
  const idleTtlMs = config.idleTtlMs ?? 4 * 60 * 60 * 1000;
  const absoluteTtlMs = config.absoluteTtlMs ?? 24 * 60 * 60 * 1000;
  return {
    async startLogin(input: unknown) {
      const parsed = loginSchema.parse(input);
      const identity = await store.findPasswordIdentity(parsed.email.trim().toLowerCase());
      const valid = await verifyPassword(parsed.password, identity?.passwordHash ?? config.dummyPasswordHash);
      if (!identity || !valid) return { status: "invalid_credentials" as const };
      const token = createOpaqueToken();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + challengeTtlMs);
      await store.createLoginChallenge({
        challengeId: randomUUID(),
        userId: identity.userId,
        tokenHash: hashOpaqueToken(token),
        now,
        expiresAt,
        requestId: parsed.requestId,
      });
      return { status: "mfa_required" as const, challengeToken: token, expiresAt };
    },

    async completeMfa(input: unknown) {
      const parsed = mfaSchema.parse(input);
      const tokenHash = hashOpaqueToken(parsed.challengeToken);
      const now = new Date();
      const challenge = await store.resolveLoginChallenge(tokenHash, now);
      if (!challenge) return { status: "invalid_challenge" as const };
      const secret = openJson<{ secret: string }>(challenge.secretEnvelope, config.mfaEncryptionKey).secret;
      if (!verifyTotpCode(secret, parsed.code, now)) return { status: "invalid_challenge" as const };
      const sessionToken = createOpaqueToken();
      const idleExpiresAt = new Date(now.getTime() + idleTtlMs);
      const absoluteExpiresAt = new Date(now.getTime() + absoluteTtlMs);
      const completed = await store.completeMfa({
        challengeTokenHash: tokenHash,
        sessionId: randomUUID(),
        sessionTokenHash: hashOpaqueToken(sessionToken),
        familyId: randomUUID(),
        now,
        idleExpiresAt,
        absoluteExpiresAt,
        requestId: parsed.requestId,
      });
      return completed
        ? { status: "authenticated" as const, sessionToken, idleExpiresAt }
        : { status: "invalid_challenge" as const };
    },

    async current(sessionToken: string) {
      if (sessionToken.length < 32 || sessionToken.length > 256) return null;
      return store.resolveSession(hashOpaqueToken(sessionToken), new Date());
    },

    async logout(sessionToken: string) {
      if (sessionToken.length >= 32 && sessionToken.length <= 256) {
        await store.revokeSession(hashOpaqueToken(sessionToken), new Date());
      }
    },
  };
}

export async function bootstrapPlatformOwner(
  store: PlatformAuthStore,
  input: Readonly<{ email: string; displayName: string; password: string; requestId: string }>,
  config: Readonly<{ mfaEncryptionKey: Buffer; recoveryHashKey: Buffer; issuer?: string }>,
) {
  const parsed = z.object({
    email: z.email().max(320),
    displayName: z.string().trim().min(2).max(160),
    password: z.string().min(16).max(128),
    requestId: z.string().min(8).max(128),
  }).strict().parse(input);
  const secret = createTotpSecret();
  const recoveryCodes = Array.from({ length: 8 }, () => randomBytes(9).toString("base64url"));
  const status = await store.bootstrap({
    userId: randomUUID(),
    roleAssignmentId: randomUUID(),
    factorId: randomUUID(),
    emailNormalized: parsed.email.trim().toLowerCase(),
    displayName: parsed.displayName,
    passwordHash: await hashPassword(parsed.password),
    secretEnvelope: sealJson({ secret }, config.mfaEncryptionKey),
    recoveryCodeHashes: recoveryCodes.map((code) => createHmac("sha256", config.recoveryHashKey).update(code).digest()),
    requestId: parsed.requestId,
  });
  if (status !== "created") return { status } as const;
  const issuer = config.issuer ?? "DJAY Bot Platform";
  const label = encodeURIComponent(`${issuer}:${parsed.email.trim().toLowerCase()}`);
  const otpauthUrl = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
  return { status: "created" as const, otpauthUrl, recoveryCodes };
}
