import { tenantRoleAllows } from "@djay/authorization";
import { uuidSchema } from "@djay/shared";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { resolveTenantRequest } from "../../../../../lib/tenant-context";

export async function GET(request: NextRequest, route: { params: Promise<{ jobId: string }> }) {
  const resolved = await resolveTenantRequest(request);
  const parsed = uuidSchema.safeParse((await route.params).jobId);
  if (!resolved || !parsed.success || !tenantRoleAllows(resolved.context.role, "privacy.manage")) {
    return NextResponse.json({ status: "not_found" }, { status: 404 });
  }
  if (!resolved.services.privacyExportKey) return NextResponse.json({ status: "temporarily_unavailable" }, { status: 503 });
  const artifact = await resolved.services.privacy.readExport(resolved.context, parsed.data, resolved.services.privacyExportKey);
  if (!artifact) return NextResponse.json({ status: "not_found" }, { status: 404 });
  return new NextResponse(JSON.stringify(artifact, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="djay-privacy-export-${parsed.data}.json"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
