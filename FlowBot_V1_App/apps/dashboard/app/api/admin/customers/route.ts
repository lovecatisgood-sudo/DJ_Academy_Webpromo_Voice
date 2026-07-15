import { z } from "zod";
import { createCustomer, listCustomers } from "../../../../lib/admin-crm";
import { apiError, apiJson } from "../../../../lib/api";
import { requireAdmin } from "../../../../lib/require-admin";

const customerSchema = z.object({
  name: z.string().trim().max(200).optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(80).optional(),
  lineId: z.string().trim().max(120).optional(),
  whatsapp: z.string().trim().max(120).optional(),
  note: z.string().trim().max(4000).optional()
});

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  const q = new URL(request.url).searchParams.get("q") ?? undefined;
  return apiJson({ customers: await listCustomers(admin, q) });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  const body = customerSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError("VALIDATION", "Invalid customer.", 422, body.error.flatten());
  return apiJson({ customer: await createCustomer(admin, body.data) }, 201);
}
