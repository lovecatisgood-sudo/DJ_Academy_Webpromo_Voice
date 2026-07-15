import { NextResponse } from "next/server";

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local";
}

export function rateLimit(request: Request, params: { scope: string; limit: number; windowMs: number; key?: string | undefined }) {
  const now = Date.now();
  const key = `${params.scope}:${params.key ?? clientIp(request)}`;
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + params.windowMs });
    return null;
  }
  current.count += 1;
  if (current.count <= params.limit) return null;

  const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
  return NextResponse.json(
    {
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Please try again shortly."
      }
    },
    {
      status: 429,
      headers: {
        "retry-after": String(retryAfter)
      }
    }
  );
}
