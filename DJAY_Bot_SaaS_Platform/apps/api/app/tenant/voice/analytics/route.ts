import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { safeJson } from "../../../../lib/http";
import { resolveTenantRequest } from "../../../../lib/tenant-context";

function csvCell(value: string | number) {
  const text = String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "voice.read")) {
    return safeJson({ status: "not_found" }, 404);
  }
  const rawDeploymentId = request.nextUrl.searchParams.get("deploymentId");
  const deploymentId = rawDeploymentId ? z.uuid().safeParse(rawDeploymentId) : null;
  if (deploymentId && !deploymentId.success) return safeJson({ status: "validation_failed" }, 400);
  const days = Math.min(365, Math.max(1, Number(request.nextUrl.searchParams.get("days")) || 30));
  const analytics = await resolved.services.voiceDeployments.analytics(resolved.context, {
    ...(deploymentId?.success ? { deploymentId: deploymentId.data } : {}), periodDays: days,
  });
  if (!analytics) return safeJson({ status: "not_found" }, 404);
  if (request.nextUrl.searchParams.get("format") !== "csv") return safeJson({ analytics });
  const rows: (string | number)[][] = [
    ["metric", "value"], ["period_days", analytics.periodDays], ["analytics_level", analytics.level],
    ...Object.entries(analytics.summary).map(([metric, value]) => [metric, value ?? "not_available"]),
    ...analytics.outcomes.map((item) => [`outcome:${item.outcome}`, item.calls]),
    ...analytics.languages.map((item) => [`language:${item.locale}`, item.calls]),
    ...analytics.terminalReasons.map((item) => [`terminal_reason:${item.reason}`, item.calls]),
    ...analytics.turnFailures.map((item) => [`turn_failure:${item.errorCode}`, item.turns]),
    ["date", "sessions", "completed_calls", "failed_calls", "leads"],
    ...analytics.daily.map((item) => [
      item.date, item.sessions, item.completedCalls, item.failedCalls, item.leads,
    ]),
  ];
  return new Response(rows.map((row) => row.map(csvCell).join(",")).join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": "attachment; filename=djay-voice-analytics.csv",
      "cache-control": "no-store", "x-content-type-options": "nosniff",
    },
  });
}
