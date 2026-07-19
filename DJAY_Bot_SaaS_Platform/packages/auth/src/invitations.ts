import { randomUUID } from "node:crypto";
import type { TenantContext } from "@djay/tenancy";
import { z } from "zod";
import { createOpaqueToken, hashOpaqueToken, hashPassword, sealJson } from "./crypto";
import type { AuthStore } from "./store";

const invitationSchema = z.object({
  email: z.email().max(320),
  role: z.enum([
    "tenant_admin", "tenant_operator", "tenant_conversation_manager",
    "tenant_human_agent", "tenant_analyst", "tenant_billing_manager",
  ]),
  requestId: z.string().min(8).max(128),
}).strict();

const acceptanceSchema = z.object({
  token: z.string().min(32).max(256),
  name: z.string().trim().min(2).max(160).optional(),
  password: z.string().min(12).max(128).optional(),
  requestId: z.string().min(8).max(128),
}).strict().refine(
  (value) => Boolean(value.name) === Boolean(value.password),
  { message: "name and password must be supplied together" },
);

export type InvitationServiceConfig = Readonly<{
  publicAppUrl: string;
  emailEnvelopeKey: Buffer;
  invitationTtlMs?: number;
}>;

export function createInvitationService(store: AuthStore, config: InvitationServiceConfig) {
  const invitationTtlMs = config.invitationTtlMs ?? 72 * 60 * 60 * 1000;
  return {
    async invite(context: TenantContext, input: unknown) {
      const parsed = invitationSchema.parse(input);
      const invitationId = randomUUID();
      const tokenId = randomUUID();
      const rawToken = createOpaqueToken();
      const expiresAt = new Date(Date.now() + invitationTtlMs);
      return store.createTenantInvitation({
        context,
        invitationId,
        tokenId,
        tokenHash: hashOpaqueToken(rawToken),
        emailNormalized: parsed.email.trim().toLowerCase(),
        role: parsed.role,
        expiresAt,
        outboxPayloadCiphertext: sealJson({
          template: "tenant-invitation",
          to: parsed.email.trim().toLowerCase(),
          invitationUrl: new URL(`/invitations/accept#${new URLSearchParams({ token: rawToken })}`, config.publicAppUrl).toString(),
          expiresAt: expiresAt.toISOString(),
        }, config.emailEnvelopeKey),
      });
    },

    async accept(input: unknown, authenticatedUserId?: string) {
      const parsed = acceptanceSchema.parse(input);
      return store.acceptTenantInvitation({
        tokenHash: hashOpaqueToken(parsed.token),
        ...(authenticatedUserId ? { authenticatedUserId } : {}),
        newUserId: randomUUID(),
        newEmailId: randomUUID(),
        newMembershipId: randomUUID(),
        ...(parsed.name ? { displayName: parsed.name } : {}),
        ...(parsed.password ? { passwordHash: await hashPassword(parsed.password) } : {}),
        now: new Date(),
        requestId: parsed.requestId,
      });
    },
  };
}
