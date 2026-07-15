import { scheduleConversationAnalysis } from "@/lib/background-analysis";
import { corsJson, corsNoContent, isAllowedCorsRequest } from "@/lib/cors";
import { getSql } from "@/lib/db";
import { readJsonBody } from "@/lib/http-guards";
import { checkRateLimit } from "@/lib/rate-limit";
import { elapsedMs, logServerTiming, nowMs } from "@/lib/server-timing";
import { verifySessionContext } from "@/lib/session-context";
import { getCachedSettings } from "@/lib/settings-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return corsNoContent(request);
}

export async function POST(request: Request) {
  const startedAt = nowMs();
  let dbMs = 0;
  let analysisMs = 0;
  let conversationId: string | null = null;
  try {
    if (!isAllowedCorsRequest(request)) {
      return corsJson(request, { error: "Origin is not allowed." }, { status: 403 });
    }

    const body = (await readJsonBody(request, 4096)) as { sessionContext?: unknown };
    const session = verifySessionContext(body.sessionContext);
    conversationId = session.conversationId;
    const rateLimit = checkRateLimit(`chat-end:${session.conversationId}`, 10, 60 * 60 * 1000);

    if (!rateLimit.allowed) {
      return corsJson(request, { error: "Too many chat end attempts." }, { status: 429 });
    }

    const sql = getSql();
    const dbStartedAt = nowMs();
    const [row] = (await sql`
      update conversations
      set
        ended_at = coalesce(ended_at, now()),
        analysis_status = case when message_count > 0 then 'pending' else 'skipped' end
      where id = ${session.conversationId}
        and channel = 'text_widget'
        and deleted_at is null
      returning id, message_count
    `) as { id: string; message_count: number }[];
    dbMs += elapsedMs(dbStartedAt);

    if (!row) {
      return corsJson(request, { error: "Chat session not found." }, { status: 404 });
    }

    if (row.message_count > 0) {
      const analysisStartedAt = nowMs();
      scheduleConversationAnalysis(session.conversationId, await getCachedSettings());
      analysisMs += elapsedMs(analysisStartedAt);
    }

    return corsJson(request, { ok: true, analysis: row.message_count > 0 ? "pending" : "skipped" });
  } catch (error) {
    console.error(error);
    return corsJson(request, { error: error instanceof Error ? error.message : "Chat end failed." }, { status: 400 });
  } finally {
    logServerTiming({
      route: "api.chat.end",
      conversationId,
      channel: "text_widget",
      dbMs,
      analysisMs,
      totalMs: elapsedMs(startedAt),
    });
  }
}
