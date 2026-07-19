import { createServer } from "node:http";
import { assertNoProductionPlaceholders } from "@djay/shared/production-config";
import { z } from "zod";
import { createAiGatewayHandler } from "./server";

const env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8080),
  AI_TEXT_GATEWAY_SERVICE_TOKEN: z.string().min(32),
  OPENAI_API_KEY: z.string().min(20),
  OPENAI_RESPONSES_MODEL: z.string().trim().min(2).max(160),
}).parse(process.env);

assertNoProductionPlaceholders(env.NODE_ENV, env);
const handler = createAiGatewayHandler({
  serviceToken: env.AI_TEXT_GATEWAY_SERVICE_TOKEN,
  openAiApiKey: env.OPENAI_API_KEY,
  openAiModel: env.OPENAI_RESPONSES_MODEL,
});

const server = createServer(async (request, response) => {
  const body = request.method === "GET" || request.method === "HEAD"
    ? undefined
    : await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      request.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 512 * 1024) {
          reject(new Error("request_too_large"));
          request.destroy();
        } else chunks.push(chunk);
      });
      request.on("end", () => resolve(Buffer.concat(chunks)));
      request.on("error", reject);
    });
  const webRequest = new Request(`http://127.0.0.1:${env.PORT}${request.url ?? "/"}`, {
    method: request.method ?? "GET",
    headers: request.headers as HeadersInit,
    ...(body ? { body: body.toString("utf8") } : {}),
  });
  const result = await handler(webRequest);
  const headers: Record<string, string> = {};
  result.headers.forEach((value, name) => { headers[name] = value; });
  response.writeHead(result.status, headers);
  response.end(Buffer.from(await result.arrayBuffer()));
});

server.listen(env.PORT, "0.0.0.0", () => {
  console.info("ai_gateway_listening", { port: env.PORT });
});
