import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { safeJson } from "../../../../lib/http";
import { resolveTenantRequest } from "../../../../lib/tenant-context";

function csvCell(value: string | number) {
  const text = String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "flowbot.read")) return safeJson({ status: "not_found" }, 404);
  const days = Math.min(365, Math.max(1, Number(request.nextUrl.searchParams.get("days")) || 30));
  const analytics = await resolved.services.flowbot.analytics(resolved.context, days);
  if (!analytics) return safeJson({ status: "not_found" }, 404);
  if (request.nextUrl.searchParams.get("format") !== "csv") return safeJson({ analytics });
  const rows: (string | number)[][] = [
    ["metric", "value"], ["executions", analytics.executions], ["completed", analytics.completed],
    ["handovers", analytics.handovers], ["leads", analytics.leads], ["messages", analytics.messages],
    ...analytics.nodeEvents.map((item) => [`event:${item.eventType}`, item.eventCount]),
  ];
  return new Response(rows.map((row) => row.map(csvCell).join(",")).join("\r\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=flowbot-analytics.csv", "cache-control": "no-store" },
  });
}
