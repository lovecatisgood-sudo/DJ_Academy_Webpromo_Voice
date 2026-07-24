import { randomUUID } from "node:crypto";
import type { TenantContext } from "@djay/tenancy";
import type { DatabaseClient } from "./client";
import { withTenantTransaction } from "./scoped-transaction";

/**
 * Short-lived staging for Facebook Login for Business Page grants. The OAuth
 * callback stages the (encrypted) granted-Page list keyed by a hashed nonce;
 * the connect step consumes it exactly once. Page tokens never leave the server.
 */
export class MetaOAuthSessionStore {
  constructor(private readonly client: DatabaseClient) {}

  async stage(context: TenantContext, input: Readonly<{
    botId: string; nonceHash: Buffer; pagesCiphertext: string; expiresAt: Date;
  }>): Promise<{ sessionId: string }> {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const sessionId = randomUUID();
      await sql`
        INSERT INTO tenancy.meta_oauth_sessions
          (id, tenant_id, membership_id, bot_id, nonce_hash, pages_ciphertext, expires_at)
        VALUES (${sessionId}::uuid, ${context.tenantId}::uuid, ${context.membershipId}::uuid,
          ${input.botId}::uuid, ${input.nonceHash}, ${input.pagesCiphertext}, ${input.expiresAt})
      `;
      return { sessionId };
    });
  }

  /** Single-use: deletes and returns the row iff it exists and is unexpired. */
  async consume(context: TenantContext, nonceHash: Buffer): Promise<{ botId: string; pagesCiphertext: string } | null> {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ botId: string; pagesCiphertext: string }[]>`
        DELETE FROM tenancy.meta_oauth_sessions
        WHERE tenant_id = ${context.tenantId}::uuid AND nonce_hash = ${nonceHash} AND expires_at > now()
        RETURNING bot_id AS "botId", pages_ciphertext AS "pagesCiphertext"
      `;
      return rows[0] ?? null;
    });
  }
}
