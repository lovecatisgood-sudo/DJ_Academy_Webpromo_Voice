import { keyedRequestHash } from "@djay/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
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

type BrowserRealmUrls = Readonly<{
  publicAppUrl: string;
  tenantAppUrl: string;
  platformAppUrl: string;
}>;

const browserRealmEnvSchema = z.object({
  PUBLIC_APP_URL: z.string().url(),
  TENANT_APP_URL: z.string().url(),
  PLATFORM_APP_URL: z.string().url(),
});

const tenantPublicMutationPaths = new Set([
  "/public/auth/login",
  "/public/auth/logout",
  "/public/auth/mfa/challenge",
  "/public/auth/recovery/complete",
  "/public/auth/recovery/request",
]);

function canonicalOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function expectedBrowserMutationOrigin(pathname: string, urls: BrowserRealmUrls): string | null {
  if (pathname.startsWith("/tenant/")) return canonicalOrigin(urls.tenantAppUrl);
  if (pathname.startsWith("/platform/")) return canonicalOrigin(urls.platformAppUrl);
  if (tenantPublicMutationPaths.has(pathname)) return canonicalOrigin(urls.tenantAppUrl);
  if (
    pathname.startsWith("/public/auth/")
    || pathname.startsWith("/public/invitations/")
    || pathname.startsWith("/public/builder/")
  ) {
    return canonicalOrigin(urls.publicAppUrl);
  }
  return null;
}

export function isTrustedBrowserMutationOrigin(
  origin: string | null,
  pathname: string,
  urls: BrowserRealmUrls,
): boolean {
  const expected = expectedBrowserMutationOrigin(pathname, urls);
  return expected !== null && origin === expected;
}

export async function hasTrustedOrigin(request: Request): Promise<boolean> {
  const env = browserRealmEnvSchema.parse(process.env);
  return isTrustedBrowserMutationOrigin(
    request.headers.get("origin"),
    new URL(request.url).pathname,
    {
      publicAppUrl: env.PUBLIC_APP_URL,
      tenantAppUrl: env.TENANT_APP_URL,
      platformAppUrl: env.PLATFORM_APP_URL,
    },
  );
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
