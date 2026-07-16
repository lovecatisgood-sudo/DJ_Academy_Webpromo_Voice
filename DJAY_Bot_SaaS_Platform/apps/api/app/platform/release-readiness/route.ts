import { platformRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { safeJson } from "../../../lib/http";
import { resolvePlatformRequest } from "../../../lib/platform-context";

export async function GET(request: NextRequest) {
  const resolved = await resolvePlatformRequest(request);
  if (!resolved || !platformRoleAllows(resolved.context.role, "platform.health.read")) {
    return safeJson({ status: "not_found" }, 404);
  }
  const [operations, usage] = await Promise.all([
    resolved.services.platformOperations.readinessOverview(
      resolved.context, resolved.services.env.OPERATIONS_ENVIRONMENT,
    ),
    resolved.services.platformCommerce.reconciliationOverview(resolved.context),
  ]);
  const usageGate = platformRoleAllows(resolved.context.role, "platform.billing.read")
    ? Object.freeze({
      passing: usage.status === "healthy", status: usage.status,
      attentionAccounts: usage.summary.attentionAccounts,
      activeWithoutCurrentAccount: usage.summary.activeWithoutCurrentAccount,
      orphanUsageEvents: usage.summary.orphanUsageEvents,
      expiredOpenReservations: usage.summary.expiredOpenReservations,
    })
    : Object.freeze({ passing: usage.status === "healthy", status: usage.status });
  const ready = operations.status === "ready" && usageGate.passing;
  return safeJson({
    readiness: Object.freeze({
      ...operations, releaseVersion: resolved.services.env.OPERATIONS_RELEASE_VERSION,
      status: ready ? "ready" as const : "blocked" as const, usage: usageGate,
    }),
  });
}
