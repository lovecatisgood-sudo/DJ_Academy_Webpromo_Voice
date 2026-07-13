import { requireAdmin } from "@/lib/admin-auth";
import { toCsv } from "@/lib/csv";
import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";

function statusValue(value: string | null) {
  return value === "pending_confirmation" ||
    value === "confirmed" ||
    value === "rejected" ||
    value === "cancelled" ||
    value === "completed" ||
    value === "no_show"
    ? value
    : "all";
}

export async function GET(request: Request) {
  const admin = await requireAdmin();
  const params = new URL(request.url).searchParams;
  const status = statusValue(params.get("status"));
  const q = (params.get("q") || "").trim().slice(0, 120);
  const search = `%${q}%`;
  const sql = getSql();
  const rows = (await sql`
    select
      a.id,
      a.created_at,
      a.updated_at,
      a.status,
      a.source,
      a.start_at,
      a.end_at,
      a.timezone,
      a.duration_minutes,
      a.client_name,
      a.company_name,
      a.email,
      a.phone,
      a.line_id,
      a.whatsapp,
      a.note,
      a.admin_notes,
      au.name as assigned_admin,
      a.lead_id,
      a.conversation_id
    from appointments a
    left join admin_users au on au.id = a.assigned_admin_id
    where a.deleted_at is null
      and (
        ${admin.role === "master_admin"}::boolean
        or a.assigned_admin_id = ${admin.id}
      )
      and (${status} = 'all' or a.status = ${status})
      and (
        ${q} = ''
        or coalesce(a.client_name, '') ilike ${search}
        or coalesce(a.company_name, '') ilike ${search}
        or coalesce(a.email, '') ilike ${search}
        or coalesce(a.phone, '') ilike ${search}
      )
    order by a.start_at desc
  `) as Record<string, unknown>[];
  const csv = toCsv(rows, [
    "id",
    "created_at",
    "updated_at",
    "status",
    "source",
    "start_at",
    "end_at",
    "timezone",
    "duration_minutes",
    "client_name",
    "company_name",
    "email",
    "phone",
    "line_id",
    "whatsapp",
    "note",
    "admin_notes",
    "assigned_admin",
    "lead_id",
    "conversation_id",
  ]);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="djai-appointments-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
