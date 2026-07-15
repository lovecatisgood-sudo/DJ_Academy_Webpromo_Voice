import { createSqlClient } from "@flowbot/db";
import { apiError } from "../../../../../lib/api";
import { getMessagesAfter } from "../../../../../lib/flowbot-runtime";
import { rateLimit } from "../../../../../lib/rate-limit";
import { subscribeToConversation, type HubEvent } from "../../../../../lib/sse-hub";
import { verifyStreamToken } from "../../../../../lib/stream-token";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = rateLimit(request, { scope: "widget-stream", limit: 6, windowMs: 60_000 });
  if (limited) return limited;
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const payload = token ? verifyStreamToken(token) : null;
  if (!payload) return apiError("UNAUTHORIZED", "Invalid stream token.", 401);

  const lastEventId = request.headers.get("last-event-id") ?? "0";
  const sql = createSqlClient();
  const encoder = new TextEncoder();
  const buffered: HubEvent[] = [];
  let live = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown, id?: string) => {
        const lines = [`event: ${event}`];
        if (id) lines.push(`id: ${id}`);
        lines.push(`data: ${JSON.stringify(data)}`, "", "");
        controller.enqueue(encoder.encode(lines.join("\n")));
      };

      const unsubscribe = subscribeToConversation(payload.conversationId, (event) => {
        if (!live) {
          buffered.push(event);
          return;
        }
        if (event.type === "message") send("message", event.payload, event.sequence);
        if (event.type === "state") send("state", event.payload);
      });

      request.signal.addEventListener("abort", () => {
        unsubscribe();
        controller.close();
      });

      const messages = await getMessagesAfter(sql, payload.tenantId, payload.conversationId, lastEventId);
      const highWater = BigInt(messages.at(-1)?.sequence ?? lastEventId);
      for (const message of messages) send("message", message, message.sequence);
      for (const event of buffered) {
        if (event.type === "message" && BigInt(event.sequence) > highWater) send("message", event.payload, event.sequence);
        if (event.type === "state") send("state", event.payload);
      }
      buffered.length = 0;
      live = true;
      send("ping", { at: new Date().toISOString() });

      const interval = setInterval(() => {
        try {
          send("ping", { at: new Date().toISOString() });
        } catch {
          clearInterval(interval);
          unsubscribe();
        }
      }, 25000);
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive"
    }
  });
}
