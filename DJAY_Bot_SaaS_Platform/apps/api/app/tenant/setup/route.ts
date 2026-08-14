import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { safeJson } from "../../../lib/http";
import { resolveTenantRequest } from "../../../lib/tenant-context";

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "onboarding.read")) {
    return safeJson({ status: "not_found" }, 404);
  }
  const canReadFlowBot = tenantRoleAllows(resolved.context.role, "flowbot.read");
  const [onboarding, bots] = await Promise.all([
    resolved.services.tenantWorkspace.getOnboarding(resolved.context),
    canReadFlowBot ? resolved.services.flowbot.listBots(resolved.context) : Promise.resolve([]),
  ]);
  if (!onboarding) return safeJson({ status: "not_found" }, 404);
  const selectedBot = bots[0];
  return safeJson({
    selectedTenantId: resolved.context.tenantId,
    workspaces: resolved.session.workspaces,
    onboarding,
    bots,
    selectedBotId: selectedBot?.id ?? null,
    draft: selectedBot ? { revision: selectedBot.draftRevision } : null,
  });
}
