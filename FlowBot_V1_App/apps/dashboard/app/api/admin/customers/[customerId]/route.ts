import { z } from "zod";
import { softDeleteCustomer, updateCustomer } from "../../../../../lib/admin-crm";
import { apiError, apiJson } from "../../../../../lib/api";
import { requireAdmin } from "../../../../../lib/require-admin";

const customerPatchSchema = z.object({
  name: z.string().trim().max(200).nullable().optional(),
  email: z.string().trim().email().nullable().optional().or(z.literal("")),
  phone: z.string().trim().max(80).nullable().optional(),
  lineId: z.string().trim().max(120).nullable().optional(),
  whatsapp: z.string().trim().max(120).nullable().optional(),
  note: z.string().trim().max(4000).nullable().optional()
});

export async function PATCH(request: Request, { params }: { params: Promise<{ customerId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  const { customerId } = await params;
  const body = customerPatchSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError("VALIDATION", "Invalid customer update.", 422, body.error.flatten());
  const customer = await updateCustomer(admin, customerId, body.data);
  if (!customer) return apiError("NOT_FOUND", "Customer not found.", 404);
  return apiJson({ customer });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ customerId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  const { customerId } = await params;
  const customer = await softDeleteCustomer(admin, customerId);
  if (!customer) return apiError("NOT_FOUND", "Customer not found.", 404);
  return apiJson({ deleted: true });
}
