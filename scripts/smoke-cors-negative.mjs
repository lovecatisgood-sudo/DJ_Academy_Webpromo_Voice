const baseUrl = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");

async function assertStatus(path, expectedStatus, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  if (response.status !== expectedStatus) {
    throw new Error(`${options.method || "GET"} ${path} expected ${expectedStatus}, got ${response.status}`);
  }
  return response;
}

const evil = await assertStatus("/api/session", 403, {
  method: "POST",
  headers: {
    Origin: "https://evil.example",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({}),
});

const evilJson = await evil.json();
if (!evilJson.error) {
  throw new Error("evil Origin session response missing error payload");
}

const allowOrigin = evil.headers.get("access-control-allow-origin");
if (allowOrigin === "https://evil.example") {
  throw new Error("evil Origin must not receive Access-Control-Allow-Origin echo");
}

await assertStatus("/api/lead", 403, {
  method: "POST",
  headers: {
    Origin: "https://evil.example",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ sessionContext: "x", lead: {} }),
});

console.log(`CORS negative smoke passed for ${baseUrl}`);
