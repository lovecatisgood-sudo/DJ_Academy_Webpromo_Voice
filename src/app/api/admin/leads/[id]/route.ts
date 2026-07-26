import { NextResponse } from "next/server";
import { isAdminApiFailure, requireAdminApi } from "@/lib/admin-auth";
import { getSql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  },
) {
  const admin = await requireAdminApi();
  if (isAdminApiFailure(admin)) return admin;

  const { id } = await params;
  const body = (await request.json()) as { status?: string };

  if (!["pending_follow_up", "appointment_set", "follow_up_later", "deal_closed", "no_deal"].includes(body.status || "")) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const sql = getSql();
  const rows = (await sql`
    update leads
    set status = ${body.status}, updated_at = now()
    where id = ${id}
      and (
        ${admin.role === "master_admin"}::boolean
        or assigned_admin_id = ${admin.id}
      )
    returning id
  `) as { id: string }[];

  if (!rows[0]?.id) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
