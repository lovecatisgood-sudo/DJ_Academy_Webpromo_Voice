import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { csvResponse } from "../../../lib/csv";
import { safeJson } from "../../../lib/http";
import { resolveTenantRequest } from "../../../lib/tenant-context";

const querySchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(30), product: z.enum(["all", "flowbot", "ai_chat", "voice"]).default("all") });

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "leads.read") || !tenantRoleAllows(resolved.context.role, "conversations.read")) return safeJson({ status: "not_found" }, 404);
  const parsed = querySchema.safeParse({ days: request.nextUrl.searchParams.get("days") ?? undefined, product: request.nextUrl.searchParams.get("product") ?? undefined });
  if (!parsed.success) return safeJson({ status: "validation_failed" }, 400);
  const report = await resolved.services.sharedDomain.operationsReport(resolved.context, {
    days: parsed.data.days, ...(parsed.data.product === "all" ? {} : { productKey: parsed.data.product }),
  });
  if (request.nextUrl.searchParams.get("format") !== "csv") return safeJson({ report });
  return csvResponse("djay-operations-report.csv", [
    ["report_days", report.days], ["product_filter", report.productKey ?? "all"], ["as_of", report.asOf.toISOString()],
    ["metric", "value"], ...Object.entries(report.summary).map(([metric, value]) => [metric, value]),
    ["confirmed_value_currency", "amount_minor", "event_count"], ...report.values.map((item) => [item.currency, item.amountMinor, item.events]),
    ["lead_status", "leads"], ...report.outcomes.map((item) => [item.status, item.leads]),
    ["product", "conversations"], ...report.products.map((item) => [item.productKey, item.conversations]),
    ["date", "conversations", "leads", "appointments", "callbacks"], ...report.daily.map((item) => [item.date, item.conversations, item.leads, item.appointments, item.callbacks]),
  ]);
}
