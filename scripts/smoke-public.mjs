const baseUrl = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const origin = process.env.SMOKE_ORIGIN || "https://djai.academy";

async function assertResponse(path, expectedStatus, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);

  if (response.status !== expectedStatus) {
    throw new Error(`${options.method || "GET"} ${path} expected ${expectedStatus}, got ${response.status}`);
  }

  return response;
}

await assertResponse("/", 200, { method: "HEAD" });

const health = await assertResponse("/api/health", 200);
const healthJson = await health.json();

if (!healthJson.ok) {
  throw new Error("/api/health did not return ok=true");
}

const widget = await assertResponse("/djai-voice-widget.js", 200, { method: "HEAD" });
const contentType = widget.headers.get("content-type") || "";

if (!contentType.includes("javascript")) {
  throw new Error(`/djai-voice-widget.js returned unexpected content-type: ${contentType}`);
}

const preflight = await assertResponse("/api/session", 204, {
  method: "OPTIONS",
  headers: {
    Origin: origin,
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "Content-Type",
  },
});

const allowOrigin = preflight.headers.get("access-control-allow-origin");

if (!allowOrigin) {
  throw new Error("/api/session preflight did not include access-control-allow-origin");
}

console.log(`Public smoke test passed for ${baseUrl}`);
