import { NextResponse } from "next/server";
import { buildVersion } from "@/lib/build-info";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: "djai-voice-sales-agent",
      buildVersion,
      time: new Date().toISOString(),
    },
    {
      headers: {
        "X-DJAI-Build": buildVersion,
      },
    },
  );
}
