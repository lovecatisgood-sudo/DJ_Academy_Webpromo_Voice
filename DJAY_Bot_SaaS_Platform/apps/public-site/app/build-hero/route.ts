import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const dynamic = "force-static";

const heroFile = resolve(process.cwd(), "../../docs/design/djay-merchant-automation-hero.png");

export async function GET() {
  return new Response(await readFile(heroFile), {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "image/png",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
