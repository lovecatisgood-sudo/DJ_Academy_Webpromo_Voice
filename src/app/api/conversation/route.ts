import { getSql } from "@/lib/db";
import { verifySessionContext } from "@/lib/session-context";
import type { ConversationLanguage, TranscriptItem } from "@/lib/types";
import { corsJson, corsNoContent } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return corsNoContent(request);
}

async function parseRequestBody(request: Request) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return request.json();
  }

  const text = await request.text();
  return text ? JSON.parse(text) : {};
}

function parseTranscript(value: unknown): TranscriptItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is TranscriptItem => {
      if (!item || typeof item !== "object") {
        return false;
      }
      const row = item as Record<string, unknown>;
      return typeof row.role === "string" && typeof row.text === "string";
    })
    .slice(0, 500)
    .map((item) => ({
      role: item.role,
      text: item.text.slice(0, 4000),
      t: typeof item.t === "number" ? item.t : Date.now(),
    }));
}

function parseLanguage(value: unknown): ConversationLanguage {
  return value === "th" || value === "en" || value === "mixed" ? value : "mixed";
}

export async function POST(request: Request) {
  try {
    const body = (await parseRequestBody(request)) as {
      sessionContext?: unknown;
      duration_seconds?: unknown;
      language?: unknown;
      page_url?: unknown;
      transcript?: unknown;
    };
    const session = verifySessionContext(body.sessionContext);
    const transcript = parseTranscript(body.transcript);
    const duration = typeof body.duration_seconds === "number" ? Math.max(0, Math.round(body.duration_seconds)) : null;
    const pageUrl = typeof body.page_url === "string" ? body.page_url.slice(0, 1000) : null;
    const language = parseLanguage(body.language);
    const sql = getSql();

    await sql`
      insert into conversations (
        id,
        started_at,
        ended_at,
        duration_seconds,
        language,
        page_url,
        transcript,
        had_lead
      )
      values (
        ${session.conversationId},
        now() - (${duration ?? 0} * interval '1 second'),
        now(),
        ${duration},
        ${language},
        ${pageUrl},
        ${JSON.stringify(transcript)},
        exists(select 1 from leads where conversation_id = ${session.conversationId})
      )
      on conflict (id) do update set
        ended_at = excluded.ended_at,
        duration_seconds = excluded.duration_seconds,
        language = excluded.language,
        page_url = excluded.page_url,
        transcript = excluded.transcript,
        had_lead = conversations.had_lead or excluded.had_lead
    `;

    return corsJson(request, { ok: true });
  } catch (error) {
    console.error(error);
    return corsJson(request, { error: error instanceof Error ? error.message : "Conversation save failed." }, { status: 400 });
  }
}
