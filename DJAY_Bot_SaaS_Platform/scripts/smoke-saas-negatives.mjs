#!/usr/bin/env node
/**
 * Phase 9 negatives — HTTP checks against a running API (local or staging).
 * No browser mocks. Exits non-zero on failure.
 *
 * Env:
 *   API_APP_URL (default http://127.0.0.1:3103)
 *   TENANT_APP_URL (default http://127.0.0.1:3101) — trusted Origin for contrast checks
 */

const apiUrl = (process.env.API_APP_URL || "http://127.0.0.1:3103").replace(/\/$/, "");
const tenantUrl = (process.env.TENANT_APP_URL || "http://127.0.0.1:3101").replace(/\/$/, "");
const evilOrigin = "https://evil.example";
const failures = [];

async function probe(name, path, init, assert) {
  try {
    const response = await fetch(`${apiUrl}${path}`, init);
    const bodyText = await response.text();
    let json = null;
    try { json = JSON.parse(bodyText); } catch { /* non-json ok */ }
    await assert({ response, json, bodyText });
    console.log(`ok  ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    console.error(`fail ${name}`);
  }
}

const health = await fetch(`${apiUrl}/api/health/live`).catch(() => null);
if (!health?.ok) {
  console.error(`API not reachable at ${apiUrl}/api/health/live — start the API or set API_APP_URL`);
  process.exit(1);
}

await probe(
  "evil Origin rejected on public login (no ACAO echo)",
  "/public/auth/login",
  {
    method: "POST",
    headers: {
      Origin: evilOrigin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: "attacker@evil.example", password: "not-a-real-password-value" }),
  },
  async ({ response, json }) => {
    if (![401, 403].includes(response.status)) {
      throw new Error(`expected 401/403, got ${response.status}`);
    }
    const acao = response.headers.get("access-control-allow-origin");
    if (acao === evilOrigin) throw new Error("evil Origin echoed in Access-Control-Allow-Origin");
    if (!json || typeof json !== "object") throw new Error("expected JSON denial payload");
  },
);

await probe(
  "evil Origin rejected on public register",
  "/public/auth/register",
  {
    method: "POST",
    headers: {
      Origin: evilOrigin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: `evil+${Date.now()}@evil.example`,
      password: "Evil-Password-Value-123!",
      businessName: "Evil Co",
      acceptedTermsVersion: "terms-x",
      acceptedPrivacyVersion: "privacy-x",
    }),
  },
  async ({ response }) => {
    if (response.status !== 403) throw new Error(`expected 403, got ${response.status}`);
    if (response.headers.get("access-control-allow-origin") === evilOrigin) {
      throw new Error("evil Origin echoed in Access-Control-Allow-Origin");
    }
  },
);

await probe(
  "unauthenticated checkout is non-revealing 404",
  "/tenant/billing/checkout",
  {
    method: "POST",
    headers: {
      Origin: tenantUrl,
      "Content-Type": "application/json",
      "Idempotency-Key": "smoke-negative-idempotency-key-01",
    },
    body: JSON.stringify({
      subscriptionId: "00000000-0000-4000-8000-000000000099",
      contractSnapshotId: "00000000-0000-4000-8000-000000000098",
    }),
  },
  async ({ response, json }) => {
    if (response.status !== 404) throw new Error(`expected 404, got ${response.status}`);
    if (json?.status !== "not_found") throw new Error(`expected status not_found, got ${JSON.stringify(json)}`);
  },
);

await probe(
  "evil Origin on tenant checkout is non-revealing 404",
  "/tenant/billing/checkout",
  {
    method: "POST",
    headers: {
      Origin: evilOrigin,
      "Content-Type": "application/json",
      "Idempotency-Key": "smoke-negative-idempotency-key-02",
      Cookie: "djay_tenant_session=forged-token-value-that-must-not-leak",
    },
    body: JSON.stringify({
      subscriptionId: "00000000-0000-4000-8000-000000000099",
      contractSnapshotId: "00000000-0000-4000-8000-000000000098",
    }),
  },
  async ({ response, json }) => {
    if (response.status !== 404) throw new Error(`expected 404, got ${response.status}`);
    if (json?.status !== "not_found") throw new Error(`expected status not_found, got ${JSON.stringify(json)}`);
    if (response.headers.get("access-control-allow-origin") === evilOrigin) {
      throw new Error("evil Origin echoed in Access-Control-Allow-Origin");
    }
  },
);

await probe(
  "flowbot public session without deployment key is denied",
  "/public/flowbot/session",
  {
    method: "POST",
    headers: {
      Origin: evilOrigin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ deploymentKey: "djay_flow_not_a_real_key", locale: "en" }),
  },
  async ({ response }) => {
    if (![400, 401, 403, 404].includes(response.status)) {
      throw new Error(`expected denial status, got ${response.status}`);
    }
  },
);

if (failures.length) {
  console.error("\nSaaS negative smoke failures:\n" + failures.join("\n"));
  process.exit(1);
}
console.log(`\nSaaS negative smoke passed for ${apiUrl}`);
