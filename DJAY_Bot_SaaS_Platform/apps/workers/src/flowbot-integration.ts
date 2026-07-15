import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { openJson } from "@djay/auth";

type Delivery = Readonly<{
  dispatchId: string;
  endpointCiphertext: string;
  payloadCiphertext: string;
  templateKey: string;
}>;

function isPublicAddress(address: string) {
  const family = isIP(address);
  if (family === 4) {
    const [a = 0, b = 0] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19)));
  }
  if (family === 6) {
    const normalized = address.toLowerCase();
    return normalized !== "::" && normalized !== "::1"
      && !normalized.startsWith("fc") && !normalized.startsWith("fd")
      && !/^fe[89ab]/.test(normalized) && !normalized.startsWith("::ffff:");
  }
  return false;
}

export async function deliverFlowbotIntegration(delivery: Delivery, envelopeKey: Buffer) {
  const endpoint = openJson<{ url: string }>(delivery.endpointCiphertext, envelopeKey).url;
  const payload = openJson<Record<string, unknown>>(delivery.payloadCiphertext, envelopeKey);
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw new Error("endpoint_policy_rejected");
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((item) => !isPublicAddress(item.address))) throw new Error("endpoint_address_rejected");
  const selected = addresses[0]!;
  const body = JSON.stringify({
    event: "flowbot.integration",
    dispatchId: delivery.dispatchId,
    templateKey: delivery.templateKey,
    payload,
  });
  if (Buffer.byteLength(body) > 64 * 1024) throw new Error("integration_payload_too_large");
  await new Promise<void>((resolve, reject) => {
    const outbound = request(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
        "user-agent": "DJAY-Bot-Integration/1.0",
        "x-djay-idempotency-key": delivery.dispatchId,
      },
      timeout: 8_000,
      lookup: (_hostname, _options, callback) => callback(null, selected.address, selected.family),
    }, (response) => {
      let bytes = 0;
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 64 * 1024) response.destroy(new Error("integration_response_too_large"));
      });
      response.on("end", () => {
        if ((response.statusCode ?? 500) >= 200 && (response.statusCode ?? 500) < 300) resolve();
        else reject(new Error("integration_http_rejected"));
      });
      response.on("error", reject);
    });
    outbound.on("timeout", () => outbound.destroy(new Error("integration_timeout")));
    outbound.on("error", reject);
    outbound.end(body);
  });
}
