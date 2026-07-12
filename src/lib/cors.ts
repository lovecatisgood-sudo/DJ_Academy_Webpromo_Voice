import { NextResponse } from "next/server";
import { optionalEnv } from "./env";

const publicMethods = "POST, OPTIONS";
const publicHeaders = "Content-Type";

function allowedOrigins() {
  return (optionalEnv("WIDGET_ALLOWED_ORIGINS") || "*")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function corsHeaders(request: Request) {
  const origin = request.headers.get("origin");
  const allowed = allowedOrigins();
  const headers = new Headers({
    "Access-Control-Allow-Methods": publicMethods,
    "Access-Control-Allow-Headers": publicHeaders,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  });

  if (!origin) {
    return headers;
  }

  if (allowed.includes("*")) {
    headers.set("Access-Control-Allow-Origin", "*");
    return headers;
  }

  if (allowed.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }

  return headers;
}

export function corsJson(request: Request, body: unknown, init?: ResponseInit) {
  const headers = corsHeaders(request);
  const existing = new Headers(init?.headers);

  existing.forEach((value, key) => {
    headers.set(key, value);
  });

  return NextResponse.json(body, {
    ...init,
    headers,
  });
}

export function corsNoContent(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request),
  });
}
