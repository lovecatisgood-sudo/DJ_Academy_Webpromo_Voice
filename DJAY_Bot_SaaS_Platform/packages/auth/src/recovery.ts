import { randomUUID } from "node:crypto";
import { recoveryCompleteInputSchema, recoveryRequestInputSchema } from "./contracts";
import { createOpaqueToken, hashOpaqueToken, hashPassword, sealJson } from "./crypto";
import type { AuthStore } from "./store";

const genericRecoveryMessage = "If the account exists, a recovery email has been sent.";

export type RecoveryServiceConfig = Readonly<{
  publicAppUrl: string;
  emailEnvelopeKey: Buffer;
  recoveryTtlMs?: number;
}>;

export function createRecoveryService(store: AuthStore, config: RecoveryServiceConfig) {
  const recoveryTtlMs = config.recoveryTtlMs ?? 30 * 60 * 1000;

  return {
    async request(input: unknown) {
      const parsed = recoveryRequestInputSchema.parse(input);
      const emailNormalized = parsed.email.trim().toLowerCase();
      const token = createOpaqueToken();
      const expiresAt = new Date(Date.now() + recoveryTtlMs);
      const recoveryUrl = new URL("/recovery/complete", config.publicAppUrl);
      recoveryUrl.hash = new URLSearchParams({ token }).toString();
      await store.createRecoveryIntent({
        emailNormalized,
        tokenId: randomUUID(),
        tokenHash: hashOpaqueToken(token),
        tokenExpiresAt: expiresAt,
        outboxPayloadCiphertext: sealJson({
          template: "recover-password",
          to: emailNormalized,
          recoveryUrl: recoveryUrl.toString(),
          expiresAt: expiresAt.toISOString(),
        }, config.emailEnvelopeKey),
        requestId: parsed.requestId,
      });
      return Object.freeze({ accepted: true as const, message: genericRecoveryMessage });
    },

    async complete(input: unknown) {
      const parsed = recoveryCompleteInputSchema.parse(input);
      const status = await store.completeRecovery({
        tokenHash: hashOpaqueToken(parsed.token),
        passwordHash: await hashPassword(parsed.newPassword),
        now: new Date(),
        requestId: parsed.requestId,
      });
      return Object.freeze({ status });
    },
  };
}
