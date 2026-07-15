import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";

const baseUrl = process.env.FLOWBOT_BASE_URL ?? "http://127.0.0.1:3025";
const databaseUrl = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;

if (!process.env.OWNER_EMAIL) throw new Error("OWNER_EMAIL is required.");
if (!process.env.OWNER_PASSWORD) throw new Error("OWNER_PASSWORD is required.");
if (!databaseUrl) throw new Error("DATABASE_URL_DIRECT or DATABASE_URL is required.");

const sql = neon(databaseUrl);

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {})
    }
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} failed ${response.status}: ${text}`);
  }
  return { response, json };
}

async function expectStatus(path, init, expectedStatus) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {})
    }
  });
  if (response.status !== expectedStatus) {
    throw new Error(`Expected ${expectedStatus} from ${path}, got ${response.status}: ${await response.text()}`);
  }
  return response;
}

const login = await request("/api/admin/auth/login", {
  method: "POST",
  body: JSON.stringify({ email: process.env.OWNER_EMAIL, password: process.env.OWNER_PASSWORD })
});
const cookie = login.response.headers.get("set-cookie")?.split(";")[0];
if (!cookie) throw new Error("Expected admin session cookie.");

const bots = await request("/api/admin/bots", { headers: { cookie } });
const bot = bots.json.bots[0];
if (!bot?.id || !bot.publishedVersionId) throw new Error("Expected seeded bot.");

const draft = await request(`/api/admin/bots/${bot.id}/draft`, { headers: { cookie } });
const root = draft.json.tree.find((node) => node.parentId === null);
if (!root) throw new Error("Expected draft root node.");

const smokeToken = randomUUID().slice(0, 8);
const branch = await request(`/api/admin/bots/${bot.id}/draft`, {
  method: "POST",
  headers: { cookie },
  body: JSON.stringify({
    type: "options",
    parentId: root.id,
    title: `Smoke branch ${smokeToken}`,
    contentTh: "เลือกตัวเลือกทดสอบ",
    contentEn: "Choose a smoke-test option",
    sortOrder: 900
  })
});
const branchNode = branch.json.node;

const target = await request(`/api/admin/bots/${bot.id}/draft`, {
  method: "POST",
  headers: { cookie },
  body: JSON.stringify({
    type: "message",
    parentId: branchNode.id,
    title: `Smoke target ${smokeToken}`,
    contentTh: "ข้อความปลายทางทดสอบ",
    contentEn: "Smoke-test target message",
    sortOrder: 901
  })
});
const targetNode = target.json.node;

const option = await request(`/api/admin/nodes/${branchNode.id}/options`, {
  method: "POST",
  headers: { cookie },
  body: JSON.stringify({
    targetNodeId: targetNode.id,
    labelTh: "ไปต่อ",
    labelEn: "Continue",
    sortOrder: 1
  })
});
const branchOption = option.json.option;

await request(`/api/admin/options/${branchOption.id}`, {
  method: "PATCH",
  headers: { cookie },
  body: JSON.stringify({ labelEn: "Continue now" })
});

await request(`/api/admin/nodes/${branchNode.id}/keywords`, {
  method: "PUT",
  headers: { cookie },
  body: JSON.stringify({
    keywords: [
      { lang: "en", keyword: `smoke ${smokeToken}`, priority: 5, substringEnabled: true },
      { lang: "th", keyword: `ทดสอบ${smokeToken}`, priority: 5, substringEnabled: true }
    ]
  })
});

const references = await request(`/api/admin/nodes/${targetNode.id}/references`, { headers: { cookie } });
if (!references.json.options.some((item) => item.nodeId === branchNode.id)) {
  throw new Error("Expected incoming option reference to target node.");
}

await expectStatus(
  `/api/admin/nodes/${targetNode.id}?mode=cascade`,
  { method: "DELETE", headers: { cookie } },
  409
);

const simulation = await request(`/api/admin/bots/${bot.id}/simulate`, {
  method: "POST",
  headers: { cookie },
  body: JSON.stringify({
    state: { currentNodeId: branchNode.id, status: "bot", lang: "en" },
    input: { type: "option", payload: { optionId: branchOption.id } }
  })
});
if (!simulation.json.result.messages.some((message) => message.content?.text === "Smoke-test target message")) {
  throw new Error("Expected draft simulator to advance to target node.");
}

const beforePublish = await request(`/api/admin/bots/${bot.id}/versions`, { headers: { cookie } });
const previousPublished = beforePublish.json.versions.find((version) => version.id === bot.publishedVersionId);
if (!previousPublished) throw new Error("Expected previous published version.");

const publish = await request(`/api/admin/bots/${bot.id}/publish`, {
  method: "POST",
  headers: { cookie },
  body: "{}"
});
if (!publish.json.versionId || !publish.json.versionNo) throw new Error("Expected publish response.");

const publishedSnapshotRows = await sql`
  SELECT snapshot
  FROM flowbot_flow_versions
  WHERE id = ${publish.json.versionId}
  LIMIT 1
`;
const publishedSnapshot = publishedSnapshotRows[0]?.snapshot;
if (!publishedSnapshot?.nodes || !Object.values(publishedSnapshot.nodes).some((node) => node.contentEn === "Smoke-test target message")) {
  throw new Error("Published snapshot missing smoke target.");
}

await request(`/api/admin/nodes/${targetNode.id}`, {
  method: "PATCH",
  headers: { cookie },
  body: JSON.stringify({ contentEn: "Draft changed after publish" })
});
const afterMutationRows = await sql`
  SELECT snapshot
  FROM flowbot_flow_versions
  WHERE id = ${publish.json.versionId}
  LIMIT 1
`;
if (JSON.stringify(afterMutationRows[0].snapshot) !== JSON.stringify(publishedSnapshot)) {
  throw new Error("Published snapshot changed after draft mutation.");
}

const rollback = await request(`/api/admin/bots/${bot.id}/rollback`, {
  method: "POST",
  headers: { cookie },
  body: JSON.stringify({ versionNo: previousPublished.versionNo })
});
if (rollback.json.versionNo !== previousPublished.versionNo) throw new Error("Rollback did not select previous version.");

await request(`/api/admin/options/${branchOption.id}`, {
  method: "DELETE",
  headers: { cookie }
});
const deleteResult = await request(`/api/admin/nodes/${branchNode.id}?mode=cascade`, {
  method: "DELETE",
  headers: { cookie }
});
if (!deleteResult.json.deletedNodeIds.includes(branchNode.id) || !deleteResult.json.deletedNodeIds.includes(targetNode.id)) {
  throw new Error("Cascade delete did not remove owned branch and target.");
}

const finalDraft = await request(`/api/admin/bots/${bot.id}/draft`, { headers: { cookie } });
if (finalDraft.json.tree.some((node) => node.id === branchNode.id || node.id === targetNode.id)) {
  throw new Error("Deleted draft nodes still appear in draft.");
}

console.log(
  JSON.stringify(
    {
      ok: true,
      botId: bot.id,
      createdNodes: 2,
      publishVersionNo: publish.json.versionNo,
      rollbackVersionNo: rollback.json.versionNo,
      simulator: "ok",
      references: "ok",
      immutablePublish: "ok",
      cascadeDelete: "ok"
    },
    null,
    2
  )
);
