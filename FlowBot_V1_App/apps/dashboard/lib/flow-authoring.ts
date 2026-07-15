import { advance, normalizeInput } from "@flowbot/core";
import { createSqlClient, type AdminUser } from "@flowbot/db";
import { engineInputSchema, flowSnapshotSchema, type EngineInput, type FlowSnapshot } from "@flowbot/shared";
import { Pool, type PoolClient } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";

type Sql = any;
let pgPool: Pool | null = null;

type BotRow = {
  id: string;
  tenant_id: string;
  public_key: string;
  name: string;
  default_lang: "th" | "en";
  published_version_id: string | null;
};

type FlowVersionRow = {
  id: string;
  tenant_id: string;
  bot_id: string;
  status: "draft" | "published" | "retired";
  version_no: number;
  published_at: Date | string | null;
  created_at: Date | string;
};

type NodeRow = {
  id: string;
  tenant_id: string;
  flow_version_id: string;
  type: string;
  parent_id: string | null;
  next_node_id: string | null;
  sort_order: number;
  title: string;
  content_th: string;
  content_en: string;
  image_url: string | null;
  searchable_content: boolean;
  config: Record<string, unknown>;
};

type OptionRow = {
  id: string;
  tenant_id: string;
  flow_version_id: string;
  node_id: string;
  target_node_id: string;
  sort_order: number;
  label_th: string;
  label_en: string;
};

type KeywordRow = {
  id: string;
  tenant_id: string;
  flow_version_id: string;
  node_id: string;
  lang: "th" | "en";
  keyword: string;
  normalized_keyword: string;
  priority: number;
  substring_enabled: boolean;
};

export async function listBots(admin: AdminUser, sql: Sql = createSqlClient()) {
  const rows = (await sql`
    SELECT id, public_key, name, default_lang, published_version_id, created_at, updated_at
    FROM flowbot_bots
    WHERE tenant_id = ${admin.tenantId}
    ORDER BY created_at ASC
  `) as (BotRow & { created_at: Date | string; updated_at: Date | string })[];
  return rows.map((row) => ({
    id: row.id,
    publicKey: row.public_key,
    name: row.name,
    defaultLang: row.default_lang,
    publishedVersionId: row.published_version_id,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  }));
}

export async function listVersions(admin: AdminUser, botId: string, sql: Sql = createSqlClient()) {
  await requireBot(admin, botId, sql);
  const rows = (await sql`
    SELECT id, status, version_no, published_at, created_at
    FROM flowbot_flow_versions
    WHERE tenant_id = ${admin.tenantId}
      AND bot_id = ${botId}
    ORDER BY
      CASE WHEN status = 'draft' THEN 0 ELSE 1 END,
      version_no DESC
  `) as FlowVersionRow[];
  return rows.map(mapVersion);
}

export async function getDraft(admin: AdminUser, botId: string, sql: Sql = createSqlClient()) {
  const bot = await requireBot(admin, botId, sql);
  const draft = await ensureDraft(admin, bot, sql);
  return getVersionAuthoring(admin.tenantId, draft.id, sql);
}

export async function createDraftNode(
  admin: AdminUser,
  botId: string,
  input: {
    type: string;
    parentId?: string | null | undefined;
    title: string;
    contentTh?: string | undefined;
    contentEn?: string | undefined;
    sortOrder?: number | undefined;
    config?: Record<string, unknown> | undefined;
  },
  sql: Sql = createSqlClient()
) {
  const bot = await requireBot(admin, botId, sql);
  const draft = await ensureDraft(admin, bot, sql);
  await assertDraftNodeParent(admin.tenantId, draft.id, input.parentId ?? null, sql);
  const id = randomUUID();
  const rows = await sql`
    INSERT INTO flowbot_nodes (
      id, tenant_id, flow_version_id, type, parent_id, title, content_th, content_en, sort_order, config
    )
    VALUES (
      ${id}, ${admin.tenantId}, ${draft.id}, ${input.type}, ${input.parentId ?? null},
      ${input.title}, ${input.contentTh ?? ""}, ${input.contentEn ?? ""}, ${input.sortOrder ?? 0},
      ${JSON.stringify(input.config ?? {})}
    )
    RETURNING *
  `;
  return mapNode(rows[0] as NodeRow);
}

export async function updateNode(
  admin: AdminUser,
  nodeId: string,
  patch: {
    type?: string | undefined;
    parentId?: string | null | undefined;
    nextNodeId?: string | null | undefined;
    sortOrder?: number | undefined;
    title?: string | undefined;
    contentTh?: string | undefined;
    contentEn?: string | undefined;
    searchableContent?: boolean | undefined;
    config?: Record<string, unknown> | undefined;
  },
  sql: Sql = createSqlClient()
) {
  const node = await requireDraftNode(admin, nodeId, sql);
  if (patch.parentId !== undefined) await assertDraftNodeParent(admin.tenantId, node.flow_version_id, patch.parentId, sql);
  if (patch.nextNodeId !== undefined) await assertNodeInVersion(admin.tenantId, node.flow_version_id, patch.nextNodeId, sql);

  const rows = await sql`
    UPDATE flowbot_nodes
    SET type = COALESCE(${patch.type ?? null}, type),
        parent_id = CASE WHEN ${patch.parentId === undefined} THEN parent_id ELSE ${patch.parentId ?? null} END,
        next_node_id = CASE WHEN ${patch.nextNodeId === undefined} THEN next_node_id ELSE ${patch.nextNodeId ?? null} END,
        sort_order = COALESCE(${patch.sortOrder ?? null}, sort_order),
        title = COALESCE(${patch.title ?? null}, title),
        content_th = COALESCE(${patch.contentTh ?? null}, content_th),
        content_en = COALESCE(${patch.contentEn ?? null}, content_en),
        searchable_content = COALESCE(${patch.searchableContent ?? null}, searchable_content),
        config = CASE WHEN ${patch.config === undefined} THEN config ELSE ${JSON.stringify(patch.config ?? {})}::jsonb END,
        updated_at = now()
    WHERE tenant_id = ${admin.tenantId}
      AND id = ${nodeId}
    RETURNING *
  `;
  return mapNode(rows[0] as NodeRow);
}

export async function createOption(
  admin: AdminUser,
  nodeId: string,
  input: { targetNodeId: string; labelTh: string; labelEn: string; sortOrder?: number | undefined },
  sql: Sql = createSqlClient()
) {
  const node = await requireDraftNode(admin, nodeId, sql);
  await assertNodeInVersion(admin.tenantId, node.flow_version_id, input.targetNodeId, sql);
  await assertOptionLimit(admin.tenantId, nodeId, sql);
  const rows = await sql`
    INSERT INTO flowbot_node_options (
      id, tenant_id, flow_version_id, node_id, target_node_id, sort_order, label_th, label_en
    )
    VALUES (
      ${randomUUID()}, ${admin.tenantId}, ${node.flow_version_id}, ${nodeId}, ${input.targetNodeId},
      ${input.sortOrder ?? 100}, ${input.labelTh}, ${input.labelEn}
    )
    RETURNING *
  `;
  return mapOption(rows[0] as OptionRow);
}

export async function updateOption(
  admin: AdminUser,
  optionId: string,
  patch: { targetNodeId?: string | undefined; labelTh?: string | undefined; labelEn?: string | undefined; sortOrder?: number | undefined },
  sql: Sql = createSqlClient()
) {
  const option = await requireDraftOption(admin, optionId, sql);
  if (patch.targetNodeId) await assertNodeInVersion(admin.tenantId, option.flow_version_id, patch.targetNodeId, sql);
  const rows = await sql`
    UPDATE flowbot_node_options
    SET target_node_id = COALESCE(${patch.targetNodeId ?? null}, target_node_id),
        label_th = COALESCE(${patch.labelTh ?? null}, label_th),
        label_en = COALESCE(${patch.labelEn ?? null}, label_en),
        sort_order = COALESCE(${patch.sortOrder ?? null}, sort_order)
    WHERE tenant_id = ${admin.tenantId}
      AND id = ${optionId}
    RETURNING *
  `;
  return mapOption(rows[0] as OptionRow);
}

export async function deleteOption(admin: AdminUser, optionId: string, sql: Sql = createSqlClient()) {
  await requireDraftOption(admin, optionId, sql);
  await sql`
    DELETE FROM flowbot_node_options
    WHERE tenant_id = ${admin.tenantId}
      AND id = ${optionId}
  `;
  return { deleted: true };
}

export async function replaceKeywords(
  admin: AdminUser,
  nodeId: string,
  keywords: { lang: "th" | "en"; keyword: string; priority?: number | undefined; substringEnabled?: boolean | undefined }[],
  sql: Sql = createSqlClient()
) {
  const node = await requireDraftNode(admin, nodeId, sql);
  await sql`
    DELETE FROM flowbot_node_keywords
    WHERE tenant_id = ${admin.tenantId}
      AND node_id = ${nodeId}
  `;
  const inserted = [];
  for (const item of keywords) {
    const rows = await sql`
      INSERT INTO flowbot_node_keywords (
        id, tenant_id, flow_version_id, node_id, lang, keyword, normalized_keyword, priority, substring_enabled
      )
      VALUES (
        ${randomUUID()}, ${admin.tenantId}, ${node.flow_version_id}, ${nodeId}, ${item.lang},
        ${item.keyword}, ${normalizeInput(item.keyword)}, ${item.priority ?? 100}, ${item.substringEnabled ?? true}
      )
      RETURNING *
    `;
    inserted.push(mapKeyword(rows[0] as KeywordRow));
  }
  return { keywords: inserted };
}

export async function getNodeReferences(admin: AdminUser, nodeId: string, sql: Sql = createSqlClient()) {
  const node = await requireDraftNode(admin, nodeId, sql);
  return getReferencesForNode(admin.tenantId, node.flow_version_id, nodeId, sql);
}

export async function deleteNode(admin: AdminUser, nodeId: string, mode: "detach" | "cascade", sql: Sql = createSqlClient()) {
  const node = await requireDraftNode(admin, nodeId, sql);
  const subtree = await getOwnedSubtree(admin.tenantId, node.flow_version_id, nodeId, sql);
  if (mode === "detach" && subtree.length > 1) {
    throw Object.assign(new Error("Node has owned descendants. Use cascade."), { statusCode: 409 });
  }

  const subtreeIds = new Set(subtree.map((item) => item.id));
  const references = await getReferencesForNode(admin.tenantId, node.flow_version_id, nodeId, sql);
  const externalOptionReferences = references.options.filter((ref: { nodeId: string }) => !subtreeIds.has(ref.nodeId));
  const externalNextReferences = references.nextNodes.filter((ref: { nodeId: string }) => !subtreeIds.has(ref.nodeId));
  const externalReferences = [...externalOptionReferences, ...externalNextReferences];
  if (externalReferences.length > 0) {
    throw Object.assign(new Error("Node has incoming references outside the owned subtree."), {
      statusCode: 409,
      details: references
    });
  }

  await sql`
    DELETE FROM flowbot_nodes
    WHERE tenant_id = ${admin.tenantId}
      AND flow_version_id = ${node.flow_version_id}
      AND id = ANY(${Array.from(subtreeIds)})
  `;
  return { deleted: true, deletedNodeIds: Array.from(subtreeIds) };
}

export async function publishBot(admin: AdminUser, botId: string, sql: Sql = createSqlClient()) {
  return withPgTransaction(async (txSql) => {
    const bot = await requireBot(admin, botId, txSql);
    const draft = await ensureDraft(admin, bot, txSql);
    const draftData = await getVersionAuthoring(admin.tenantId, draft.id, txSql);
    const validation = validateAuthoring(draftData);
    if (validation.errors.length > 0) {
      throw Object.assign(new Error("Publish validation failed."), {
        statusCode: 422,
        details: validation
      });
    }

    const versionRows = await txSql`
      SELECT COALESCE(MAX(version_no), 0)::int + 1 AS next_version_no
      FROM flowbot_flow_versions
      WHERE tenant_id = ${admin.tenantId}
        AND bot_id = ${botId}
        AND status <> 'draft'
    `;
    const versionNo = Number(versionRows[0].next_version_no);
    const publishedVersionId = randomUUID();
    const copy = buildCopiedSnapshot(draftData, publishedVersionId);
    flowSnapshotSchema.parse(copy.snapshot);

    await txSql`
      INSERT INTO flowbot_flow_versions (id, tenant_id, bot_id, status, version_no, snapshot, published_at)
      VALUES (${publishedVersionId}, ${admin.tenantId}, ${botId}, 'published', ${versionNo}, ${JSON.stringify(copy.snapshot)}, now())
    `;

    for (const node of topologicalNodes(draftData.nodes)) {
      const copiedId = copy.nodeIdMap.get(node.id)!;
      await txSql`
        INSERT INTO flowbot_nodes (
          id, tenant_id, flow_version_id, type, parent_id, next_node_id, sort_order,
          title, content_th, content_en, image_url, searchable_content, config
        )
        VALUES (
          ${copiedId}, ${admin.tenantId}, ${publishedVersionId}, ${node.type},
          ${node.parent_id ? copy.nodeIdMap.get(node.parent_id) : null},
          ${node.next_node_id ? copy.nodeIdMap.get(node.next_node_id) : null},
          ${node.sort_order}, ${node.title}, ${node.content_th}, ${node.content_en},
          ${node.image_url}, ${node.searchable_content}, ${JSON.stringify(node.config ?? {})}
        )
      `;
    }

    for (const option of draftData.options) {
      await txSql`
        INSERT INTO flowbot_node_options (
          id, tenant_id, flow_version_id, node_id, target_node_id, sort_order, label_th, label_en
        )
        VALUES (
          ${randomUUID()}, ${admin.tenantId}, ${publishedVersionId},
          ${copy.nodeIdMap.get(option.node_id)}, ${copy.nodeIdMap.get(option.target_node_id)},
          ${option.sort_order}, ${option.label_th}, ${option.label_en}
        )
      `;
    }

    for (const keyword of draftData.keywords) {
      await txSql`
        INSERT INTO flowbot_node_keywords (
          id, tenant_id, flow_version_id, node_id, lang, keyword, normalized_keyword, priority, substring_enabled
        )
        VALUES (
          ${randomUUID()}, ${admin.tenantId}, ${publishedVersionId}, ${copy.nodeIdMap.get(keyword.node_id)},
          ${keyword.lang}, ${keyword.keyword}, ${keyword.normalized_keyword}, ${keyword.priority}, ${keyword.substring_enabled}
        )
      `;
    }

    await txSql`
      UPDATE flowbot_bots
      SET published_version_id = ${publishedVersionId}, updated_at = now()
      WHERE tenant_id = ${admin.tenantId}
        AND id = ${botId}
    `;

    return {
      versionId: publishedVersionId,
      versionNo,
      warnings: validation.warnings
    };
  });
}

export async function rollbackBot(admin: AdminUser, botId: string, versionNo: number, sql: Sql = createSqlClient()) {
  const bot = await requireBot(admin, botId, sql);
  const rows = await sql`
    SELECT id, version_no
    FROM flowbot_flow_versions
    WHERE tenant_id = ${admin.tenantId}
      AND bot_id = ${bot.id}
      AND status = 'published'
      AND version_no = ${versionNo}
    LIMIT 1
  `;
  const version = rows[0] as { id: string; version_no: number } | undefined;
  if (!version) throw Object.assign(new Error("Published version not found."), { statusCode: 404 });
  await sql`
    UPDATE flowbot_bots
    SET published_version_id = ${version.id}, updated_at = now()
    WHERE tenant_id = ${admin.tenantId}
      AND id = ${bot.id}
  `;
  return { versionId: version.id, versionNo: version.version_no };
}

export async function simulateDraft(
  admin: AdminUser,
  botId: string,
  body: {
    state?: { currentNodeId?: string | null | undefined; status?: "bot" | "awaiting_admin" | "admin_active" | undefined; lang?: "th" | "en" | undefined } | undefined;
    input: EngineInput;
  },
  sql: Sql = createSqlClient()
) {
  const bot = await requireBot(admin, botId, sql);
  const draft = await ensureDraft(admin, bot, sql);
  const draftData = await getVersionAuthoring(admin.tenantId, draft.id, sql);
  const validation = validateAuthoring(draftData);
  if (validation.errors.length > 0) {
    throw Object.assign(new Error("Draft cannot be simulated."), { statusCode: 422, details: validation });
  }
  const snapshot = buildSnapshot(draftData, draft.id);
  const input = engineInputSchema.parse(body.input);
  const result = await advance(
    {
      tenantId: admin.tenantId,
      botId,
      conversation: {
        id: "00000000-0000-0000-0000-000000000000",
        flowVersionId: draft.id,
        currentNodeId: body.state?.currentNodeId ?? snapshot.rootNodeId,
        status: body.state?.status ?? "bot",
        lang: body.state?.lang ?? bot.default_lang
      },
      config: { snapshot }
    },
    input
  );
  return {
    result,
    validation,
    state: {
      flowVersionId: draft.id,
      currentNodeId: result.stateUpdates.currentNodeId ?? body.state?.currentNodeId ?? snapshot.rootNodeId,
      status: result.stateUpdates.status ?? body.state?.status ?? "bot",
      lang: result.stateUpdates.lang ?? body.state?.lang ?? bot.default_lang
    }
  };
}

async function requireBot(admin: AdminUser, botId: string, sql: Sql): Promise<BotRow> {
  const rows = await sql`
    SELECT id, tenant_id, public_key, name, default_lang, published_version_id
    FROM flowbot_bots
    WHERE tenant_id = ${admin.tenantId}
      AND id = ${botId}
    LIMIT 1
  `;
  const bot = rows[0] as BotRow | undefined;
  if (!bot) throw Object.assign(new Error("Bot not found."), { statusCode: 404 });
  return bot;
}

async function ensureDraft(admin: AdminUser, bot: BotRow, sql: Sql): Promise<FlowVersionRow> {
  const rows = await sql`
    SELECT id, tenant_id, bot_id, status, version_no, published_at, created_at
    FROM flowbot_flow_versions
    WHERE tenant_id = ${admin.tenantId}
      AND bot_id = ${bot.id}
      AND status = 'draft'
    LIMIT 1
  `;
  const existing = rows[0] as FlowVersionRow | undefined;
  if (existing) return existing;

  const draftId = randomUUID();
  await sql`
    INSERT INTO flowbot_flow_versions (id, tenant_id, bot_id, status, version_no)
    VALUES (${draftId}, ${admin.tenantId}, ${bot.id}, 'draft', 999999)
  `;
  await sql`
    INSERT INTO flowbot_nodes (id, tenant_id, flow_version_id, type, title, content_th, content_en, config)
    VALUES (
      ${randomUUID()}, ${admin.tenantId}, ${draftId}, 'options', 'Main menu',
      'สวัสดีครับ ต้องการให้ช่วยเรื่องไหน?', 'Hi, what would you like help with?', '{}'
    )
  `;
  return {
    id: draftId,
    tenant_id: admin.tenantId,
    bot_id: bot.id,
    status: "draft",
    version_no: 999999,
    published_at: null,
    created_at: new Date()
  };
}

async function getVersionAuthoring(tenantId: string, flowVersionId: string, sql: Sql) {
  const versionRows = await sql`
    SELECT id, tenant_id, bot_id, status, version_no, published_at, created_at
    FROM flowbot_flow_versions
    WHERE tenant_id = ${tenantId}
      AND id = ${flowVersionId}
    LIMIT 1
  `;
  const version = versionRows[0] as FlowVersionRow | undefined;
  if (!version) throw Object.assign(new Error("Flow version not found."), { statusCode: 404 });

  const nodes = (await sql`
    SELECT *
    FROM flowbot_nodes
    WHERE tenant_id = ${tenantId}
      AND flow_version_id = ${flowVersionId}
    ORDER BY parent_id NULLS FIRST, sort_order ASC, created_at ASC
  `) as NodeRow[];
  const options = (await sql`
    SELECT *
    FROM flowbot_node_options
    WHERE tenant_id = ${tenantId}
      AND flow_version_id = ${flowVersionId}
    ORDER BY sort_order ASC, created_at ASC
  `) as OptionRow[];
  const keywords = (await sql`
    SELECT *
    FROM flowbot_node_keywords
    WHERE tenant_id = ${tenantId}
      AND flow_version_id = ${flowVersionId}
    ORDER BY priority ASC, created_at ASC
  `) as KeywordRow[];

  return {
    version: mapVersion(version),
    nodes,
    options,
    keywords,
    tree: nodes.map(mapNode),
    optionRows: options.map(mapOption),
    keywordRows: keywords.map(mapKeyword)
  };
}

function validateAuthoring(data: Awaited<ReturnType<typeof getVersionAuthoring>>) {
  const errors: { code: string; message: string; nodeId?: string }[] = [];
  const warnings: { code: string; message: string; nodeId?: string }[] = [];
  const nodesById = new Map(data.nodes.map((node) => [node.id, node]));
  const roots = data.nodes.filter((node) => node.parent_id === null);

  if (roots.length !== 1) errors.push({ code: "root_count", message: "Flow must have exactly one root node." });
  for (const node of data.nodes) {
    if (!node.title.trim()) errors.push({ code: "missing_title", message: "Node title is required.", nodeId: node.id });
    if (!node.content_th.trim() && !node.content_en.trim()) {
      warnings.push({ code: "empty_content", message: "Node has no Thai or English content.", nodeId: node.id });
    }
    if (node.parent_id && !nodesById.has(node.parent_id)) {
      errors.push({ code: "missing_parent", message: "Node parent is missing.", nodeId: node.id });
    }
    if (node.next_node_id && !nodesById.has(node.next_node_id)) {
      errors.push({ code: "missing_next_node", message: "Next node target is missing.", nodeId: node.id });
    }
  }

  const optionsByNode = new Map<string, OptionRow[]>();
  for (const option of data.options) {
    optionsByNode.set(option.node_id, [...(optionsByNode.get(option.node_id) ?? []), option]);
    if (!nodesById.has(option.node_id) || !nodesById.has(option.target_node_id)) {
      errors.push({ code: "bad_option_target", message: "Option points to a missing node.", nodeId: option.node_id });
    }
  }
  for (const [nodeId, options] of optionsByNode) {
    if (options.length > 6) errors.push({ code: "too_many_options", message: "A node may have at most six options.", nodeId });
  }

  try {
    flowSnapshotSchema.parse(buildSnapshot(data, data.version.id));
  } catch {
    errors.push({ code: "snapshot_invalid", message: "Draft cannot be serialized into a valid snapshot." });
  }

  return { errors, warnings };
}

function buildSnapshot(data: Awaited<ReturnType<typeof getVersionAuthoring>>, flowVersionId: string): FlowSnapshot {
  const root = data.nodes.find((node) => node.parent_id === null);
  if (!root) {
    return { flowVersionId, rootNodeId: "00000000-0000-0000-0000-000000000000", nodes: {}, keywords: [] };
  }

  return {
    flowVersionId,
    rootNodeId: root.id,
    nodes: Object.fromEntries(
      data.nodes.map((node) => [
        node.id,
        {
          id: node.id,
          type: node.type as FlowSnapshot["nodes"][string]["type"],
          title: node.title,
          contentTh: node.content_th,
          contentEn: node.content_en,
          nextNodeId: node.next_node_id,
          options: data.options
            .filter((option) => option.node_id === node.id)
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((option) => ({
              id: option.id,
              labelTh: option.label_th,
              labelEn: option.label_en,
              targetNodeId: option.target_node_id
            })),
          config: node.config ?? {}
        }
      ])
    ),
    keywords: data.keywords.map((keyword, index) => ({
      nodeId: keyword.node_id,
      keyword: keyword.keyword,
      lang: keyword.lang,
      priority: keyword.priority,
      substringEnabled: keyword.substring_enabled,
      order: index
    }))
  };
}

function buildCopiedSnapshot(data: Awaited<ReturnType<typeof getVersionAuthoring>>, flowVersionId: string) {
  const nodeIdMap = new Map(data.nodes.map((node) => [node.id, randomUUID()]));
  const root = data.nodes.find((node) => node.parent_id === null);
  if (!root) throw new Error("Draft root node not found.");

  const snapshot: FlowSnapshot = {
    flowVersionId,
    rootNodeId: nodeIdMap.get(root.id)!,
    nodes: Object.fromEntries(
      data.nodes.map((node) => {
        const copiedNodeId = nodeIdMap.get(node.id)!;
        return [
          copiedNodeId,
          {
            id: copiedNodeId,
            type: node.type as FlowSnapshot["nodes"][string]["type"],
            title: node.title,
            contentTh: node.content_th,
            contentEn: node.content_en,
            nextNodeId: node.next_node_id ? nodeIdMap.get(node.next_node_id) : node.next_node_id,
            options: data.options
              .filter((option) => option.node_id === node.id)
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((option) => ({
                id: randomUUID(),
                labelTh: option.label_th,
                labelEn: option.label_en,
                targetNodeId: nodeIdMap.get(option.target_node_id)!
              })),
            config: node.config ?? {}
          }
        ];
      })
    ),
    keywords: data.keywords.map((keyword, index) => ({
      nodeId: nodeIdMap.get(keyword.node_id)!,
      keyword: keyword.keyword,
      lang: keyword.lang,
      priority: keyword.priority,
      substringEnabled: keyword.substring_enabled,
      order: index
    }))
  };

  return { snapshot, nodeIdMap };
}

function topologicalNodes(nodes: NodeRow[]): NodeRow[] {
  const pending = new Map(nodes.map((node) => [node.id, node]));
  const emitted = new Set<string>();
  const ordered: NodeRow[] = [];

  while (pending.size > 0) {
    const ready = [...pending.values()].filter((node) => !node.parent_id || emitted.has(node.parent_id));
    if (ready.length === 0) throw new Error("Node ownership tree contains a cycle or missing parent.");
    ready.sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
    for (const node of ready) {
      ordered.push(node);
      emitted.add(node.id);
      pending.delete(node.id);
    }
  }

  return ordered;
}

async function requireDraftNode(admin: AdminUser, nodeId: string, sql: Sql): Promise<NodeRow> {
  const rows = await sql`
    SELECT n.*
    FROM flowbot_nodes n
    JOIN flowbot_flow_versions fv ON fv.tenant_id = n.tenant_id AND fv.id = n.flow_version_id
    WHERE n.tenant_id = ${admin.tenantId}
      AND n.id = ${nodeId}
      AND fv.status = 'draft'
    LIMIT 1
  `;
  const node = rows[0] as NodeRow | undefined;
  if (!node) throw Object.assign(new Error("Draft node not found."), { statusCode: 404 });
  return node;
}

async function requireDraftOption(admin: AdminUser, optionId: string, sql: Sql): Promise<OptionRow> {
  const rows = await sql`
    SELECT o.*
    FROM flowbot_node_options o
    JOIN flowbot_flow_versions fv ON fv.tenant_id = o.tenant_id AND fv.id = o.flow_version_id
    WHERE o.tenant_id = ${admin.tenantId}
      AND o.id = ${optionId}
      AND fv.status = 'draft'
    LIMIT 1
  `;
  const option = rows[0] as OptionRow | undefined;
  if (!option) throw Object.assign(new Error("Draft option not found."), { statusCode: 404 });
  return option;
}

async function assertDraftNodeParent(tenantId: string, flowVersionId: string, parentId: string | null, sql: Sql) {
  if (!parentId) return;
  await assertNodeInVersion(tenantId, flowVersionId, parentId, sql);
}

async function assertNodeInVersion(tenantId: string, flowVersionId: string, nodeId: string | null | undefined, sql: Sql) {
  if (!nodeId) return;
  const rows = await sql`
    SELECT id
    FROM flowbot_nodes
    WHERE tenant_id = ${tenantId}
      AND flow_version_id = ${flowVersionId}
      AND id = ${nodeId}
    LIMIT 1
  `;
  if (!rows[0]) throw Object.assign(new Error("Target node not found in this draft."), { statusCode: 422 });
}

async function assertOptionLimit(tenantId: string, nodeId: string, sql: Sql) {
  const rows = await sql`
    SELECT count(*)::int AS count
    FROM flowbot_node_options
    WHERE tenant_id = ${tenantId}
      AND node_id = ${nodeId}
  `;
  if (rows[0].count >= 6) throw Object.assign(new Error("A node may have at most six options."), { statusCode: 422 });
}

async function getReferencesForNode(tenantId: string, flowVersionId: string, nodeId: string, sql: Sql) {
  const options = await sql`
    SELECT id, node_id AS "nodeId", target_node_id AS "targetNodeId", label_th AS "labelTh", label_en AS "labelEn"
    FROM flowbot_node_options
    WHERE tenant_id = ${tenantId}
      AND flow_version_id = ${flowVersionId}
      AND target_node_id = ${nodeId}
  `;
  const nextNodes = await sql`
    SELECT id, id AS "nodeId", next_node_id AS "targetNodeId", title
    FROM flowbot_nodes
    WHERE tenant_id = ${tenantId}
      AND flow_version_id = ${flowVersionId}
      AND next_node_id = ${nodeId}
  `;
  return { options, nextNodes };
}

async function getOwnedSubtree(tenantId: string, flowVersionId: string, rootNodeId: string, sql: Sql): Promise<NodeRow[]> {
  const rows = await sql`
    WITH RECURSIVE subtree AS (
      SELECT *
      FROM flowbot_nodes
      WHERE tenant_id = ${tenantId}
        AND flow_version_id = ${flowVersionId}
        AND id = ${rootNodeId}
      UNION ALL
      SELECT n.*
      FROM flowbot_nodes n
      JOIN subtree s ON s.tenant_id = n.tenant_id
        AND s.flow_version_id = n.flow_version_id
        AND s.id = n.parent_id
    )
    SELECT *
    FROM subtree
  `;
  return rows as NodeRow[];
}

async function withPgTransaction<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  const client = await getPgPool().connect();
  const sql = createTxSql(client);
  try {
    await client.query("BEGIN");
    const result = await fn(sql);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function createTxSql(client: PoolClient): Sql {
  return async (strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = "";
    for (let index = 0; index < strings.length; index += 1) {
      text += strings[index];
      if (index < values.length) text += `$${index + 1}`;
    }
    const result = await client.query(text, values);
    return result.rows;
  };
}

function getPgPool(): Pool {
  if (!pgPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is required.");
    pgPool = new Pool({ connectionString });
  }
  return pgPool;
}

function mapVersion(row: FlowVersionRow) {
  return {
    id: row.id,
    botId: row.bot_id,
    status: row.status,
    versionNo: row.version_no,
    publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString()
  };
}

function mapNode(row: NodeRow) {
  return {
    id: row.id,
    flowVersionId: row.flow_version_id,
    type: row.type,
    parentId: row.parent_id,
    nextNodeId: row.next_node_id,
    sortOrder: row.sort_order,
    title: row.title,
    contentTh: row.content_th,
    contentEn: row.content_en,
    imageUrl: row.image_url,
    searchableContent: row.searchable_content,
    config: row.config
  };
}

function mapOption(row: OptionRow) {
  return {
    id: row.id,
    flowVersionId: row.flow_version_id,
    nodeId: row.node_id,
    targetNodeId: row.target_node_id,
    sortOrder: row.sort_order,
    labelTh: row.label_th,
    labelEn: row.label_en
  };
}

function mapKeyword(row: KeywordRow) {
  return {
    id: row.id,
    flowVersionId: row.flow_version_id,
    nodeId: row.node_id,
    lang: row.lang,
    keyword: row.keyword,
    normalizedKeyword: row.normalized_keyword,
    priority: row.priority,
    substringEnabled: row.substring_enabled
  };
}
