const baseUrl = process.env.FLOWBOT_BASE_URL ?? "http://127.0.0.1:3025";
const botKey = process.env.FLOWBOT_BOT_KEY ?? "flowbot_test_web";
const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;

async function postStreamToken() {
  return fetch(`${baseUrl}/api/w/${botKey}/stream-token`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip
    },
    body: JSON.stringify({})
  });
}

for (let index = 0; index < 10; index += 1) {
  const response = await postStreamToken();
  if (response.status === 429) {
    throw new Error(`Rate limited too early at request ${index + 1}.`);
  }
}

const limited = await postStreamToken();
if (limited.status !== 429) {
  throw new Error(`Expected request 11 to be rate limited, got ${limited.status}: ${await limited.text()}`);
}
if (!limited.headers.get("retry-after")) throw new Error("Expected Retry-After header.");

console.log(
  JSON.stringify(
    {
      ok: true,
      route: "stream-token",
      status: limited.status,
      retryAfter: limited.headers.get("retry-after")
    },
    null,
    2
  )
);
