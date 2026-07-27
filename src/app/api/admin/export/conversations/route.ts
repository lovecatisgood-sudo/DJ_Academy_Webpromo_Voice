import { isAdminApiFailure, requireAdminApi } from "@/lib/admin-auth";
import { toCsv } from "@/lib/csv";
import { getSql } from "@/lib/db";
import { localeFromRequest } from "@/lib/request-locale";

export const dynamic = "force-dynamic";

function filterValue(value: string | null) {
  return value === "leads" || value === "no_leads" || value === "starred" || value === "failed" ? value : "all";
}

function channelValue(value: string | null) {
  return value === "voice_widget" || value === "text_widget" ? value : "all";
}

export async function GET(request: Request) {
  const admin = await requireAdminApi();
  if (isAdminApiFailure(admin)) return admin;
  const params = new URL(request.url).searchParams;
  const filter = filterValue(params.get("filter"));
  const channel = channelValue(params.get("channel"));
  const q = (params.get("q") || "").trim().slice(0, 120);
  const search = `%${q}%`;
  const includeDeleted = params.get("includeDeleted") === "1";
  const sql = getSql();
  const rows = (await sql`
    select
      id,
      channel,
      interaction_mode,
      provider,
      model_id,
      started_at,
      ended_at,
      duration_seconds,
      language,
      page_url,
      had_lead,
      starred,
      analysis_status,
      interest_level,
      business_type,
      main_problem,
      business_goal,
      concern_or_objection,
      recommended_service,
      next_action,
      summary
    from conversations
    where (${includeDeleted} or deleted_at is null)
      and (
        ${admin.role === "master_admin"}::boolean
        or assigned_admin_id = ${admin.id}
        or exists (
          select 1 from leads
          where leads.conversation_id = conversations.id
            and leads.assigned_admin_id = ${admin.id}
        )
      )
      and (${channel} = 'all' or channel = ${channel})
      and (
        ${filter} = 'all'
        or (${filter} = 'leads' and had_lead)
        or (${filter} = 'no_leads' and not had_lead)
        or (${filter} = 'starred' and starred)
        or (${filter} = 'failed' and analysis_status = 'failed')
      )
      and (
        ${q} = ''
        or coalesce(page_url, '') ilike ${search}
        or coalesce(summary, '') ilike ${search}
        or coalesce(main_problem, '') ilike ${search}
        or coalesce(recommended_service, '') ilike ${search}
      )
    order by started_at desc
  `) as Record<string, unknown>[];
  const headers = [
    "id",
    "channel",
    "interaction_mode",
    "provider",
    "model_id",
    "started_at",
    "ended_at",
    "duration_seconds",
    "language",
    "page_url",
    "had_lead",
    "starred",
    "analysis_status",
    "interest_level",
    "business_type",
    "main_problem",
    "business_goal",
    "concern_or_objection",
    "recommended_service",
    "next_action",
    "summary",
  ];
  const csv = toCsv(rows, headers, localeFromRequest(request) === "th" ? {
    id: "รหัสการสนทนา", channel: "ช่องทาง", interaction_mode: "รูปแบบการสนทนา", provider: "ผู้ให้บริการ",
    model_id: "รหัสโมเดล", started_at: "เริ่มเมื่อ", ended_at: "สิ้นสุดเมื่อ", duration_seconds: "ระยะเวลา (วินาที)",
    language: "ภาษา", page_url: "หน้าเว็บ", had_lead: "เก็บข้อมูลผู้สนใจได้", starred: "ติดดาว",
    analysis_status: "สถานะการวิเคราะห์", interest_level: "ระดับความสนใจ", business_type: "ประเภทธุรกิจ",
    main_problem: "ปัญหาหลัก", business_goal: "เป้าหมายธุรกิจ", concern_or_objection: "ข้อกังวลหรือข้อโต้แย้ง",
    recommended_service: "บริการที่แนะนำ", next_action: "ขั้นตอนถัดไป", summary: "สรุป",
  } : {});

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="djai-conversations-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
