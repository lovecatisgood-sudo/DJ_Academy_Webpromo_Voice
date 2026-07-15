import { randomUUID } from "node:crypto";

const baseUrl = process.env.FLOWBOT_BASE_URL ?? "http://127.0.0.1:3025";
const botKey = process.env.FLOWBOT_BOT_KEY ?? "flowbot_test_web";

if (!process.env.OWNER_EMAIL) throw new Error("OWNER_EMAIL is required.");
if (!process.env.OWNER_PASSWORD) throw new Error("OWNER_PASSWORD is required.");

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

const login = await request("/api/admin/auth/login", {
  method: "POST",
  body: JSON.stringify({ email: process.env.OWNER_EMAIL, password: process.env.OWNER_PASSWORD })
});
const cookie = login.response.headers.get("set-cookie")?.split(";")[0];
if (!cookie) throw new Error("Expected admin session cookie.");

const marker = randomUUID().slice(0, 8);
const session = await request(`/api/w/${botKey}/session`, {
  method: "POST",
  body: JSON.stringify({ lang: "en" })
});
const conversationId = session.json.conversationId;
if (!conversationId) throw new Error("Expected conversation.");

await request(`/api/w/${botKey}/message`, {
  method: "POST",
  body: JSON.stringify({
    sessionToken: session.json.sessionToken,
    inputId: randomUUID(),
    lang: "en",
    input: { type: "text", payload: { text: `My private phone is 081-${marker}` } }
  })
});

const customer = await request("/api/admin/customers", {
  method: "POST",
  headers: { cookie },
  body: JSON.stringify({
    name: `Privacy Smoke ${marker}`,
    phone: `081${marker}`,
    email: `privacy-${marker}@example.com`,
    lineId: `privacy-${marker}`,
    note: "Privacy smoke note"
  })
});
const customerId = customer.json.customer?.id;
if (!customerId) throw new Error("Expected customer id.");

await request(`/api/admin/conversations/${conversationId}`, {
  method: "PATCH",
  headers: { cookie },
  body: JSON.stringify({ customerId })
});
await request(`/api/admin/conversations/${conversationId}/notes`, {
  method: "POST",
  headers: { cookie },
  body: JSON.stringify({ note: `private note ${marker}` })
});

const exported = await request(`/api/admin/customers/${customerId}/export`, { headers: { cookie } });
if (exported.json.export?.customer?.name !== `Privacy Smoke ${marker}`) throw new Error("Customer export missing profile.");
if (!exported.json.export?.conversations?.some((conversation) => conversation.id === conversationId)) {
  throw new Error("Customer export missing linked conversation.");
}

const erasure = await request(`/api/admin/customers/${customerId}/erase`, {
  method: "POST",
  headers: { cookie }
});
if (!erasure.json.erased || erasure.json.conversationCount < 1) throw new Error("Erasure did not report linked conversation.");

const detail = await request(`/api/admin/conversations/${conversationId}`, { headers: { cookie } });
if (!detail.json.messages.every((message) => message.content?.redacted === true)) {
  throw new Error("Erasure did not redact linked conversation messages.");
}
if (!detail.json.notes.every((note) => note.note === "[erased]")) {
  throw new Error("Erasure did not redact linked notes.");
}

const filteredCustomers = await request(`/api/admin/customers?q=${encodeURIComponent(marker)}`, { headers: { cookie } });
if (filteredCustomers.json.customers.some((item) => item.id === customerId)) {
  throw new Error("Erased customer still appears in active customer search.");
}

console.log(
  JSON.stringify(
    {
      ok: true,
      customerId,
      conversationId,
      export: "ok",
      erasure: "ok"
    },
    null,
    2
  )
);
