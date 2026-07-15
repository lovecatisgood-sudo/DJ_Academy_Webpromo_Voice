import { createHash } from "node:crypto";
import { sealJson } from "@djay/auth";
import { verifySignedWebhook } from "@djay/usage-billing";
import { getServices } from "../../../../../lib/container";
import { requestId, safeJson } from "../../../../../lib/http";

const maxWebhookBytes = 256 * 1024;

export async function POST(request: Request) {
  const id = requestId();
  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > maxWebhookBytes) return safeJson({ status: "rejected" }, 413);
    const services = await getServices();
    if (!services.billingWebhook || !services.billingWebhookSecret || !services.billingWebhookEnvelopeKey) {
      return safeJson({ status: "not_found" }, 404);
    }
    const event = verifySignedWebhook({
      rawBody,
      timestampHeader: request.headers.get("x-djay-timestamp"),
      signatureHeader: request.headers.get("x-djay-signature"),
      secret: services.billingWebhookSecret,
      now: new Date(),
    });
    const result = await services.billingWebhook.inbox({
      providerKey: "pilot",
      event,
      payloadHash: createHash("sha256").update(rawBody).digest(),
      payloadCiphertext: sealJson({ rawBody }, services.billingWebhookEnvelopeKey),
    });
    if (result.status === "event_id_conflict") return safeJson({ status: "rejected" }, 409);
    return safeJson({ status: "accepted" }, 202);
  } catch (error) {
    console.warn("billing_webhook_rejected", { requestId: id, error: error instanceof Error ? error.name : "unknown" });
    return safeJson({ status: "rejected" }, 400);
  }
}
