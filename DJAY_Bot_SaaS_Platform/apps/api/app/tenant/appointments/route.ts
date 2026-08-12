import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../lib/http";
import { resolveTenantRequest } from "../../../lib/tenant-context";
import { csvResponse } from "../../../lib/csv";

const exportFilterSchema = z.enum(["open", "requested", "pending_confirmation", "confirmed", "rescheduled", "completed", "cancelled", "all"]);
const openStatuses = new Set(["requested", "pending_confirmation", "confirmed", "rescheduled"]);

const updateSchema = z.object({
  appointmentId: z.uuid(),
  status: z.enum(["pending_confirmation", "confirmed", "rescheduled", "completed", "cancelled", "rejected", "no_show"]),
  optionId: z.uuid().optional(), notes: z.string().trim().max(2000).optional(),
}).strict();

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "leads.read")) return safeJson({ status: "not_found" }, 404);
  const appointments = await resolved.services.sharedDomain.listAppointments(resolved.context);
  if (request.nextUrl.searchParams.get("format") === "csv") {
    const parsedFilter = exportFilterSchema.safeParse(request.nextUrl.searchParams.get("filter") ?? "all");
    if (!parsedFilter.success) return safeJson({ status: "validation_failed" }, 400);
    const visible = parsedFilter.data === "all" ? appointments
      : parsedFilter.data === "open" ? appointments.filter((item) => openStatuses.has(item.status))
        : appointments.filter((item) => item.status === parsedFilter.data);
    return csvResponse("djay-appointments.csv", [
      ["appointment_id", "contact_name", "lead_title", "status", "calendar_sync_status", "calendar_sync_operation", "timezone", "proposed_times", "notes", "created_at", "updated_at"],
      ...visible.map((item) => [
        item.id, item.contactName, item.leadTitle, item.status, item.calendarSyncStatus, item.calendarSyncOperation, item.timezone,
        item.options.map((option) => `${option.startAt.toISOString()}–${option.endAt.toISOString()} (${option.verificationStatus})`).join("; "),
        item.notes, item.createdAt.toISOString(), item.updatedAt.toISOString(),
      ]),
    ]);
  }
  return safeJson({ appointments });
}

export async function PATCH(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "leads.write") || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  try {
    const input = updateSchema.parse(await readJson(request));
    const result = await resolved.services.sharedDomain.updateAppointment(resolved.context, input.appointmentId, {
      status: input.status, ...(input.optionId ? { optionId: input.optionId } : {}), ...(input.notes ? { notes: input.notes } : {}),
    });
    return safeJson(result, result.status === "accepted" ? 200 : result.status === "invalid_transition" ? 409 : result.status === "validation_failed" ? 422 : 404);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
