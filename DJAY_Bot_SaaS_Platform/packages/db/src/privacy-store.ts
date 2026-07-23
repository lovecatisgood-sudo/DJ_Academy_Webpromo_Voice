import { createHash, randomUUID } from "node:crypto";
import { openJson, sealJson } from "@djay/auth";
import type { TenantContext } from "@djay/tenancy";
import type postgres from "postgres";
import type { DatabaseClient } from "./client";
import { withTenantTransaction } from "./scoped-transaction";

type ClaimedPrivacyJob = Readonly<{
  jobId: string;
  tenantId: string;
  contactId: string | null;
  jobType: "export" | "erasure";
}>;

type ExportRow = Readonly<{ id: string; [key: string]: unknown }>;
export type PrivacyExport = Readonly<{
  format: "djay-privacy-export-v1";
  generatedAt: string;
  tenantId: string;
  scope: Readonly<{ contactId: string | null }>;
  data: Readonly<Record<string, readonly ExportRow[]>>;
}>;

export class PrivacyStore {
  constructor(private readonly client: DatabaseClient) {}

  async claimNext(requestId: string): Promise<ClaimedPrivacyJob | null> {
    return this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'privacy_worker', true), set_config('app.request_id', ${requestId}, true)`;
      const rows = await sql<{
        job_id: string; tenant_id: string; contact_id: string | null; job_type: "export" | "erasure";
      }[]>`SELECT * FROM tenancy.claim_privacy_job()`;
      const row = rows[0];
      return row ? {
        jobId: row.job_id,
        tenantId: row.tenant_id,
        contactId: row.contact_id,
        jobType: row.job_type,
      } : null;
    }) as Promise<ClaimedPrivacyJob | null>;
  }

  async processNext(encryptionKey: Buffer, requestId: string = randomUUID()) {
    const job = await this.claimNext(requestId);
    if (!job) return { status: "idle" as const };
    try {
      if (job.jobType === "erasure") {
        const completed = await this.client.begin(async (sql) => {
          await this.setWorkerContext(sql, job.tenantId, requestId);
          const rows = await sql<{ completed: boolean }[]>`
            SELECT tenancy.execute_contact_erasure(${job.jobId}::uuid) AS completed
          `;
          return rows[0]?.completed ?? false;
        });
        if (!completed) throw new Error("privacy_erasure_rejected");
      } else {
        await this.createExport(job, encryptionKey, requestId);
      }
      return { status: "completed" as const, jobId: job.jobId, jobType: job.jobType };
    } catch (error) {
      await this.markFailed(job, requestId);
      throw error;
    }
  }

  async applyRetention(now: Date = new Date(), limit = 1000, requestId: string = randomUUID()) {
    return this.client.begin(async (sql) => {
      await sql`
        SELECT set_config('app.service', 'retention_worker', true),
               set_config('app.request_id', ${requestId}, true)
      `;
      const rows = await sql<{ messagesRedacted: number; voiceTurnsRedacted: number }[]>`
        SELECT messages_redacted AS "messagesRedacted",
               voice_turns_redacted AS "voiceTurnsRedacted"
        FROM tenancy.apply_retention_policies(${now}, ${limit})
      `;
      return rows[0] ?? { messagesRedacted: 0, voiceTurnsRedacted: 0 };
    });
  }

  private async setWorkerContext(sql: postgres.TransactionSql, tenantId: string, requestId: string) {
    await sql`
      SELECT set_config('app.service', 'privacy_worker', true),
             set_config('app.tenant_id', ${tenantId}, true),
             set_config('app.request_id', ${requestId}, true)
    `;
  }

  private async markFailed(job: ClaimedPrivacyJob, requestId: string) {
    await this.client.begin(async (sql) => {
      await this.setWorkerContext(sql, job.tenantId, requestId);
      await sql`
        UPDATE tenancy.privacy_jobs SET status = 'failed', completed_at = now()
        WHERE tenant_id = ${job.tenantId}::uuid AND id = ${job.jobId}::uuid AND status = 'processing'
      `;
    });
  }

  private async createExport(job: ClaimedPrivacyJob, encryptionKey: Buffer, requestId: string) {
    await this.client.begin(async (sql) => {
      await this.setWorkerContext(sql, job.tenantId, requestId);
      const contactId = job.contactId;
      const data: Record<string, ExportRow[]> = {};
      data.contacts = await sql<ExportRow[]>`
        SELECT id, display_name AS "displayName", locale, consent_status AS "consentStatus",
               status, created_at AS "createdAt", updated_at AS "updatedAt"
        FROM tenancy.contacts WHERE tenant_id = ${job.tenantId}::uuid
          AND (${contactId}::uuid IS NULL OR id = ${contactId}::uuid) ORDER BY id
      `;
      data.identities = await sql<ExportRow[]>`
        SELECT id, contact_id AS "contactId", identity_kind AS kind, normalized_value AS value,
               verification_status AS "verificationStatus", verified_at AS "verifiedAt", revoked_at AS "revokedAt"
        FROM tenancy.contact_identities WHERE tenant_id = ${job.tenantId}::uuid
          AND (${contactId}::uuid IS NULL OR contact_id = ${contactId}::uuid) ORDER BY id
      `;
      data.contactTags = await sql<ExportRow[]>`
        SELECT tag.id, tag.tag_key AS "tagKey", tag.label, tag.color,
               assignment.contact_id AS "contactId", assignment.assigned_at AS "assignedAt"
        FROM tenancy.contact_tag_assignments assignment
        JOIN tenancy.contact_tags tag ON tag.tenant_id = assignment.tenant_id AND tag.id = assignment.tag_id
        WHERE assignment.tenant_id = ${job.tenantId}::uuid
          AND (${contactId}::uuid IS NULL OR assignment.contact_id = ${contactId}::uuid)
        ORDER BY assignment.contact_id, tag.id
      `;
      data.contactAttributes = await sql<ExportRow[]>`
        SELECT id, contact_id AS "contactId", attribute_key AS "attributeKey", label,
               value_type AS "valueType", value_text AS value, created_at AS "createdAt", updated_at AS "updatedAt"
        FROM tenancy.contact_attributes WHERE tenant_id = ${job.tenantId}::uuid
          AND (${contactId}::uuid IS NULL OR contact_id = ${contactId}::uuid) ORDER BY id
      `;
      data.leads = await sql<ExportRow[]>`
        SELECT lead.* FROM tenancy.leads lead WHERE lead.tenant_id = ${job.tenantId}::uuid
          AND (${contactId}::uuid IS NULL OR lead.contact_id = ${contactId}::uuid) ORDER BY lead.id
      `;
      data.salesFacts = await sql<ExportRow[]>`
        SELECT fact.* FROM tenancy.sales_facts fact
        JOIN tenancy.leads lead ON lead.tenant_id = fact.tenant_id AND lead.id = fact.lead_id
        WHERE fact.tenant_id = ${job.tenantId}::uuid
          AND (${contactId}::uuid IS NULL OR lead.contact_id = ${contactId}::uuid) ORDER BY fact.id
      `;
      data.appointments = await sql<ExportRow[]>`
        SELECT appointment.* FROM tenancy.appointment_requests appointment
        JOIN tenancy.leads lead ON lead.tenant_id = appointment.tenant_id AND lead.id = appointment.lead_id
        WHERE appointment.tenant_id = ${job.tenantId}::uuid
          AND (${contactId}::uuid IS NULL OR lead.contact_id = ${contactId}::uuid) ORDER BY appointment.id
      `;
      data.appointmentOptions = await sql<ExportRow[]>`
        SELECT option.* FROM tenancy.appointment_time_options option
        JOIN tenancy.appointment_requests appointment ON appointment.tenant_id = option.tenant_id AND appointment.id = option.appointment_request_id
        JOIN tenancy.leads lead ON lead.tenant_id = appointment.tenant_id AND lead.id = appointment.lead_id
        WHERE option.tenant_id = ${job.tenantId}::uuid
          AND (${contactId}::uuid IS NULL OR lead.contact_id = ${contactId}::uuid) ORDER BY option.id
      `;
      data.followUps = await sql<ExportRow[]>`
        SELECT task.* FROM tenancy.follow_up_tasks task
        JOIN tenancy.leads lead ON lead.tenant_id = task.tenant_id AND lead.id = task.lead_id
        WHERE task.tenant_id = ${job.tenantId}::uuid
          AND (${contactId}::uuid IS NULL OR lead.contact_id = ${contactId}::uuid) ORDER BY task.id
      `;
      data.conversations = await sql<ExportRow[]>`
        SELECT conversation.* FROM tenancy.conversations conversation
        WHERE conversation.tenant_id = ${job.tenantId}::uuid
          AND (${contactId}::uuid IS NULL OR conversation.contact_id = ${contactId}::uuid) ORDER BY conversation.id
      `;
      data.messages = await sql<ExportRow[]>`
        SELECT message.* FROM tenancy.messages message
        JOIN tenancy.conversations conversation ON conversation.tenant_id = message.tenant_id AND conversation.id = message.conversation_id
        WHERE message.tenant_id = ${job.tenantId}::uuid
          AND (${contactId}::uuid IS NULL OR conversation.contact_id = ${contactId}::uuid)
        ORDER BY message.conversation_id, message.sequence
      `;
      data.notes = await sql<ExportRow[]>`
        SELECT note.* FROM tenancy.conversation_notes note
        JOIN tenancy.conversations conversation ON conversation.tenant_id = note.tenant_id AND conversation.id = note.conversation_id
        WHERE note.tenant_id = ${job.tenantId}::uuid
          AND (${contactId}::uuid IS NULL OR conversation.contact_id = ${contactId}::uuid) ORDER BY note.id
      `;
      data.transitions = await sql<ExportRow[]>`
        SELECT transition.* FROM tenancy.conversation_transitions transition
        JOIN tenancy.conversations conversation ON conversation.tenant_id = transition.tenant_id AND conversation.id = transition.conversation_id
        WHERE transition.tenant_id = ${job.tenantId}::uuid
          AND (${contactId}::uuid IS NULL OR conversation.contact_id = ${contactId}::uuid) ORDER BY transition.id
      `;
      data.handovers = await sql<ExportRow[]>`
        SELECT handover.* FROM tenancy.handover_events handover
        JOIN tenancy.conversations conversation ON conversation.tenant_id = handover.tenant_id AND conversation.id = handover.conversation_id
        WHERE handover.tenant_id = ${job.tenantId}::uuid
          AND (${contactId}::uuid IS NULL OR conversation.contact_id = ${contactId}::uuid) ORDER BY handover.id
      `;
      data.actions = await sql<ExportRow[]>`
        SELECT request.* FROM tenancy.action_requests request
        LEFT JOIN tenancy.conversations conversation ON conversation.tenant_id = request.tenant_id AND conversation.id = request.conversation_id
        WHERE request.tenant_id = ${job.tenantId}::uuid AND (
          ${contactId}::uuid IS NULL OR conversation.contact_id = ${contactId}::uuid
          OR request.input_json->>'contactId' = ${contactId}
          OR EXISTS (SELECT 1 FROM tenancy.leads lead WHERE lead.tenant_id = request.tenant_id
            AND lead.contact_id = ${contactId}::uuid AND lead.id::text = request.input_json->>'leadId')
        ) ORDER BY request.id
      `;
      data.actionResults = await sql<ExportRow[]>`
        SELECT result.* FROM tenancy.action_results result
        JOIN tenancy.action_requests request
          ON request.tenant_id = result.tenant_id AND request.id = result.action_request_id
        LEFT JOIN tenancy.conversations conversation
          ON conversation.tenant_id = request.tenant_id AND conversation.id = request.conversation_id
        WHERE result.tenant_id = ${job.tenantId}::uuid AND (
          ${contactId}::uuid IS NULL OR conversation.contact_id = ${contactId}::uuid
          OR request.input_json->>'contactId' = ${contactId}
          OR EXISTS (SELECT 1 FROM tenancy.leads lead WHERE lead.tenant_id = request.tenant_id
            AND lead.contact_id = ${contactId}::uuid AND lead.id::text = request.input_json->>'leadId')
        ) ORDER BY result.id
      `;
      data.aiSocialSubjects = await sql<ExportRow[]>`
        SELECT subject.id, subject.connection_id AS "connectionId", subject.contact_id AS "contactId",
               subject.conversation_id AS "conversationId", subject.status,
               subject.first_seen_at AS "firstSeenAt", subject.last_seen_at AS "lastSeenAt"
        FROM tenancy.ai_social_subjects subject
        WHERE subject.tenant_id = ${job.tenantId}::uuid
          AND (${contactId}::uuid IS NULL OR subject.contact_id = ${contactId}::uuid)
        ORDER BY subject.id
      `;
      data.flowSocialSubjects = await sql<ExportRow[]>`
        SELECT subject.id, subject.connection_id AS "connectionId", subject.contact_id AS "contactId",
               subject.conversation_id AS "conversationId", subject.status,
               subject.first_seen_at AS "firstSeenAt", subject.last_seen_at AS "lastSeenAt"
        FROM tenancy.flow_social_subjects subject
        WHERE subject.tenant_id = ${job.tenantId}::uuid
          AND (${contactId}::uuid IS NULL OR subject.contact_id = ${contactId}::uuid)
        ORDER BY subject.id
      `;
      data.voiceSessions = await sql<ExportRow[]>`
        SELECT session.id, session.deployment_id AS "deploymentId",
          session.contact_id AS "contactId", session.conversation_id AS "conversationId",
          session.capability_profile AS "capabilityProfile", session.public_label AS "publicLabel",
          session.locale, session.status, session.settled_minutes AS "settledMinutes",
          session.settled_elapsed_seconds AS "settledElapsedSeconds",
          session.connected_at AS "connectedAt", session.ended_at AS "endedAt",
          session.terminal_reason AS "terminalReason", session.created_at AS "createdAt"
        FROM tenancy.voice_sessions session
        WHERE session.tenant_id = ${job.tenantId}::uuid
          AND (${contactId}::uuid IS NULL OR session.contact_id = ${contactId}::uuid)
        ORDER BY session.id
      `;
      data.voiceTurns = await sql<ExportRow[]>`
        SELECT turn.* FROM tenancy.voice_turns turn
        JOIN tenancy.voice_sessions session
          ON session.tenant_id = turn.tenant_id AND session.id = turn.session_id
        WHERE turn.tenant_id = ${job.tenantId}::uuid
          AND (${contactId}::uuid IS NULL OR session.contact_id = ${contactId}::uuid)
        ORDER BY turn.session_id, turn.turn_sequence
      `;
      data.voiceOutcomes = await sql<ExportRow[]>`
        SELECT outcome.* FROM tenancy.voice_call_outcomes outcome
        JOIN tenancy.voice_sessions session
          ON session.tenant_id = outcome.tenant_id AND session.id = outcome.session_id
        WHERE outcome.tenant_id = ${job.tenantId}::uuid
          AND (${contactId}::uuid IS NULL OR session.contact_id = ${contactId}::uuid)
        ORDER BY outcome.id
      `;
      data.voiceCallbacks = await sql<ExportRow[]>`
        SELECT callback.* FROM tenancy.voice_callback_requests callback
        JOIN tenancy.voice_sessions session
          ON session.tenant_id = callback.tenant_id AND session.id = callback.session_id
        WHERE callback.tenant_id = ${job.tenantId}::uuid
          AND (${contactId}::uuid IS NULL OR session.contact_id = ${contactId}::uuid)
        ORDER BY callback.id
      `;

      const artifact: PrivacyExport = {
        format: "djay-privacy-export-v1",
        generatedAt: new Date().toISOString(),
        tenantId: job.tenantId,
        scope: { contactId: job.contactId },
        data,
      };
      const plaintext = JSON.stringify(artifact);
      const byteLength = Buffer.byteLength(plaintext);
      if (byteLength > 52_428_800) throw new Error("privacy_export_too_large");
      const artifactId = randomUUID();
      await sql`
        INSERT INTO tenancy.privacy_artifacts (
          id, tenant_id, privacy_job_id, payload_ciphertext, plaintext_sha256, byte_length, expires_at
        ) VALUES (
          ${artifactId}::uuid, ${job.tenantId}::uuid, ${job.jobId}::uuid,
          ${sealJson(artifact, encryptionKey)}, ${createHash("sha256").update(plaintext).digest()},
          ${byteLength}, now() + interval '7 days'
        )
      `;
      for (const [entityType, rows] of Object.entries(data)) {
        for (const row of rows) await sql`
          INSERT INTO tenancy.privacy_lineage (
            tenant_id, privacy_job_id, entity_type, entity_id, disposition
          ) VALUES (${job.tenantId}::uuid, ${job.jobId}::uuid, ${entityType}, ${String(row.id)}, 'exported')
          ON CONFLICT DO NOTHING
        `;
      }
      await sql`
        UPDATE tenancy.privacy_jobs
        SET status = 'completed', result_object_ref_ciphertext = ${sealJson({ artifactId }, encryptionKey)}, completed_at = now()
        WHERE tenant_id = ${job.tenantId}::uuid AND id = ${job.jobId}::uuid
      `;
    });
  }

  async readExport(context: TenantContext, jobId: string, encryptionKey: Buffer): Promise<PrivacyExport | null> {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ payload_ciphertext: string }[]>`
        SELECT artifact.payload_ciphertext FROM tenancy.privacy_artifacts artifact
        JOIN tenancy.privacy_jobs job ON job.tenant_id = artifact.tenant_id AND job.id = artifact.privacy_job_id
        WHERE artifact.tenant_id = ${context.tenantId}::uuid AND artifact.privacy_job_id = ${jobId}::uuid
          AND job.job_type = 'export' AND job.status = 'completed' AND artifact.expires_at > now()
      `;
      return rows[0] ? openJson<PrivacyExport>(rows[0].payload_ciphertext, encryptionKey) : null;
    });
  }
}
