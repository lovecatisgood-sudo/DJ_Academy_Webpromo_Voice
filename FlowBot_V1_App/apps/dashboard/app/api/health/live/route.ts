import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "flowbot-dashboard",
    status: "live"
  });
}
