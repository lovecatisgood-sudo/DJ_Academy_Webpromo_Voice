import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const dynamic = "force-static";

const approvedFlowFile = resolve(process.cwd(), "../../docs/design/djay-bot-text-voice-configuration-flow.html");

export async function GET() {
  const html = await readFile(approvedFlowFile, "utf8");
  return new Response(html, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
