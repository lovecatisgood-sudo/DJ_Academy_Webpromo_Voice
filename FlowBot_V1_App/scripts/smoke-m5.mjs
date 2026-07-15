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

async function ensureConversation() {
  const session = await request(`/api/w/${botKey}/session`, {
    method: "POST",
    body: JSON.stringify({ lang: "en" })
  });
  return session.json.conversationId;
}

const login = await request("/api/admin/auth/login", {
  method: "POST",
  body: JSON.stringify({ email: process.env.OWNER_EMAIL, password: process.env.OWNER_PASSWORD })
});
const cookie = login.response.headers.get("set-cookie")?.split(";")[0];
if (!cookie) throw new Error("Expected admin session cookie.");

const overview = await request("/api/admin/overview", { headers: { cookie } });
if (typeof overview.json.overview?.matchRate !== "number") throw new Error("Overview did not return metrics.");

let conversations = await request("/api/admin/conversations", { headers: { cookie } });
if (!conversations.json.conversations.length) {
  await ensureConversation();
  conversations = await request("/api/admin/conversations", { headers: { cookie } });
}
const conversation = conversations.json.conversations[0];
if (!conversation?.id) throw new Error("Expected at least one conversation.");

const detail = await request(`/api/admin/conversations/${conversation.id}`, { headers: { cookie } });
if (!Array.isArray(detail.json.messages)) throw new Error("Conversation detail missing messages.");

await request(`/api/admin/conversations/${conversation.id}`, {
  method: "PATCH",
  headers: { cookie },
  body: JSON.stringify({ crmStatus: "pending_follow_up", starred: true })
});

const noteText = `M5 smoke note ${randomUUID()}`;
const note = await request(`/api/admin/conversations/${conversation.id}/notes`, {
  method: "POST",
  headers: { cookie },
  body: JSON.stringify({ note: noteText })
});
if (note.json.note?.note !== noteText) throw new Error("Note was not created.");

const afterNote = await request(`/api/admin/conversations/${conversation.id}`, { headers: { cookie } });
if (!afterNote.json.notes.some((item) => item.note === noteText)) throw new Error("Conversation note did not appear in detail.");

const marker = randomUUID().slice(0, 8);
const createdCustomer = await request("/api/admin/customers", {
  method: "POST",
  headers: { cookie },
  body: JSON.stringify({
    name: `Smoke Customer ${marker}`,
    phone: `+6600${marker.replaceAll("-", "")}`,
    email: `smoke-${marker}@example.com`,
    lineId: `smoke-${marker}`,
    whatsapp: `+6600${marker.replaceAll("-", "")}`,
    note: "Created by M5 smoke test"
  })
});
const customer = createdCustomer.json.customer;
if (!customer?.id) throw new Error("Customer was not created.");

const filteredCustomers = await request(`/api/admin/customers?q=${encodeURIComponent(marker)}`, { headers: { cookie } });
if (!filteredCustomers.json.customers.some((item) => item.id === customer.id)) throw new Error("Created customer not found by search.");

await request(`/api/admin/customers/${customer.id}`, {
  method: "PATCH",
  headers: { cookie },
  body: JSON.stringify({ note: "Updated by M5 smoke test" })
});

await request(`/api/admin/customers/${customer.id}`, {
  method: "DELETE",
  headers: { cookie }
});

const leads = await request("/api/admin/leads", { headers: { cookie } });
if (!Array.isArray(leads.json.leads)) throw new Error("Leads response is invalid.");

console.log(
  JSON.stringify(
    {
      ok: true,
      conversationId: conversation.id,
      note: "ok",
      customerCreateUpdateDelete: "ok",
      conversations: conversations.json.conversations.length,
      leads: leads.json.leads.length
    },
    null,
    2
  )
);
