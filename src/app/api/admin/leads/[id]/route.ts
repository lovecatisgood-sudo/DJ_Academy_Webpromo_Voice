import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
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
  await requireAdmin();
  const { id } = await params;
  const body = (await request.json()) as { status?: string };

  if (!["new", "contacted", "closed"].includes(body.status || "")) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const sql = getSql();
  await sql`update leads set status = ${body.status} where id = ${id}`;
  return NextResponse.json({ ok: true });
}
