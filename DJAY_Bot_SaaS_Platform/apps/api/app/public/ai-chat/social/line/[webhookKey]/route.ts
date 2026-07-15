import { keyedRequestHash } from "@djay/auth";
import { normalizeSocialWebhook, verifySocialSignature } from "@djay/channel-adapters";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getServices } from "../../../../../../lib/container";
import { clientAddress, enforceRateLimit, safeJson } from "../../../../../../lib/http";

const webhookKeySchema = z.string().regex(/^djay_social_[A-Za-z0-9_-]{32,}$/).max(200);
const maximumBodyBytes = 1024 * 1024;

export async function POST(request: NextRequest, route: { params: Promise<{ webhookKey: string }> }) {
  const webhookKey = webhookKeySchema.safeParse((await route.params).webhookKey);
  if (!webhookKey.success) return safeJson({ status: "not_found" }, 404);
  const services = await getServices();
  if (!services.aiSocialRuntime || !services.aiSocialSubjectHashKey) {
    return safeJson({ status: "not_found" }, 404);
  }
  const allowed = await enforceRateLimit(
    "ai_social_line_webhook", `${webhookKey.data}:${clientAddress(request)}`, 240, 60_000,
  );
  if (!allowed.allowed) return safeJson({ status: "rate_limited" }, 429);
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > maximumBodyBytes) return safeJson({ status: "request_too_large" }, 413);

  try {
    const connection = await services.aiSocialRuntime.connection(webhookKey.data, "line");
    if (!connection) return safeJson({ status: "not_found" }, 404);
    const rawBody = new Uint8Array(await request.arrayBuffer());
    if (rawBody.byteLength > maximumBodyBytes) return safeJson({ status: "request_too_large" }, 413);
    if (!verifySocialSignature(
      "line", rawBody, request.headers.get("x-line-signature"), connection.credentials,
    )) return safeJson({ status: "signature_invalid" }, 401);

    const payload = JSON.parse(new TextDecoder().decode(rawBody)) as unknown;
    const events = normalizeSocialWebhook("line", payload);
    const receipts = [];
    for (const event of events) {
      const subjectHash = keyedRequestHash(services.aiSocialSubjectHashKey, {
        connectionId: connection.connectionId, externalSubject: event.externalSubject,
      });
      const receipt = await services.aiSocialRuntime.receive({
        webhookKey: webhookKey.data,
        channel: "line",
        externalEventId: event.externalEventId,
        externalMessageId: event.externalMessageId,
        subjectHash,
        eventType: event.eventType,
        occurredAt: event.occurredAt,
        normalized: {
          text: event.text,
          replyToken: event.replyToken,
          deliveryStatus: event.deliveryStatus,
        },
      });
      if (receipt) receipts.push(receipt);
    }
    return safeJson({
      status: "received",
      accepted: receipts.filter((item) => item.disposition === "accepted" && !item.replayed).length,
      outOfOrder: receipts.filter((item) => item.disposition === "out_of_order" && !item.replayed).length,
      replayed: receipts.filter((item) => item.replayed).length,
    });
  } catch (error) {
    return error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400)
      : safeJson({ status: "not_available" }, 404);
  }
}
