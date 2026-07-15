import { createHash } from "node:crypto";
import { createOpaqueToken, hashOpaqueToken } from "@djay/auth";
import { createDatabaseClient } from "@djay/db";
import { validateFlowForPublish, type FlowEntitlements } from "@djay/flowbot-domain";
import { convertLegacyFlowSnapshot, deterministicMigrationId } from "@djay/flowbot-migration";
import { z } from "zod";

const env = z.object({
  LEGACY_FLOWBOT_DATABASE_URL: z.string().url(),
  DATABASE_MIGRATION_URL: z.string().url(),
  LEGACY_FLOWBOT_TENANT_ID: z.uuid(),
  DJAY_TARGET_TENANT_ID: z.uuid(),
  DJAY_TARGET_MEMBERSHIP_ID: z.uuid(),
  MIGRATION_OPERATOR_REFERENCE: z.string().min(3).max(200),
  MIGRATION_MODE: z.enum(["import", "rollback"]).default("import"),
}).parse(process.env);

const legacy = createDatabaseClient(env.LEGACY_FLOWBOT_DATABASE_URL);
const target = createDatabaseClient(env.DATABASE_MIGRATION_URL);
type LegacyRow = {
  id: string; name: string; default_lang: "th" | "en"; allowed_origins: string[];
  version_id: string | null; version_no: number | null; snapshot: unknown;
};
const bots = await legacy<LegacyRow[]>`
  SELECT bot.id, bot.name, bot.default_lang, bot.allowed_origins,
         version.id AS version_id, version.version_no, version.snapshot
  FROM flowbot_bots bot
  LEFT JOIN flowbot_flow_versions version
    ON version.tenant_id = bot.tenant_id AND version.bot_id = bot.id
    AND version.status IN ('published', 'retired')
  WHERE bot.tenant_id = ${env.LEGACY_FLOWBOT_TENANT_ID}::uuid
  ORDER BY bot.id, version.version_no
`;
const sourceChecksum = createHash("sha256").update(JSON.stringify(bots)).digest();
const runId = deterministicMigrationId(env.DJAY_TARGET_TENANT_ID, "migration_run", sourceChecksum.toString("hex"));
await target`
  INSERT INTO migration.runs (
    id, source_system, source_version, tenant_id, operator_reference, source_checksum
  ) VALUES (
    ${runId}::uuid, 'flowbot_v1', 'v1', ${env.DJAY_TARGET_TENANT_ID}::uuid,
    ${env.MIGRATION_OPERATOR_REFERENCE}, ${sourceChecksum}
  ) ON CONFLICT (tenant_id, source_system, source_checksum) DO NOTHING
`;

if (env.MIGRATION_MODE === "rollback") {
  const active = await target<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM tenancy.flow_executions execution
    JOIN migration.legacy_id_map mapping
      ON mapping.run_id = ${runId}::uuid AND mapping.target_entity_type = 'flow_bot'
      AND mapping.target_id = execution.bot_id
    WHERE execution.tenant_id = ${env.DJAY_TARGET_TENANT_ID}::uuid
  `;
  if ((active[0]?.count ?? 0) > 0) throw new Error("rollback_refused_target_executions_exist");
  await target.begin(async (sql) => {
    await sql`
      UPDATE tenancy.flow_deployments SET status = 'disabled'
      WHERE tenant_id = ${env.DJAY_TARGET_TENANT_ID}::uuid
        AND bot_id IN (SELECT target_id FROM migration.legacy_id_map WHERE run_id = ${runId}::uuid AND target_entity_type = 'flow_bot')
    `;
    await sql`
      UPDATE tenancy.flow_bots SET status = 'archived', updated_at = now()
      WHERE tenant_id = ${env.DJAY_TARGET_TENANT_ID}::uuid
        AND id IN (SELECT target_id FROM migration.legacy_id_map WHERE run_id = ${runId}::uuid AND target_entity_type = 'flow_bot')
    `;
    await sql`UPDATE migration.runs SET status = 'rolled_back', completed_at = now() WHERE id = ${runId}::uuid`;
  });
  console.info(JSON.stringify({ status: "rolled_back", runId }));
  await legacy.end(); await target.end();
  process.exit(0);
}

const authorityRows = await target<{
  plan_key: "flowbot_basic" | "flowbot_premium"; access_mode: "active";
  resolved_json: { entitlements?: FlowEntitlements["entitlements"]; limits?: FlowEntitlements["limits"] };
}[]>`
  SELECT plan.plan_key, snapshot.access_mode, snapshot.resolved_json
  FROM tenancy.entitlement_snapshots snapshot
  JOIN tenancy.product_subscriptions subscription
    ON subscription.tenant_id = snapshot.tenant_id AND subscription.id = snapshot.subscription_id
    AND subscription.status IN ('active', 'trialing', 'scheduled_change')
  JOIN catalog.plan_versions plan_version ON plan_version.id = snapshot.plan_version_id
  JOIN catalog.plans plan ON plan.id = plan_version.plan_id AND plan.product_key = 'flowbot'
  WHERE snapshot.tenant_id = ${env.DJAY_TARGET_TENANT_ID}::uuid AND snapshot.access_mode = 'active'
  ORDER BY snapshot.created_at DESC LIMIT 1
`;
const authorityRow = authorityRows[0];
if (!authorityRow) throw new Error("target_flowbot_entitlement_missing");
const authority: FlowEntitlements = {
  planKey: authorityRow.plan_key, accessMode: authorityRow.access_mode,
  entitlements: authorityRow.resolved_json.entitlements ?? {}, limits: authorityRow.resolved_json.limits ?? {},
};

const grouped = new Map<string, LegacyRow[]>();
for (const row of bots) grouped.set(row.id, [...(grouped.get(row.id) ?? []), row]);
let accepted = 0; let rejected = 0;
const rotatedDeploymentKeys: { botName: string; deploymentKey: string; allowedOrigins: string[] }[] = [];

for (const [sourceBotId, rows] of grouped) {
  const bot = rows[0]!; const targetBotId = deterministicMigrationId(env.DJAY_TARGET_TENANT_ID, "flow_bot", sourceBotId);
  const converted: { targetVersionId: string; versionNo: number; snapshot: ReturnType<typeof convertLegacyFlowSnapshot> & { status: "converted" } }[] = [];
  for (const version of rows.filter((row) => row.version_id && row.version_no && row.snapshot)) {
    const targetVersionId = deterministicMigrationId(env.DJAY_TARGET_TENANT_ID, "flow_version", version.version_id!);
    const conversion = convertLegacyFlowSnapshot(version.snapshot, targetVersionId);
    if (conversion.status !== "converted") {
      rejected += 1;
      await target`
        INSERT INTO migration.rejects (run_id, tenant_id, source_entity_type, redacted_locator, reason_code)
        VALUES (${runId}::uuid, ${env.DJAY_TARGET_TENANT_ID}::uuid, 'flow_version',
          ${createHash("sha256").update(version.version_id!).digest("hex").slice(0, 16)}, ${conversion.reasonCode})
      `;
      continue;
    }
    const issues = validateFlowForPublish(conversion.snapshot, authority);
    if (issues.length) {
      rejected += 1;
      await target`
        INSERT INTO migration.rejects (run_id, tenant_id, source_entity_type, redacted_locator, reason_code)
        VALUES (${runId}::uuid, ${env.DJAY_TARGET_TENANT_ID}::uuid, 'flow_version',
          ${createHash("sha256").update(version.version_id!).digest("hex").slice(0, 16)}, ${issues[0]!.code})
      `;
      continue;
    }
    converted.push({ targetVersionId, versionNo: version.version_no!, snapshot: conversion });
  }
  if (!converted.length) continue;
  converted.sort((left, right) => left.versionNo - right.versionNo);
  await target.begin(async (sql) => {
    await sql`
      INSERT INTO tenancy.flow_bots (id, tenant_id, name, default_language, status, created_by_membership_id)
      VALUES (${targetBotId}::uuid, ${env.DJAY_TARGET_TENANT_ID}::uuid, ${bot.name}, ${bot.default_lang}, 'draft', ${env.DJAY_TARGET_MEMBERSHIP_ID}::uuid)
      ON CONFLICT (id) DO NOTHING
    `;
    await sql`
      INSERT INTO migration.legacy_id_map (run_id, tenant_id, source_entity_type, source_id, target_entity_type, target_id, source_checksum)
      VALUES (${runId}::uuid, ${env.DJAY_TARGET_TENANT_ID}::uuid, 'bot', ${sourceBotId}, 'flow_bot', ${targetBotId}::uuid,
        ${createHash("sha256").update(JSON.stringify(bot)).digest()})
      ON CONFLICT DO NOTHING
    `;
    for (const version of converted) {
      const serialized = JSON.stringify(version.snapshot.snapshot);
      await sql`
        INSERT INTO tenancy.flow_versions (
          id, tenant_id, bot_id, version, status, snapshot_json, snapshot_sha256, published_by_membership_id
        ) VALUES (
          ${version.targetVersionId}::uuid, ${env.DJAY_TARGET_TENANT_ID}::uuid, ${targetBotId}::uuid,
          ${version.versionNo}, 'published', ${sql.json(version.snapshot.snapshot)},
          ${createHash("sha256").update(serialized).digest()}, ${env.DJAY_TARGET_MEMBERSHIP_ID}::uuid
        ) ON CONFLICT (id) DO NOTHING
      `;
      await sql`
        INSERT INTO migration.legacy_id_map (run_id, tenant_id, source_entity_type, source_id, target_entity_type, target_id, source_checksum)
        VALUES (${runId}::uuid, ${env.DJAY_TARGET_TENANT_ID}::uuid, 'flow_version',
          ${rows.find((row) => row.version_no === version.versionNo)!.version_id}, 'flow_version', ${version.targetVersionId}::uuid,
          ${createHash("sha256").update(serialized).digest()}) ON CONFLICT DO NOTHING
      `;
      accepted += 1;
    }
    const latest = converted.at(-1)!;
    await sql`
      UPDATE tenancy.flow_bots SET status = 'active', current_published_version_id = ${latest.targetVersionId}::uuid, updated_at = now()
      WHERE tenant_id = ${env.DJAY_TARGET_TENANT_ID}::uuid AND id = ${targetBotId}::uuid
    `;
    await sql`
      INSERT INTO tenancy.flow_drafts (tenant_id, bot_id, based_on_version_id, definition_json, updated_by_membership_id)
      VALUES (${env.DJAY_TARGET_TENANT_ID}::uuid, ${targetBotId}::uuid, ${latest.targetVersionId}::uuid,
        ${sql.json(latest.snapshot.snapshot)}, ${env.DJAY_TARGET_MEMBERSHIP_ID}::uuid)
      ON CONFLICT (tenant_id, bot_id) DO NOTHING
    `;
    const deploymentId = deterministicMigrationId(env.DJAY_TARGET_TENANT_ID, "flow_deployment", sourceBotId);
    const rawKey = `djay_flow_${createOpaqueToken()}`;
    const deployments = await sql<{ id: string }[]>`
      INSERT INTO tenancy.flow_deployments (
        id, tenant_id, bot_id, name, deployment_key_hash, key_prefix, allowed_origins, created_by_membership_id
      ) VALUES (
        ${deploymentId}::uuid, ${env.DJAY_TARGET_TENANT_ID}::uuid, ${targetBotId}::uuid,
        ${`${bot.name} migrated deployment`}, ${hashOpaqueToken(rawKey)}, ${rawKey.slice(0, 16)},
        ${bot.allowed_origins}, ${env.DJAY_TARGET_MEMBERSHIP_ID}::uuid
      ) ON CONFLICT (id) DO NOTHING RETURNING id
    `;
    if (deployments[0]) rotatedDeploymentKeys.push({ botName: bot.name, deploymentKey: rawKey, allowedOrigins: bot.allowed_origins });
  });
}

const expected = bots.filter((row) => row.version_id && row.snapshot).length;
const actual = { accepted, rejected, reconciled: accepted + rejected };
const evidence = createHash("sha256").update(JSON.stringify({ expected, actual })).digest();
await target.begin(async (sql) => {
  await sql`
    INSERT INTO migration.validations (run_id, validation_key, expected_json, actual_json, passed, evidence_sha256)
    VALUES (${runId}::uuid, 'published_version_reconciliation', ${sql.json({ publishedVersions: expected })},
      ${sql.json(actual)}, ${actual.reconciled === expected}, ${evidence})
    ON CONFLICT (run_id, validation_key) DO UPDATE
      SET actual_json = EXCLUDED.actual_json, passed = EXCLUDED.passed, evidence_sha256 = EXCLUDED.evidence_sha256
  `;
  await sql`
    UPDATE migration.runs SET status = ${rejected === 0 && actual.reconciled === expected ? "validated" : "failed"},
      accepted_count = ${accepted}, rejected_count = ${rejected}, completed_at = now()
    WHERE id = ${runId}::uuid
  `;
});
console.info(JSON.stringify({ status: rejected === 0 ? "validated" : "remediation_required", runId, accepted, rejected, rotatedDeploymentKeys }, null, 2));
await legacy.end(); await target.end();
