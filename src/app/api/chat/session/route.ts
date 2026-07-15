import { corsJson, corsNoContent, isAllowedCorsRequest } from "@/lib/cors";
import { getSql } from "@/lib/db";
import { readJsonBody } from "@/lib/http-guards";
import { checkRateLimit } from "@/lib/rate-limit";
import { elapsedMs, logServerTiming, nowMs } from "@/lib/server-timing";
import { createSessionContext } from "@/lib/session-context";
import { getCachedSettings } from "@/lib/settings-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requestKey(request: Request) {
  const realIp = request.headers.get("x-real-ip")?.trim();
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const candidate = realIp || forwardedFor || "unknown";
  return /^[A-Za-z0-9.:_-]{1,80}$/.test(candidate) ? candidate : "unknown";
}

function sanitizePageUrl(value: unknown) {
  if (typeof value !== "string") return "";

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return `${parsed.origin}${parsed.pathname}`.slice(0, 1000);
  } catch {
    return "";
  }
}

export function OPTIONS(request: Request) {
  return corsNoContent(request);
}

export async function POST(request: Request) {
  const startedAt = nowMs();
  let dbMs = 0;
  let conversationId: string | null = null;
  try {
    if (!isAllowedCorsRequest(request)) {
      return corsJson(request, { error: "Origin is not allowed." }, { status: 403 });
    }

    const body = (await readJsonBody(request, 4096).catch(() => ({}))) as {
      pageUrl?: string;
      preferredLanguage?: string;
    };
    const settings = await getCachedSettings();
    const rateLimit = checkRateLimit(`chat-session:${requestKey(request)}`, 30, 60 * 60 * 1000);

    if (!rateLimit.allowed) {
      return corsJson(
        request,
        { error: "Too many chat session attempts. Try again later." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
      );
    }

    if (!settings.text_chat_enabled) {
      return corsJson(request, { error: "Chatbot is currently offline." }, { status: 403 });
    }

    const pageUrl = sanitizePageUrl(body.pageUrl);
    const preferredLanguage = body.preferredLanguage === "en" ? "en" : body.preferredLanguage === "th" ? "th" : "auto";
    const sessionContext = createSessionContext(24 * 60 * 60, 3600);
    conversationId = sessionContext.conversationId;
    const sql = getSql();
    const dbStartedAt = nowMs();
    const rows = (await sql`
      with locked as (
        select pg_advisory_xact_lock(514124713)
      ),
      quota as (
        select count(*)::int as count
        from conversations, locked
        where channel = 'text_widget'
          and started_at >= date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok'
      ),
      inserted as (
        insert into conversations (
          id,
          started_at,
          page_url,
          transcript,
          had_lead,
          analysis_status,
          channel,
          interaction_mode,
          provider,
          model_id,
          message_count,
          last_message_at
        )
        select
          ${sessionContext.conversationId},
          now(),
          ${pageUrl || null},
          '[]'::jsonb,
          false,
          'pending',
          'text_widget',
          'text',
          'openai',
          ${settings.text_chat_model_id},
          0,
          now()
        from quota
        where count < ${settings.text_chat_daily_session_cap}
        on conflict (id) do nothing
        returning id
      )
      select id::text as id from inserted
    `) as { id: string }[];
    dbMs += elapsedMs(dbStartedAt);

    if (!rows[0]) {
      return corsJson(request, { error: "Daily chat session cap reached." }, { status: 429 });
    }

    return corsJson(request, {
      ok: true,
      conversationId: sessionContext.conversationId,
      sessionContext,
      greeting: settings.text_chat_greeting || settings.greeting || "Hi, I am DJ from DJAI Academy. What kind of business are you running?",
      maxMessages: settings.text_chat_max_messages,
      preferredLanguage,
    });
  } catch (error) {
    console.error(error);
    return corsJson(request, { error: "Chat session failed." }, { status: 400 });
  } finally {
    logServerTiming({
      route: "api.chat.session",
      conversationId,
      channel: "text_widget",
      dbMs,
      totalMs: elapsedMs(startedAt),
    });
  }
}
