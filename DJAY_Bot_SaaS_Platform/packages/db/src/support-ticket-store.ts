import { randomUUID } from "node:crypto";
import type { PlatformContext, TenantContext } from "@djay/tenancy";
import type { DatabaseClient } from "./client";
import { withPlatformTransaction, withTenantTransaction } from "./scoped-transaction";

export type SupportTicketCategory = "onboarding" | "channel" | "bot" | "knowledge" | "inbox" | "billing" | "account" | "other";
export type SupportTicketPriority = "low" | "normal" | "high" | "urgent";
export type SupportTicketStatus = "open" | "in_progress" | "waiting_on_customer" | "resolved" | "closed";

type TicketRow = {
  id: string; tenantId: string; businessName?: string; createdByMembershipId: string;
  assignedPlatformUserId: string | null; category: SupportTicketCategory;
  priority: SupportTicketPriority; subject: string; description: string;
  status: SupportTicketStatus; contextPath: string | null; diagnosticCode: string | null;
  lastActivityAt: Date; resolvedAt: Date | null; closedAt: Date | null;
  feedbackRating: number | null; feedbackComment: string | null;
  serviceLevel: "standard" | "priority";
  firstResponseDueAt?: Date; firstRespondedAt?: Date | null;
  responseState?: "responded" | "overdue" | "due_soon" | "on_track";
  createdAt: Date; updatedAt: Date;
};

type MessageRow = {
  id: string; ticketId: string; authorKind: "customer" | "platform";
  body: string; createdAt: Date;
};
export type SupportAttachmentMediaType = "application/pdf" | "image/png" | "image/jpeg" | "text/plain";
type AttachmentRow = {
  id: string; ticketId: string; originalFilename: string; mediaType: SupportAttachmentMediaType;
  declaredSize: number; status: "pending_upload" | "uploaded" | "scanning" | "clean" | "infected" | "failed";
  safeErrorCode: string | null; createdAt: Date; scannedAt: Date | null;
};
type NotificationRow = {
  id: string; ticketId: string;
  eventKind: "platform_response" | "attachment_clean" | "attachment_blocked";
  createdAt: Date; read: boolean;
};

const ticketSelect = `
  ticket.id, ticket.tenant_id AS "tenantId", ticket.created_by_membership_id AS "createdByMembershipId",
  ticket.assigned_platform_user_id AS "assignedPlatformUserId", ticket.category, ticket.priority,
  ticket.subject, ticket.description, ticket.status, ticket.context_path AS "contextPath",
  ticket.diagnostic_code AS "diagnosticCode", ticket.last_activity_at AS "lastActivityAt",
  ticket.resolved_at AS "resolvedAt", ticket.closed_at AS "closedAt",
  ticket.service_level AS "serviceLevel",
  ticket.created_at AS "createdAt", ticket.updated_at AS "updatedAt",
  (SELECT feedback.rating::int FROM tenancy.support_ticket_feedback feedback
    WHERE feedback.tenant_id = ticket.tenant_id AND feedback.ticket_id = ticket.id) AS "feedbackRating",
  (SELECT feedback.comment FROM tenancy.support_ticket_feedback feedback
    WHERE feedback.tenant_id = ticket.tenant_id AND feedback.ticket_id = ticket.id) AS "feedbackComment"
`;

export class TenantSupportTicketStore {
  constructor(private readonly client: DatabaseClient) {}

  async overview(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => ({
      tickets: await sql.unsafe<TicketRow[]>(`SELECT ${ticketSelect} FROM tenancy.support_tickets ticket
        WHERE ticket.tenant_id = $1::uuid ORDER BY ticket.last_activity_at DESC, ticket.id DESC LIMIT 200`, [context.tenantId]),
      messages: await sql<MessageRow[]>`
        SELECT id, ticket_id AS "ticketId", author_kind AS "authorKind", body, created_at AS "createdAt"
        FROM tenancy.support_ticket_messages WHERE tenant_id = ${context.tenantId}::uuid
        ORDER BY created_at, id LIMIT 5000
      `,
      attachments: await sql<AttachmentRow[]>`
        SELECT id, ticket_id AS "ticketId", original_filename AS "originalFilename", media_type AS "mediaType",
          declared_size AS "declaredSize", status, safe_error_code AS "safeErrorCode",
          created_at AS "createdAt", scanned_at AS "scannedAt"
        FROM tenancy.support_ticket_attachments WHERE tenant_id = ${context.tenantId}::uuid
        ORDER BY created_at, id LIMIT 1000
      `,
      notifications: await sql<NotificationRow[]>`
        SELECT notification.id, notification.ticket_id AS "ticketId", notification.event_kind AS "eventKind",
          notification.created_at AS "createdAt", (receipt.notification_id IS NOT NULL) AS read
        FROM tenancy.support_ticket_notifications notification
        LEFT JOIN tenancy.support_ticket_notification_reads receipt
          ON receipt.tenant_id = notification.tenant_id AND receipt.notification_id = notification.id
          AND receipt.membership_id = ${context.membershipId}::uuid
        WHERE notification.tenant_id = ${context.tenantId}::uuid
        ORDER BY notification.created_at DESC, notification.id DESC LIMIT 500
      `,
    }));
  }

  async initiateAttachment(context: TenantContext, input: Readonly<{
    ticketId: string; filename: string; mediaType: SupportAttachmentMediaType; size: number; idempotencyKey: string;
  }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ attachmentId: string; jobId: string; objectKey: string }[]>`
        SELECT attachment_id AS "attachmentId", job_id AS "jobId", object_key AS "objectKey"
        FROM tenancy.create_support_ticket_attachment(
          ${input.ticketId}::uuid, ${context.membershipId}::uuid, ${input.filename}, ${input.mediaType},
          ${input.size}, ${input.idempotencyKey}::uuid
        )
      `;
      return rows[0] ? { status: "created" as const, ...rows[0], mediaType: input.mediaType }
        : { status: "not_found" as const };
    });
  }

  async pendingAttachment(context: TenantContext, ticketId: string, attachmentId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ objectKey: string; mediaType: SupportAttachmentMediaType; declaredSize: number }[]>`
        SELECT object_key AS "objectKey", media_type AS "mediaType", declared_size AS "declaredSize"
        FROM tenancy.support_ticket_attachments WHERE tenant_id = ${context.tenantId}::uuid
          AND ticket_id = ${ticketId}::uuid AND id = ${attachmentId}::uuid AND status = 'pending_upload'
      `;
      return rows[0] ?? null;
    });
  }

  async completeAttachmentUpload(context: TenantContext, attachmentId: string, observedSize: number) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ completed: boolean }[]>`
        SELECT tenancy.complete_support_ticket_attachment_upload(${attachmentId}::uuid, ${observedSize}) AS completed
      `;
      return rows[0]?.completed ? { status: "queued" as const } : { status: "not_completable" as const };
    });
  }

  async cleanAttachment(context: TenantContext, ticketId: string, attachmentId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ objectKey: string; mediaType: SupportAttachmentMediaType; filename: string }[]>`
        SELECT object_key AS "objectKey", media_type AS "mediaType", original_filename AS filename
        FROM tenancy.support_ticket_attachments WHERE tenant_id = ${context.tenantId}::uuid
          AND ticket_id = ${ticketId}::uuid AND id = ${attachmentId}::uuid AND status = 'clean'
      `;
      return rows[0] ?? null;
    });
  }

  async createTicket(context: TenantContext, input: Readonly<{
    category: SupportTicketCategory; priority: SupportTicketPriority; subject: string;
    description: string; contextPath?: string; diagnosticCode?: string; idempotencyKey: string;
  }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const active = await sql<{ active: boolean }[]>`SELECT EXISTS (
        SELECT 1 FROM tenancy.memberships WHERE tenant_id = ${context.tenantId}::uuid
          AND id = ${context.membershipId}::uuid AND user_id = ${context.userId}::uuid AND status = 'active'
      ) AS active`;
      if (!active[0]?.active) return { status: "not_found" as const };
      const support = await sql<{ serviceLevel: "standard" | "priority"; dueAt: Date }[]>`
        SELECT service_level AS "serviceLevel", due_at AS "dueAt"
        FROM tenancy.resolve_support_service(now())
      `;
      if (!support[0]) throw new Error("Support response policy is not configured.");
      const id = randomUUID();
      const inserted = await sql<{ id: string }[]>`
        INSERT INTO tenancy.support_tickets (
          id, tenant_id, created_by_membership_id, category, priority, subject, description,
          context_path, diagnostic_code, idempotency_key, service_level, first_response_due_at
        ) VALUES (
          ${id}::uuid, ${context.tenantId}::uuid, ${context.membershipId}::uuid, ${input.category},
          ${input.priority}, ${input.subject}, ${input.description}, ${input.contextPath ?? null},
          ${input.diagnosticCode ?? null}, ${input.idempotencyKey}::uuid,
          ${support[0].serviceLevel}, ${support[0].dueAt}
        ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING RETURNING id
      `;
      if (inserted[0]) {
        await sql`INSERT INTO tenancy.audit_logs (
          tenant_id, actor_user_id, actor_membership_id, action, target_type, target_id,
          request_id, result, metadata
        ) VALUES (
          ${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid,
          'support_ticket.created', 'support_ticket', ${id}, ${context.requestId}, 'succeeded',
          ${sql.json({ category: input.category, priority: input.priority, contextPath: input.contextPath ?? null })}
        )`;
        return { status: "created" as const, ticketId: id };
      }
      const existing = await sql<{ id: string; matches: boolean }[]>`
        SELECT id, category = ${input.category} AND priority = ${input.priority}
          AND subject = ${input.subject} AND description = ${input.description}
          AND context_path IS NOT DISTINCT FROM ${input.contextPath ?? null}
          AND diagnostic_code IS NOT DISTINCT FROM ${input.diagnosticCode ?? null} AS matches
        FROM tenancy.support_tickets
        WHERE tenant_id = ${context.tenantId}::uuid AND idempotency_key = ${input.idempotencyKey}::uuid
      `;
      return existing[0]?.matches
        ? { status: "created" as const, ticketId: existing[0].id, replayed: true as const }
        : { status: "idempotency_conflict" as const };
    });
  }

  async addMessage(context: TenantContext, input: Readonly<{ ticketId: string; body: string; idempotencyKey: string }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const active = await sql<{ active: boolean }[]>`SELECT EXISTS (
        SELECT 1 FROM tenancy.memberships WHERE tenant_id = ${context.tenantId}::uuid
          AND id = ${context.membershipId}::uuid AND user_id = ${context.userId}::uuid AND status = 'active'
      ) AS active`;
      if (!active[0]?.active) return { status: "not_found" as const };
      const tickets = await sql<{ status: SupportTicketStatus }[]>`
        SELECT status FROM tenancy.support_tickets WHERE tenant_id = ${context.tenantId}::uuid
          AND id = ${input.ticketId}::uuid FOR UPDATE
      `;
      if (!tickets[0]) return { status: "not_found" as const };
      if (tickets[0].status === "closed") return { status: "ticket_closed" as const };
      const id = randomUUID();
      const inserted = await sql<{ id: string }[]>`
        INSERT INTO tenancy.support_ticket_messages (
          id, tenant_id, ticket_id, author_kind, author_membership_id, body, idempotency_key
        ) VALUES (
          ${id}::uuid, ${context.tenantId}::uuid, ${input.ticketId}::uuid, 'customer',
          ${context.membershipId}::uuid, ${input.body}, ${input.idempotencyKey}::uuid
        ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING RETURNING id
      `;
      if (!inserted[0]) {
        const existing = await sql<{ id: string; matches: boolean }[]>`
          SELECT id, ticket_id = ${input.ticketId}::uuid AND body = ${input.body}
            AND author_kind = 'customer' AS matches
          FROM tenancy.support_ticket_messages
          WHERE tenant_id = ${context.tenantId}::uuid AND idempotency_key = ${input.idempotencyKey}::uuid
        `;
        return existing[0]?.matches
          ? { status: "updated" as const, messageId: existing[0].id, replayed: true as const }
          : { status: "idempotency_conflict" as const };
      }
      await sql`UPDATE tenancy.support_tickets SET
        status = CASE WHEN status IN ('waiting_on_customer','resolved') THEN 'open' ELSE status END,
        resolved_at = CASE WHEN status IN ('waiting_on_customer','resolved') THEN NULL ELSE resolved_at END,
        last_activity_at = now(), updated_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${input.ticketId}::uuid`;
      return { status: "updated" as const, messageId: inserted[0].id };
    });
  }

  async closeTicket(context: TenantContext, ticketId: string, feedback?: Readonly<{ rating: number; comment?: string }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const active = await sql<{ active: boolean }[]>`SELECT EXISTS (
        SELECT 1 FROM tenancy.memberships WHERE tenant_id = ${context.tenantId}::uuid
          AND id = ${context.membershipId}::uuid AND user_id = ${context.userId}::uuid AND status = 'active'
      ) AS active`;
      if (!active[0]?.active) return { status: "not_found" as const };
      const tickets = await sql<{ id: string; status: SupportTicketStatus }[]>`
        SELECT id, status FROM tenancy.support_tickets
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${ticketId}::uuid FOR UPDATE
      `;
      if (!tickets[0]) return { status: "not_found" as const };
      if (tickets[0].status !== "closed") await sql`UPDATE tenancy.support_tickets SET status = 'closed',
        resolved_at = COALESCE(resolved_at, now()), closed_at = now(), last_activity_at = now(), updated_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${ticketId}::uuid`;
      if (feedback) await sql`
        INSERT INTO tenancy.support_ticket_feedback (
          tenant_id, ticket_id, submitted_by_membership_id, rating, comment
        ) VALUES (
          ${context.tenantId}::uuid, ${ticketId}::uuid, ${context.membershipId}::uuid,
          ${feedback.rating}, ${feedback.comment?.trim() || null}
        ) ON CONFLICT (tenant_id, ticket_id) DO NOTHING
      `;
      await sql`INSERT INTO tenancy.audit_logs (
        tenant_id, actor_user_id, actor_membership_id, action, target_type, target_id,
        request_id, result, metadata
      ) VALUES (
        ${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid,
        'support_ticket.closed', 'support_ticket', ${ticketId}, ${context.requestId}, 'succeeded',
        ${sql.json({ feedbackRating: feedback?.rating ?? null, replayed: tickets[0].status === "closed" })}
      )`;
      return { status: "closed" as const, replayed: tickets[0].status === "closed" };
    });
  }

  async markNotificationRead(context: TenantContext, ticketId: string, notificationId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ marked: boolean }[]>`SELECT tenancy.mark_support_notification_read(
        ${ticketId}::uuid, ${notificationId}::uuid, ${context.membershipId}::uuid
      ) AS marked`;
      return rows[0]?.marked ? { status: "read" as const } : { status: "not_found" as const };
    });
  }
}

export class PlatformSupportTicketStore {
  constructor(private readonly client: DatabaseClient) {}

  async queue(context: PlatformContext) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => ({
      tickets: await sql.unsafe<TicketRow[]>(`SELECT ${ticketSelect}, tenant.business_name AS "businessName",
          ticket.first_response_due_at AS "firstResponseDueAt", ticket.first_responded_at AS "firstRespondedAt",
          CASE WHEN ticket.first_responded_at IS NOT NULL THEN 'responded'
            WHEN ticket.first_response_due_at <= now() THEN 'overdue'
            WHEN ticket.first_response_due_at <= now() + interval '1 hour' THEN 'due_soon'
            ELSE 'on_track' END AS "responseState"
        FROM tenancy.support_tickets ticket JOIN tenancy.tenants tenant ON tenant.id = ticket.tenant_id
        ORDER BY CASE ticket.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'waiting_on_customer' THEN 2 ELSE 3 END,
          CASE ticket.service_level WHEN 'priority' THEN 0 ELSE 1 END,
          CASE ticket.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
          ticket.last_activity_at, ticket.id LIMIT 1000`),
      messages: await sql<MessageRow[]>`SELECT id, ticket_id AS "ticketId", author_kind AS "authorKind", body,
        created_at AS "createdAt" FROM tenancy.support_ticket_messages ORDER BY created_at, id LIMIT 10000`,
      attachments: await sql<AttachmentRow[]>`SELECT id, ticket_id AS "ticketId", original_filename AS "originalFilename",
        media_type AS "mediaType", declared_size AS "declaredSize", status, safe_error_code AS "safeErrorCode",
        created_at AS "createdAt", scanned_at AS "scannedAt"
        FROM tenancy.support_ticket_attachments ORDER BY created_at, id LIMIT 5000`,
    }));
  }

  async respond(context: PlatformContext, input: Readonly<{
    ticketId: string; body: string; status: Exclude<SupportTicketStatus, "closed">; idempotencyKey: string;
  }>) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const tickets = await sql<{ tenantId: string; status: SupportTicketStatus }[]>`
        SELECT tenant_id AS "tenantId", status FROM tenancy.support_tickets
        WHERE id = ${input.ticketId}::uuid FOR UPDATE
      `;
      const ticket = tickets[0];
      if (!ticket || ticket.status === "closed") return { status: "not_found" as const };
      const id = randomUUID();
      const inserted = await sql<{ id: string }[]>`
        INSERT INTO tenancy.support_ticket_messages (
          id, tenant_id, ticket_id, author_kind, author_platform_user_id, body, idempotency_key
        ) VALUES (
          ${id}::uuid, ${ticket.tenantId}::uuid, ${input.ticketId}::uuid, 'platform',
          ${context.platformUserId}::uuid, ${input.body}, ${input.idempotencyKey}::uuid
        ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING RETURNING id
      `;
      if (!inserted[0]) {
        const existing = await sql<{ id: string; matches: boolean }[]>`
          SELECT id, ticket_id = ${input.ticketId}::uuid AND body = ${input.body}
            AND author_kind = 'platform' AS matches FROM tenancy.support_ticket_messages
          WHERE tenant_id = ${ticket.tenantId}::uuid AND idempotency_key = ${input.idempotencyKey}::uuid
        `;
        if (!existing[0]?.matches) return { status: "idempotency_conflict" as const };
        return { status: "updated" as const, messageId: existing[0].id, replayed: true as const };
      }
      const resolved = input.status === "resolved";
      await sql`UPDATE tenancy.support_tickets SET status = ${input.status},
        assigned_platform_user_id = ${context.platformUserId}::uuid,
        resolved_at = ${resolved ? new Date() : null}, closed_at = NULL,
        last_activity_at = now(), updated_at = now() WHERE id = ${input.ticketId}::uuid`;
      await sql`INSERT INTO platform.audit_logs (
        actor_platform_user_id, action, target_type, target_id, request_id, result, metadata
      ) VALUES (
        ${context.platformUserId}::uuid, 'support_ticket.responded', 'support_ticket', ${input.ticketId},
        ${context.requestId}, 'succeeded', ${sql.json({ tenantId: ticket.tenantId, previousStatus: ticket.status, status: input.status })}
      )`;
      return { status: "updated" as const, messageId: inserted[0].id };
    });
  }

  async cleanAttachment(context: PlatformContext, attachmentId: string) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ objectKey: string; mediaType: SupportAttachmentMediaType; filename: string }[]>`
        SELECT object_key AS "objectKey", media_type AS "mediaType", original_filename AS filename
        FROM tenancy.support_ticket_attachments WHERE id = ${attachmentId}::uuid AND status = 'clean'
      `;
      return rows[0] ?? null;
    });
  }
}

export type SupportAttachmentScanClaim = Readonly<{
  job_id: string; tenant_id: string; attachment_id: string; object_key: string;
  media_type: SupportAttachmentMediaType; declared_size: number; attempt_count: number;
}>;

export class SupportAttachmentWorkerStore {
  constructor(private readonly client: DatabaseClient) {}
  async claim(): Promise<SupportAttachmentScanClaim | null> {
    const rows = await this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'support_attachment_worker', true)`;
      return sql<SupportAttachmentScanClaim[]>`SELECT * FROM tenancy.claim_support_attachment_scan(now())`;
    });
    return rows[0] ?? null;
  }
  async complete(jobId: string, observedSize: number, sha256: Buffer) {
    const rows = await this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'support_attachment_worker', true)`;
      return sql<{ completed: boolean }[]>`SELECT tenancy.complete_support_attachment_scan(
        ${jobId}::uuid, ${observedSize}, ${sha256}
      ) AS completed`;
    });
    return rows[0]?.completed === true;
  }
  async fail(jobId: string, safeErrorCode: string, retryable: boolean) {
    const rows = await this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'support_attachment_worker', true)`;
      return sql<{ failed: boolean }[]>`SELECT tenancy.fail_support_attachment_scan(
        ${jobId}::uuid, ${safeErrorCode}, ${retryable}
      ) AS failed`;
    });
    return rows[0]?.failed === true;
  }
}
