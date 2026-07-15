import { randomUUID } from "node:crypto";

const baseUrl = process.env.FLOWBOT_BASE_URL ?? "http://127.0.0.1:3025";

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

const login = await request("/api/admin/auth/login", {
  method: "POST",
  body: JSON.stringify({ email: process.env.OWNER_EMAIL, password: process.env.OWNER_PASSWORD })
});
const cookie = login.response.headers.get("set-cookie")?.split(";")[0];
if (!cookie) throw new Error("Expected admin session cookie.");

const bots = await request("/api/admin/bots", { headers: { cookie } });
const bot = bots.json.bots[0];
if (!bot?.id || !bot.publicKey) throw new Error("Expected seeded bot.");

const widgetOriginal = await request(`/api/admin/bots/${bot.id}/widget-settings`, { headers: { cookie } });
const originalWidgetSettings = widgetOriginal.json.settings;

await request(`/api/admin/bots/${bot.id}/widget-settings`, {
  method: "PATCH",
  headers: { cookie },
  body: JSON.stringify({
    ...originalWidgetSettings,
    enabled: false,
    themeColor: "#126E82",
    greetingEn: "Smoke greeting",
    allowedOrigins: [baseUrl]
  })
});

const publicConfigDisabled = await request(`/api/w/${bot.publicKey}/config`);
if (publicConfigDisabled.json.enabled !== false || publicConfigDisabled.json.greeting.en !== "Smoke greeting") {
  throw new Error("Public config did not reflect disabled widget settings.");
}
await expectStatus(`/api/w/${bot.publicKey}/session`, { method: "POST", body: JSON.stringify({ lang: "en" }) }, 404);

await request(`/api/admin/bots/${bot.id}/widget-settings`, {
  method: "PATCH",
  headers: { cookie },
  body: JSON.stringify({ ...originalWidgetSettings, enabled: true })
});

const channelsOriginal = await request(`/api/admin/bots/${bot.id}/contact-channels`, { headers: { cookie } });
await request(`/api/admin/bots/${bot.id}/contact-channels`, {
  method: "PUT",
  headers: { cookie },
  body: JSON.stringify({
    channels: [
      { type: "email", label: "Smoke Email", value: "smoke@example.com", sortOrder: 1 },
      { type: "url", label: "Smoke Site", value: "https://example.com", sortOrder: 2 }
    ]
  })
});
const channelsUpdated = await request(`/api/admin/bots/${bot.id}/contact-channels`, { headers: { cookie } });
if (channelsUpdated.json.channels.length !== 2 || channelsUpdated.json.channels[0].label !== "Smoke Email") {
  throw new Error("Contact channels did not save.");
}
await request(`/api/admin/bots/${bot.id}/contact-channels`, {
  method: "PUT",
  headers: { cookie },
  body: JSON.stringify({
    channels: channelsOriginal.json.channels.map((channel, index) => ({
      type: channel.type,
      label: channel.label,
      value: channel.value,
      sortOrder: index + 1
    }))
  })
});

const marker = randomUUID().slice(0, 8);
const teamUser = await request("/api/admin/team", {
  method: "POST",
  headers: { cookie },
  body: JSON.stringify({
    name: `Settings Smoke ${marker}`,
    email: `settings-smoke-${marker}@example.com`,
    role: "admin",
    password: `SettingsSmoke-${marker}-12345`
  })
});
if (!teamUser.json.user?.id) throw new Error("Team member was not created.");
const team = await request("/api/admin/team", { headers: { cookie } });
if (!team.json.users.some((user) => user.id === teamUser.json.user.id)) throw new Error("Team member did not appear in list.");
await request(`/api/admin/team/${teamUser.json.user.id}`, { method: "DELETE", headers: { cookie } });

const privacyOriginal = await request("/api/admin/privacy", { headers: { cookie } });
await request("/api/admin/privacy", {
  method: "PATCH",
  headers: { cookie },
  body: JSON.stringify({
    ...privacyOriginal.json.settings,
    transcriptRetentionDays: 180,
    privacyPolicyUrl: "https://example.com/privacy",
    alertEmail: "alerts@example.com"
  })
});
const privacyUpdated = await request("/api/admin/privacy", { headers: { cookie } });
if (privacyUpdated.json.settings.transcriptRetentionDays !== 180) throw new Error("Privacy settings did not save.");
await request("/api/admin/privacy", {
  method: "PATCH",
  headers: { cookie },
  body: JSON.stringify(privacyOriginal.json.settings)
});

const publicConfigRestored = await request(`/api/w/${bot.publicKey}/config`);
if (publicConfigRestored.json.enabled !== true) throw new Error("Widget settings were not restored.");

console.log(
  JSON.stringify(
    {
      ok: true,
      widgetSettings: "ok",
      contactChannels: "ok",
      team: "ok",
      privacy: "ok"
    },
    null,
    2
  )
);
