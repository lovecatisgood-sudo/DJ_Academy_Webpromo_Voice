import { getSql } from "@/lib/db";
import { parseLeadPayload } from "@/lib/lead-validation";
import { verifySessionContext } from "@/lib/session-context";
import { corsJson, corsNoContent } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return corsNoContent(request);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { sessionContext?: unknown; lead?: unknown };
    const session = verifySessionContext(body.sessionContext);
    const lead = parseLeadPayload(body.lead);
    const sql = getSql();

    await sql`
      insert into conversations (id, started_at, had_lead)
      values (${session.conversationId}, now(), true)
      on conflict (id) do update set had_lead = true
    `;

    const rows = (await sql`
      insert into leads (conversation_id, name, contact, contact_type, need, preferred_time)
      values (
        ${session.conversationId},
        ${lead.name},
        ${lead.contact},
        ${lead.contact_type},
        ${lead.need},
        ${lead.preferred_time}
      )
      on conflict (conversation_id, contact) do update set
        name = excluded.name,
        contact_type = excluded.contact_type,
        need = excluded.need,
        preferred_time = excluded.preferred_time
      returning id
    `) as { id: string }[];

    return corsJson(request, { ok: true, leadId: rows[0]?.id ?? null });
  } catch (error) {
    console.error(error);
    return corsJson(request, { error: error instanceof Error ? error.message : "Lead capture failed." }, { status: 400 });
  }
}
