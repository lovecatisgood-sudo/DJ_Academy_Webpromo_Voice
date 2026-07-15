export type VoiceGatewayCapacity = Readonly<{
  acceptingNewSessions: boolean;
  activeSessions: number;
  maxSessions: number;
}>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export function createVoiceGatewayHandler(input: Readonly<{
  capacity: () => VoiceGatewayCapacity;
  ready: () => boolean;
}>) {
  return async (request: Request) => {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health/live") return json({ status: "live" });
    if (request.method === "GET" && url.pathname === "/health/ready") {
      return input.ready() ? json({ status: "ready" }) : json({ status: "not_ready" }, 503);
    }
    if (request.method === "GET" && url.pathname === "/v1/capacity") {
      const capacity = input.capacity();
      return json({ status: capacity.acceptingNewSessions ? "available" : "paused", ...capacity });
    }
    return json({ status: "not_found" }, 404);
  };
}
