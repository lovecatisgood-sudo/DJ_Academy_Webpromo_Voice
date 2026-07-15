import { getAdminSession } from "@flowbot/db/auth";
import { NextResponse } from "next/server";
import { getAdminSessionToken } from "../../../../lib/admin-auth";

export async function GET() {
  const sessionToken = await getAdminSessionToken();

  if (!sessionToken) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Not signed in." } }, { status: 401 });
  }

  const user = await getAdminSession({ sessionToken });

  if (!user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Not signed in." } }, { status: 401 });
  }

  return NextResponse.json({ user });
}
