import type { AiPublicResponse } from "@djay/ai-chat-runtime";
import type { NextRequest } from "next/server";
import { z } from "zod";

const deploymentKeySchema = z.string().regex(/^djay_ai_[A-Za-z0-9_-]{32,}$/).max(200);
const sessionTokenSchema = z.string().regex(/^djay_ai_session_[A-Za-z0-9_-]{32,}$/).max(240);

export function aiChatRequestCredentials(request: NextRequest) {
  const origin = request.headers.get("origin");
  const deploymentKey = deploymentKeySchema.safeParse(request.headers.get("x-djay-ai-key"));
  if (!origin || !deploymentKey.success) return null;
  try {
    if (new URL(origin).origin !== origin) return null;
  } catch {
    return null;
  }
  return { origin, deploymentKey: deploymentKey.data };
}

export function aiChatSessionToken(request: NextRequest) {
  const parsed = sessionTokenSchema.safeParse(request.headers.get("x-djay-ai-session"));
  return parsed.success ? parsed.data : null;
}

export function aiChatCorsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-DJAY-AI-Key, X-DJAY-AI-Session",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

export function aiChatNdjson(response: AiPublicResponse, origin: string) {
  const encoder = new TextEncoder();
  const chunks = response.text.match(/\S+\s*/gu) ?? [];
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`${JSON.stringify({ type: "response.start", inputId: response.inputId })}\n`));
      for (const text of chunks) controller.enqueue(encoder.encode(`${JSON.stringify({ type: "response.delta", text })}\n`));
      controller.enqueue(encoder.encode(`${JSON.stringify({
        type: "response.done", status: response.status, quickReplies: response.quickReplies,
        nextTurnSequence: response.nextTurnSequence,
      })}\n`));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      ...aiChatCorsHeaders(origin),
      "Cache-Control": "no-store",
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
