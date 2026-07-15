import { z } from "zod";
import { createOpaqueToken, hashOpaqueToken } from "./crypto";
import type { AuthStore } from "./store";

const workspaceSelectionSchema = z.object({
  tenantId: z.uuid(),
  requestId: z.string().min(8).max(128),
}).strict();

const sessionRevocationSchema = z.object({
  sessionId: z.uuid(),
  requestId: z.string().min(8).max(128),
}).strict();

export function createSessionService(store: AuthStore, idleTtlMs = 12 * 60 * 60 * 1000) {
  return {
    async current(sessionToken: string) {
      if (sessionToken.length < 32 || sessionToken.length > 256) return null;
      return store.resolveSession(hashOpaqueToken(sessionToken), new Date());
    },

    async selectWorkspace(sessionToken: string, input: unknown) {
      const parsed = workspaceSelectionSchema.parse(input);
      const current = await store.resolveSession(hashOpaqueToken(sessionToken), new Date());
      if (!current || !current.workspaces.some((workspace) => workspace.tenantId === parsed.tenantId)) {
        return { status: "not_found" as const };
      }
      const replacementToken = createOpaqueToken();
      const now = new Date();
      const idleExpiresAt = new Date(Math.min(now.getTime() + idleTtlMs, current.absoluteExpiresAt.getTime()));
      const rotated = await store.rotateWorkspaceSession({
        currentTokenHash: hashOpaqueToken(sessionToken),
        replacementTokenHash: hashOpaqueToken(replacementToken),
        tenantId: parsed.tenantId,
        now,
        idleExpiresAt,
        requestId: parsed.requestId,
      });
      return rotated
        ? { status: "selected" as const, sessionToken: replacementToken, tenantId: parsed.tenantId, idleExpiresAt }
        : { status: "not_found" as const };
    },

    async list(sessionToken: string) {
      const current = await this.current(sessionToken);
      if (!current) return null;
      const sessions = await store.listUserSessions(current.userId, new Date());
      return sessions.map((session) => Object.freeze({
        ...session,
        current: session.sessionId === current.sessionId,
      }));
    },

    async revokeOwned(sessionToken: string, input: unknown) {
      const parsed = sessionRevocationSchema.parse(input);
      const current = await this.current(sessionToken);
      if (!current) return { status: "not_found" as const };
      const revoked = await store.revokeUserSession({
        userId: current.userId,
        sessionId: parsed.sessionId,
        now: new Date(),
        requestId: parsed.requestId,
      });
      return revoked
        ? { status: "revoked" as const, revokedCurrent: parsed.sessionId === current.sessionId }
        : { status: "not_found" as const };
    },

    async logout(sessionToken: string) {
      if (sessionToken.length >= 32 && sessionToken.length <= 256) {
        await store.revokeSession(hashOpaqueToken(sessionToken), new Date(), "logout");
      }
    },
  };
}
