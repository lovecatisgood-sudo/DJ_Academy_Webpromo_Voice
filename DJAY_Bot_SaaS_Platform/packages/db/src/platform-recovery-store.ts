import type { PlatformContext } from "@djay/tenancy";
import type { DatabaseClient } from "./client";
import { withPlatformTransaction } from "./scoped-transaction";

export type RecoverableQueueKind = "system_email" | "flowbot_email" | "ai_chat_email";

export class PlatformRecoveryStore {
  constructor(private readonly client: DatabaseClient) {}

  async overview(context: PlatformContext) {
    const rows = await withPlatformTransaction(this.client, context, async ({ sql }) => sql<{
      recordKind: "recoverable" | "request"; recordId: string; queueKind: RecoverableQueueKind;
      itemId: string; attemptCount: number; safeErrorCode: string | null; occurredAt: Date;
      status: "dead_letter" | "requested" | "applied" | "rejected" | "invalidated";
      reason: string | null; requestedByPlatformUserId: string | null;
      reviewedByPlatformUserId: string | null;
    }[]>`
      SELECT record_kind AS "recordKind", record_id AS "recordId", queue_kind AS "queueKind",
             item_id AS "itemId", attempt_count AS "attemptCount",
             safe_error_code AS "safeErrorCode", occurred_at AS "occurredAt", status, reason,
             requested_by_platform_user_id AS "requestedByPlatformUserId",
             reviewed_by_platform_user_id AS "reviewedByPlatformUserId"
      FROM platform.dead_letter_recovery_overview()
    `);
    return {
      recoverable: rows.filter((row) => row.recordKind === "recoverable"),
      requests: rows.filter((row) => row.recordKind === "request"),
      policy: {
        replayableQueueKinds: ["system_email", "flowbot_email", "ai_chat_email"] as const,
        excludedQueueKinds: ["flowbot_webhook", "social_inbound", "social_delivery"] as const,
      },
    };
  }

  async request(context: PlatformContext, input: Readonly<{
    queueKind: RecoverableQueueKind; itemId: string; attemptCount: number; reason: string;
  }>) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ requestId: string | null }[]>`
        SELECT platform.request_dead_letter_replay(
          ${input.queueKind}, ${input.itemId}::uuid, ${input.attemptCount}, ${input.reason}
        ) AS "requestId"
      `;
      return rows[0]?.requestId
        ? { status: "requested" as const, requestId: rows[0].requestId }
        : { status: "not_requestable" as const };
    });
  }

  async review(context: PlatformContext, requestId: string, decision: "approve" | "reject") {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ status: "applied" | "rejected" | "invalidated" | "not_reviewable" }[]>`
        SELECT platform.review_dead_letter_replay(${requestId}::uuid, ${decision}) AS status
      `;
      return { status: rows[0]?.status ?? "not_reviewable" };
    });
  }
}
