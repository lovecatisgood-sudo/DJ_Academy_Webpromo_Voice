import { revokeAdminSession } from "@flowbot/db/auth";
import { NextResponse } from "next/server";
import { clearAdminSessionCookie, getAdminSessionToken } from "../../../../../lib/admin-auth";

export async function POST() {
  const sessionToken = await getAdminSessionToken();

  if (sessionToken) {
    await revokeAdminSession({ sessionToken });
  }

  await clearAdminSessionCookie();
  return NextResponse.json({ ok: true });
}
