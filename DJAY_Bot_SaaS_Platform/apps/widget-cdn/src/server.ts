import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { resolve } from "node:path";

const assetPaths = [
  "/ai-chat/v1/index.js",
  "/flowbot/v1/index.js",
  "/voice/v1/index.js",
] as const;

type Asset = { body: Buffer; etag: string };

function loadAssets(root: string) {
  return new Map<string, Asset>(assetPaths.map((path) => {
    const body = readFileSync(resolve(root, path.slice(1)));
    const etag = `"${createHash("sha256").update(body).digest("base64url")}"`;
    return [path, { body, etag }];
  }));
}

export function createWidgetCdnServer(assetRoot: string): Server {
  const assets = loadAssets(assetRoot);
  return createServer((request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD", "Cache-Control": "no-store" });
      response.end();
      return;
    }

    let pathname: string;
    try {
      pathname = new URL(request.url ?? "/", "http://widget.invalid").pathname;
    } catch {
      response.writeHead(400, { "Cache-Control": "no-store" });
      response.end();
      return;
    }

    if (pathname === "/health/live" || pathname === "/health/ready") {
      const body = Buffer.from(JSON.stringify({ status: pathname.endsWith("ready") ? "ready" : "ok", app: "widget-cdn" }));
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Length": String(body.length),
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(request.method === "HEAD" ? undefined : body);
      return;
    }

    const asset = assets.get(pathname);
    if (!asset) {
      response.writeHead(404, { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      response.end();
      return;
    }

    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300, must-revalidate",
      "Content-Length": String(asset.body.length),
      "Content-Type": "text/javascript; charset=utf-8",
      "Cross-Origin-Resource-Policy": "cross-origin",
      ETag: asset.etag,
      "X-Content-Type-Options": "nosniff",
    };
    if (request.headers["if-none-match"] === asset.etag) {
      response.writeHead(304, headers);
      response.end();
      return;
    }
    response.writeHead(200, headers);
    response.end(request.method === "HEAD" ? undefined : asset.body);
  });
}
