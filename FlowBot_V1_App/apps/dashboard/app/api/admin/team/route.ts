import { z } from "zod";
import { createTeamMember, listTeamMembers, userRoles } from "../../../../lib/admin-settings";
import { apiError, apiJson } from "../../../../lib/api";
import { requireAdmin } from "../../../../lib/require-admin";

const memberSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().min(1).max(160),
  role: z.enum(userRoles),
  password: z.string().min(12).max(200)
});

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  try {
    return apiJson({ users: await listTeamMembers(admin) });
  } catch (error) {
    return handleTeamError(error);
  }
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  const body = memberSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError("VALIDATION", "Invalid team member.", 422, body.error.flatten());
  try {
    return apiJson({ user: await createTeamMember(admin, body.data) }, 201);
  } catch (error) {
    return handleTeamError(error);
  }
}

function handleTeamError(error: unknown) {
  const status = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 500;
  return apiError(status === 403 ? "FORBIDDEN" : "INTERNAL", error instanceof Error ? error.message : "Team request failed.", status);
}
