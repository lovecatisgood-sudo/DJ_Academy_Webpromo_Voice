import { createHash } from "node:crypto";
import { createDatabaseClient, type DatabaseTransaction } from "@djay/db";
import {
  convertLegacyConversation,
  convertLegacyLead,
  deterministicLegacyId,
  redactedLocator,
  type ConvertedConversation,
  type ConvertedLead,
} from "@djay/voice-text-migration";
import { z } from "zod";

const env = z.object({
  LEGACY_VOICE_TEXT_DATABASE_URL: z.string().url(),
  DATABASE_MIGRATION_URL: z.string().url(),
  DJAY_TARGET_TENANT_ID: z.uuid(),
  MIGRATION_OPERATOR_REFERENCE: z.string().min(3).max(200),
  MIGRATION_APPROVAL_REFERENCE: z.string().min(3).max(200).optional(),
  MIGRATION_MODE: z.enum(["dry_run", "import", "rollback"]).default("dry_run"),
}).parse(process.env);

if (env.MIGRATION_MODE === "import" && !env.MIGRATION_APPROVAL_REFERENCE) {
  throw new Error("migration_approval_reference_required");
}
const auditedOperatorReference = env.MIGRATION_MODE === "import"
  ? `${env.MIGRATION_OPERATOR_REFERENCE} | approval:${env.MIGRATION_APPROVAL_REFERENCE}`
  : env.MIGRATION_OPERATOR_REFERENCE;
if (auditedOperatorReference.length > 200) throw new Error("migration_operator_and_approval_reference_too_long");

const source = createDatabaseClient(env.LEGACY_VOICE_TEXT_DATABASE_URL);
const target = createDatabaseClient(env.DATABASE_MIGRATION_URL);

type SourceConversation = Record<string, unknown> & { id: string };
type SourceLead = Record<string, unknown> & { id: string };
type Authority = { snapshotId: string; productKey: "voice" | "ai_chat"; publicPlanKey: string };

const conversations = await source<SourceConversation[]>`
  SELECT conversation.id, conversation.started_at, conversation.ended_at,
         conversation.duration_seconds, conversation.language, conversation.transcript,
         conversation.summary, conversation.business_type, conversation.main_problem,
         conversation.business_goal, conversation.interest_level,
         conversation.concern_or_objection, conversation.recommended_service,
         conversation.next_action, conversation.starred, conversation.deleted_at,
         conversation.channel, conversation.interaction_mode, conversation.last_message_at,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
             'id', message.id, 'conversation_id', message.conversation_id,
             'channel', message.channel, 'role', message.role,
             'content', message.content, 'created_at', message.created_at
           ) ORDER BY message.created_at, message.id)
           FROM conversation_messages message WHERE message.conversation_id = conversation.id
         ), '[]'::jsonb) AS messages,
         COALESCE((
           SELECT jsonb_agg(to_jsonb(lead) - 'assigned_admin_id' ORDER BY lead.created_at, lead.id)
           FROM leads lead WHERE lead.conversation_id = conversation.id
         ), '[]'::jsonb) AS leads
  FROM conversations conversation
  ORDER BY conversation.started_at, conversation.id
`;

const orphanLeads = await source<SourceLead[]>`
  SELECT lead.id, lead.conversation_id, lead.name, lead.contact, lead.contact_type,
         lead.need, lead.preferred_time, lead.status, lead.client_name,
         lead.company_name, lead.phone, lead.email, lead.line_id, lead.whatsapp,
         lead.other_contact, lead.preferred_contact_method,
         lead.preferred_meeting_day, lead.preferred_meeting_time, lead.admin_notes,
         lead.created_at, lead.updated_at, lead.source_channel, lead.source_mode
  FROM leads lead
  WHERE lead.conversation_id IS NULL
  ORDER BY lead.created_at, lead.id
`;

const sourceChecksum = createHash("sha256")
  .update(JSON.stringify({ conversations, orphanLeads }))
  .digest();
const checksumHex = sourceChecksum.toString("hex");
const runId = deterministicLegacyId(env.DJAY_TARGET_TENANT_ID, "migration_run", checksumHex);

async function tenantTransaction<T>(callback: (sql: DatabaseTransaction) => Promise<T>) {
  return target.begin(async (sql) => {
    await sql`SELECT set_config('app.tenant_id', ${env.DJAY_TARGET_TENANT_ID}, true)`;
    return callback(sql);
  });
}

const authorities = await tenantTransaction(async (sql) => sql<Authority[]>`
  SELECT snapshot.id AS "snapshotId", plan.product_key AS "productKey",
         plan.plan_key AS "publicPlanKey"
  FROM tenancy.entitlement_snapshots snapshot
  JOIN tenancy.product_subscriptions subscription
    ON subscription.tenant_id = snapshot.tenant_id
   AND subscription.id = snapshot.subscription_id
   AND subscription.status IN ('active', 'trialing', 'scheduled_change')
  JOIN catalog.plan_versions plan_version ON plan_version.id = snapshot.plan_version_id
  JOIN catalog.plans plan ON plan.id = plan_version.plan_id
  WHERE snapshot.tenant_id = ${env.DJAY_TARGET_TENANT_ID}::uuid
    AND snapshot.access_mode = 'active'
    AND plan.product_key IN ('voice', 'ai_chat')
  ORDER BY snapshot.created_at DESC
`);
const authorityByProduct = new Map<Authority["productKey"], Authority>();
for (const authority of authorities) if (!authorityByProduct.has(authority.productKey)) {
  authorityByProduct.set(authority.productKey, authority);
}

const convertedConversations = conversations.map((row) => ({ row, result: convertLegacyConversation(row) }));
const convertedOrphanLeads = orphanLeads.map((row) => ({ row, result: convertLegacyLead(row) }));
const preview = {
  sourceConversations: conversations.length,
  acceptedConversations: convertedConversations.filter(({ result }) => result.status === "converted" && authorityByProduct.has(result.value.productKey)).length,
  quarantinedConversations: convertedConversations.filter(({ result }) => result.status === "quarantined" || (result.status === "converted" && !authorityByProduct.has(result.value.productKey))).length,
  skippedDeletedConversations: convertedConversations.filter(({ result }) => result.status === "skipped").length,
  sourceOrphanLeads: orphanLeads.length,
  acceptedOrphanLeads: convertedOrphanLeads.filter(({ result }) => result.status === "converted").length,
  quarantinedOrphanLeads: convertedOrphanLeads.filter(({ result }) => result.status === "quarantined").length,
};

if (env.MIGRATION_MODE === "dry_run") {
  console.info(JSON.stringify({ status: "dry_run", runId, sourceChecksum: checksumHex, ...preview }, null, 2));
  await source.end();
  await target.end();
  process.exit(0);
}

if (env.MIGRATION_MODE === "rollback") {
  const existingRun = await target<{ status: string }[]>`
    SELECT status FROM migration.runs
    WHERE id = ${runId}::uuid AND tenant_id = ${env.DJAY_TARGET_TENANT_ID}::uuid
      AND source_system = 'voice_text_v2'
  `;
  if (existingRun[0]?.status !== "validated") throw new Error("rollback_refused_validated_run_missing");
  const targetOnlyWrites = await tenantTransaction(async (sql) => sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM (
      SELECT note.id FROM tenancy.conversation_notes note
      JOIN migration.legacy_id_map mapping
        ON mapping.run_id = ${runId}::uuid AND mapping.target_entity_type = 'conversation'
       AND mapping.target_id = note.conversation_id
      WHERE note.tenant_id = ${env.DJAY_TARGET_TENANT_ID}::uuid
      UNION ALL
      SELECT transition.id FROM tenancy.conversation_transitions transition
      JOIN migration.legacy_id_map mapping
        ON mapping.run_id = ${runId}::uuid AND mapping.target_entity_type = 'conversation'
       AND mapping.target_id = transition.conversation_id
      WHERE transition.tenant_id = ${env.DJAY_TARGET_TENANT_ID}::uuid
      UNION ALL
      SELECT handover.id FROM tenancy.handover_events handover
      JOIN migration.legacy_id_map mapping
        ON mapping.run_id = ${runId}::uuid AND mapping.target_entity_type = 'conversation'
       AND mapping.target_id = handover.conversation_id
      WHERE handover.tenant_id = ${env.DJAY_TARGET_TENANT_ID}::uuid
      UNION ALL
      SELECT action.id FROM tenancy.action_requests action
      JOIN migration.legacy_id_map mapping
        ON mapping.run_id = ${runId}::uuid AND mapping.target_entity_type = 'conversation'
       AND mapping.target_id = action.conversation_id
      WHERE action.tenant_id = ${env.DJAY_TARGET_TENANT_ID}::uuid
      UNION ALL
      SELECT appointment.id FROM tenancy.appointment_requests appointment
      JOIN migration.legacy_id_map mapping
        ON mapping.run_id = ${runId}::uuid AND mapping.target_entity_type = 'conversation'
       AND mapping.target_id = appointment.conversation_id
      WHERE appointment.tenant_id = ${env.DJAY_TARGET_TENANT_ID}::uuid
      UNION ALL
      SELECT conversation.id FROM tenancy.conversations conversation
      JOIN migration.legacy_id_map mapping
        ON mapping.run_id = ${runId}::uuid AND mapping.target_entity_type = 'conversation'
       AND mapping.target_id = conversation.id
      WHERE conversation.tenant_id = ${env.DJAY_TARGET_TENANT_ID}::uuid
        AND (conversation.status <> 'closed' OR conversation.automation_mode <> 'closed'
          OR conversation.assigned_membership_id IS NOT NULL)
      UNION ALL
      SELECT message.id FROM tenancy.messages message
      JOIN migration.legacy_id_map conversation_mapping
        ON conversation_mapping.run_id = ${runId}::uuid
       AND conversation_mapping.target_entity_type = 'conversation'
       AND conversation_mapping.target_id = message.conversation_id
      LEFT JOIN migration.legacy_id_map message_mapping
        ON message_mapping.run_id = ${runId}::uuid
       AND message_mapping.target_entity_type = 'message'
       AND message_mapping.target_id = message.id
      WHERE message.tenant_id = ${env.DJAY_TARGET_TENANT_ID}::uuid
        AND message_mapping.target_id IS NULL
    ) target_write
  `);
  if ((targetOnlyWrites[0]?.count ?? 0) > 0) throw new Error("rollback_refused_target_only_writes_exist");
  await tenantTransaction(async (sql) => {
    await sql`
      UPDATE tenancy.legacy_conversation_imports
      SET cutover_state = 'rolled_back', rolled_back_at = now()
      WHERE tenant_id = ${env.DJAY_TARGET_TENANT_ID}::uuid
        AND migration_run_id = ${runId}::uuid
    `;
    await sql`
      UPDATE migration.runs SET status = 'rolled_back', completed_at = now()
      WHERE id = ${runId}::uuid
    `;
  });
  console.info(JSON.stringify({ status: "traffic_rollback_ready", runId, retainedHistoricalRows: true }));
  await source.end();
  await target.end();
  process.exit(0);
}

await target`
  INSERT INTO migration.runs (
    id, source_system, source_version, tenant_id, operator_reference, source_checksum
  ) VALUES (
    ${runId}::uuid, 'voice_text_v2', 'v2', ${env.DJAY_TARGET_TENANT_ID}::uuid,
    ${auditedOperatorReference}, ${sourceChecksum}
  ) ON CONFLICT (tenant_id, source_system, source_checksum) DO NOTHING
`;

async function mapEntity(
  sql: DatabaseTransaction,
  sourceEntityType: string,
  sourceId: string,
  targetEntityType: string,
  targetId: string,
  value: unknown,
) {
  await sql`
    INSERT INTO migration.legacy_id_map (
      run_id, tenant_id, source_entity_type, source_id,
      target_entity_type, target_id, source_checksum
    ) VALUES (
      ${runId}::uuid, ${env.DJAY_TARGET_TENANT_ID}::uuid, ${sourceEntityType}, ${sourceId},
      ${targetEntityType}, ${targetId}::uuid,
      ${createHash("sha256").update(JSON.stringify(value)).digest()}
    ) ON CONFLICT DO NOTHING
  `;
}

async function insertReject(sourceEntityType: string, sourceId: string, reasonCode: string) {
  await target`
    INSERT INTO migration.rejects (
      run_id, tenant_id, source_entity_type, redacted_locator, reason_code
    ) VALUES (
      ${runId}::uuid, ${env.DJAY_TARGET_TENANT_ID}::uuid, ${sourceEntityType},
      ${redactedLocator(sourceId)}, ${reasonCode}
    ) ON CONFLICT DO NOTHING
  `;
}

async function insertLead(sql: DatabaseTransaction, lead: ConvertedLead) {
  const contactId = deterministicLegacyId(env.DJAY_TARGET_TENANT_ID, "contact", lead.sourceId);
  const leadId = deterministicLegacyId(env.DJAY_TARGET_TENANT_ID, "lead", lead.sourceId);
  await sql`
    INSERT INTO tenancy.contacts (
      id, tenant_id, display_name, locale, consent_status, created_at, updated_at
    ) VALUES (
      ${contactId}::uuid, ${env.DJAY_TARGET_TENANT_ID}::uuid, ${lead.displayName},
      ${lead.locale}, 'unknown', ${lead.createdAt}, ${lead.updatedAt}
    ) ON CONFLICT (id) DO NOTHING
  `;
  await mapEntity(sql, "lead_contact", lead.sourceId, "contact", contactId, { displayName: lead.displayName, locale: lead.locale });
  for (const identity of lead.identities) {
    const identityId = deterministicLegacyId(env.DJAY_TARGET_TENANT_ID, `contact_identity:${identity.kind}`, `${lead.sourceId}:${identity.value}`);
    await sql`
      INSERT INTO tenancy.contact_identities (
        id, tenant_id, contact_id, identity_kind, normalized_value,
        verification_status, created_at
      ) VALUES (
        ${identityId}::uuid, ${env.DJAY_TARGET_TENANT_ID}::uuid, ${contactId}::uuid,
        ${identity.kind}, ${identity.value}, 'unverified', ${lead.createdAt}
      ) ON CONFLICT (id) DO NOTHING
    `;
  }
  await sql`
    INSERT INTO tenancy.leads (
      id, tenant_id, contact_id, title, source, status, created_at, updated_at,
      closed_at
    ) VALUES (
      ${leadId}::uuid, ${env.DJAY_TARGET_TENANT_ID}::uuid, ${contactId}::uuid,
      ${lead.title}, 'legacy_voice_text', ${lead.status}, ${lead.createdAt}, ${lead.updatedAt},
      ${["closed_deal", "disqualified"].includes(lead.status) ? lead.updatedAt : null}
    ) ON CONFLICT (id) DO NOTHING
  `;
  const historyId = deterministicLegacyId(env.DJAY_TARGET_TENANT_ID, "lead_history", lead.sourceId);
  await sql`
    INSERT INTO tenancy.lead_status_history (
      id, tenant_id, lead_id, from_status, to_status, source_action,
      request_id, created_at
    ) VALUES (
      ${historyId}::uuid, ${env.DJAY_TARGET_TENANT_ID}::uuid, ${leadId}::uuid,
      NULL, ${lead.status}, 'legacy.import', ${`legacy-import:${runId}:${lead.sourceId}`}, ${lead.createdAt}
    ) ON CONFLICT (id) DO NOTHING
  `;
  for (const [index, fact] of lead.facts.entries()) {
    const factId = deterministicLegacyId(env.DJAY_TARGET_TENANT_ID, `lead_fact:${index}`, lead.sourceId);
    await sql`
      INSERT INTO tenancy.sales_facts (
        id, tenant_id, lead_id, fact_type, value_json, confidence, created_at
      ) VALUES (
        ${factId}::uuid, ${env.DJAY_TARGET_TENANT_ID}::uuid, ${leadId}::uuid,
        ${fact.type}, ${sql.json({ text: fact.value })}, 'customer_stated', ${lead.createdAt}
      ) ON CONFLICT (id) DO NOTHING
    `;
  }
  await mapEntity(sql, "lead", lead.sourceId, "lead", leadId, lead);
  return { contactId, leadId };
}

async function insertConversation(sql: DatabaseTransaction, value: ConvertedConversation, authority: Authority) {
  const primaryLead = value.leads[0];
  let contactId: string;
  let leadId: string | null = null;
  if (primaryLead) {
    ({ contactId, leadId } = await insertLead(sql, primaryLead));
    for (const lead of value.leads.slice(1)) await insertLead(sql, lead);
  } else {
    contactId = deterministicLegacyId(env.DJAY_TARGET_TENANT_ID, "conversation_contact", value.sourceId);
    await sql`
      INSERT INTO tenancy.contacts (
        id, tenant_id, display_name, locale, consent_status, created_at, updated_at
      ) VALUES (
        ${contactId}::uuid, ${env.DJAY_TARGET_TENANT_ID}::uuid,
        ${value.channelKind === "voice" ? "Imported voice visitor" : "Imported chat visitor"},
        ${value.locale}, 'unknown', ${value.startedAt}, ${value.closedAt}
      ) ON CONFLICT (id) DO NOTHING
    `;
    await mapEntity(sql, "conversation_contact", value.sourceId, "contact", contactId, { locale: value.locale });
  }
  const conversationId = deterministicLegacyId(env.DJAY_TARGET_TENANT_ID, "conversation", value.sourceId);
  await sql`
    INSERT INTO tenancy.conversations (
      id, tenant_id, contact_id, lead_id, product_key, public_plan_key,
      entitlement_snapshot_id, channel_kind, automation_mode, status,
      next_sequence, started_at, updated_at, closed_at
    ) VALUES (
      ${conversationId}::uuid, ${env.DJAY_TARGET_TENANT_ID}::uuid, ${contactId}::uuid,
      ${leadId}::uuid, ${value.productKey}, ${authority.publicPlanKey},
      ${authority.snapshotId}::uuid, ${value.channelKind}, 'closed', 'closed',
      ${value.messages.length + 1}, ${value.startedAt}, ${value.closedAt}, ${value.closedAt}
    ) ON CONFLICT (id) DO NOTHING
  `;
  await mapEntity(sql, "conversation", value.sourceId, "conversation", conversationId, value);
  for (const [index, message] of value.messages.entries()) {
    const messageId = deterministicLegacyId(env.DJAY_TARGET_TENANT_ID, "message", message.sourceId);
    await sql`
      INSERT INTO tenancy.messages (
        id, tenant_id, conversation_id, sequence, actor_type, direction,
        content_json, external_message_id, created_at
      ) VALUES (
        ${messageId}::uuid, ${env.DJAY_TARGET_TENANT_ID}::uuid, ${conversationId}::uuid,
        ${index + 1}, ${message.actorType}, ${message.direction},
        ${sql.json({ type: "text", text: message.text })}, ${`legacy:${message.sourceId}`}, ${message.createdAt}
      ) ON CONFLICT (id) DO NOTHING
    `;
    await mapEntity(sql, "message", message.sourceId, "message", messageId, message);
  }
  if (leadId) for (const [index, fact] of value.facts.entries()) {
    const factId = deterministicLegacyId(env.DJAY_TARGET_TENANT_ID, `conversation_fact:${index}`, value.sourceId);
    await sql`
      INSERT INTO tenancy.sales_facts (
        id, tenant_id, lead_id, fact_type, value_json, confidence, created_at
      ) VALUES (
        ${factId}::uuid, ${env.DJAY_TARGET_TENANT_ID}::uuid, ${leadId}::uuid,
        ${fact.type}, ${sql.json({ text: fact.value })}, 'inferred', ${value.closedAt}
      ) ON CONFLICT (id) DO NOTHING
    `;
  }
  await sql`
    INSERT INTO tenancy.legacy_conversation_imports (
      tenant_id, conversation_id, migration_run_id, source_kind, source_language,
      duration_seconds, summary_text, starred, source_checksum
    ) VALUES (
      ${env.DJAY_TARGET_TENANT_ID}::uuid, ${conversationId}::uuid, ${runId}::uuid,
      ${value.productKey === "voice" ? "voice_widget" : "text_widget"}, ${value.locale},
      ${value.durationSeconds}, ${value.summary}, ${value.starred},
      ${createHash("sha256").update(JSON.stringify(value)).digest()}
    ) ON CONFLICT (tenant_id, conversation_id) DO NOTHING
  `;
}

let accepted = 0;
let rejected = 0;
let skipped = 0;
for (const { row, result } of convertedConversations) {
  if (result.status === "skipped") {
    skipped += 1;
    continue;
  }
  if (result.status === "quarantined") {
    rejected += 1;
    await insertReject("conversation", row.id, result.reasonCode);
    continue;
  }
  const authority = authorityByProduct.get(result.value.productKey);
  if (!authority) {
    rejected += 1;
    await insertReject("conversation", row.id, "target_entitlement_missing");
    continue;
  }
  await tenantTransaction((sql) => insertConversation(sql, result.value, authority));
  await target`
    UPDATE migration.rejects SET remediation_status = 'resolved', resolved_at = now()
    WHERE run_id = ${runId}::uuid AND source_entity_type = 'conversation'
      AND redacted_locator = ${redactedLocator(row.id)} AND remediation_status = 'open'
  `;
  accepted += 1;
}

for (const { row, result } of convertedOrphanLeads) {
  if (result.status === "quarantined") {
    rejected += 1;
    await insertReject("orphan_lead", row.id, result.reasonCode);
    continue;
  }
  await tenantTransaction((sql) => insertLead(sql, result.value));
  await target`
    UPDATE migration.rejects SET remediation_status = 'resolved', resolved_at = now()
    WHERE run_id = ${runId}::uuid AND source_entity_type = 'orphan_lead'
      AND redacted_locator = ${redactedLocator(row.id)} AND remediation_status = 'open'
  `;
  accepted += 1;
}

const expected = conversations.length + orphanLeads.length;
const actual = { accepted, rejected, skipped, reconciled: accepted + rejected + skipped };
const mappings = await target<{ count: number }[]>`
  SELECT count(*)::int AS count FROM migration.legacy_id_map WHERE run_id = ${runId}::uuid
`;
const validationEvidence = createHash("sha256")
  .update(JSON.stringify({ expected, actual, mappedEntities: mappings[0]?.count ?? 0 }))
  .digest();
const passed = actual.reconciled === expected && rejected === 0;
await target.begin(async (sql) => {
  await sql`
    INSERT INTO migration.validations (
      run_id, validation_key, expected_json, actual_json, passed, evidence_sha256
    ) VALUES (
      ${runId}::uuid, 'voice_text_entity_reconciliation',
      ${sql.json({ sourceEntities: expected })},
      ${sql.json({ ...actual, mappedEntities: mappings[0]?.count ?? 0 })},
      ${passed}, ${validationEvidence}
    ) ON CONFLICT (run_id, validation_key) DO UPDATE SET
      actual_json = EXCLUDED.actual_json, passed = EXCLUDED.passed,
      evidence_sha256 = EXCLUDED.evidence_sha256
  `;
  await sql`
    UPDATE migration.runs SET status = ${passed ? "validated" : "failed"},
      accepted_count = ${accepted}, rejected_count = ${rejected}, completed_at = now()
    WHERE id = ${runId}::uuid
  `;
});
console.info(JSON.stringify({
  status: passed ? "validated" : "remediation_required",
  runId,
  sourceChecksum: checksumHex,
  ...actual,
  mappedEntities: mappings[0]?.count ?? 0,
}, null, 2));
await source.end();
await target.end();
