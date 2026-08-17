import { createHash, randomUUID } from "node:crypto";
import type { ActionRequest } from "@djay/action-gateway";
import type {
  contactInputSchema,
  conversationInputSchema,
  leadInputSchema,
} from "@djay/domain";
import { canTransitionMode, messageInputSchema } from "@djay/domain";
import {
  flowExecutionStateSchema,
  flowSnapshotSchema,
  type FlowEntitlements,
  type FlowInput,
} from "@djay/flowbot-domain";
import { advanceFlow } from "@djay/flowbot-engine";
import { chunkKnowledge } from "@djay/sales-core";
import { privacyJobRequestSchema, type PrivacyJobRequest } from "@djay/shared";
import type { TenantContext } from "@djay/tenancy";
import type { z } from "zod";
import type { DatabaseClient } from "./client";
import { flowbotEnvironment, flowBusinessSchedulesSchema } from "./flowbot-environment";
import { withTenantTransaction } from "./scoped-transaction";

type ContactInput = z.infer<typeof contactInputSchema>;
type LeadInput = z.infer<typeof leadInputSchema>;
type ConversationInput = z.infer<typeof conversationInputSchema>;
type MessageInput = z.infer<typeof messageInputSchema>;

function normalizePhone(value: string): string {
  return value.replace(/[^0-9+]/g, "");
}

export class SharedDomainStore {
  constructor(private readonly client: DatabaseClient) {}

  async listContacts(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => sql<{
      id: string; displayName: string; locale: string; consentStatus: string;
      identities: { kind: string; value: string; verificationStatus: string }[];
      tags: { key: string; label: string; color: string }[];
      attributes: { key: string; label: string; valueType: string; value: string }[];
      leadCount: number; updatedAt: Date;
    }[]>`
      SELECT contact.id, contact.display_name AS "displayName", contact.locale,
             contact.consent_status AS "consentStatus", contact.updated_at AS "updatedAt",
             count(DISTINCT lead.id)::int AS "leadCount",
             COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
               'kind', identity.identity_kind,
               'value', identity.normalized_value,
               'verificationStatus', identity.verification_status
             )) FILTER (WHERE identity.id IS NOT NULL), '[]'::jsonb) AS identities,
             (SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'key', tag.tag_key, 'label', tag.label, 'color', tag.color
             ) ORDER BY tag.label, tag.id), '[]'::jsonb)
              FROM tenancy.contact_tag_assignments assignment
              JOIN tenancy.contact_tags tag ON tag.tenant_id = assignment.tenant_id AND tag.id = assignment.tag_id
              WHERE assignment.tenant_id = contact.tenant_id AND assignment.contact_id = contact.id) AS tags,
             (SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'key', attribute.attribute_key, 'label', attribute.label,
               'valueType', attribute.value_type, 'value', attribute.value_text
             ) ORDER BY attribute.label, attribute.id), '[]'::jsonb)
              FROM tenancy.contact_attributes attribute
              WHERE attribute.tenant_id = contact.tenant_id AND attribute.contact_id = contact.id) AS attributes
      FROM tenancy.contacts contact
      LEFT JOIN tenancy.contact_identities identity ON identity.contact_id = contact.id
        AND identity.tenant_id = contact.tenant_id AND identity.revoked_at IS NULL
      LEFT JOIN tenancy.leads lead ON lead.contact_id = contact.id AND lead.tenant_id = contact.tenant_id
      WHERE contact.tenant_id = ${context.tenantId}::uuid AND contact.status = 'active'
      GROUP BY contact.id
      ORDER BY contact.updated_at DESC, contact.id DESC
      LIMIT 500
    `);
  }

  async getCustomerJourney(context: TenantContext, contactId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const contacts = await sql<{
        id: string; displayName: string; locale: string; consentStatus: string; createdAt: Date; updatedAt: Date;
        conversationCount: number; openLeadCount: number; appointmentCount: number; openCallbackCount: number;
      }[]>`
        SELECT contact.id, contact.display_name AS "displayName", contact.locale,
          contact.consent_status AS "consentStatus", contact.created_at AS "createdAt",
          contact.updated_at AS "updatedAt",
          (SELECT count(*)::int FROM tenancy.conversations conversation
            WHERE conversation.tenant_id = contact.tenant_id AND conversation.contact_id = contact.id) AS "conversationCount",
          (SELECT count(*)::int FROM tenancy.leads lead
            WHERE lead.tenant_id = contact.tenant_id AND lead.contact_id = contact.id
              AND lead.status NOT IN ('closed_deal','disqualified')) AS "openLeadCount",
          (SELECT count(*)::int FROM tenancy.appointment_requests appointment
            JOIN tenancy.leads lead ON lead.tenant_id = appointment.tenant_id AND lead.id = appointment.lead_id
            WHERE appointment.tenant_id = contact.tenant_id AND lead.contact_id = contact.id) AS "appointmentCount",
          (SELECT count(*)::int FROM tenancy.voice_callback_requests callback
            JOIN tenancy.conversations conversation ON conversation.tenant_id = callback.tenant_id AND conversation.id = callback.conversation_id
            WHERE callback.tenant_id = contact.tenant_id AND conversation.contact_id = contact.id
              AND callback.status = 'pending') AS "openCallbackCount"
        FROM tenancy.contacts contact
        WHERE contact.tenant_id = ${context.tenantId}::uuid AND contact.id = ${contactId}::uuid
          AND contact.status = 'active'
      `;
      const contact = contacts[0];
      if (!contact) return null;
      const [leads, conversations, values, events] = await Promise.all([
        sql<{ id: string; title: string; source: string; status: string; createdAt: Date; updatedAt: Date }[]>`
          SELECT id, title, source, status, created_at AS "createdAt", updated_at AS "updatedAt"
          FROM tenancy.leads WHERE tenant_id = ${context.tenantId}::uuid AND contact_id = ${contactId}::uuid
          ORDER BY updated_at DESC, id DESC`,
        sql<{ id: string; leadId: string | null; productKey: string; channelKind: string; status: string; startedAt: Date }[]>`
          SELECT id, lead_id AS "leadId", product_key AS "productKey", channel_kind AS "channelKind",
            status, started_at AS "startedAt" FROM tenancy.conversations
          WHERE tenant_id = ${context.tenantId}::uuid AND contact_id = ${contactId}::uuid
          ORDER BY started_at DESC, id DESC`,
        sql<{ currency: string; amountMinor: string }[]>`
          SELECT currency, sum(amount_minor)::text AS "amountMinor" FROM tenancy.customer_value_events
          WHERE tenant_id = ${context.tenantId}::uuid AND contact_id = ${contactId}::uuid
          GROUP BY currency ORDER BY currency`,
        sql<{
          id: string; kind: string; title: string; detail: string | null; occurredAt: Date;
          leadId: string | null; conversationId: string | null; productKey: string | null;
          channelKind: string | null; amountMinor: string | null; currency: string | null;
        }[]>`
          SELECT * FROM (
            SELECT 'contact:' || contact.id::text AS id, 'contact_created'::text AS kind,
              'Customer record created'::text AS title, contact.consent_status::text AS detail,
              contact.created_at AS "occurredAt", NULL::uuid AS "leadId", NULL::uuid AS "conversationId",
              NULL::text AS "productKey", NULL::text AS "channelKind", NULL::text AS "amountMinor", NULL::text AS currency
            FROM tenancy.contacts contact WHERE contact.tenant_id = ${context.tenantId}::uuid AND contact.id = ${contactId}::uuid
            UNION ALL
            SELECT 'lead:' || lead.id::text, 'lead_created', 'Lead created', lead.title || ' · ' || lead.source,
              lead.created_at, lead.id, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text
            FROM tenancy.leads lead WHERE lead.tenant_id = ${context.tenantId}::uuid AND lead.contact_id = ${contactId}::uuid
            UNION ALL
            SELECT 'lead-status:' || history.id::text, 'lead_status', 'Lead status: ' || replace(history.to_status, '_', ' '),
              history.source_action, history.created_at, lead.id, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text
            FROM tenancy.lead_status_history history JOIN tenancy.leads lead
              ON lead.tenant_id = history.tenant_id AND lead.id = history.lead_id
            WHERE history.tenant_id = ${context.tenantId}::uuid AND lead.contact_id = ${contactId}::uuid
            UNION ALL
            SELECT 'conversation:' || conversation.id::text, 'conversation_started', 'Conversation started',
              conversation.product_key || ' · ' || conversation.channel_kind, conversation.started_at,
              conversation.lead_id, conversation.id, conversation.product_key, conversation.channel_kind, NULL::text, NULL::text
            FROM tenancy.conversations conversation WHERE conversation.tenant_id = ${context.tenantId}::uuid AND conversation.contact_id = ${contactId}::uuid
            UNION ALL
            SELECT 'message:' || message.id::text, 'message',
              CASE WHEN message.direction = 'inbound' THEN 'Customer message' WHEN message.direction = 'internal' THEN 'Private team note' ELSE 'Team or bot reply' END,
              left(COALESCE(message.content_json->>'text', message.content_json::text), 240), message.created_at,
              conversation.lead_id, conversation.id, conversation.product_key, conversation.channel_kind, NULL::text, NULL::text
            FROM tenancy.messages message JOIN tenancy.conversations conversation
              ON conversation.tenant_id = message.tenant_id AND conversation.id = message.conversation_id
            WHERE message.tenant_id = ${context.tenantId}::uuid AND conversation.contact_id = ${contactId}::uuid
            UNION ALL
            SELECT 'appointment:' || history.id::text, 'appointment_status',
              'Appointment: ' || replace(history.to_status, '_', ' '), appointment.notes,
              history.changed_at, lead.id, appointment.conversation_id, conversation.product_key, conversation.channel_kind, NULL::text, NULL::text
            FROM tenancy.appointment_status_history history
            JOIN tenancy.appointment_requests appointment ON appointment.tenant_id = history.tenant_id AND appointment.id = history.appointment_request_id
            JOIN tenancy.leads lead ON lead.tenant_id = appointment.tenant_id AND lead.id = appointment.lead_id
            LEFT JOIN tenancy.conversations conversation ON conversation.tenant_id = appointment.tenant_id AND conversation.id = appointment.conversation_id
            WHERE history.tenant_id = ${context.tenantId}::uuid AND lead.contact_id = ${contactId}::uuid
            UNION ALL
            SELECT 'callback:' || history.id::text, 'callback_status',
              'Callback: ' || replace(history.to_status, '_', ' '),
              CASE WHEN callback.due_at < now() AND callback.status = 'pending' THEN 'Overdue' ELSE 'Due ' || callback.due_at::text END,
              history.changed_at, callback.lead_id, callback.conversation_id, conversation.product_key, conversation.channel_kind, NULL::text, NULL::text
            FROM tenancy.voice_callback_status_history history
            JOIN tenancy.voice_callback_requests callback ON callback.tenant_id = history.tenant_id AND callback.id = history.callback_request_id
            JOIN tenancy.conversations conversation ON conversation.tenant_id = callback.tenant_id AND conversation.id = callback.conversation_id
            WHERE history.tenant_id = ${context.tenantId}::uuid AND conversation.contact_id = ${contactId}::uuid
            UNION ALL
            SELECT 'value:' || value.id::text, 'deal_value', 'Merchant-confirmed deal value', NULL::text,
              value.recorded_at, value.lead_id, value.conversation_id, conversation.product_key, conversation.channel_kind,
              value.amount_minor::text, value.currency
            FROM tenancy.customer_value_events value LEFT JOIN tenancy.conversations conversation
              ON conversation.tenant_id = value.tenant_id AND conversation.id = value.conversation_id
            WHERE value.tenant_id = ${context.tenantId}::uuid AND value.contact_id = ${contactId}::uuid
          ) journey ORDER BY "occurredAt" DESC, id DESC LIMIT 300
        `,
      ]);
      return { contact, leads, conversations, values, events, truncated: events.length === 300 };
    });
  }

  async recordCustomerDealValue(context: TenantContext, input: Readonly<{
    contactId: string; leadId: string; conversationId?: string; amountMinor: number;
    currency: string; idempotencyKey: string;
  }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ id: string | null }[]>`SELECT tenancy.record_customer_deal_value(
        ${input.contactId}::uuid, ${input.leadId}::uuid, ${input.conversationId ?? null}::uuid,
        ${input.amountMinor}::bigint, ${input.currency}, ${context.membershipId}::uuid,
        ${input.idempotencyKey}::uuid
      ) AS id`;
      return rows[0]?.id ? { status: "recorded" as const, valueEventId: rows[0].id } : { status: "not_found_or_invalid" as const };
    });
  }

  async listCallbacks(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => sql<{
      id: string; contactId: string; contactName: string; leadId: string; leadTitle: string;
      conversationId: string; dueAt: Date; status: string; createdAt: Date; completedAt: Date | null;
      history: { id: string; fromStatus: string | null; toStatus: string; changedAt: Date }[];
    }[]>`
      SELECT callback.id, contact.id AS "contactId", contact.display_name AS "contactName",
        lead.id AS "leadId", lead.title AS "leadTitle", callback.conversation_id AS "conversationId",
        callback.due_at AS "dueAt", callback.status, callback.created_at AS "createdAt",
        callback.completed_at AS "completedAt",
        (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', history.id, 'fromStatus', history.from_status,
          'toStatus', history.to_status, 'changedAt', history.changed_at) ORDER BY history.changed_at, history.id), '[]'::jsonb)
          FROM tenancy.voice_callback_status_history history
          WHERE history.tenant_id = callback.tenant_id AND history.callback_request_id = callback.id) AS history
      FROM tenancy.voice_callback_requests callback
      JOIN tenancy.leads lead ON lead.tenant_id = callback.tenant_id AND lead.id = callback.lead_id
      JOIN tenancy.contacts contact ON contact.tenant_id = lead.tenant_id AND contact.id = lead.contact_id
      WHERE callback.tenant_id = ${context.tenantId}::uuid
      ORDER BY CASE WHEN callback.status = 'pending' AND callback.due_at < now() THEN 0
        WHEN callback.status = 'pending' THEN 1 ELSE 2 END, callback.due_at, callback.id
      LIMIT 500
    `);
  }

  async operationsReport(context: TenantContext, input: Readonly<{ days: number; productKey?: "flowbot" | "ai_chat" | "voice" }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const productKey = input.productKey ?? null;
      const [summary] = await sql<{
        conversations: number; leads: number; appointments: number; callbacks: number;
        completedAppointments: number; completedCallbacks: number;
      }[]>`
        SELECT
          (SELECT count(*)::int FROM tenancy.conversations conversation
            WHERE conversation.tenant_id = ${context.tenantId}::uuid
              AND conversation.started_at >= now() - (${input.days}::text || ' days')::interval
              AND (${productKey}::text IS NULL OR conversation.product_key = ${productKey}::text)) AS conversations,
          (SELECT count(*)::int FROM tenancy.leads lead
            WHERE lead.tenant_id = ${context.tenantId}::uuid
              AND lead.created_at >= now() - (${input.days}::text || ' days')::interval
              AND (${productKey}::text IS NULL OR EXISTS (SELECT 1 FROM tenancy.conversations conversation
                WHERE conversation.tenant_id = lead.tenant_id AND conversation.lead_id = lead.id
                  AND conversation.product_key = ${productKey}::text))) AS leads,
          (SELECT count(*)::int FROM tenancy.appointment_requests appointment
            WHERE appointment.tenant_id = ${context.tenantId}::uuid
              AND appointment.created_at >= now() - (${input.days}::text || ' days')::interval
              AND (${productKey}::text IS NULL OR EXISTS (SELECT 1 FROM tenancy.conversations conversation
                WHERE conversation.tenant_id = appointment.tenant_id AND conversation.lead_id = appointment.lead_id
                  AND conversation.product_key = ${productKey}::text))) AS appointments,
          (SELECT count(*)::int FROM tenancy.voice_callback_requests callback
            JOIN tenancy.conversations conversation ON conversation.tenant_id = callback.tenant_id AND conversation.id = callback.conversation_id
            WHERE callback.tenant_id = ${context.tenantId}::uuid
              AND callback.created_at >= now() - (${input.days}::text || ' days')::interval
              AND (${productKey}::text IS NULL OR conversation.product_key = ${productKey}::text)) AS callbacks,
          (SELECT count(*)::int FROM tenancy.appointment_requests appointment
            WHERE appointment.tenant_id = ${context.tenantId}::uuid AND appointment.status = 'completed'
              AND appointment.created_at >= now() - (${input.days}::text || ' days')::interval
              AND (${productKey}::text IS NULL OR EXISTS (SELECT 1 FROM tenancy.conversations conversation
                WHERE conversation.tenant_id = appointment.tenant_id AND conversation.lead_id = appointment.lead_id
                  AND conversation.product_key = ${productKey}::text))) AS "completedAppointments",
          (SELECT count(*)::int FROM tenancy.voice_callback_requests callback
            JOIN tenancy.conversations conversation ON conversation.tenant_id = callback.tenant_id AND conversation.id = callback.conversation_id
            WHERE callback.tenant_id = ${context.tenantId}::uuid AND callback.status = 'completed'
              AND callback.created_at >= now() - (${input.days}::text || ' days')::interval
              AND (${productKey}::text IS NULL OR conversation.product_key = ${productKey}::text)) AS "completedCallbacks"
      `;
      const [values, outcomes, products, daily] = await Promise.all([
        sql<{ currency: string; amountMinor: string; events: number }[]>`
          SELECT value.currency, sum(value.amount_minor)::text AS "amountMinor", count(*)::int AS events
          FROM tenancy.customer_value_events value
          WHERE value.tenant_id = ${context.tenantId}::uuid
            AND value.recorded_at >= now() - (${input.days}::text || ' days')::interval
            AND (${productKey}::text IS NULL OR EXISTS (SELECT 1 FROM tenancy.conversations conversation
              WHERE conversation.tenant_id = value.tenant_id
                AND (conversation.id = value.conversation_id OR conversation.lead_id = value.lead_id)
                AND conversation.product_key = ${productKey}::text))
          GROUP BY value.currency ORDER BY value.currency`,
        sql<{ status: string; leads: number }[]>`
          SELECT lead.status, count(*)::int AS leads FROM tenancy.leads lead
          WHERE lead.tenant_id = ${context.tenantId}::uuid
            AND lead.created_at >= now() - (${input.days}::text || ' days')::interval
            AND (${productKey}::text IS NULL OR EXISTS (SELECT 1 FROM tenancy.conversations conversation
              WHERE conversation.tenant_id = lead.tenant_id AND conversation.lead_id = lead.id
                AND conversation.product_key = ${productKey}::text))
          GROUP BY lead.status ORDER BY leads DESC, lead.status`,
        sql<{ productKey: string; conversations: number }[]>`
          SELECT conversation.product_key AS "productKey", count(*)::int AS conversations
          FROM tenancy.conversations conversation WHERE conversation.tenant_id = ${context.tenantId}::uuid
            AND conversation.started_at >= now() - (${input.days}::text || ' days')::interval
            AND (${productKey}::text IS NULL OR conversation.product_key = ${productKey}::text)
          GROUP BY conversation.product_key ORDER BY conversations DESC, conversation.product_key`,
        sql<{ date: string; conversations: number; leads: number; appointments: number; callbacks: number }[]>`
          SELECT event_date::text AS date, sum(conversations)::int AS conversations, sum(leads)::int AS leads,
            sum(appointments)::int AS appointments, sum(callbacks)::int AS callbacks
          FROM (
            SELECT conversation.started_at::date AS event_date, 1 AS conversations, 0 AS leads, 0 AS appointments, 0 AS callbacks
              FROM tenancy.conversations conversation WHERE conversation.tenant_id = ${context.tenantId}::uuid
                AND conversation.started_at >= now() - (${input.days}::text || ' days')::interval
                AND (${productKey}::text IS NULL OR conversation.product_key = ${productKey}::text)
            UNION ALL SELECT lead.created_at::date, 0, 1, 0, 0 FROM tenancy.leads lead
              WHERE lead.tenant_id = ${context.tenantId}::uuid AND lead.created_at >= now() - (${input.days}::text || ' days')::interval
                AND (${productKey}::text IS NULL OR EXISTS (SELECT 1 FROM tenancy.conversations conversation WHERE conversation.tenant_id = lead.tenant_id AND conversation.lead_id = lead.id AND conversation.product_key = ${productKey}::text))
            UNION ALL SELECT appointment.created_at::date, 0, 0, 1, 0 FROM tenancy.appointment_requests appointment
              WHERE appointment.tenant_id = ${context.tenantId}::uuid AND appointment.created_at >= now() - (${input.days}::text || ' days')::interval
                AND (${productKey}::text IS NULL OR EXISTS (SELECT 1 FROM tenancy.conversations conversation WHERE conversation.tenant_id = appointment.tenant_id AND conversation.lead_id = appointment.lead_id AND conversation.product_key = ${productKey}::text))
            UNION ALL SELECT callback.created_at::date, 0, 0, 0, 1 FROM tenancy.voice_callback_requests callback
              JOIN tenancy.conversations conversation ON conversation.tenant_id = callback.tenant_id AND conversation.id = callback.conversation_id
              WHERE callback.tenant_id = ${context.tenantId}::uuid AND callback.created_at >= now() - (${input.days}::text || ' days')::interval
                AND (${productKey}::text IS NULL OR conversation.product_key = ${productKey}::text)
          ) events GROUP BY event_date ORDER BY event_date
      `,
      ]);
      return Object.freeze({ asOf: new Date(), days: input.days, productKey, summary: summary!, values, outcomes, products, daily });
    });
  }

  async listTenantNotifications(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => sql<{
      id: string; category: string; severity: string; eventKind: string; entityType: string;
      entityId: string; deepLink: string; occurredAt: Date; read: boolean;
    }[]>`
      SELECT notification.id, notification.category, notification.severity,
        notification.event_kind AS "eventKind", notification.entity_type AS "entityType",
        notification.entity_id AS "entityId", notification.deep_link AS "deepLink",
        notification.occurred_at AS "occurredAt", (receipt.notification_id IS NOT NULL) AS read
      FROM tenancy.tenant_notifications notification
      LEFT JOIN tenancy.tenant_notification_reads receipt
        ON receipt.tenant_id = notification.tenant_id AND receipt.notification_id = notification.id
        AND receipt.membership_id = ${context.membershipId}::uuid
      WHERE notification.tenant_id = ${context.tenantId}::uuid
      ORDER BY (receipt.notification_id IS NULL) DESC,
        CASE notification.category WHEN 'action_needed' THEN 0 WHEN 'product_health' THEN 1
          WHEN 'usage_cost' THEN 2 WHEN 'billing' THEN 3 WHEN 'team_security' THEN 4 ELSE 5 END,
        notification.occurred_at DESC, notification.id DESC LIMIT 200
    `);
  }

  async markTenantNotificationRead(context: TenantContext, notificationId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ accepted: boolean }[]>`SELECT tenancy.mark_tenant_notification_read(
        ${notificationId}::uuid, ${context.membershipId}::uuid
      ) AS accepted`;
      return rows[0]?.accepted ? { status: "accepted" as const } : { status: "not_found" as const };
    });
  }

  async updateCallback(context: TenantContext, callbackId: string, status: "completed" | "cancelled") {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ result: "accepted" | "replayed" | "not_found" | "invalid_transition" }[]>`
        SELECT tenancy.transition_voice_callback_request(
          ${callbackId}::uuid, ${status}, ${context.membershipId}::uuid
        ) AS result`;
      const result = rows[0]?.result ?? "not_found";
      return result === "accepted" ? { status: "accepted" as const, replayed: false as const }
        : result === "replayed" ? { status: "accepted" as const, replayed: true as const }
          : { status: result as "not_found" | "invalid_transition" };
    });
  }

  async updateContactMetadata(context: TenantContext, contactId: string, input: Readonly<{
    tags: readonly Readonly<{ key: string; label: string; color: string }>[];
    attributes: readonly Readonly<{ key: string; label: string; valueType: "text" | "number" | "boolean" | "date"; value: string }>[];
  }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const contact = await sql<{ id: string }[]>`
        SELECT id FROM tenancy.contacts WHERE tenant_id = ${context.tenantId}::uuid
          AND id = ${contactId}::uuid AND status = 'active' FOR UPDATE
      `;
      if (!contact[0]) return { status: "not_found" as const };
      const tagIds: string[] = [];
      for (const tag of input.tags) {
        const rows = await sql<{ id: string }[]>`
          INSERT INTO tenancy.contact_tags (tenant_id, tag_key, label, color, created_by_membership_id)
          VALUES (${context.tenantId}::uuid, ${tag.key}, ${tag.label}, ${tag.color}, ${context.membershipId}::uuid)
          ON CONFLICT (tenant_id, tag_key) DO UPDATE
          SET label = EXCLUDED.label, color = EXCLUDED.color, updated_at = now()
          RETURNING id
        `;
        tagIds.push(rows[0]!.id);
      }
      await sql`DELETE FROM tenancy.contact_tag_assignments WHERE tenant_id = ${context.tenantId}::uuid AND contact_id = ${contactId}::uuid`;
      for (const tagId of tagIds) await sql`
        INSERT INTO tenancy.contact_tag_assignments (tenant_id, contact_id, tag_id, assigned_by_membership_id)
        VALUES (${context.tenantId}::uuid, ${contactId}::uuid, ${tagId}::uuid, ${context.membershipId}::uuid)
      `;
      const attributeKeys = input.attributes.map((attribute) => attribute.key);
      await sql`DELETE FROM tenancy.contact_attributes WHERE tenant_id = ${context.tenantId}::uuid AND contact_id = ${contactId}::uuid AND NOT (attribute_key = ANY(${attributeKeys}::text[]))`;
      for (const attribute of input.attributes) await sql`
        INSERT INTO tenancy.contact_attributes (
          tenant_id, contact_id, attribute_key, label, value_type, value_text, updated_by_membership_id
        ) VALUES (
          ${context.tenantId}::uuid, ${contactId}::uuid, ${attribute.key}, ${attribute.label},
          ${attribute.valueType}, ${attribute.value}, ${context.membershipId}::uuid
        )
        ON CONFLICT (tenant_id, contact_id, attribute_key) DO UPDATE
        SET label = EXCLUDED.label, value_type = EXCLUDED.value_type,
            value_text = EXCLUDED.value_text, updated_by_membership_id = EXCLUDED.updated_by_membership_id,
            updated_at = now()
      `;
      await sql`UPDATE tenancy.contacts SET updated_at = now() WHERE tenant_id = ${context.tenantId}::uuid AND id = ${contactId}::uuid`;
      await sql`INSERT INTO tenancy.audit_logs (tenant_id, actor_user_id, actor_membership_id, action, target_type, target_id, request_id, result, metadata)
        VALUES (${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid, 'contact.metadata_updated', 'contact', ${contactId}, ${context.requestId}, 'succeeded', ${sql.json({ tagCount: input.tags.length, attributeCount: input.attributes.length })})`;
      return { status: "updated" as const };
    });
  }

  async listIdentityReviewCandidates(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => sql<{
      id: string; sourceContactId: string; sourceContactName: string;
      candidateContactId: string; candidateContactName: string;
      identityKind: "email" | "phone"; matchValue: string; observedAt: Date;
    }[]>`
      SELECT review.id, source_contact.id AS "sourceContactId",
             source_contact.display_name AS "sourceContactName",
             candidate_contact.id AS "candidateContactId",
             candidate_contact.display_name AS "candidateContactName",
             source_identity.identity_kind AS "identityKind",
             source_identity.normalized_value AS "matchValue",
             review.observed_at AS "observedAt"
      FROM tenancy.contact_identity_review_candidates review
      JOIN tenancy.contact_identities source_identity
        ON source_identity.tenant_id = review.tenant_id
       AND source_identity.id = review.source_identity_id
       AND source_identity.contact_id = review.source_contact_id
       AND source_identity.revoked_at IS NULL
      JOIN tenancy.contacts source_contact
        ON source_contact.tenant_id = review.tenant_id
       AND source_contact.id = review.source_contact_id AND source_contact.status = 'active'
      JOIN tenancy.contacts candidate_contact
        ON candidate_contact.tenant_id = review.tenant_id
       AND candidate_contact.id = review.candidate_contact_id AND candidate_contact.status = 'active'
      WHERE review.tenant_id = ${context.tenantId}::uuid
        AND EXISTS (
          SELECT 1 FROM tenancy.contact_identities candidate_identity
          WHERE candidate_identity.tenant_id = review.tenant_id
            AND candidate_identity.contact_id = review.candidate_contact_id
            AND candidate_identity.identity_kind = source_identity.identity_kind
            AND candidate_identity.normalized_value = source_identity.normalized_value
            AND candidate_identity.revoked_at IS NULL
        )
      ORDER BY review.observed_at DESC, review.id DESC
      LIMIT 200
    `);
  }

  async createContact(context: TenantContext, input: ContactInput) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const emailNormalized = input.email?.trim().toLowerCase() ?? null;
      const phoneNormalized = input.phone ? normalizePhone(input.phone) : null;
      const identities = [
        ...(emailNormalized ? [{ kind: "email", value: emailNormalized }] : []),
        ...(phoneNormalized ? [{ kind: "phone", value: phoneNormalized }] : []),
      ];
      const candidates = await sql<{ contact_id: string }[]>`
        SELECT DISTINCT contact_id FROM tenancy.contact_identities
        WHERE tenant_id = ${context.tenantId}::uuid AND revoked_at IS NULL
          AND (
            (${emailNormalized}::text IS NOT NULL AND identity_kind = 'email' AND normalized_value = ${emailNormalized})
            OR (${phoneNormalized}::text IS NOT NULL AND identity_kind = 'phone' AND normalized_value = ${phoneNormalized})
          )
      `;
      if (candidates.length > 0) {
        return { status: "review_required" as const, candidateContactIds: candidates.map((row) => row.contact_id) };
      }
      const contactId = randomUUID();
      await sql`
        INSERT INTO tenancy.contacts (id, tenant_id, display_name, locale, consent_status)
        VALUES (${contactId}::uuid, ${context.tenantId}::uuid, ${input.displayName}, ${input.locale}, ${input.consentStatus})
      `;
      for (const identity of identities) await sql`
        INSERT INTO tenancy.contact_identities (
          tenant_id, contact_id, identity_kind, normalized_value, verification_status
        ) VALUES (
          ${context.tenantId}::uuid, ${contactId}::uuid, ${identity.kind}, ${identity.value}, 'unverified'
        )
      `;
      await sql`
        INSERT INTO tenancy.audit_logs (
          tenant_id, actor_user_id, actor_membership_id, action, target_type,
          target_id, request_id, result, metadata
        ) VALUES (
          ${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid,
          'contact.created', 'contact', ${contactId}, ${context.requestId}, 'succeeded', '{}'::jsonb
        )
      `;
      return { status: "created" as const, contactId };
    });
  }

  async createLead(context: TenantContext, input: LeadInput) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const contact = await sql<{ id: string }[]>`
        SELECT id FROM tenancy.contacts WHERE tenant_id = ${context.tenantId}::uuid
          AND id = ${input.contactId}::uuid AND status = 'active'
      `;
      if (!contact[0]) return { status: "not_found" as const };
      const leadId = randomUUID();
      await sql`
        INSERT INTO tenancy.leads (id, tenant_id, contact_id, title, source, status)
        VALUES (${leadId}::uuid, ${context.tenantId}::uuid, ${input.contactId}::uuid, ${input.title}, ${input.source}, ${input.status})
      `;
      await sql`
        INSERT INTO tenancy.lead_status_history (
          tenant_id, lead_id, from_status, to_status, source_action,
          actor_membership_id, request_id
        ) VALUES (
          ${context.tenantId}::uuid, ${leadId}::uuid, NULL, ${input.status}, 'lead.create',
          ${context.membershipId}::uuid, ${context.requestId}
        )
      `;
      return { status: "created" as const, leadId };
    });
  }

  async listLeads(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => sql<{
      id: string; contactId: string; contactName: string; title: string;
      source: string; status: string; createdAt: Date; updatedAt: Date;
    }[]>`
      SELECT lead.id, lead.contact_id AS "contactId", contact.display_name AS "contactName",
             lead.title, lead.source, lead.status, lead.created_at AS "createdAt",
             lead.updated_at AS "updatedAt"
      FROM tenancy.leads lead
      JOIN tenancy.contacts contact ON contact.id = lead.contact_id
        AND contact.tenant_id = lead.tenant_id
      WHERE lead.tenant_id = ${context.tenantId}::uuid
      ORDER BY lead.updated_at DESC, lead.id DESC
      LIMIT 500
    `);
  }

  async updateLeadStatus(context: TenantContext, leadId: string, status: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ status: string }[]>`
        SELECT status FROM tenancy.leads
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${leadId}::uuid
        FOR UPDATE
      `;
      const previous = rows[0]?.status;
      if (!previous) return { status: "not_found" as const };
      if (previous === status) return { status: "accepted" as const, replayed: true as const };
      await sql`
        UPDATE tenancy.leads
        SET status = ${status}, updated_at = now(),
            closed_at = CASE WHEN ${status} IN ('closed_deal', 'disqualified') THEN now() ELSE NULL END
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${leadId}::uuid
      `;
      await sql`
        INSERT INTO tenancy.lead_status_history (
          tenant_id, lead_id, from_status, to_status, source_action,
          actor_membership_id, request_id
        ) VALUES (
          ${context.tenantId}::uuid, ${leadId}::uuid, ${previous}, ${status},
          'lead.update', ${context.membershipId}::uuid, ${context.requestId}
        )
      `;
      await sql`
        INSERT INTO tenancy.audit_logs (
          tenant_id, actor_user_id, actor_membership_id, action, target_type,
          target_id, request_id, result, metadata
        ) VALUES (
          ${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid,
          'lead.status.updated', 'lead', ${leadId}, ${context.requestId}, 'succeeded',
          ${sql.json({ fromStatus: previous, toStatus: status })}
        )
      `;
      return { status: "accepted" as const, replayed: false as const };
    });
  }

  async listAppointments(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => sql<{
      id: string; leadId: string; leadTitle: string; contactName: string; status: string; timezone: string;
      notes: string | null; createdAt: Date; updatedAt: Date; calendarSyncStatus: string;
      calendarSyncOperation: string | null; calendarSyncErrorCode: string | null;
      options: { id: string; startAt: Date; endAt: Date; preferenceOrder: number; verificationStatus: string }[];
      history: { id: string; fromStatus: string | null; toStatus: string; changedAt: Date }[];
    }[]>`SELECT request.id, request.lead_id AS "leadId", lead.title AS "leadTitle",
      contact.display_name AS "contactName", request.status, request.timezone, request.notes,
      request.created_at AS "createdAt", request.updated_at AS "updatedAt",
      CASE WHEN sync.id IS NULL THEN CASE WHEN EXISTS (
        SELECT 1 FROM tenancy.voice_scheduling_profiles profile
        WHERE profile.tenant_id = request.tenant_id AND profile.status = 'active'
      ) THEN 'ready' ELSE 'not_configured' END
        WHEN sync.status = 'pending' THEN 'pending'
        WHEN sync.status = 'processing' THEN 'synchronizing'
        WHEN sync.status = 'confirmed' THEN 'synchronized'
        WHEN sync.status = 'dead_letter' THEN 'action_required'
        WHEN sync.status = 'failed' THEN 'failed'
        ELSE sync.status END AS "calendarSyncStatus",
      sync.operation AS "calendarSyncOperation", sync.safe_error_code AS "calendarSyncErrorCode",
      (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', history.id, 'fromStatus', history.from_status, 'toStatus', history.to_status,
        'changedAt', history.changed_at
      ) ORDER BY history.changed_at, history.id), '[]'::jsonb)
        FROM tenancy.appointment_status_history history
        WHERE history.tenant_id = request.tenant_id AND history.appointment_request_id = request.id) AS history,
      COALESCE(jsonb_agg(jsonb_build_object('id', option.id, 'startAt', option.start_at,
        'endAt', option.end_at, 'preferenceOrder', option.preference_order,
        'verificationStatus', option.verification_status) ORDER BY option.preference_order)
        FILTER (WHERE option.id IS NOT NULL), '[]'::jsonb) AS options
      FROM tenancy.appointment_requests request
      JOIN tenancy.leads lead ON lead.tenant_id = request.tenant_id AND lead.id = request.lead_id
      JOIN tenancy.contacts contact ON contact.tenant_id = lead.tenant_id AND contact.id = lead.contact_id
      LEFT JOIN tenancy.appointment_time_options option ON option.tenant_id = request.tenant_id
        AND option.appointment_request_id = request.id
      LEFT JOIN LATERAL (
        SELECT job.id, job.status, job.operation, job.safe_error_code
        FROM tenancy.voice_scheduling_jobs job
        WHERE job.tenant_id = request.tenant_id AND job.appointment_request_id = request.id
        ORDER BY job.created_at DESC, job.id DESC LIMIT 1
      ) sync ON true
      WHERE request.tenant_id = ${context.tenantId}::uuid
      GROUP BY request.id, lead.id, contact.id, sync.id, sync.status, sync.operation, sync.safe_error_code
      ORDER BY CASE request.status WHEN 'requested' THEN 0 WHEN 'pending_confirmation' THEN 1 WHEN 'confirmed' THEN 2 WHEN 'rescheduled' THEN 2 ELSE 3 END,
        request.updated_at DESC, request.id DESC LIMIT 500`);
  }

  async updateAppointment(context: TenantContext, appointmentId: string, input: Readonly<{
    status: "pending_confirmation" | "confirmed" | "rescheduled" | "completed" | "cancelled" | "rejected" | "no_show";
    optionId?: string; notes?: string;
  }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ status: string; leadId: string }[]>`SELECT status, lead_id AS "leadId"
        FROM tenancy.appointment_requests WHERE tenant_id = ${context.tenantId}::uuid AND id = ${appointmentId}::uuid FOR UPDATE`;
      const current = rows[0]; if (!current) return { status: "not_found" as const };
      const allowed: Readonly<Record<string, readonly string[]>> = {
        requested: ["pending_confirmation", "confirmed", "cancelled", "rejected"],
        pending_confirmation: ["confirmed", "cancelled", "rejected"],
        confirmed: ["rescheduled", "completed", "cancelled", "no_show"],
        rescheduled: ["completed", "cancelled", "no_show"],
      };
      if (current.status === input.status) {
        if (input.status !== "rescheduled" || !input.optionId) {
          return { status: "accepted" as const, replayed: true as const };
        }
        const selected = await sql<{ id: string; verificationStatus: string }[]>`
          SELECT id, verification_status AS "verificationStatus" FROM tenancy.appointment_time_options
          WHERE tenant_id = ${context.tenantId}::uuid AND appointment_request_id = ${appointmentId}::uuid
            AND id = ${input.optionId}::uuid`;
        if (!selected[0]) return { status: "not_found" as const };
        if (selected[0].verificationStatus === "confirmed") {
          return { status: "accepted" as const, replayed: true as const };
        }
        await sql`UPDATE tenancy.appointment_time_options
          SET verification_status = CASE WHEN id = ${input.optionId}::uuid THEN 'confirmed' ELSE 'unavailable' END
          WHERE tenant_id = ${context.tenantId}::uuid AND appointment_request_id = ${appointmentId}::uuid`;
        await sql`UPDATE tenancy.appointment_requests
          SET notes = COALESCE(${input.notes?.trim() || null}, notes), updated_at = now()
          WHERE tenant_id = ${context.tenantId}::uuid AND id = ${appointmentId}::uuid`;
        await sql`INSERT INTO tenancy.audit_logs (tenant_id, actor_user_id, actor_membership_id, action, target_type, target_id, request_id, result, metadata)
          VALUES (${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid, 'appointment.rescheduled_again',
            'appointment_request', ${appointmentId}, ${context.requestId}, 'succeeded', ${sql.json({ optionId: input.optionId })})`;
        return { status: "accepted" as const, replayed: false as const };
      }
      if (!(allowed[current.status] ?? []).includes(input.status)) return { status: "invalid_transition" as const };
      if (input.status === "confirmed" || input.status === "rescheduled") {
        if (!input.optionId) return { status: "validation_failed" as const };
        const options = await sql<{ id: string }[]>`SELECT id FROM tenancy.appointment_time_options
          WHERE tenant_id = ${context.tenantId}::uuid AND appointment_request_id = ${appointmentId}::uuid AND id = ${input.optionId}::uuid`;
        if (!options[0]) return { status: "not_found" as const };
        await sql`UPDATE tenancy.appointment_time_options SET verification_status = CASE WHEN id = ${input.optionId}::uuid THEN 'confirmed' ELSE 'unavailable' END
          WHERE tenant_id = ${context.tenantId}::uuid AND appointment_request_id = ${appointmentId}::uuid`;
      }
      await sql`UPDATE tenancy.appointment_requests SET status = ${input.status}, notes = COALESCE(${input.notes?.trim() || null}, notes), updated_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${appointmentId}::uuid`;
      if (input.status === "confirmed" || input.status === "rescheduled") await sql`UPDATE tenancy.leads SET status = 'appointment_made', updated_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${current.leadId}::uuid`;
      await sql`INSERT INTO tenancy.audit_logs (tenant_id, actor_user_id, actor_membership_id, action, target_type, target_id, request_id, result, metadata)
        VALUES (${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid, 'appointment.status_changed',
          'appointment_request', ${appointmentId}, ${context.requestId}, 'succeeded', ${sql.json({ from: current.status, to: input.status, optionId: input.optionId ?? null })})`;
      return { status: "accepted" as const };
    });
  }

  async listInbox(context: TenantContext, input: Readonly<{ q?: string }> = {}) {
    const query = input.q?.trim() ?? "";
    const like = query ? `%${query.replace(/[%_\\]/g, "\\$&")}%` : null;
    return withTenantTransaction(this.client, context, async ({ sql }) => sql<{
      id: string; contactId: string; contactName: string; leadId: string | null;
      productKey: string; publicPlanKey: string; channelKind: string; automationMode: string;
      status: string; assignedMembershipId: string | null; legalHold: boolean;
      lastMessage: string | null;
      lastMessageAt: Date | null; updatedAt: Date; takeoverEligible: boolean; takeoverExpiresAt: Date | null;
      voiceStatus: string | null;
      voiceTerminalReason: string | null; voiceMinutes: number | null;
      voiceDurationSeconds: number | null; voiceOutcome: string | null;
      voiceSummary: string | null; callbackStatus: string | null; callbackDueAt: Date | null;
    }[]>`
      SELECT conversation.id, conversation.contact_id AS "contactId",
             contact.display_name AS "contactName", conversation.lead_id AS "leadId",
             conversation.product_key AS "productKey", conversation.public_plan_key AS "publicPlanKey",
             conversation.channel_kind AS "channelKind", conversation.automation_mode AS "automationMode",
             conversation.status, conversation.assigned_membership_id AS "assignedMembershipId",
             conversation.legal_hold AS "legalHold",
             COALESCE(last_message.content_json->>'text', last_message.content_json->'content'->>'text') AS "lastMessage",
             last_message.created_at AS "lastMessageAt", conversation.updated_at AS "updatedAt",
             (conversation.status = 'open'
               AND conversation.automation_mode IN ('flowbot', 'ai_text', 'voice')
               AND latest_bot.created_at > now() - interval '5 minutes') AS "takeoverEligible",
             latest_bot.created_at + interval '5 minutes' AS "takeoverExpiresAt",
             voice.status AS "voiceStatus", voice.terminal_reason AS "voiceTerminalReason",
             voice.settled_minutes AS "voiceMinutes",
             voice.settled_elapsed_seconds AS "voiceDurationSeconds",
             outcome.outcome_code AS "voiceOutcome", outcome.summary_text AS "voiceSummary",
             callback.status AS "callbackStatus", callback.due_at AS "callbackDueAt"
      FROM tenancy.conversations conversation
      JOIN tenancy.contacts contact ON contact.id = conversation.contact_id
        AND contact.tenant_id = conversation.tenant_id
      LEFT JOIN LATERAL (
        SELECT content_json, created_at FROM tenancy.messages message
        WHERE message.tenant_id = conversation.tenant_id AND message.conversation_id = conversation.id
        ORDER BY message.sequence DESC LIMIT 1
      ) last_message ON true
      LEFT JOIN LATERAL (
        SELECT created_at FROM tenancy.messages message
        WHERE message.tenant_id = conversation.tenant_id AND message.conversation_id = conversation.id
          AND message.actor_type IN ('flowbot', 'ai') AND message.direction = 'outbound'
        ORDER BY message.sequence DESC LIMIT 1
      ) latest_bot ON true
      LEFT JOIN tenancy.voice_sessions voice
        ON voice.tenant_id = conversation.tenant_id AND voice.conversation_id = conversation.id
      LEFT JOIN tenancy.voice_call_outcomes outcome
        ON outcome.tenant_id = voice.tenant_id AND outcome.session_id = voice.id
      LEFT JOIN LATERAL (
        SELECT request.status, request.due_at
        FROM tenancy.voice_callback_requests request
        WHERE request.tenant_id = voice.tenant_id AND request.session_id = voice.id
        ORDER BY request.created_at DESC, request.id DESC LIMIT 1
      ) callback ON true
      LEFT JOIN tenancy.legacy_conversation_imports legacy_import
        ON legacy_import.tenant_id = conversation.tenant_id
       AND legacy_import.conversation_id = conversation.id
      WHERE conversation.tenant_id = ${context.tenantId}::uuid
        AND COALESCE(legacy_import.cutover_state, 'imported') = 'imported'
        AND (
          ${like}::text IS NULL
          OR contact.display_name ILIKE ${like} ESCAPE '\\'
          OR EXISTS (
            SELECT 1 FROM tenancy.contact_identities identity
            WHERE identity.tenant_id = conversation.tenant_id
              AND identity.contact_id = contact.id
              AND identity.normalized_value ILIKE ${like} ESCAPE '\\'
          )
        )
      ORDER BY COALESCE(last_message.created_at, conversation.started_at) DESC
      LIMIT 500
    `);
  }

  async createConversation(context: TenantContext, input: ConversationInput) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await sql<{ ok: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM tenancy.entitlement_snapshots snapshot
          JOIN tenancy.product_subscriptions subscription
            ON subscription.id = snapshot.subscription_id AND subscription.tenant_id = snapshot.tenant_id
          JOIN catalog.plan_versions version ON version.id = snapshot.plan_version_id
          JOIN catalog.plans plan ON plan.id = version.plan_id
          WHERE snapshot.tenant_id = ${context.tenantId}::uuid
            AND snapshot.id = ${input.entitlementSnapshotId}::uuid
            AND snapshot.access_mode = 'active'
            AND subscription.status IN ('active', 'trialing', 'scheduled_change')
            AND snapshot.product_key = ${input.productKey}
            AND plan.plan_key = ${input.publicPlanKey}
        ) AND EXISTS (
          SELECT 1 FROM tenancy.contacts WHERE tenant_id = ${context.tenantId}::uuid
            AND id = ${input.contactId}::uuid AND status = 'active'
        ) AS ok
      `;
      if (!authority[0]?.ok) return { status: "not_entitled_or_not_found" as const };
      const conversationId = randomUUID();
      await sql`
        INSERT INTO tenancy.conversations (
          id, tenant_id, contact_id, lead_id, product_key, public_plan_key,
          entitlement_snapshot_id, channel_kind, automation_mode
        ) VALUES (
          ${conversationId}::uuid, ${context.tenantId}::uuid, ${input.contactId}::uuid,
          ${input.leadId ?? null}::uuid, ${input.productKey}, ${input.publicPlanKey},
          ${input.entitlementSnapshotId}::uuid, ${input.channelKind}, ${input.automationMode}
        )
      `;
      await sql`
        INSERT INTO tenancy.outbox (tenant_id, topic, payload, idempotency_key)
        VALUES (${context.tenantId}::uuid, 'conversation.started',
          ${sql.json({ conversationId, productKey: input.productKey, publicPlanKey: input.publicPlanKey })},
          ${`conversation-started:${conversationId}`})
      `;
      return { status: "created" as const, conversationId };
    });
  }

  async listMessages(context: TenantContext, conversationId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => sql<{
      id: string; sequence: number; actorType: string; direction: string;
      text: string; createdAt: Date;
    }[]>`
      SELECT id, sequence, actor_type AS "actorType", direction,
             COALESCE(content_json->>'text', content_json->'content'->>'text', '') AS text,
             created_at AS "createdAt"
      FROM tenancy.messages
      WHERE tenant_id = ${context.tenantId}::uuid AND conversation_id = ${conversationId}::uuid
      ORDER BY sequence
      LIMIT 2000
    `);
  }

  async appendMessage(context: TenantContext, conversationId: string, input: MessageInput) {
    const parsed = messageInputSchema.parse(input);
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      if (parsed.externalMessageId) {
        const replay = await sql<{ id: string; sequence: number }[]>`
          SELECT id, sequence FROM tenancy.messages
          WHERE tenant_id = ${context.tenantId}::uuid AND conversation_id = ${conversationId}::uuid
            AND external_message_id = ${parsed.externalMessageId}
        `;
        if (replay[0]) return { status: "replayed" as const, messageId: replay[0].id, sequence: replay[0].sequence };
      }
      const conversations = await sql<{ next_sequence: number; automation_mode: string }[]>`
        SELECT next_sequence, automation_mode FROM tenancy.conversations
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${conversationId}::uuid AND status <> 'closed'
        FOR UPDATE
      `;
      const conversation = conversations[0];
      if (!conversation) return { status: "not_found" as const };
      if (parsed.actorType === "human" && parsed.direction === "outbound" && conversation.automation_mode !== "human") {
        return { status: "handover_required" as const };
      }
      const messageId = randomUUID();
      await sql`
        INSERT INTO tenancy.messages (
          id, tenant_id, conversation_id, sequence, actor_type, direction,
          content_json, external_message_id
        ) VALUES (
          ${messageId}::uuid, ${context.tenantId}::uuid, ${conversationId}::uuid,
          ${conversation.next_sequence}, ${parsed.actorType}, ${parsed.direction},
          ${sql.json({ text: parsed.text })}, ${parsed.externalMessageId ?? null}
        )
      `;
      await sql`
        UPDATE tenancy.conversations SET next_sequence = next_sequence + 1, updated_at = now()
        WHERE id = ${conversationId}::uuid
      `;
      return { status: "created" as const, messageId, sequence: conversation.next_sequence };
    });
  }

  async takeOverConversation(context: TenantContext, conversationId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ automation_mode: string; status: string }[]>`
        SELECT automation_mode, status FROM tenancy.conversations
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${conversationId}::uuid
        FOR UPDATE
      `;
      const conversation = rows[0];
      if (!conversation || conversation.status === "closed") return { status: "not_found" as const };
      if (conversation.automation_mode === "human") return { status: "accepted" as const, replayed: true as const };
      if (!canTransitionMode(conversation.automation_mode, "human")) return { status: "transition_denied" as const };
      if (!["flowbot", "ai_text", "voice"].includes(conversation.automation_mode)) {
        return { status: "takeover_unavailable" as const };
      }
      const latestBotResponses = await sql<{ eligible: boolean; expires_at: Date }[]>`
        SELECT created_at > now() - interval '5 minutes' AS eligible,
               created_at + interval '5 minutes' AS expires_at
        FROM tenancy.messages
        WHERE tenant_id = ${context.tenantId}::uuid AND conversation_id = ${conversationId}::uuid
          AND actor_type IN ('flowbot', 'ai') AND direction = 'outbound'
        ORDER BY sequence DESC LIMIT 1
      `;
      if (!latestBotResponses[0]?.eligible) {
        return { status: "takeover_window_expired" as const,
          expiresAt: latestBotResponses[0]?.expires_at ?? null };
      }
      await sql`
        UPDATE tenancy.conversations
        SET automation_mode = 'human', assigned_membership_id = ${context.membershipId}::uuid, updated_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${conversationId}::uuid
      `;
      await sql`
        UPDATE tenancy.flow_executions
        SET status = 'handover', state_json = jsonb_set(state_json, '{status}', '"handover"'::jsonb), updated_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid AND conversation_id = ${conversationId}::uuid
          AND status IN ('active', 'waiting')
      `;
      await sql`
        INSERT INTO tenancy.conversation_transitions (
          tenant_id, conversation_id, from_mode, to_mode, reason,
          actor_membership_id, request_id
        ) VALUES (
          ${context.tenantId}::uuid, ${conversationId}::uuid, ${conversation.automation_mode},
          'human', 'staff_takeover', ${context.membershipId}::uuid, ${context.requestId}
        )
      `;
      await sql`
        INSERT INTO tenancy.handover_events (
          tenant_id, conversation_id, event_type, actor_membership_id,
          assigned_membership_id, reason, idempotency_key
        ) VALUES (
          ${context.tenantId}::uuid, ${conversationId}::uuid, 'accepted',
          ${context.membershipId}::uuid, ${context.membershipId}::uuid,
          'staff_takeover', ${`handover:accepted:${conversationId}:${context.requestId}`}
        )
      `;
      return { status: "accepted" as const, replayed: false as const };
    });
  }

  async releaseConversation(context: TenantContext, conversationId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ automation_mode: string; product_key: string; status: string }[]>`
        SELECT automation_mode, product_key, status FROM tenancy.conversations
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${conversationId}::uuid
        FOR UPDATE
      `;
      const conversation = rows[0];
      if (!conversation || conversation.status === "closed") return { status: "not_found" as const };
      if (conversation.automation_mode !== "human") return { status: "not_in_handover" as const };
      const targetMode = conversation.product_key === "flowbot" ? "flowbot"
        : conversation.product_key === "ai_chat" ? "ai_text"
          : conversation.product_key === "voice" ? "voice" : null;
      if (!targetMode || !canTransitionMode("human", targetMode)) return { status: "transition_denied" as const };

      if (targetMode === "flowbot") {
        const executions = await sql<{
          id: string; deployment_id: string; flow_version_id: string; snapshot_json: unknown;
          state_json: unknown; authority_json: FlowEntitlements; next_input_sequence: number;
        }[]>`
          SELECT execution.id, execution.deployment_id, execution.flow_version_id,
                 version.snapshot_json, execution.state_json, execution.next_input_sequence,
                 jsonb_build_object(
                   'planKey', plan.plan_key,
                   'accessMode', snapshot.access_mode,
                   'entitlements', COALESCE(snapshot.resolved_json->'entitlements', '{}'::jsonb),
                   'limits', COALESCE(snapshot.resolved_json->'limits', '{}'::jsonb)
                 ) AS authority_json
          FROM tenancy.flow_executions execution
          JOIN tenancy.flow_versions version
            ON version.tenant_id = execution.tenant_id AND version.id = execution.flow_version_id
          JOIN tenancy.entitlement_snapshots snapshot
            ON snapshot.tenant_id = execution.tenant_id AND snapshot.id = execution.entitlement_snapshot_id
          JOIN catalog.plan_versions plan_version ON plan_version.id = snapshot.plan_version_id
          JOIN catalog.plans plan ON plan.id = plan_version.plan_id AND plan.product_key = 'flowbot'
          WHERE execution.tenant_id = ${context.tenantId}::uuid
            AND execution.conversation_id = ${conversationId}::uuid
            AND execution.status = 'handover' AND execution.expires_at > now()
          FOR UPDATE OF execution
        `;
        const execution = executions[0];
        if (!execution) return { status: "release_unavailable" as const };
        const scheduleRows = await sql<{
          scheduleKey: string; timezone: string; weeklyWindows: unknown; closedDates: string[];
        }[]>`
          SELECT schedule_key AS "scheduleKey", timezone,
                 weekly_windows AS "weeklyWindows", closed_dates AS "closedDates"
          FROM tenancy.flow_business_schedules
          WHERE tenant_id = ${context.tenantId}::uuid
          ORDER BY schedule_key
        `;
        const inputId = randomUUID();
        const flowInput: FlowInput = { type: "action", payload: { action: "return_to_flow" } };
        const result = advanceFlow({
          tenantId: context.tenantId,
          deploymentId: execution.deployment_id,
          executionId: execution.id,
          flowVersionId: execution.flow_version_id,
          sequence: execution.next_input_sequence,
          inputId,
          input: flowInput,
          snapshot: flowSnapshotSchema.parse(execution.snapshot_json),
          state: flowExecutionStateSchema.parse(execution.state_json),
          authority: execution.authority_json,
          environment: flowbotEnvironment(new Date(), flowBusinessSchedulesSchema.parse(scheduleRows)),
        });
        // Returning to automation is intentionally a main-menu boundary. A root that immediately
        // performs an external action or asks for another handover must be repaired before release.
        if (result.commands.length > 0 || result.nextState.status !== "active") {
          return { status: "release_unavailable" as const };
        }
        const sequences = await sql<{ next_sequence: number }[]>`
          SELECT next_sequence FROM tenancy.conversations
          WHERE tenant_id = ${context.tenantId}::uuid AND id = ${conversationId}::uuid
          FOR UPDATE
        `;
        let nextSequence = sequences[0]!.next_sequence;
        for (const message of result.messages) {
          await sql`
            INSERT INTO tenancy.messages (
              tenant_id, conversation_id, sequence, actor_type, direction, content_json
            ) VALUES (
              ${context.tenantId}::uuid, ${conversationId}::uuid, ${nextSequence},
              'flowbot', 'outbound', ${sql.json(JSON.parse(JSON.stringify(message)))}
            )
          `;
          nextSequence += 1;
        }
        for (const event of result.events) {
          await sql`
            INSERT INTO tenancy.flow_events (
              tenant_id, bot_id, execution_id, flow_version_id, event_type, node_id, detail_json
            ) SELECT tenant_id, bot_id, id, flow_version_id, ${event.type},
                     ${event.nodeId ?? null}::uuid,
                     ${sql.json(JSON.parse(JSON.stringify(event.detail ?? {})))}
              FROM tenancy.flow_executions
              WHERE tenant_id = ${context.tenantId}::uuid AND id = ${execution.id}::uuid
          `;
        }
        await sql`
          UPDATE tenancy.flow_executions
          SET state_json = ${sql.json(JSON.parse(JSON.stringify(result.nextState)))},
              status = ${result.nextState.status}, next_input_sequence = next_input_sequence + 1,
              updated_at = now(),
              completed_at = CASE WHEN ${result.nextState.status} = 'completed' THEN now() ELSE NULL END
          WHERE tenant_id = ${context.tenantId}::uuid AND id = ${execution.id}::uuid
        `;
        await sql`
          UPDATE tenancy.conversations SET next_sequence = ${nextSequence}
          WHERE tenant_id = ${context.tenantId}::uuid AND id = ${conversationId}::uuid
        `;
      } else if (targetMode === "ai_text") {
        await sql`SELECT tenancy.resume_ai_session_after_staff_release(${conversationId}::uuid)`;
      }
      await sql`
        UPDATE tenancy.conversations
        SET automation_mode = ${targetMode}, assigned_membership_id = NULL, updated_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${conversationId}::uuid
      `;
      await sql`
        INSERT INTO tenancy.conversation_transitions (
          tenant_id, conversation_id, from_mode, to_mode, reason,
          actor_membership_id, request_id
        ) VALUES (
          ${context.tenantId}::uuid, ${conversationId}::uuid, 'human', ${targetMode},
          'staff_release', ${context.membershipId}::uuid, ${context.requestId}
        )
      `;
      await sql`
        INSERT INTO tenancy.handover_events (
          tenant_id, conversation_id, event_type, actor_membership_id,
          reason, idempotency_key
        ) VALUES (
          ${context.tenantId}::uuid, ${conversationId}::uuid, 'released',
          ${context.membershipId}::uuid, 'staff_release',
          ${`handover:released:${conversationId}:${context.requestId}`}
        )
      `;
      return { status: "released" as const, automationMode: targetMode };
    });
  }

  async createKnowledgeSource(context: TenantContext, input: Readonly<{
    name: string; sourceKind: "text" | "file" | "url" | "structured"; content: string; collectionId?: string;
  }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await sql<{ allowed: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM tenancy.product_subscriptions subscription
          JOIN LATERAL (
            SELECT snapshot.access_mode, snapshot.resolved_json
            FROM tenancy.entitlement_snapshots snapshot
            WHERE snapshot.tenant_id = subscription.tenant_id
              AND snapshot.subscription_id = subscription.id
            ORDER BY snapshot.created_at DESC, snapshot.id DESC LIMIT 1
          ) current_snapshot ON true
          WHERE subscription.tenant_id = ${context.tenantId}::uuid
            AND subscription.product_key IN ('ai_chat', 'voice')
            AND subscription.status IN ('active', 'trialing', 'scheduled_change')
            AND current_snapshot.access_mode = 'active'
            AND current_snapshot.resolved_json->'entitlements'->>'knowledge.enabled' = 'true'
        ) AS allowed
      `;
      if (!authority[0]?.allowed) return { status: "not_entitled" as const };
      const sourceId = randomUUID();
      const revisionId = randomUUID();
      const checksum = createHash("sha256").update(input.content).digest();
      await sql`
        INSERT INTO tenancy.knowledge_sources (
          id, tenant_id, name, source_kind, created_by_membership_id
        ) VALUES (${sourceId}::uuid, ${context.tenantId}::uuid, ${input.name}, ${input.sourceKind}, ${context.membershipId}::uuid)
      `;
      await sql`
        INSERT INTO tenancy.knowledge_source_revisions (
          id, tenant_id, source_id, version, content_text, checksum,
          status, created_by_membership_id
        ) VALUES (
          ${revisionId}::uuid, ${context.tenantId}::uuid, ${sourceId}::uuid, 1,
          ${input.content}, ${checksum}, 'ready', ${context.membershipId}::uuid
        )
      `;
      if (input.collectionId) {
        const attached = await sql<{ id: string }[]>`
          INSERT INTO tenancy.knowledge_collection_sources (tenant_id, collection_id, source_id)
          SELECT ${context.tenantId}::uuid, collection.id, ${sourceId}::uuid
          FROM tenancy.knowledge_collections collection
          WHERE collection.tenant_id = ${context.tenantId}::uuid AND collection.id = ${input.collectionId}::uuid
            AND collection.status = 'active' RETURNING source_id AS id
        `;
        if (!attached[0]) throw new Error("knowledge_collection_not_found");
      }
      const chunks = chunkKnowledge(input.content);
      for (const [index, content] of chunks.entries()) {
        await sql`
          INSERT INTO tenancy.knowledge_chunks (
            id, tenant_id, source_revision_id, sequence, content_text, content_hash
          ) VALUES (
            ${randomUUID()}::uuid, ${context.tenantId}::uuid, ${revisionId}::uuid,
            ${index + 1}, ${content}, ${createHash("sha256").update(content).digest()}
          )
        `;
      }
      return { status: "created" as const, sourceId, revisionId };
    });
  }

  async listKnowledge(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => sql<{
      id: string; name: string; sourceKind: string; status: string;
      version: number; revisionId: string | null; revisionCreatedAt: Date; safeErrorCode: string | null;
    }[]>`
      SELECT source.id, source.name, source.source_kind AS "sourceKind",
        CASE
          WHEN source.status = 'archived' THEN 'excluded'
          WHEN job.created_at > COALESCE(revision.created_at, '-infinity'::timestamptz)
            AND job.status IN ('failed', 'dead_letter') THEN 'failed'
          WHEN job.created_at > COALESCE(revision.created_at, '-infinity'::timestamptz)
            AND job.status IN ('waiting_upload', 'pending', 'processing') THEN 'processing'
          ELSE COALESCE(revision.status, CASE WHEN job.status IN ('failed', 'dead_letter') THEN 'failed' ELSE 'processing' END)
        END AS status,
        COALESCE(revision.version, 0)::int AS version, revision.id AS "revisionId",
        COALESCE(revision.created_at, job.created_at, source.created_at) AS "revisionCreatedAt",
        job.safe_error_code AS "safeErrorCode"
      FROM tenancy.knowledge_sources source
      LEFT JOIN LATERAL (
        SELECT id, version, status, created_at FROM tenancy.knowledge_source_revisions candidate
        WHERE candidate.tenant_id = source.tenant_id AND candidate.source_id = source.id
        ORDER BY version DESC LIMIT 1
      ) revision ON true
      LEFT JOIN LATERAL (
        SELECT status, safe_error_code, created_at FROM tenancy.knowledge_ingestion_jobs candidate
        WHERE candidate.tenant_id = source.tenant_id AND candidate.source_id = source.id
        ORDER BY created_at DESC, id DESC LIMIT 1
      ) job ON true
      WHERE source.tenant_id = ${context.tenantId}::uuid AND source.status <> 'erased'
      ORDER BY source.updated_at DESC
    `);
  }

  async setConversationLegalHold(
    context: TenantContext,
    conversationId: string,
    input: Readonly<{ legalHold: boolean; reason?: string }>,
  ) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      if (input.legalHold) {
        const reason = input.reason?.trim() ?? "";
        if (reason.length < 8 || reason.length > 500) {
          return { status: "validation_failed" as const };
        }
        const rows = await sql<{ id: string }[]>`
          UPDATE tenancy.conversations SET
            legal_hold = true,
            legal_hold_reason = ${reason},
            legal_hold_set_at = now(),
            legal_hold_set_by_membership_id = ${context.membershipId}::uuid,
            updated_at = now()
          WHERE tenant_id = ${context.tenantId}::uuid AND id = ${conversationId}::uuid
          RETURNING id
        `;
        if (!rows[0]) return { status: "not_found" as const };
        await sql`
          INSERT INTO tenancy.audit_logs (
            tenant_id, actor_user_id, actor_membership_id, action, target_type, target_id, request_id, result, metadata
          ) VALUES (
            ${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid,
            'privacy.legal_hold.set', 'conversation', ${conversationId},
            ${context.requestId}, 'succeeded', ${sql.json({ reason })}
          )
        `;
        return { status: "accepted" as const, legalHold: true as const };
      }
      const rows = await sql<{ id: string }[]>`
        UPDATE tenancy.conversations SET
          legal_hold = false,
          legal_hold_reason = NULL,
          legal_hold_set_at = NULL,
          legal_hold_set_by_membership_id = NULL,
          updated_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${conversationId}::uuid
        RETURNING id
      `;
      if (!rows[0]) return { status: "not_found" as const };
      await sql`
        INSERT INTO tenancy.audit_logs (
          tenant_id, actor_user_id, actor_membership_id, action, target_type, target_id, request_id, result, metadata
        ) VALUES (
          ${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid,
          'privacy.legal_hold.clear', 'conversation', ${conversationId},
          ${context.requestId}, 'succeeded', '{}'::jsonb
        )
      `;
      return { status: "accepted" as const, legalHold: false as const };
    });
  }

  async listLegalHolds(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => sql<{
      id: string; contactId: string; contactName: string; reason: string; setAt: Date;
    }[]>`
      SELECT conversation.id, conversation.contact_id AS "contactId",
             contact.display_name AS "contactName",
             conversation.legal_hold_reason AS reason,
             conversation.legal_hold_set_at AS "setAt"
      FROM tenancy.conversations conversation
      JOIN tenancy.contacts contact
        ON contact.tenant_id = conversation.tenant_id AND contact.id = conversation.contact_id
      WHERE conversation.tenant_id = ${context.tenantId}::uuid
        AND conversation.legal_hold = true
      ORDER BY conversation.legal_hold_set_at DESC NULLS LAST
      LIMIT 200
    `);
  }

  async requestPrivacyJob(context: TenantContext, input: PrivacyJobRequest) {
    const parsed = privacyJobRequestSchema.parse(input);
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      if (parsed.contactId) {
        const contacts = await sql<{ status: string }[]>`
          SELECT status FROM tenancy.contacts
          WHERE tenant_id = ${context.tenantId}::uuid AND id = ${parsed.contactId}::uuid
        `;
        if (!contacts[0] || (parsed.jobType === "erasure" && contacts[0].status !== "active")) {
          return { status: "not_found" as const };
        }
      }
      const jobId = randomUUID();
      const rows = await sql<{ id: string; status: string }[]>`
        INSERT INTO tenancy.privacy_jobs (
          id, tenant_id, contact_id, job_type, scope_json, idempotency_key,
          requested_by_membership_id
        ) VALUES (
          ${jobId}::uuid, ${context.tenantId}::uuid, ${parsed.contactId ?? null}::uuid,
          ${parsed.jobType}, ${sql.json({ contactId: parsed.contactId ?? null })},
          ${parsed.idempotencyKey}, ${context.membershipId}::uuid
        )
        ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
        RETURNING id, status
      `;
      if (rows[0]) return { status: "accepted" as const, jobId: rows[0].id, jobStatus: rows[0].status };
      const existing = await sql<{ id: string; status: string; jobType: string; contactId: string | null }[]>`
        SELECT id, status, job_type AS "jobType", contact_id AS "contactId"
        FROM tenancy.privacy_jobs
        WHERE tenant_id = ${context.tenantId}::uuid AND idempotency_key = ${parsed.idempotencyKey}
      `;
      const replay = existing[0];
      return replay && replay.jobType === parsed.jobType && replay.contactId === (parsed.contactId ?? null)
        ? { status: "accepted" as const, jobId: replay.id, jobStatus: replay.status }
        : { status: "conflict" as const };
    });
  }

  async listPrivacyJobs(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => sql<{
      id: string; contactId: string | null; contactName: string | null;
      jobType: string; status: string; requestedAt: Date; completedAt: Date | null;
    }[]>`
      SELECT job.id, job.contact_id AS "contactId", contact.display_name AS "contactName",
             job.job_type AS "jobType", job.status, job.requested_at AS "requestedAt",
             job.completed_at AS "completedAt"
      FROM tenancy.privacy_jobs job
      LEFT JOIN tenancy.contacts contact ON contact.id = job.contact_id
        AND contact.tenant_id = job.tenant_id
      WHERE job.tenant_id = ${context.tenantId}::uuid
      ORDER BY job.requested_at DESC
      LIMIT 200
    `);
  }

  async getRetentionPolicy(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{
        transcriptDays: number; recordingDays: number; voicePlanMaximumDays: number | null; updatedAt: Date;
      }[]>`
        SELECT policy.message_days AS "transcriptDays", policy.recording_days AS "recordingDays",
          voice_limit.maximum_days AS "voicePlanMaximumDays", policy.updated_at AS "updatedAt"
        FROM tenancy.retention_policies policy
        LEFT JOIN LATERAL (
          SELECT min(NULLIF(snapshot.resolved_json->'limits'->>'retention_days', '')::integer) AS maximum_days
          FROM tenancy.entitlement_snapshots snapshot
          JOIN tenancy.product_subscriptions subscription
            ON subscription.tenant_id = snapshot.tenant_id AND subscription.id = snapshot.subscription_id
          WHERE snapshot.tenant_id = policy.tenant_id AND snapshot.product_key = 'voice'
            AND snapshot.access_mode = 'active'
            AND subscription.status IN ('active', 'trialing', 'scheduled_change')
        ) voice_limit ON true
        WHERE policy.tenant_id = ${context.tenantId}::uuid
      `;
      return rows[0] ?? null;
    });
  }

  async updateRetentionPolicy(context: TenantContext, transcriptDays: number) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const limits = await sql<{ maximum_days: number | null }[]>`
        SELECT min(NULLIF(snapshot.resolved_json->'limits'->>'retention_days', '')::integer) AS maximum_days
        FROM tenancy.entitlement_snapshots snapshot
        JOIN tenancy.product_subscriptions subscription
          ON subscription.tenant_id = snapshot.tenant_id AND subscription.id = snapshot.subscription_id
        WHERE snapshot.tenant_id = ${context.tenantId}::uuid AND snapshot.product_key = 'voice'
          AND snapshot.access_mode = 'active'
          AND subscription.status IN ('active', 'trialing', 'scheduled_change')
      `;
      const maximumDays = limits[0]?.maximum_days ?? null;
      if (maximumDays !== null && transcriptDays > maximumDays) {
        return { status: "limit_exceeded" as const, maximumDays };
      }
      await sql`
        INSERT INTO tenancy.retention_policies (
          tenant_id, message_days, recording_days, updated_by_membership_id, updated_at
        ) VALUES (
          ${context.tenantId}::uuid, ${transcriptDays}, 0, ${context.membershipId}::uuid, now()
        ) ON CONFLICT (tenant_id) DO UPDATE SET
          message_days = EXCLUDED.message_days,
          recording_days = 0,
          updated_by_membership_id = EXCLUDED.updated_by_membership_id,
          updated_at = now()
      `;
      await sql`
        INSERT INTO tenancy.audit_logs (
          tenant_id, actor_user_id, actor_membership_id, action, target_type,
          target_id, request_id, result, metadata
        ) VALUES (
          ${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid,
          'retention.policy_updated', 'retention_policy', ${context.tenantId},
          ${context.requestId}, 'succeeded', ${sql.json({ transcriptDays, recordingDays: 0 })}
        )
      `;
      return { status: "updated" as const, transcriptDays, recordingDays: 0, maximumDays };
    });
  }

  async listActiveSupportAccess(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => sql<{
      id: string; reason: string; startsAt: Date; expiresAt: Date;
    }[]>`
      SELECT id, reason, starts_at AS "startsAt", expires_at AS "expiresAt"
      FROM tenancy.support_access_grants
      WHERE tenant_id = ${context.tenantId}::uuid
        AND status = 'active' AND starts_at <= now() AND expires_at > now()
      ORDER BY expires_at
    `);
  }

  async executeAction(context: TenantContext, entitlementSnapshotId: string, action: ActionRequest) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await sql<{ ok: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM tenancy.entitlement_snapshots
          WHERE tenant_id = ${context.tenantId}::uuid AND id = ${entitlementSnapshotId}::uuid
            AND access_mode = 'active'
        ) AS ok
      `;
      if (!authority[0]?.ok) return { status: "denied" as const };
      const existing = await sql<{ id: string; status: string; result_json: Record<string, unknown> | null }[]>`
        SELECT request.id, request.status, result.result_json
        FROM tenancy.action_requests request
        LEFT JOIN tenancy.action_results result ON result.action_request_id = request.id
          AND result.tenant_id = request.tenant_id
        WHERE request.tenant_id = ${context.tenantId}::uuid
          AND request.idempotency_key = ${action.idempotencyKey}
        FOR UPDATE OF request
      `;
      if (existing[0]) return { status: "replayed" as const, actionRequestId: existing[0].id, result: existing[0].result_json };
      const actionRequestId = randomUUID();
      await sql`
        INSERT INTO tenancy.action_requests (
          id, tenant_id, conversation_id, entitlement_snapshot_id, action_type,
          input_json, idempotency_key, status, requested_by_membership_id
        ) VALUES (
          ${actionRequestId}::uuid, ${context.tenantId}::uuid,
          ${"conversationId" in action ? action.conversationId : null}::uuid,
          ${entitlementSnapshotId}::uuid, ${action.type}, ${sql.json(action)},
          ${action.idempotencyKey}, 'processing', ${context.membershipId}::uuid
        )
      `;
      let result: Record<string, string | number | boolean | null>;
      if (action.type === "lead.create") {
        const leadId = randomUUID();
        await sql`INSERT INTO tenancy.leads (id, tenant_id, contact_id, title, source)
          VALUES (${leadId}::uuid, ${context.tenantId}::uuid, ${action.contactId}::uuid, ${action.title}, ${action.source})`;
        await sql`INSERT INTO tenancy.lead_status_history (tenant_id, lead_id, to_status, source_action, actor_membership_id, request_id)
          VALUES (${context.tenantId}::uuid, ${leadId}::uuid, 'new', 'lead.create', ${context.membershipId}::uuid, ${context.requestId})`;
        result = { leadId, status: "new" };
      } else if (action.type === "lead.update") {
        const previous = await sql<{ status: string }[]>`
          SELECT status FROM tenancy.leads WHERE tenant_id = ${context.tenantId}::uuid AND id = ${action.leadId}::uuid FOR UPDATE
        `;
        if (!previous[0]) throw new Error("action_target_not_found");
        await sql`UPDATE tenancy.leads SET status = ${action.status}, updated_at = now(),
          closed_at = CASE WHEN ${action.status} IN ('closed_deal', 'disqualified') THEN now() ELSE NULL END
          WHERE id = ${action.leadId}::uuid`;
        await sql`INSERT INTO tenancy.lead_status_history (tenant_id, lead_id, from_status, to_status, source_action, actor_membership_id, request_id)
          VALUES (${context.tenantId}::uuid, ${action.leadId}::uuid, ${previous[0].status}, ${action.status}, 'lead.update', ${context.membershipId}::uuid, ${context.requestId})`;
        result = { leadId: action.leadId, status: action.status };
      } else if (action.type === "sales_fact.record") {
        const factId = randomUUID();
        await sql`INSERT INTO tenancy.sales_facts (id, tenant_id, lead_id, fact_type, value_json)
          VALUES (${factId}::uuid, ${context.tenantId}::uuid, ${action.leadId}::uuid, ${action.factType}, ${sql.json({ value: action.value })})`;
        result = { factId };
      } else if (action.type === "appointment.request") {
        const appointmentRequestId = randomUUID();
        await sql`INSERT INTO tenancy.appointment_requests (id, tenant_id, lead_id, status, timezone, idempotency_key)
          VALUES (${appointmentRequestId}::uuid, ${context.tenantId}::uuid, ${action.leadId}::uuid, 'requested', ${action.timezone}, ${action.idempotencyKey})`;
        for (const [index, option] of action.options.entries()) await sql`
          INSERT INTO tenancy.appointment_time_options (tenant_id, appointment_request_id, start_at, end_at, preference_order, source)
          VALUES (${context.tenantId}::uuid, ${appointmentRequestId}::uuid, ${option.startAt}, ${option.endAt}, ${index + 1}, 'customer_request')
        `;
        result = { appointmentRequestId, status: "requested" };
      } else if (action.type === "follow_up.create") {
        const taskId = randomUUID();
        await sql`INSERT INTO tenancy.follow_up_tasks (id, tenant_id, lead_id, note, due_at)
          VALUES (${taskId}::uuid, ${context.tenantId}::uuid, ${action.leadId}::uuid, ${action.note}, ${action.dueAt})`;
        result = { taskId, status: "open" };
      } else if (action.type === "handover.request") {
        const handoverId = randomUUID();
        await sql`INSERT INTO tenancy.handover_events (id, tenant_id, conversation_id, event_type, actor_membership_id, reason, idempotency_key)
          VALUES (${handoverId}::uuid, ${context.tenantId}::uuid, ${action.conversationId}::uuid, 'requested', ${context.membershipId}::uuid, ${action.reason}, ${action.idempotencyKey})`;
        result = { handoverId, status: "requested" };
      } else {
        const profiles = await sql<{ id: string }[]>`
          SELECT id FROM tenancy.notification_profiles
          WHERE tenant_id = ${context.tenantId}::uuid AND id = ${action.notificationProfileId}::uuid
            AND status = 'active' AND ${action.templateKey} = ANY(allowed_template_keys)
        `;
        if (!profiles[0]) throw new Error("notification_profile_not_allowed");
        await sql`INSERT INTO tenancy.outbox (tenant_id, topic, payload, idempotency_key)
          VALUES (${context.tenantId}::uuid, 'merchant_email.requested',
            ${sql.json({ notificationProfileId: action.notificationProfileId, templateKey: action.templateKey, variables: action.variables })},
            ${`action:${action.idempotencyKey}`})`;
        result = { queued: true };
      }
      await sql`
        INSERT INTO tenancy.action_results (tenant_id, action_request_id, success, result_json)
        VALUES (${context.tenantId}::uuid, ${actionRequestId}::uuid, true, ${sql.json(result)})
      `;
      await sql`UPDATE tenancy.action_requests SET status = 'succeeded', completed_at = now() WHERE id = ${actionRequestId}::uuid`;
      return { status: "succeeded" as const, actionRequestId, result };
    });
  }
}
