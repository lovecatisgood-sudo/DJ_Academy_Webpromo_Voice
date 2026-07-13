import { getSql } from "@/lib/db";
import { parseLeadPayload } from "@/lib/lead-validation";
import { verifySessionContext } from "@/lib/session-context";
import { corsJson, corsNoContent } from "@/lib/cors";
import { readJsonBody } from "@/lib/http-guards";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return corsNoContent(request);
}

export async function POST(request: Request) {
  try {
    const body = (await readJsonBody(request, 20000)) as { sessionContext?: unknown; lead?: unknown };
    const session = verifySessionContext(body.sessionContext);
    const rateLimit = checkRateLimit(`lead:${session.conversationId}`, 5, 60 * 60 * 1000);

    if (!rateLimit.allowed) {
      return corsJson(
        request,
        { error: "Too many lead capture attempts for this session." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
      );
    }

    const lead = parseLeadPayload(body.lead);
    const sql = getSql();

    const rows = (await sql`
      with conversation_row as (
        insert into conversations (id, started_at, had_lead)
        values (${session.conversationId}, now(), true)
        on conflict (id) do update set had_lead = true
        returning id
      ),
      lead_row as (
        insert into leads (conversation_id, name, contact, contact_type, need, preferred_time)
        select
          id,
          ${lead.name},
          ${lead.contact},
          ${lead.contact_type},
          ${lead.need},
          ${lead.preferred_time}
        from conversation_row
        on conflict (conversation_id, contact) do update set
          name = excluded.name,
          contact_type = excluded.contact_type,
          need = excluded.need,
          preferred_time = excluded.preferred_time
        returning id
      )
      select id from lead_row
    `) as { id: string }[];

    return corsJson(request, { ok: true, leadId: rows[0]?.id ?? null });
  } catch (error) {
    console.error(error);
    return corsJson(request, { error: error instanceof Error ? error.message : "Lead capture failed." }, { status: 400 });
  }
}
