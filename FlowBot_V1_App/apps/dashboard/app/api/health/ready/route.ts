import { NextResponse } from "next/server";
import { dbEnvSchema } from "@flowbot/db/env";

export function GET() {
  const env = dbEnvSchema.safeParse(process.env);

  return NextResponse.json(
    {
      ok: env.success,
      service: "flowbot-dashboard",
      status: env.success ? "ready" : "not_ready",
      checks: {
        env: env.success
      }
    },
    { status: env.success ? 200 : 503 }
  );
}
