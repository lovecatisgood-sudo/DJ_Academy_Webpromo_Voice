import { getSql } from "@/lib/db";
import { getCachedSettings } from "@/lib/settings-cache";
import { requireEnv } from "@/lib/env";
import { buildVoiceAgentSystemPrompt, captureLeadTool } from "@/lib/prompt";
import { createSessionContext } from "@/lib/session-context";
import { corsJson, corsNoContent } from "@/lib/cors";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSafetyIdentifier(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip") || "unknown";
}

function extractClientSecret(data: unknown) {
  const payload = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const nested = payload.client_secret && typeof payload.client_secret === "object"
    ? (payload.client_secret as Record<string, unknown>)
    : null;
  const value = typeof payload.value === "string"
    ? payload.value
    : typeof nested?.value === "string"
      ? nested.value
      : "";
  const expiresAt = typeof payload.expires_at === "number"
    ? payload.expires_at
    : typeof nested?.expires_at === "number"
      ? nested.expires_at
      : null;

  return value ? { value, expires_at: expiresAt } : null;
}

export function OPTIONS(request: Request) {
  return corsNoContent(request);
}

export async function GET(request: Request) {
  try {
    const settings = await getCachedSettings();
    return corsJson(request, {
      agentEnabled: settings.agent_enabled,
      maxCallSeconds: settings.max_call_seconds,
    });
  } catch (error) {
    console.error(error);
    return corsJson(request, { agentEnabled: false }, { status: 200 });
  }
}

async function getTodaySessionCount() {
  const sql = getSql();
  const rows = (await sql`
    select count(*)::text as count
    from conversations
    where started_at >= date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok'
  `) as { count: string }[];

  return Number(rows[0]?.count || 0);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { pageUrl?: string };
    const settings = await getCachedSettings();
    const rateLimit = checkRateLimit(getSafetyIdentifier(request), 12, 60 * 60 * 1000);

    if (!rateLimit.allowed) {
      return corsJson(
        request,
        { error: "Too many voice session attempts. Try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        },
      );
    }

    if (!settings.agent_enabled) {
      return corsJson(request, { error: "Voice agent is currently offline." }, { status: 403 });
    }

    const sessionCount = await getTodaySessionCount();

    if (sessionCount >= settings.daily_session_cap) {
      return corsJson(request, { error: "Daily voice session cap reached." }, { status: 429 });
    }

    const pageUrl = typeof body.pageUrl === "string" ? body.pageUrl.slice(0, 1000) : "";
    const prompt = buildVoiceAgentSystemPrompt({ settings, pageUrl, now: new Date() });
    const sessionContext = createSessionContext(settings.max_call_seconds + 900);

    if (process.env.NODE_ENV !== "production") {
      console.info("\n--- DJAI VOICE AGENT SYSTEM PROMPT ---\n%s\n--- END PROMPT ---\n", prompt);
    }

    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requireEnv("OPENAI_API_KEY")}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": getSafetyIdentifier(request),
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: settings.model_id,
          instructions: prompt,
          audio: {
            output: {
              voice: settings.voice,
            },
            input: {
              transcription: {
                model: settings.transcription_model,
              },
              turn_detection: {
                type: "server_vad",
              },
            },
          },
          tools: [captureLeadTool],
          tool_choice: "auto",
        },
      }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      console.error("OpenAI client secret error", {
        status: response.status,
        requestId: response.headers.get("x-request-id"),
        data,
      });
      return corsJson(
        request,
        {
          error: "Voice agent is unavailable. Please try again shortly.",
          code: "openai_client_secret_failed",
          upstreamStatus: response.status,
          requestId: response.headers.get("x-request-id"),
        },
        { status: 502 },
      );
    }

    const clientSecret = extractClientSecret(data);

    if (!clientSecret) {
      console.error("OpenAI client secret response was missing a usable value.", {
        requestId: response.headers.get("x-request-id"),
      });
      return corsJson(
        request,
        {
          error: "Voice agent is unavailable. Please try again shortly.",
          code: "openai_client_secret_missing",
          requestId: response.headers.get("x-request-id"),
        },
        { status: 502 },
      );
    }

    const sql = getSql();
    await sql`
      insert into conversations (id, started_at, page_url, transcript, had_lead)
      values (${sessionContext.conversationId}, now(), ${pageUrl || null}, '[]'::jsonb, false)
      on conflict (id) do nothing
    `;

    return corsJson(request, {
      clientSecret,
      sessionContext,
      conversationId: sessionContext.conversationId,
      maxCallSeconds: settings.max_call_seconds,
      greeting: settings.greeting,
      modelId: settings.model_id,
    });
  } catch (error) {
    console.error(error);
    return corsJson(
      request,
      {
        error: "Voice agent is unavailable. Please try again shortly.",
        code: "session_failed",
      },
      { status: 500 },
    );
  }
}
