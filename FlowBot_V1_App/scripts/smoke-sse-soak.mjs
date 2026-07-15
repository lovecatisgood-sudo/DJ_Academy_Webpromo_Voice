import { randomUUID } from "node:crypto";

const baseUrl = process.env.FLOWBOT_BASE_URL ?? "http://127.0.0.1:3025";
const botKey = process.env.FLOWBOT_BOT_KEY ?? "flowbot_test_web";
const concurrency = Number(process.env.FLOWBOT_SSE_SOAK_CONCURRENCY ?? "4");
const timeoutMs = Number(process.env.FLOWBOT_SSE_SOAK_TIMEOUT_MS ?? "5000");
const useUniqueClientIps = process.env.FLOWBOT_SSE_SOAK_UNIQUE_IPS === "1";

if (!process.env.OWNER_EMAIL) throw new Error("OWNER_EMAIL is required.");
if (!process.env.OWNER_PASSWORD) throw new Error("OWNER_PASSWORD is required.");
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 100) {
  throw new Error("FLOWBOT_SSE_SOAK_CONCURRENCY must be an integer from 1 to 100.");
}
if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) {
  throw new Error("FLOWBOT_SSE_SOAK_TIMEOUT_MS must be an integer from 1000 to 120000.");
}
if (concurrency > 5 && !useUniqueClientIps) {
  throw new Error(
    "FLOWBOT_SSE_SOAK_CONCURRENCY above 5 requires FLOWBOT_SSE_SOAK_UNIQUE_IPS=1 so the test models separate visitors without weakening runtime rate limits."
  );
}

function clientHeaders(index) {
  if (!useUniqueClientIps) return {};
  return { "x-forwarded-for": `198.51.100.${(index % 250) + 1}` };
}

async function request(path, init = {}, clientIndex) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(clientIndex === undefined ? {} : clientHeaders(clientIndex)),
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

async function openStream(streamToken, lastEventId, predicate, clientIndex) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("Timed out waiting for SSE message.")), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/api/w/${botKey}/stream?token=${encodeURIComponent(streamToken)}`, {
      signal: controller.signal,
      headers: { "last-event-id": lastEventId, ...clientHeaders(clientIndex) }
    });
    if (!response.ok || !response.body) throw new Error(`Stream failed ${response.status}: ${await response.text()}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        const lines = block.split("\n");
        const event = lines.find((line) => line.startsWith("event: "))?.slice("event: ".length);
        const data = lines.find((line) => line.startsWith("data: "))?.slice("data: ".length);
        if (event !== "message" || !data) continue;
        const message = JSON.parse(data);
        if (predicate(message)) return message;
      }
    }
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }

  throw new Error("SSE stream ended before the expected message arrived.");
}

function optionByLabel(message, text) {
  const option = (message?.content?.options ?? []).find((candidate) =>
    String(candidate.label).toLowerCase().includes(text)
  );
  if (!option) throw new Error(`Missing option containing "${text}".`);
  return option;
}

const login = await request("/api/admin/auth/login", {
  method: "POST",
  body: JSON.stringify({ email: process.env.OWNER_EMAIL, password: process.env.OWNER_PASSWORD })
});
const cookie = login.response.headers.get("set-cookie")?.split(";")[0];
if (!cookie) throw new Error("Expected admin session cookie.");

async function prepareConversation(index) {
  const session = await request(
    `/api/w/${botKey}/session`,
    {
      method: "POST",
      body: JSON.stringify({ lang: "en" })
    },
    index
  );
  const root = session.json.messages[0];
  const serviceOption = optionByLabel(root, "service");

  await request(
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
    index
  );

  const handoff = await request(
    `/api/w/${botKey}/message`,
    {
      method: "POST",
      body: JSON.stringify({
        sessionToken: session.json.sessionToken,
        inputId: randomUUID(),
        lang: "en",
        input: { type: "text", payload: { text: `SSE soak handoff ${index}: I need a custom integration.` } }
      })
    },
    index
  );
  if (handoff.json.state.status !== "awaiting_admin") throw new Error("Expected awaiting_admin before stream open.");

  const streamToken = await request(
    `/api/w/${botKey}/stream-token`,
    {
      method: "POST",
      body: JSON.stringify({ sessionToken: session.json.sessionToken })
    },
    index
  );

  await request(`/api/admin/conversations/${session.json.conversationId}/takeover`, {
    method: "POST",
    headers: { cookie },
    body: "{}"
  });

  return {
    clientIndex: index,
    conversationId: session.json.conversationId,
    streamToken: streamToken.json.streamToken,
    lastSequence: handoff.json.lastSequence
  };
}

const conversations = [];
for (let index = 0; index < concurrency; index += 1) {
  conversations.push(await prepareConversation(index + 1));
}

const waiters = conversations.map((conversation) =>
  openStream(
    conversation.streamToken,
    conversation.lastSequence,
    (message) => message.sender === "admin",
    conversation.clientIndex
  )
);

const replies = [];
for (const [index, conversation] of conversations.entries()) {
  const reply = await request(`/api/admin/conversations/${conversation.conversationId}/reply`, {
    method: "POST",
    headers: { cookie },
    body: JSON.stringify({
      idempotencyKey: randomUUID(),
      text: `SSE soak reply ${index + 1}`
    })
  });
  replies.push(reply.json.message);
}

const streamed = await Promise.all(waiters);
for (const reply of replies) {
  if (!streamed.some((message) => message.id === reply.id)) {
    throw new Error(`Expected reply ${reply.id} to arrive through SSE.`);
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      baseUrl,
      concurrency,
      timeoutMs,
      useUniqueClientIps,
      streamedReplies: streamed.length,
      conversations: conversations.map((conversation) => conversation.conversationId)
    },
    null,
    2
  )
);
