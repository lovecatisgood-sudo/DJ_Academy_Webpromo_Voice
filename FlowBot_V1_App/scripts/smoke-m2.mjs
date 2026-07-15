import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";

const baseUrl = process.env.FLOWBOT_BASE_URL ?? "http://127.0.0.1:3025";
const botKey = process.env.FLOWBOT_BOT_KEY ?? "flowbot_test_web";
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
}

async function waitForStreamMessage(streamToken, lastEventId, predicate) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("Timed out waiting for stream message.")), 3000);

  try {
    const response = await fetch(`${baseUrl}/api/w/${botKey}/stream?token=${encodeURIComponent(streamToken)}`, {
      signal: controller.signal,
      headers: { "last-event-id": lastEventId }
    });
    if (!response.ok || !response.body) throw new Error(`Stream failed ${response.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const eventBlock of events) {
        const eventLine = eventBlock.split("\n").find((line) => line.startsWith("event: "));
        const dataLine = eventBlock.split("\n").find((line) => line.startsWith("data: "));
        if (eventLine?.includes("message") && dataLine) {
          const message = JSON.parse(dataLine.slice("data: ".length));
          if (predicate(message)) return message;
        }
      }
    }
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }

  throw new Error("Stream ended before expected message arrived.");
}

function optionByLabel(message, text) {
  const options = message?.content?.options ?? [];
  const option = options.find((candidate) => String(candidate.label).toLowerCase().includes(text));
  if (!option) throw new Error(`Missing option containing "${text}".`);
  return option;
}

const config = await request(`/api/w/${botKey}/config`);
if (!config.json.hasPublishedFlow) throw new Error("Expected published flow.");

const session = await request(`/api/w/${botKey}/session`, {
  method: "POST",
  body: JSON.stringify({ lang: "en" })
});

const root = session.json.messages[0];
if (root?.type !== "options") throw new Error("Expected root options message.");

const serviceOption = optionByLabel(root, "service");
await request(`/api/w/${botKey}/message`, {
  method: "POST",
  body: JSON.stringify({
    sessionToken: session.json.sessionToken,
    inputId: randomUUID(),
    lang: "en",
    input: { type: "option", payload: { optionId: serviceOption.id } }
  })
});

const handoffInputId = randomUUID();
const handoffPayload = {
  sessionToken: session.json.sessionToken,
  inputId: handoffInputId,
  lang: "en",
  input: { type: "text", payload: { text: "Can you integrate this with a custom ERP?" } }
};
const [handoff, duplicateHandoff] = await Promise.all([
  request(`/api/w/${botKey}/message`, {
    method: "POST",
    body: JSON.stringify(handoffPayload)
  }),
  request(`/api/w/${botKey}/message`, {
    method: "POST",
    body: JSON.stringify(handoffPayload)
  })
]);
if (handoff.json.state.status !== "awaiting_admin") throw new Error("Expected awaiting_admin after unmatched text.");
if (duplicateHandoff.json.messages.length !== handoff.json.messages.length) {
  throw new Error("Expected idempotent duplicate handoff response.");
}
if (!handoff.json.messages.some((message) => message.type === "cta" && message.content?.kind === "contact_channels")) {
  throw new Error("Expected fallback contact-channel CTA.");
}

const handoffCounts = await sql`
  SELECT
    (SELECT count(*)::int FROM flowbot_notification_outbox WHERE conversation_id = ${session.json.conversationId}) AS outbox_count,
    (SELECT count(*)::int FROM flowbot_processed_inputs WHERE conversation_id = ${session.json.conversationId} AND input_id = ${handoffInputId}) AS processed_count,
    (SELECT count(*)::int FROM flowbot_messages WHERE conversation_id = ${session.json.conversationId} AND client_request_id = ${handoffInputId}) AS visitor_count
  FROM flowbot_notification_outbox
  LIMIT 1
`;
if (handoffCounts[0].outbox_count !== 1) throw new Error("Expected one deduped handoff outbox row.");
if (handoffCounts[0].processed_count !== 1) throw new Error("Expected one processed input row for concurrent retry.");
if (handoffCounts[0].visitor_count !== 1) throw new Error("Expected one visitor message row for concurrent retry.");

const streamToken = await request(`/api/w/${botKey}/stream-token`, {
  method: "POST",
  body: JSON.stringify({ sessionToken: session.json.sessionToken })
});
if (!streamToken.json.streamToken) throw new Error("Expected stream token.");
await expectStatus(`/api/w/${botKey}/stream?token=invalid`, {}, 401);
const liveReplyPromise = waitForStreamMessage(
  streamToken.json.streamToken,
  handoff.json.lastSequence,
  (message) => message.sender === "admin"
);

const login = await request("/api/admin/auth/login", {
  method: "POST",
  body: JSON.stringify({ email: process.env.OWNER_EMAIL, password: process.env.OWNER_PASSWORD })
});
const cookie = login.response.headers.get("set-cookie")?.split(";")[0];
if (!cookie) throw new Error("Expected admin session cookie.");

await request(`/api/admin/conversations/${session.json.conversationId}/takeover`, {
  method: "POST",
  headers: { cookie },
  body: "{}"
});

await expectStatus(
  `/api/w/${botKey}/message`,
  {
    method: "POST",
    body: JSON.stringify({
      sessionToken: session.json.sessionToken,
      inputId: randomUUID(),
      lang: "en",
      input: { type: "option", payload: { optionId: serviceOption.id } }
    })
  },
  409
);

const reply = await request(`/api/admin/conversations/${session.json.conversationId}/reply`, {
  method: "POST",
  headers: { cookie },
  body: JSON.stringify({ idempotencyKey: randomUUID(), text: "Yes, we can review that with you." })
});
if (reply.json.message.sender !== "admin") throw new Error("Expected admin reply message.");
const liveReply = await liveReplyPromise;
if (liveReply.id !== reply.json.message.id) throw new Error("Expected admin reply to arrive live through SSE.");

const replayedReply = await waitForStreamMessage(
  streamToken.json.streamToken,
  handoff.json.lastSequence,
  (message) => message.id === reply.json.message.id
);
if (replayedReply.id !== reply.json.message.id) throw new Error("Expected DB replay of missed admin reply.");

const release = await request(`/api/admin/conversations/${session.json.conversationId}/release`, {
  method: "POST",
  headers: { cookie },
  body: "{}"
});
if (release.json.state.status !== "bot") throw new Error("Expected bot status after release.");
if (release.json.state.flowVersionId !== session.json.state.flowVersionId) {
  throw new Error("Expected release to keep the original pinned flow version.");
}

const thaiSession = await request(`/api/w/${botKey}/session`, {
  method: "POST",
  body: JSON.stringify({ lang: "th" })
});
const thaiHandoff = await request(`/api/w/${botKey}/message`, {
  method: "POST",
  body: JSON.stringify({
    sessionToken: thaiSession.json.sessionToken,
    inputId: randomUUID(),
    lang: "th",
    input: { type: "text", payload: { text: "อยากถามเรื่องระบบหลังบ้าน" } }
  })
});
if (thaiHandoff.json.state.status !== "awaiting_admin") throw new Error("Expected Thai unmatched text to hand off.");

const leadSession = await request(`/api/w/${botKey}/session`, {
  method: "POST",
  body: JSON.stringify({ lang: "en" })
});
const leadOption = optionByLabel(leadSession.json.messages[0], "contact");
const leadNode = leadOption.targetNodeId;
await request(`/api/w/${botKey}/message`, {
  method: "POST",
  body: JSON.stringify({
    sessionToken: leadSession.json.sessionToken,
    inputId: randomUUID(),
    lang: "en",
    input: { type: "option", payload: { optionId: leadOption.id } }
  })
});
const leadInputId = randomUUID();
const lead = await request(`/api/w/${botKey}/message`, {
  method: "POST",
  body: JSON.stringify({
    sessionToken: leadSession.json.sessionToken,
    inputId: leadInputId,
    lang: "en",
    input: {
      type: "form",
      payload: {
        nodeId: leadNode,
        data: { name: "Smoke Test", phone: "+66000000000", email: "smoke@example.com" }
      }
    }
  })
});
if (!lead.json.lead?.id) throw new Error("Expected lead creation.");

const duplicateLead = await request(`/api/w/${botKey}/message`, {
  method: "POST",
  body: JSON.stringify({
    sessionToken: leadSession.json.sessionToken,
    inputId: leadInputId,
    lang: "en",
    input: {
      type: "form",
      payload: {
        nodeId: leadNode,
        data: { name: "Smoke Test", phone: "+66000000000", email: "smoke@example.com" }
      }
    }
  })
});
if (duplicateLead.json.lead.id !== lead.json.lead.id) throw new Error("Expected idempotent duplicate lead response.");

const rawTokenRows = await sql`
  SELECT count(*)::int AS count
  FROM flowbot_conversations
  WHERE id = ${session.json.conversationId}
    AND encode(session_token_hash, 'hex') = ${session.json.sessionToken}
`;
if (rawTokenRows[0].count !== 0) throw new Error("Raw session token appears to be stored.");

const faultSession = await request(`/api/w/${botKey}/session`, {
  method: "POST",
  body: JSON.stringify({ lang: "en" })
});
const faultInputId = randomUUID();
await expectStatus(
  `/api/w/${botKey}/message`,
  {
    method: "POST",
    headers: { "x-flowbot-test-fault": "after-visitor-message" },
    body: JSON.stringify({
      sessionToken: faultSession.json.sessionToken,
      inputId: faultInputId,
      lang: "en",
      input: { type: "text", payload: { text: "Force rollback after visitor insert" } }
    })
  },
  500
);
const rollbackRows = await sql`
  SELECT
    (SELECT count(*)::int FROM flowbot_messages WHERE conversation_id = ${faultSession.json.conversationId} AND client_request_id = ${faultInputId}) AS message_count,
    (SELECT count(*)::int FROM flowbot_processed_inputs WHERE conversation_id = ${faultSession.json.conversationId} AND input_id = ${faultInputId}) AS processed_count
`;
if (rollbackRows[0].message_count !== 0 || rollbackRows[0].processed_count !== 0) {
  throw new Error("Injected DB failure left partial message or processed input rows.");
}

const activeVersion = await sql`
  SELECT b.tenant_id, b.id AS bot_id, b.published_version_id, fv.snapshot, max(all_versions.version_no)::int + 1 AS next_version_no
  FROM flowbot_bots b
  JOIN flowbot_flow_versions fv ON fv.tenant_id = b.tenant_id AND fv.id = b.published_version_id
  JOIN flowbot_flow_versions all_versions ON all_versions.tenant_id = b.tenant_id AND all_versions.bot_id = b.id
  WHERE b.public_key = ${botKey}
  GROUP BY b.tenant_id, b.id, b.published_version_id, fv.snapshot
  LIMIT 1
`;
const nextVersionId = randomUUID();
const previousSnapshot = activeVersion[0].snapshot;
const nodeIdMap = Object.fromEntries(Object.keys(previousSnapshot.nodes).map((nodeId) => [nodeId, randomUUID()]));
const snapshot = {
  ...previousSnapshot,
  flowVersionId: nextVersionId,
  rootNodeId: nodeIdMap[previousSnapshot.rootNodeId],
  nodes: Object.fromEntries(
    Object.values(previousSnapshot.nodes).map((node) => {
      const copiedNode = {
        ...node,
        id: nodeIdMap[node.id],
        nextNodeId: node.nextNodeId ? nodeIdMap[node.nextNodeId] : node.nextNodeId,
        options: (node.options ?? []).map((option) => ({
          ...option,
          id: randomUUID(),
          targetNodeId: nodeIdMap[option.targetNodeId]
        }))
      };
      return [copiedNode.id, copiedNode];
    })
  )
};
await sql`
  INSERT INTO flowbot_flow_versions (id, tenant_id, bot_id, status, version_no, snapshot, published_at)
  VALUES (
    ${nextVersionId},
    ${activeVersion[0].tenant_id},
    ${activeVersion[0].bot_id},
    'published',
    ${activeVersion[0].next_version_no},
    ${JSON.stringify(snapshot)},
    now()
  )
`;
const copiedNodes = Object.values(snapshot.nodes);
for (const node of [
  snapshot.nodes[snapshot.rootNodeId],
  ...copiedNodes.filter((node) => node.id !== snapshot.rootNodeId)
]) {
  await sql`
    INSERT INTO flowbot_nodes (id, tenant_id, flow_version_id, type, parent_id, title, content_th, content_en, config)
    VALUES (
      ${node.id},
      ${activeVersion[0].tenant_id},
      ${nextVersionId},
      ${node.type},
      ${node.id === snapshot.rootNodeId ? null : snapshot.rootNodeId},
      ${node.title},
      ${node.contentTh},
      ${node.contentEn},
      ${JSON.stringify(node.config ?? {})}
    )
    ON CONFLICT DO NOTHING
  `;
}
const rootNode = snapshot.nodes[snapshot.rootNodeId];
for (const [index, option] of rootNode.options.entries()) {
  await sql`
    INSERT INTO flowbot_node_options (
      id, tenant_id, flow_version_id, node_id, target_node_id, sort_order, label_th, label_en
    )
    VALUES (
      ${randomUUID()},
      ${activeVersion[0].tenant_id},
      ${nextVersionId},
      ${rootNode.id},
      ${option.targetNodeId},
      ${index + 1},
      ${option.labelTh},
      ${option.labelEn}
    )
    ON CONFLICT DO NOTHING
  `;
}
await sql`
  UPDATE flowbot_bots
  SET published_version_id = ${nextVersionId}, updated_at = now()
  WHERE tenant_id = ${activeVersion[0].tenant_id}
    AND id = ${activeVersion[0].bot_id}
`;
const oldSessionSync = await request(`/api/w/${botKey}/sync`, {
  method: "POST",
  body: JSON.stringify({ sessionToken: session.json.sessionToken, afterSequence: "0" })
});
if (oldSessionSync.json.state.flowVersionId !== session.json.state.flowVersionId) {
  throw new Error("Existing session did not keep its pinned flow version after publish.");
}
const newVersionSession = await request(`/api/w/${botKey}/session`, {
  method: "POST",
  body: JSON.stringify({ lang: "en" })
});
if (newVersionSession.json.state.flowVersionId !== nextVersionId) {
  throw new Error("New session did not pin to latest published flow version.");
}

console.log(
  JSON.stringify(
    {
      ok: true,
      config: "ok",
      handoffConversationId: session.json.conversationId,
      handoffStatus: handoff.json.state.status,
      outboxRows: handoffCounts[0].outbox_count,
      streamedAdminReply: true,
      replayedAdminReply: true,
      adminReplySequence: reply.json.message.sequence,
      releaseStatus: release.json.state.status,
      leadId: lead.json.lead.id,
      rollbackVerified: true,
      versionPinning: true
    },
    null,
    2
  )
);
