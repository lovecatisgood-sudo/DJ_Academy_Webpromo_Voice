import type { NextRequest } from "next/server";
import { z } from "zod";

const deploymentKeySchema = z.string().regex(/^djay_flow_[A-Za-z0-9_-]{32,}$/).max(200);
const sessionTokenSchema = z.string().regex(/^djay_flow_session_[A-Za-z0-9_-]{32,}$/).max(240);

export function flowbotRequestCredentials(request: NextRequest) {
  const origin = request.headers.get("origin");
  const deploymentKey = deploymentKeySchema.safeParse(request.headers.get("x-djay-flowbot-key"));
  if (!origin || !deploymentKey.success) return null;
  try {
    if (new URL(origin).origin !== origin) return null;
  } catch {
    return null;
  }
  return { origin, deploymentKey: deploymentKey.data };
}

export function flowbotSessionToken(request: NextRequest) {
  const parsed = sessionTokenSchema.safeParse(request.headers.get("x-djay-flowbot-session"));
  return parsed.success ? parsed.data : null;
}

export function flowbotCorsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-DJAY-FlowBot-Key, X-DJAY-FlowBot-Session",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}
