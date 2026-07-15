import { deleteTeamMember } from "../../../../../lib/admin-settings";
import { apiError, apiJson } from "../../../../../lib/api";
import { requireAdmin } from "../../../../../lib/require-admin";

export async function DELETE(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  const { userId } = await params;
  try {
    const result = await deleteTeamMember(admin, userId);
    if (!result) return apiError("NOT_FOUND", "User not found.", 404);
    return apiJson(result);
  } catch (error) {
    const status = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 500;
    return apiError(
      status === 403 ? "FORBIDDEN" : status === 409 ? "CONFLICT" : "INTERNAL",
      error instanceof Error ? error.message : "Team request failed.",
      status
    );
  }
}
