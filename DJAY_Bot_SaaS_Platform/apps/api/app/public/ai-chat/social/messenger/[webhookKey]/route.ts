import { keyedRequestHash, sealJson } from "@djay/auth";
import { normalizeSocialWebhook, verifySocialChallenge, verifySocialSignature } from "@djay/channel-adapters";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getServices } from "../../../../../../lib/container";
import { clientAddress, enforceRateLimit, safeJson } from "../../../../../../lib/http";
import { withWebhookAck } from "../../../../../../lib/webhook-ack";

const webhookKeySchema = z.string().regex(/^djay_social_[A-Za-z0-9_-]{32,}$/).max(200);
const maximumBodyBytes = 1024 * 1024;

export async function GET(request: NextRequest, route: { params: Promise<{ webhookKey: string }> }) {
  const webhookKey = webhookKeySchema.safeParse((await route.params).webhookKey);
  if (!webhookKey.success) return safeJson({ status: "not_found" }, 404);
  const services = await getServices();
  if (!services.aiSocialRuntime) return safeJson({ status: "not_found" }, 404);
  const allowed = await enforceRateLimit(
    "ai_social_messenger_challenge", `${webhookKey.data}:${clientAddress(request)}`, 60, 60_000,
  );
  if (!allowed.allowed) return safeJson({ status: "rate_limited" }, 429);
  try {
    const connection = await services.aiSocialRuntime.connection(webhookKey.data, "messenger");
    if (!connection) return safeJson({ status: "not_found" }, 404);
    const challenge = verifySocialChallenge(
      "messenger", request.nextUrl.searchParams.get("hub.mode"),
      request.nextUrl.searchParams.get("hub.verify_token"),
      request.nextUrl.searchParams.get("hub.challenge"), connection.credentials,
    );
    return challenge === null
      ? safeJson({ status: "not_found" }, 404)
      : new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  } catch { return safeJson({ status: "not_found" }, 404); }
}

export function POST(request: NextRequest, route: { params: Promise<{ webhookKey: string }> }) {
  return withWebhookAck("ai_chat", "messenger", () => handleWebhook(request, route));
}

async function handleWebhook(request: NextRequest, route: { params: Promise<{ webhookKey: string }> }) {
  const webhookKey = webhookKeySchema.safeParse((await route.params).webhookKey);
  if (!webhookKey.success) return safeJson({ status: "not_found" }, 404);
  const services = await getServices();
  if (!services.aiSocialRuntime || !services.aiSocialSubjectHashKey || !services.aiSocialCredentialKey) {
    return safeJson({ status: "not_found" }, 404);
  }
  const allowed = await enforceRateLimit(
    "ai_social_messenger_webhook", `${webhookKey.data}:${clientAddress(request)}`, 240, 60_000,
  );
  if (!allowed.allowed) return safeJson({ status: "rate_limited" }, 429);
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > maximumBodyBytes) return safeJson({ status: "request_too_large" }, 413);

  try {
    const connection = await services.aiSocialRuntime.connection(webhookKey.data, "messenger");
    if (!connection) return safeJson({ status: "not_found" }, 404);
    const rawBody = new Uint8Array(await request.arrayBuffer());
    if (rawBody.byteLength > maximumBodyBytes) return safeJson({ status: "request_too_large" }, 413);
    if (!verifySocialSignature(
      "messenger", rawBody, request.headers.get("x-hub-signature-256"), connection.credentials,
    )) return safeJson({ status: "signature_invalid" }, 401);

    const events = normalizeSocialWebhook("messenger", JSON.parse(new TextDecoder().decode(rawBody)) as unknown);
    const receipts = [];
    for (const event of events) {
      const subjectHash = keyedRequestHash(services.aiSocialSubjectHashKey, {
        connectionId: connection.connectionId, externalSubject: event.externalSubject,
      });
      const receipt = await services.aiSocialRuntime.receive({
        webhookKey: webhookKey.data, channel: "messenger",
        externalEventId: event.externalEventId, externalMessageId: event.externalMessageId,
        subjectHash, eventType: event.eventType, occurredAt: event.occurredAt,
        normalized: {
          text: event.text,
          subjectCiphertext: sealJson({ value: event.externalSubject }, services.aiSocialCredentialKey),
          replyTokenCiphertext: null, deliveryStatus: event.deliveryStatus,
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
