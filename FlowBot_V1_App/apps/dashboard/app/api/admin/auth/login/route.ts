import { loginAdmin } from "@flowbot/db/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { setAdminSessionCookie } from "../../../../../lib/admin-auth";
import { clientIp, rateLimit } from "../../../../../lib/rate-limit";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export async function POST(request: Request) {
  const limited = rateLimit(request, { scope: "admin-login", limit: 10, windowMs: 60_000, key: clientIp(request) });
  if (limited) return limited;
  const body = loginSchema.safeParse(await request.json().catch(() => null));
  const tenantId = process.env.TENANT_ID;

  if (!body.success || !tenantId) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid login request." } }, { status: 422 });
  }

  const result = await loginAdmin({
    tenantId,
    email: body.data.email,
    password: body.data.password
  });

  if (!result.ok) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid email or password." } }, { status: 401 });
  }

  await setAdminSessionCookie(result.sessionToken, result.expiresAt);

  return NextResponse.json({
    user: result.user
  });
}
