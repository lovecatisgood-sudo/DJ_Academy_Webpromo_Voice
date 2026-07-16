import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  createOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  keyedRequestHash,
  sealJson,
} from "./crypto";
import {
  registrationInputSchema,
  verificationInputSchema,
  type RegistrationInput,
  type RegistrationResponse,
  type VerificationInput,
  type VerificationResponse,
} from "./contracts";
import type { AuthStore } from "./store";

const genericRegistrationMessage = "Check your email to continue. If an account already exists, use sign in or recovery.";

export type RegistrationServiceConfig = Readonly<{
  publicAppUrl: string;
  legalVersions: Readonly<{ termsVersion: string; privacyVersion: string }> | null;
  requestHashKey: Buffer;
  emailEnvelopeKey: Buffer;
  verificationTtlMs?: number;
}>;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function canonicalRequest(input: ReturnType<typeof registrationInputSchema.parse>) {
  return {
    email: normalizeEmail(input.email),
    name: input.name,
    businessName: input.businessName,
    password: input.password,
    locale: input.locale,
    timezone: input.timezone,
    selectedPlanKey: input.selectedPlanKey ?? null,
    termsVersion: input.termsVersion,
    privacyVersion: input.privacyVersion,
    acceptTerms: input.acceptTerms,
    acceptPrivacy: input.acceptPrivacy,
  };
}

export function createRegistrationService(store: AuthStore, config: RegistrationServiceConfig) {
  const verificationTtlMs = config.verificationTtlMs ?? 30 * 60 * 1000;

  return {
    async register(input: RegistrationInput): Promise<RegistrationResponse> {
      const parsed = registrationInputSchema.parse(input);
      if (!config.legalVersions) {
        return Object.freeze({
          accepted: false as const,
          status: "registration_unavailable" as const,
          message: "Registration is paused until the current service terms and privacy notice are available.",
        });
      }
      if (parsed.termsVersion !== config.legalVersions.termsVersion
        || parsed.privacyVersion !== config.legalVersions.privacyVersion) {
        return Object.freeze({
          accepted: false as const,
          status: "legal_version_changed" as const,
          message: "The service terms or privacy notice changed. Review the current documents and accept them again.",
        });
      }
      const emailNormalized = normalizeEmail(parsed.email);
      const verificationToken = createOpaqueToken();
      const intentId = randomUUID();
      const tokenId = randomUUID();
      const expiresAt = new Date(Date.now() + verificationTtlMs);
      const verificationUrl = new URL("/verify-email", config.publicAppUrl);
      verificationUrl.hash = new URLSearchParams({ token: verificationToken }).toString();

      await store.createSignupIntent({
        intentId,
        tokenId,
        idempotencyKey: parsed.idempotencyKey,
        requestHash: keyedRequestHash(config.requestHashKey, canonicalRequest(parsed)),
        email: parsed.email.trim(),
        emailNormalized,
        displayName: parsed.name,
        businessName: parsed.businessName,
        passwordHash: await hashPassword(parsed.password),
        locale: parsed.locale,
        timezone: parsed.timezone,
        ...(parsed.selectedPlanKey ? { selectedPlanKey: parsed.selectedPlanKey } : {}),
        termsVersion: config.legalVersions.termsVersion,
        privacyVersion: config.legalVersions.privacyVersion,
        tokenHash: hashOpaqueToken(verificationToken),
        tokenExpiresAt: expiresAt,
        outboxPayloadCiphertext: sealJson({
          template: "verify-email",
          to: emailNormalized,
          verificationUrl: verificationUrl.toString(),
          expiresAt: expiresAt.toISOString(),
        }, config.emailEnvelopeKey),
      });

      return Object.freeze({ accepted: true, message: genericRegistrationMessage });
    },

    async verify(input: VerificationInput): Promise<VerificationResponse> {
      const parsed = verificationInputSchema.parse(input);
      const result = await store.provisionSignup({
        tokenHash: hashOpaqueToken(parsed.token),
        now: new Date(),
        userId: randomUUID(),
        emailId: randomUUID(),
        tenantId: randomUUID(),
        membershipId: randomUUID(),
        subscriptionId: randomUUID(),
        entitlementSnapshotId: randomUUID(),
        quotaAccountId: randomUUID(),
        requestId: parsed.requestId,
      });

      if (result.status === "invalid_or_expired") return result;
      return Object.freeze({
        status: result.status === "provisioned" ? "verified" : "already_verified",
        tenantId: result.tenantId,
      });
    },

    async resend(input: unknown) {
      const parsed = verificationResendSchema.parse(input);
      const emailNormalized = normalizeEmail(parsed.email);
      const token = createOpaqueToken();
      const expiresAt = new Date(Date.now() + verificationTtlMs);
      const verificationUrl = new URL("/verify-email", config.publicAppUrl);
      verificationUrl.hash = new URLSearchParams({ token }).toString();
      await store.resendVerification({
        emailNormalized,
        tokenId: randomUUID(),
        tokenHash: hashOpaqueToken(token),
        expiresAt,
        outboxPayloadCiphertext: sealJson({
          template: "verify-email",
          to: emailNormalized,
          verificationUrl: verificationUrl.toString(),
          expiresAt: expiresAt.toISOString(),
        }, config.emailEnvelopeKey),
        requestId: parsed.requestId,
      });
      return Object.freeze({ accepted: true as const, message: genericRegistrationMessage });
    },
  };
}

const verificationResendSchema = z.object({
  email: z.email().max(320),
  requestId: z.string().min(8).max(128),
}).strict();
