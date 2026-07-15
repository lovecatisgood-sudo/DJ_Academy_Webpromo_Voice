import type { VerifiedWebhook } from "@djay/usage-billing";
import type { DatabaseClient } from "./client";

export class BillingWebhookStore {
  constructor(private readonly client: DatabaseClient) {}

  async inbox(input: Readonly<{
    providerKey: string;
    event: VerifiedWebhook;
    payloadHash: Buffer;
    payloadCiphertext: string;
  }>) {
    return this.client.begin(async (sql) => {
      const inserted = await sql<{ id: string }[]>`
        INSERT INTO billing.webhook_events (
          provider_key, external_event_id, event_type, occurred_at,
          payload_hash, payload_ciphertext
        ) VALUES (
          ${input.providerKey}, ${input.event.externalEventId}, ${input.event.eventType},
          ${input.event.occurredAt}, ${input.payloadHash}, ${input.payloadCiphertext}
        )
        ON CONFLICT (provider_key, external_event_id) DO NOTHING
        RETURNING id
      `;
      if (inserted[0]) return { status: "received" as const };
      const existing = await sql<{ matches: boolean }[]>`
        SELECT payload_hash = ${input.payloadHash} AS matches
        FROM billing.webhook_events
        WHERE provider_key = ${input.providerKey}
          AND external_event_id = ${input.event.externalEventId}
        FOR UPDATE
      `;
      return existing[0]?.matches
        ? { status: "replayed" as const }
        : { status: "event_id_conflict" as const };
    });
  }
}
