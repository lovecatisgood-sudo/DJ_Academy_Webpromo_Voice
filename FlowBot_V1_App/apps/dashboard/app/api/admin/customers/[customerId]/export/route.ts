import { apiError, apiJson } from "../../../../../../lib/api";
import { exportCustomerData } from "../../../../../../lib/privacy-service";
import { requireAdmin } from "../../../../../../lib/require-admin";

export async function GET(_request: Request, { params }: { params: Promise<{ customerId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  const { customerId } = await params;
  try {
    const data = await exportCustomerData(admin, customerId);
    if (!data) return apiError("NOT_FOUND", "Customer not found.", 404);
    return apiJson({ export: data });
  } catch (error) {
    const status = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 500;
    return apiError(status === 403 ? "FORBIDDEN" : "INTERNAL", error instanceof Error ? error.message : "Export failed.", status);
  }
}
