import { neon } from "@neondatabase/serverless";
import { readEnv } from "./env-utils.mjs";

const baseUrl = (process.env.BASE_URL || "https://djbot.djai.academy").replace(/\/$/, "");
const expectedBuild = process.env.EXPECTED_BUILD || "agent-widget-v2-openai-text-chat-2026-07-13";
const allowedOrigin = process.env.SMOKE_ORIGIN || "https://djbot.djai.academy";
const blockedOrigin = process.env.BLOCKED_ORIGIN || "https://blocked.example";
const databaseUrl = readEnv("DATABASE_URL");
const temporaryConversationIds = new Set();

function fail(message) {
  throw new Error(message);
}

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.headers || {}),
    },
  });
}

async function jsonResponse(path, expectedStatus, options = {}) {
  const response = await request(path, options);
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (response.status !== expectedStatus) {
    fail(`${options.method || "GET"} ${path} expected ${expectedStatus}, got ${response.status}: ${typeof body === "string" ? body.slice(0, 300) : JSON.stringify(body)}`);
  }

  return { response, body };
}

function rememberConversation(body) {
  if (body && typeof body === "object" && typeof body.conversationId === "string") {
    temporaryConversationIds.add(body.conversationId);
  }
}

async function cleanupTemporaryRows() {
  if (!databaseUrl || temporaryConversationIds.size === 0) {
    return;
  }

  const sql = neon(databaseUrl);
  for (const id of temporaryConversationIds) {
    await sql`delete from conversation_messages where conversation_id = ${id}`;
    await sql`delete from leads where conversation_id = ${id}`;
    await sql`delete from conversations where id = ${id}`;
  }
}

try {
  const { response: healthResponse, body: health } = await jsonResponse("/api/health", 200);
  const healthBuild = healthResponse.headers.get("x-djai-build") || health.buildVersion;

  if (!health.ok) {
    fail("/api/health did not return ok=true");
  }

  if (healthBuild !== expectedBuild) {
    fail(`/api/health build mismatch. Expected ${expectedBuild}, got ${healthBuild || "missing"}`);
  }

  const chatPreflight = await request("/api/chat/session", {
    method: "OPTIONS",
    headers: {
      Origin: allowedOrigin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "Content-Type",
    },
  });

  if (chatPreflight.status !== 204) {
    fail(`/api/chat/session OPTIONS expected 204, got ${chatPreflight.status}`);
  }

  if (!chatPreflight.headers.get("access-control-allow-origin")) {
    fail("/api/chat/session preflight did not include access-control-allow-origin");
  }

  const blocked = await jsonResponse("/api/chat/session", 403, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: blockedOrigin,
    },
    body: JSON.stringify({
      pageUrl: `${baseUrl}/phase11-blocked-origin`,
      preferredLanguage: "en",
    }),
  });

  if (!JSON.stringify(blocked.body).includes("Origin")) {
    fail("Blocked-origin response did not mention origin rejection.");
  }

  const chatSession = await jsonResponse("/api/chat/session", 200, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pageUrl: `${baseUrl}/phase11-chat-session`,
      preferredLanguage: "en",
    }),
  });
  rememberConversation(chatSession.body);

  if (!chatSession.body.ok || !chatSession.body.sessionContext || !chatSession.body.conversationId) {
    fail("/api/chat/session did not return a usable text chat session.");
  }

  const voiceSession = await jsonResponse("/api/session", 200, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pageUrl: `${baseUrl}/phase11-voice-session`,
      preferredLanguage: "en",
    }),
  });
  rememberConversation(voiceSession.body);

  const voiceBuild = voiceSession.response.headers.get("x-djai-build") || voiceSession.body.buildVersion;
  if (voiceBuild !== expectedBuild) {
    fail(`/api/session build mismatch. Expected ${expectedBuild}, got ${voiceBuild || "missing"}`);
  }

  if (!voiceSession.body.conversationId || !voiceSession.body.sessionContext) {
    fail("/api/session did not return a usable voice session.");
  }

  console.log(`Phase 11 production API acceptance passed for ${baseUrl} (${expectedBuild}).`);
} finally {
  await cleanupTemporaryRows();
}
