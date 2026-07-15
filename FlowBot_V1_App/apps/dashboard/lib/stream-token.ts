import { createHmac, timingSafeEqual } from "node:crypto";

type StreamPayload = {
  purpose: "flowbot_stream";
  tenantId: string;
  botId: string;
  conversationId: string;
  exp: number;
};

const encoder = new TextEncoder();

export function createStreamToken(payload: Omit<StreamPayload, "purpose" | "exp">, ttlSeconds = 300) {
  const body: StreamPayload = {
    ...payload,
    purpose: "flowbot_stream",
    exp: Math.floor(Date.now() / 1000) + ttlSeconds
  };
  const encodedBody = Buffer.from(JSON.stringify(body)).toString("base64url");
  const signature = sign(encodedBody);
  return {
    token: `${encodedBody}.${signature}`,
    expiresAt: new Date(body.exp * 1000).toISOString()
  };
}

export function verifyStreamToken(token: string): StreamPayload | null {
  const [encodedBody, signature] = token.split(".");
  if (!encodedBody || !signature) return null;

  const expected = sign(encodedBody);
  const expectedBytes = encoder.encode(expected);
  const actualBytes = encoder.encode(signature);
  if (expectedBytes.length !== actualBytes.length || !timingSafeEqual(expectedBytes, actualBytes)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedBody, "base64url").toString("utf8")) as StreamPayload;
    if (payload.purpose !== "flowbot_stream") return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function sign(value: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required for stream tokens.");
  return createHmac("sha256", secret).update(value).digest("base64url");
}
