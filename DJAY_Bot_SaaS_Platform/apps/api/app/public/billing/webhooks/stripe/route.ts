import { createHash } from "node:crypto";
import { sealJson } from "@djay/auth";
import { verifyStripeWebhook } from "@djay/usage-billing";
import { getServices } from "../../../../../lib/container";
import { requestId, safeJson } from "../../../../../lib/http";

const maxWebhookBytes = 256 * 1024;

export async function POST(request: Request) {
  const id = requestId();
  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > maxWebhookBytes) return safeJson({ status: "rejected" }, 413);
    const services = await getServices();
    if (!services.billingWebhook || !services.stripeWebhookSecret || !services.billingWebhookEnvelopeKey) {
      return safeJson({ status: "not_found" }, 404);
    }
    const event = verifyStripeWebhook({
      rawBody,
      signatureHeader: request.headers.get("stripe-signature"),
      secret: services.stripeWebhookSecret,
      now: new Date(),
      requireLiveMode: services.stripeLiveMode,
    });
    const result = await services.billingWebhook.inbox({
      providerKey: "stripe",
      event,
      payloadHash: createHash("sha256").update(rawBody).digest(),
      payloadCiphertext: sealJson({ rawBody }, services.billingWebhookEnvelopeKey),
    });
    if (result.status === "event_id_conflict") return safeJson({ status: "rejected" }, 409);
    return safeJson({ status: "accepted" }, 202);
  } catch (error) {
    console.warn("stripe_webhook_rejected", {
      requestId: id, error: error instanceof Error ? error.name : "unknown",
    });
    return safeJson({ status: "rejected" }, 400);
  }
}
