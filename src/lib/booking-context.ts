import { randomBytes } from "crypto";
import { getSql } from "./db";

/**
 * Booking context — the customer details carried from a chat/voice conversation into the
 * booking page so the visitor does not retype them.
 *
 * ## Why this is stored server-side
 *
 * This previously encoded the whole context into a signed base64url token that travelled in
 * the booking URL as `?context=…`. The token was signed but **not encrypted**, so the
 * customer's name, company, email, phone, LINE ID, and WhatsApp number were readable by
 * anyone who saw the URL. A signature prevents modification; it provides no confidentiality.
 *
 * URLs are not a private channel. They land in browser history, server and reverse-proxy
 * access logs, analytics `Referer` headers, bookmark syncs, screenshots, and any link the
 * customer forwards. Putting PII there is a disclosure, not a hypothetical.
 *
 * The URL now carries only an opaque 32-byte random token with no structure and no payload.
 * The details live in the `booking_contexts` table, expire quickly, and the token is
 * single-use for the appointment mutation so a forwarded link cannot create repeat bookings.
 */

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

/**
 * Two hours, down from the previous 24. A booking link is used within minutes of the
 * conversation that produced it; a full day of validity was exposure with no benefit.
 */
const DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 2;

/** 32 bytes of CSPRNG output. Opaque — carries no payload and reveals nothing if seen. */
function newToken() {
  return randomBytes(32).toString("base64url");
}

function normalise(parsed: Partial<BookingContext>, expiresAt: number): BookingContext {
  const text = (value: unknown) => (typeof value === "string" && value !== "" ? value : null);
  return {
    leadId: text(parsed.leadId),
    conversationId: text(parsed.conversationId),
    clientName: text(parsed.clientName),
    companyName: text(parsed.companyName),
    email: text(parsed.email),
    phone: text(parsed.phone),
    lineId: text(parsed.lineId),
    whatsapp: text(parsed.whatsapp),
    sourceChannel: text(parsed.sourceChannel),
    sourceMode: text(parsed.sourceMode),
    expiresAt,
  };
}

/**
 * Persist a booking context and return the opaque token to put in the URL.
 *
 * Note this is now async — it performs a write. Callers that previously treated it as pure
 * must await it.
 */
export async function createBookingContext(
  input: Omit<BookingContext, "expiresAt">,
  maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS,
): Promise<string> {
  const sql = getSql();
  const token = newToken();
  const expiresAtSeconds = Math.floor(Date.now() / 1000) + maxAgeSeconds;

  // Only the fields the booking page actually prefills are stored. Nothing else is retained.
  const payload = {
    clientName: input.clientName,
    companyName: input.companyName,
    email: input.email,
    phone: input.phone,
    lineId: input.lineId,
    whatsapp: input.whatsapp,
    sourceChannel: input.sourceChannel ?? null,
    sourceMode: input.sourceMode ?? null,
  };

  await sql`
    insert into booking_contexts (token, payload, lead_id, conversation_id, expires_at)
    values (
      ${token},
      ${JSON.stringify(payload)}::jsonb,
      ${input.leadId},
      ${input.conversationId},
      to_timestamp(${expiresAtSeconds})
    )
  `;

  return token;
}

/**
 * Read a booking context for rendering. Does not consume it — the booking page renders on GET
 * and the appointment is created by a later POST, so consumption belongs to the mutation.
 */
export async function verifyBookingContext(token: string | null | undefined): Promise<BookingContext | null> {
  if (!token) return null;

  const sql = getSql();
  const rows = (await sql`
    select payload, lead_id, conversation_id, extract(epoch from expires_at)::bigint as expires_at_seconds
    from booking_contexts
    where token = ${token}
      and expires_at > now()
      and consumed_at is null
  `) as { payload: Partial<BookingContext>; lead_id: string | null; conversation_id: string | null; expires_at_seconds: string }[];

  const row = rows[0];
  if (!row) return null;

  return normalise(
    { ...row.payload, leadId: row.lead_id, conversationId: row.conversation_id },
    Number(row.expires_at_seconds),
  );
}

/**
 * Atomically claim a booking context for appointment creation.
 *
 * Single-use: the conditional `consumed_at is null` in the UPDATE means two concurrent
 * requests cannot both claim the same token, so a forwarded booking link cannot be replayed
 * into duplicate appointments. Returns null if the token is unknown, expired, or already used.
 */
export async function consumeBookingContext(token: string | null | undefined): Promise<BookingContext | null> {
  if (!token) return null;

  const sql = getSql();
  const rows = (await sql`
    update booking_contexts
    set consumed_at = now()
    where token = ${token}
      and expires_at > now()
      and consumed_at is null
    returning payload, lead_id, conversation_id, extract(epoch from expires_at)::bigint as expires_at_seconds
  `) as { payload: Partial<BookingContext>; lead_id: string | null; conversation_id: string | null; expires_at_seconds: string }[];

  const row = rows[0];
  if (!row) return null;

  return normalise(
    { ...row.payload, leadId: row.lead_id, conversationId: row.conversation_id },
    Number(row.expires_at_seconds),
  );
}
