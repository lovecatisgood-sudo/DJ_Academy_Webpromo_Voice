import { createHash, randomUUID } from "node:crypto";
import type { ActionRequest } from "@djay/action-gateway";
import type {
  contactInputSchema,
  conversationInputSchema,
  leadInputSchema,
  messageInputSchema,
} from "@djay/domain";
import { canTransitionMode } from "@djay/domain";
import { chunkKnowledge } from "@djay/sales-core";
import type { TenantContext } from "@djay/tenancy";
import type { z } from "zod";
import type { DatabaseClient } from "./client";
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
      leadCount: number; updatedAt: Date;
    }[]>`
      SELECT contact.id, contact.display_name AS "displayName", contact.locale,
             contact.consent_status AS "consentStatus", contact.updated_at AS "updatedAt",
             count(DISTINCT lead.id)::int AS "leadCount",
             COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
               'kind', identity.identity_kind,
               'value', identity.normalized_value,
               'verificationStatus', identity.verification_status
             )) FILTER (WHERE identity.id IS NOT NULL), '[]'::jsonb) AS identities
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

  async listInbox(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => sql<{
      id: string; contactId: string; contactName: string; leadId: string | null;
      productKey: string; publicPlanKey: string; channelKind: string; automationMode: string;
      status: string; assignedMembershipId: string | null; lastMessage: string | null;
      lastMessageAt: Date | null; updatedAt: Date;
    }[]>`
      SELECT conversation.id, conversation.contact_id AS "contactId",
             contact.display_name AS "contactName", conversation.lead_id AS "leadId",
             conversation.product_key AS "productKey", conversation.public_plan_key AS "publicPlanKey",
             conversation.channel_kind AS "channelKind", conversation.automation_mode AS "automationMode",
             conversation.status, conversation.assigned_membership_id AS "assignedMembershipId",
             COALESCE(last_message.content_json->>'text', last_message.content_json->'content'->>'text') AS "lastMessage",
             last_message.created_at AS "lastMessageAt", conversation.updated_at AS "updatedAt"
      FROM tenancy.conversations conversation
      JOIN tenancy.contacts contact ON contact.id = conversation.contact_id
        AND contact.tenant_id = conversation.tenant_id
      LEFT JOIN LATERAL (
        SELECT content_json, created_at FROM tenancy.messages message
        WHERE message.tenant_id = conversation.tenant_id AND message.conversation_id = conversation.id
        ORDER BY message.sequence DESC LIMIT 1
      ) last_message ON true
      WHERE conversation.tenant_id = ${context.tenantId}::uuid
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
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      if (input.externalMessageId) {
        const replay = await sql<{ id: string; sequence: number }[]>`
          SELECT id, sequence FROM tenancy.messages
          WHERE tenant_id = ${context.tenantId}::uuid AND conversation_id = ${conversationId}::uuid
            AND external_message_id = ${input.externalMessageId}
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
      if (input.actorType === "human" && input.direction === "outbound" && conversation.automation_mode !== "human") {
        return { status: "handover_required" as const };
      }
      const messageId = randomUUID();
      await sql`
        INSERT INTO tenancy.messages (
          id, tenant_id, conversation_id, sequence, actor_type, direction,
          content_json, external_message_id
        ) VALUES (
          ${messageId}::uuid, ${context.tenantId}::uuid, ${conversationId}::uuid,
          ${conversation.next_sequence}, ${input.actorType}, ${input.direction},
          ${sql.json({ text: input.text })}, ${input.externalMessageId ?? null}
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
          : conversation.product_key === "voice_agent" ? "voice" : null;
      if (!targetMode || !canTransitionMode("human", targetMode)) return { status: "transition_denied" as const };
      await sql`
        UPDATE tenancy.conversations
        SET automation_mode = ${targetMode}, assigned_membership_id = NULL, updated_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${conversationId}::uuid
      `;
      if (targetMode === "flowbot") {
        await sql`
          UPDATE tenancy.flow_executions
          SET status = 'active', state_json = jsonb_set(state_json, '{status}', '"active"'::jsonb), updated_at = now()
          WHERE tenant_id = ${context.tenantId}::uuid AND conversation_id = ${conversationId}::uuid
            AND status = 'handover'
        `;
      }
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
    name: string; sourceKind: "text" | "file" | "url" | "structured"; content: string;
  }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
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
      version: number; revisionId: string; revisionCreatedAt: Date;
    }[]>`
      SELECT source.id, source.name, source.source_kind AS "sourceKind", source.status,
             revision.version, revision.id AS "revisionId", revision.created_at AS "revisionCreatedAt"
      FROM tenancy.knowledge_sources source
      JOIN LATERAL (
        SELECT id, version, created_at FROM tenancy.knowledge_source_revisions candidate
        WHERE candidate.tenant_id = source.tenant_id AND candidate.source_id = source.id
        ORDER BY version DESC LIMIT 1
      ) revision ON true
      WHERE source.tenant_id = ${context.tenantId}::uuid
      ORDER BY source.updated_at DESC
    `);
  }

  async requestPrivacyJob(context: TenantContext, input: Readonly<{
    jobType: "export" | "erasure"; contactId?: string; idempotencyKey: string;
  }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const jobId = randomUUID();
      const rows = await sql<{ id: string; status: string }[]>`
        INSERT INTO tenancy.privacy_jobs (
          id, tenant_id, contact_id, job_type, scope_json, idempotency_key,
          requested_by_membership_id
        ) VALUES (
          ${jobId}::uuid, ${context.tenantId}::uuid, ${input.contactId ?? null}::uuid,
          ${input.jobType}, ${sql.json({ contactId: input.contactId ?? null })},
          ${input.idempotencyKey}, ${context.membershipId}::uuid
        )
        ON CONFLICT (tenant_id, idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
        RETURNING id, status
      `;
      return { status: "accepted" as const, jobId: rows[0]!.id, jobStatus: rows[0]!.status };
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
