import { createSqlClient } from "@flowbot/db";
import { NextResponse } from "next/server";
import { apiError } from "./api";

type Sql = any;

type OriginCheck =
  | { ok: true; origin?: string | undefined }
  | { ok: false; response: NextResponse };

const corsMethods = "GET,POST,OPTIONS";
const corsHeaders = "content-type";

export async function checkWidgetOrigin(botKey: string, request: Request, sql: Sql = createSqlClient()): Promise<OriginCheck> {
  const origin = normalizeOrigin(request.headers.get("origin"));
  if (!origin) return { ok: true };
  const requestOrigin = normalizeOrigin(request.url);
  if (origin === requestOrigin || isEquivalentLoopbackOrigin(origin, requestOrigin)) return { ok: true, origin };

  const rows = await sql`
    SELECT allowed_origins
    FROM flowbot_bots
    WHERE public_key = ${botKey}
    LIMIT 1
  `;
  const allowedOrigins = (rows[0]?.allowed_origins ?? []) as string[];
  if (allowedOrigins.some((allowed) => normalizeOrigin(allowed) === origin)) {
    return { ok: true, origin };
  }

  return {
    ok: false,
    response: apiError("FORBIDDEN", "This website is not allowed to use this widget.", 403)
  };
}

export async function widgetOptions(botKey: string, request: Request) {
  const originCheck = await checkWidgetOrigin(botKey, request);
  if (!originCheck.ok) return originCheck.response;
  return withWidgetCors(new NextResponse(null, { status: 204 }), originCheck.origin);
}

export function withWidgetCors<T extends Response>(response: T, origin?: string | undefined): T {
  if (!origin) return response;
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Methods", corsMethods);
  response.headers.set("Access-Control-Allow-Headers", corsHeaders);
  response.headers.set("Vary", appendVary(response.headers.get("Vary"), "Origin"));
  return response;
}

function normalizeOrigin(value: string | null | undefined) {
  if (!value) return undefined;
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return undefined;
  }
}

function isEquivalentLoopbackOrigin(origin: string, requestOrigin: string | undefined) {
  if (!requestOrigin) return false;
  try {
    const left = new URL(origin);
    const right = new URL(requestOrigin);
    const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
    return (
      left.protocol === right.protocol &&
      left.port === right.port &&
      loopbackHosts.has(left.hostname) &&
      loopbackHosts.has(right.hostname)
    );
  } catch {
    return false;
  }
}

function appendVary(current: string | null, value: string) {
  if (!current) return value;
  const parts = current.split(",").map((part) => part.trim().toLowerCase());
  return parts.includes(value.toLowerCase()) ? current : `${current}, ${value}`;
}
