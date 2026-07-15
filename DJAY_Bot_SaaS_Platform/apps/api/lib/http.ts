import { keyedRequestHash } from "@djay/auth";
import { NextResponse } from "next/server";
import { getServices } from "./container";

const maxBodyBytes = 16 * 1024;

export function requestId(): string {
  return crypto.randomUUID();
}

export async function readJson(request: Request, limitBytes = maxBodyBytes): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > limitBytes) throw new Error("request_too_large");
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > limitBytes) throw new Error("request_too_large");
  return JSON.parse(text);
}

export function safeJson(body: unknown, status = 200, headers?: HeadersInit) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

export function clientAddress(request: Request): string {
  if (process.env.TRUST_PROXY_HEADERS === "true") {
    return request.headers.get("x-real-ip")
      || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || "unknown-proxy-client";
  }
  return "direct-client";
}

export async function hasTrustedOrigin(request: Request): Promise<boolean> {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const { env } = await getServices();
  const allowed = [env.PUBLIC_APP_URL, env.TENANT_APP_URL, env.PLATFORM_APP_URL, env.API_APP_URL]
    .filter((value): value is string => Boolean(value))
    .map((value) => new URL(value).origin);
  return allowed.includes(origin);
}

export async function enforceRateLimit(scope: string, identifier: string, limit: number, windowMs: number) {
  const services = await getServices();
  return services.store.consumeRateLimit({
    scope,
    keyHash: keyedRequestHash(services.rateLimitKey, { scope, identifier }),
    limit,
    windowMs,
    now: new Date(),
  });
}
