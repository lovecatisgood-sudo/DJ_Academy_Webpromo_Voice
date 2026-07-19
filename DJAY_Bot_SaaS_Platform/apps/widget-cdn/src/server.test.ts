import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createWidgetCdnServer } from "./server";

const servers: ReturnType<typeof createWidgetCdnServer>[] = [];
afterEach(async () => Promise.all(servers.splice(0).map((server) => new Promise<void>((done) => server.close(() => done())))));

function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), "djay-widget-cdn-"));
  for (const path of ["ai-chat/v1/index.js", "flowbot/v1/index.js", "voice/v1/index.js"]) {
    const file = resolve(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `export const product = ${JSON.stringify(path)};\n`);
  }
  return root;
}

async function start() {
  const server = createWidgetCdnServer(fixture());
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server_address_missing");
  return `http://127.0.0.1:${address.port}`;
}

describe("widget CDN origin", () => {
  it("serves only admitted bundles with cross-origin cache headers", async () => {
    const origin = await start();
    const response = await fetch(`${origin}/flowbot/v1/index.js`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
    expect(response.headers.get("cache-control")).toBe("public, max-age=300, must-revalidate");
    expect(await response.text()).toContain("flowbot/v1/index.js");

    const cached = await fetch(`${origin}/flowbot/v1/index.js`, { headers: { "If-None-Match": response.headers.get("etag")! } });
    expect(cached.status).toBe(304);
    expect((await fetch(`${origin}/release-manifest.json`)).status).toBe(404);
    expect((await fetch(`${origin}/../package.json`)).status).toBe(404);
  });

  it("exposes uncached liveness and rejects mutation methods", async () => {
    const origin = await start();
    const health = await fetch(`${origin}/health/live`);
    expect(await health.json()).toEqual({ status: "ok", app: "widget-cdn" });
    expect(health.headers.get("cache-control")).toBe("no-store");
    expect((await fetch(`${origin}/flowbot/v1/index.js`, { method: "POST" })).status).toBe(405);
  });
});
