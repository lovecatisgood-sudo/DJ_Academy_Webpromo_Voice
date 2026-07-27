import { isAdminApiFailure, requireAdminApi } from "@/lib/admin-auth";
import { toCsv } from "@/lib/csv";
import { getSql } from "@/lib/db";
import { localeFromRequest } from "@/lib/request-locale";

export const dynamic = "force-dynamic";

function statusValue(value: string | null) {
  return value === "pending_follow_up" ||
    value === "appointment_set" ||
    value === "follow_up_later" ||
    value === "deal_closed" ||
    value === "no_deal"
    ? value
    : "all";
}

function channelValue(value: string | null) {
  return value === "voice_widget" || value === "text_widget" ? value : "all";
}

export async function GET(request: Request) {
  const admin = await requireAdminApi();
  if (isAdminApiFailure(admin)) return admin;
  const params = new URL(request.url).searchParams;
  const status = statusValue(params.get("status"));
  const channel = channelValue(params.get("channel"));
  const q = (params.get("q") || "").trim().slice(0, 120);
  const search = `%${q}%`;
  const includeDeleted = params.get("includeDeleted") === "1";
  const sql = getSql();
  const rows = (await sql`
    select
      leads.id,
      leads.created_at,
      leads.updated_at,
      leads.status,
      leads.source_channel,
      leads.source_mode,
      leads.client_name,
      leads.company_name,
      leads.phone,
      leads.email,
      leads.line_id,
      leads.whatsapp,
      leads.other_contact,
      leads.preferred_contact_method,
      leads.preferred_meeting_day,
      leads.preferred_meeting_time,
      leads.admin_notes,
      leads.need,
      conversations.id as conversation_id,
      conversations.interest_level,
      conversations.main_problem,
      conversations.concern_or_objection,
      conversations.recommended_service,
      conversations.next_action
    from leads
    left join conversations on conversations.id = leads.conversation_id
    where (${status} = 'all' or leads.status = ${status})
      and (${channel} = 'all' or leads.source_channel = ${channel})
      and (${includeDeleted} or conversations.deleted_at is null or conversations.id is null)
      and (
        ${admin.role === "master_admin"}::boolean
        or leads.assigned_admin_id = ${admin.id}
      )
      and (
        ${q} = ''
        or coalesce(leads.client_name, leads.name, '') ilike ${search}
        or coalesce(leads.company_name, '') ilike ${search}
        or coalesce(leads.phone, leads.email, leads.line_id, leads.whatsapp, leads.other_contact, leads.contact, '') ilike ${search}
        or coalesce(conversations.main_problem, '') ilike ${search}
        or coalesce(conversations.recommended_service, '') ilike ${search}
      )
    order by leads.updated_at desc nulls last, leads.created_at desc
  `) as Record<string, unknown>[];
  const headers = [
    "id",
    "created_at",
    "updated_at",
    "status",
    "source_channel",
    "source_mode",
    "client_name",
    "company_name",
    "phone",
    "email",
    "line_id",
    "whatsapp",
    "other_contact",
    "preferred_contact_method",
    "preferred_meeting_day",
    "preferred_meeting_time",
    "admin_notes",
    "need",
    "conversation_id",
    "interest_level",
    "main_problem",
    "concern_or_objection",
    "recommended_service",
    "next_action",
  ];
  const csv = toCsv(rows, headers, localeFromRequest(request) === "th" ? {
    id: "รหัสผู้สนใจ", created_at: "สร้างเมื่อ", updated_at: "อัปเดตเมื่อ", status: "สถานะ",
    source_channel: "ช่องทางต้นทาง", source_mode: "รูปแบบการติดต่อ", client_name: "ชื่อลูกค้า",
    company_name: "บริษัท", phone: "โทรศัพท์", email: "อีเมล", line_id: "LINE ID", whatsapp: "WhatsApp",
    other_contact: "ช่องทางติดต่ออื่น", preferred_contact_method: "ช่องทางที่สะดวก",
    preferred_meeting_day: "วันที่สะดวกนัดหมาย", preferred_meeting_time: "เวลาที่สะดวกนัดหมาย",
    admin_notes: "บันทึกภายใน", need: "ความต้องการ", conversation_id: "รหัสการสนทนา",
    interest_level: "ระดับความสนใจ", main_problem: "ปัญหาหลัก", concern_or_objection: "ข้อกังวลหรือข้อโต้แย้ง",
    recommended_service: "บริการที่แนะนำ", next_action: "ขั้นตอนถัดไป",
  } : {});

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="djai-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
