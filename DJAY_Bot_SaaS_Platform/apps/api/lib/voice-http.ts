import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

const deploymentKeySchema = z.string().regex(/^djay_voice_deploy_[A-Za-z0-9_-]{32,}$/).max(220);

export function voiceRequestCredentials(request: NextRequest) {
  const origin = request.headers.get("origin");
  const deploymentKey = deploymentKeySchema.safeParse(request.headers.get("x-djay-voice-key"));
  if (!origin || !deploymentKey.success) return null;
  try {
    if (new URL(origin).origin !== origin) return null;
  } catch {
    return null;
  }
  return { origin, deploymentKey: deploymentKey.data };
}

export function voiceCorsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-DJAY-Voice-Key",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

function digest(value: string) { return createHash("sha256").update(value).digest(); }

export function hasVoiceServiceAuthority(request: Request, expectedToken: string | undefined) {
  if (!expectedToken) return false;
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  return timingSafeEqual(digest(authorization.slice(7)), digest(expectedToken));
}
