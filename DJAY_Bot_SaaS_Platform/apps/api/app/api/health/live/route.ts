export function GET() {
  return Response.json({ status: "ok", app: "api", phase: "p1" }, {
    headers: { "Cache-Control": "no-store" },
  });
}

