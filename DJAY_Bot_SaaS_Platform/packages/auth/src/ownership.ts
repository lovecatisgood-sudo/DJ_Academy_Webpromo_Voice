import { randomUUID } from "node:crypto";
import type { TenantContext } from "@djay/tenancy";
import { z } from "zod";
import { createOpaqueToken, hashOpaqueToken, sealJson } from "./crypto";
import type { AuthStore } from "./store";

const initiationSchema = z.object({
  targetMembershipId: z.uuid(),
}).strict();

const acceptanceSchema = z.object({
  transferId: z.uuid(),
  token: z.string().min(32).max(256),
}).strict();

const transferIdSchema = z.uuid();

export type OwnershipServiceConfig = Readonly<{
  tenantAppUrl: string;
  emailEnvelopeKey: Buffer;
  transferTtlMs?: number;
  reauthenticationMaxAgeMs?: number;
}>;

function recentlyReauthenticated(at: Date, now: Date, maxAgeMs: number): boolean {
  const age = now.getTime() - at.getTime();
  return age >= -60_000 && age <= maxAgeMs;
}

export function createOwnershipService(store: AuthStore, config: OwnershipServiceConfig) {
  const transferTtlMs = config.transferTtlMs ?? 24 * 60 * 60 * 1000;
  const reauthenticationMaxAgeMs = config.reauthenticationMaxAgeMs ?? 10 * 60 * 1000;
  return {
    async initiate(context: TenantContext, input: unknown, reauthenticatedAt: Date, mfaVerifiedAt: Date | null) {
      const parsed = initiationSchema.parse(input);
      const now = new Date();
      if (!recentlyReauthenticated(reauthenticatedAt, now, reauthenticationMaxAgeMs)
        || !mfaVerifiedAt
        || !recentlyReauthenticated(mfaVerifiedAt, now, reauthenticationMaxAgeMs)) {
        return { status: "reauthentication_required" as const };
      }
      const transferId = randomUUID();
      const tokenId = randomUUID();
      const token = createOpaqueToken();
      const expiresAt = new Date(now.getTime() + transferTtlMs);
      return store.createOwnershipTransfer({
        context,
        transferId,
        tokenId,
        tokenHash: hashOpaqueToken(token),
        targetMembershipId: parsed.targetMembershipId,
        expiresAt,
        outboxPayloadCiphertext: (targetEmail) => sealJson({
          template: "ownership-transfer",
          to: targetEmail,
          transferUrl: new URL(
            `/ownership/accept#${new URLSearchParams({ transferId, token })}`,
            config.tenantAppUrl,
          ).toString(),
          expiresAt: expiresAt.toISOString(),
        }, config.emailEnvelopeKey),
      });
    },

    async accept(context: TenantContext, input: unknown, reauthenticatedAt: Date, mfaVerifiedAt: Date | null) {
      const parsed = acceptanceSchema.parse(input);
      const now = new Date();
      if (!recentlyReauthenticated(reauthenticatedAt, now, reauthenticationMaxAgeMs)
        || !mfaVerifiedAt
        || !recentlyReauthenticated(mfaVerifiedAt, now, reauthenticationMaxAgeMs)) {
        return { status: "reauthentication_required" as const };
      }
      return store.acceptOwnershipTransfer({
        context,
        transferId: parsed.transferId,
        tokenHash: hashOpaqueToken(parsed.token),
        now,
      });
    },

    async cancel(context: TenantContext, transferId: unknown, reauthenticatedAt: Date, mfaVerifiedAt: Date | null) {
      const parsedTransferId = transferIdSchema.parse(transferId);
      const now = new Date();
      if (!recentlyReauthenticated(reauthenticatedAt, now, reauthenticationMaxAgeMs)
        || !mfaVerifiedAt
        || !recentlyReauthenticated(mfaVerifiedAt, now, reauthenticationMaxAgeMs)) {
        return { status: "reauthentication_required" as const };
      }
      return store.cancelOwnershipTransfer({ context, transferId: parsedTransferId, now });
    },
  };
}

export { recentlyReauthenticated };
