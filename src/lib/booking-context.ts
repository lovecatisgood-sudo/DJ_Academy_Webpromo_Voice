import { createHmac, timingSafeEqual } from "crypto";
import { optionalEnv, requireEnv } from "./env";

export type BookingContext = {
  leadId: string | null;
  conversationId: string | null;
  clientName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  lineId: string | null;
  whatsapp: string | null;
  sourceChannel?: string | null;
  sourceMode?: string | null;
  expiresAt: number;
};

function secret() {
  return optionalEnv("SESSION_SIGNING_SECRET") || optionalEnv("SESSION_PASSWORD") || requireEnv("SESSION_PASSWORD");
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function constantEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function createBookingContext(input: Omit<BookingContext, "expiresAt">, maxAgeSeconds = 60 * 60 * 24) {
  const payload = Buffer.from(JSON.stringify({
    ...input,
    expiresAt: Math.floor(Date.now() / 1000) + maxAgeSeconds,
  })).toString("base64url");

  return `${payload}.${sign(payload)}`;
}

export function verifyBookingContext(token: string | null | undefined): BookingContext | null {
  if (!token) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature || !constantEquals(signature, sign(payload))) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<BookingContext>;

    if (typeof parsed.expiresAt !== "number" || parsed.expiresAt < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return {
      leadId: typeof parsed.leadId === "string" ? parsed.leadId : null,
      conversationId: typeof parsed.conversationId === "string" ? parsed.conversationId : null,
      clientName: typeof parsed.clientName === "string" ? parsed.clientName : null,
      companyName: typeof parsed.companyName === "string" ? parsed.companyName : null,
      email: typeof parsed.email === "string" ? parsed.email : null,
      phone: typeof parsed.phone === "string" ? parsed.phone : null,
      lineId: typeof parsed.lineId === "string" ? parsed.lineId : null,
      whatsapp: typeof parsed.whatsapp === "string" ? parsed.whatsapp : null,
      sourceChannel: typeof parsed.sourceChannel === "string" ? parsed.sourceChannel : null,
      sourceMode: typeof parsed.sourceMode === "string" ? parsed.sourceMode : null,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}
