import { getServices } from "../../../../lib/container";

export async function GET() {
  try {
    const result = await (await getServices()).databaseReadiness.check();
    return Response.json({ status: result.status, app: "api" }, {
      status: result.status === "ready" ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ status: "unavailable", app: "api" }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
