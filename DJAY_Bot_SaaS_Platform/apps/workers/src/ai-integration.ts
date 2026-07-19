import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { openJson } from "@djay/auth";
import type { AiIntegrationClaim } from "@djay/db";
import { JWT } from "google-auth-library";
import { z } from "zod";

const googleConfigSchema = z.object({
  spreadsheetId: z.string().regex(/^[a-zA-Z0-9_-]{20,200}$/), range: z.string().min(1).max(200),
  serviceAccountEmail: z.email(), privateKey: z.string().min(100).max(10000),
}).strict();
const httpConfigSchema = z.object({ endpoint: z.url(), bearerToken: z.string().min(16).max(4096).optional() }).strict();

function publicAddress(address: string) {
  const family = isIP(address);
  if (family === 4) {
    const [a = 0, b = 0] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19)));
  }
  if (family === 6) {
    const normalized = address.toLowerCase();
    return normalized !== "::" && normalized !== "::1" && !normalized.startsWith("fc") && !normalized.startsWith("fd")
      && !/^fe[89ab]/.test(normalized) && !normalized.startsWith("::ffff:");
  }
  return false;
}

function payload(claim: AiIntegrationClaim) {
  return { schemaVersion: "djay.ai.integration.v1", event: claim.event_type, idempotencyKey: claim.job_id,
    tenantId: claim.tenant_id, conversationId: claim.conversation_id, contactId: claim.contact_id,
    summary: claim.summary_text, leadScore: claim.lead_score, segment: claim.segment };
}

async function deliverHttp(claim: AiIntegrationClaim, configValue: unknown) {
  const config = httpConfigSchema.parse(configValue); const url = new URL(config.endpoint);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw new Error("endpoint_policy_rejected");
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((item) => !publicAddress(item.address))) throw new Error("endpoint_address_rejected");
  const selected = addresses[0]!; const body = JSON.stringify(payload(claim));
  if (Buffer.byteLength(body) > 64 * 1024) throw new Error("integration_payload_too_large");
  await new Promise<void>((resolve, reject) => {
    const outbound = request(url, { method: "POST", timeout: 8_000,
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body), "user-agent": "DJAY-AI-Integration/1.0",
        "x-djay-idempotency-key": claim.job_id, ...(config.bearerToken ? { authorization: `Bearer ${config.bearerToken}` } : {}) },
      lookup: (_hostname, _options, callback) => callback(null, selected.address, selected.family),
    }, (response) => {
      let bytes = 0; response.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > 64 * 1024) response.destroy(new Error("integration_response_too_large")); });
      response.on("end", () => (response.statusCode ?? 500) >= 200 && (response.statusCode ?? 500) < 300 ? resolve() : reject(new Error("integration_http_rejected")));
      response.on("error", reject);
    });
    outbound.on("timeout", () => outbound.destroy(new Error("integration_timeout"))); outbound.on("error", reject); outbound.end(body);
  });
}

async function deliverGoogleSheets(claim: AiIntegrationClaim, configValue: unknown) {
  const config = googleConfigSchema.parse(configValue);
  const auth = new JWT({ email: config.serviceAccountEmail, key: config.privateKey.replace(/\\n/g, "\n"), scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  const target = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.spreadsheetId)}/values/${encodeURIComponent(config.range)}:append`;
  await auth.request({ url: target, method: "POST", params: { valueInputOption: "RAW", insertDataOption: "INSERT_ROWS" },
    data: { values: [[new Date().toISOString(), claim.event_type, claim.conversation_id, claim.contact_id, claim.summary_text, claim.lead_score, claim.segment, claim.job_id]] } });
}

export async function deliverAiIntegration(claim: AiIntegrationClaim, envelopeKey: Buffer) {
  const config = openJson<unknown>(claim.config_ciphertext, envelopeKey);
  if (claim.integration_kind === "google_sheets") await deliverGoogleSheets(claim, config);
  else await deliverHttp(claim, config);
}
