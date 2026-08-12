import { platformRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { safeJson } from "../../../../lib/http";
import { resolvePlatformRequest } from "../../../../lib/platform-context";

export async function GET(request: NextRequest, { params }: Readonly<{ params: Promise<{ tenantId: string }> }>) {
  const resolved = await resolvePlatformRequest(request);
  if (!resolved || !platformRoleAllows(resolved.context.role, "platform.tenants.read")) return safeJson({ status: "not_found" }, 404);
  const parsed = z.uuid().safeParse((await params).tenantId);
  if (!parsed.success) return safeJson({ status: "not_found" }, 404);
  const overview = await resolved.services.platformSupport.tenant360(resolved.context, parsed.data);
  return overview ? safeJson({ overview }) : safeJson({ status: "not_found" }, 404);
}
