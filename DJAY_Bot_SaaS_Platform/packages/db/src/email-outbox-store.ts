import type { EmailOutboxStore } from "@djay/notifications";
import type { DatabaseClient } from "./client";

export class PostgresEmailOutboxStore implements EmailOutboxStore {
  constructor(private readonly client: DatabaseClient) {}

  async claimBatch(now: Date, limit: number, staleBefore: Date) {
    const rows = await this.client<{
      id: string;
      topic: string;
      payload_ciphertext: string;
      attempt_count: number;
    }[]>`
      WITH candidates AS (
        SELECT id
        FROM operations.outbox
        WHERE topic IN (
          'auth.verify_email', 'auth.recover_password',
          'tenant.invitation', 'tenant.ownership_transfer'
        )
          AND available_at <= ${now}
          AND (
            status IN ('pending', 'failed')
            OR (status = 'processing' AND locked_at < ${staleBefore})
          )
        ORDER BY available_at, created_at, id
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE operations.outbox outbox
      SET status = 'processing', locked_at = ${now}, attempt_count = outbox.attempt_count + 1
      FROM candidates
      WHERE outbox.id = candidates.id
      RETURNING outbox.id, outbox.topic, outbox.payload_ciphertext, outbox.attempt_count
    `;
    return rows.map((row) => ({
      id: row.id,
      topic: row.topic,
      payloadCiphertext: row.payload_ciphertext,
      attemptCount: row.attempt_count,
    }));
  }

  async markSent(id: string, now: Date) {
    await this.client`
      UPDATE operations.outbox
      SET status = 'sent', processed_at = ${now}, locked_at = NULL, last_error_code = NULL
      WHERE id = ${id}::uuid AND status = 'processing'
    `;
  }

  async markFailed(id: string, now: Date, errorCode: string, retryAt: Date, deadLetter: boolean) {
    await this.client`
      UPDATE operations.outbox
      SET status = ${deadLetter ? "dead_letter" : "failed"},
          available_at = ${retryAt}, locked_at = NULL,
          processed_at = ${deadLetter ? now : null}, last_error_code = ${errorCode}
      WHERE id = ${id}::uuid AND status = 'processing'
    `;
    await this.client`
      INSERT INTO operations.audit_logs (
        realm, action, target_type, target_id, request_id, result, metadata
      ) VALUES (
        'system', 'notification.delivery_failed', 'operations_outbox', ${id},
        ${`email-worker:${id}`}, 'failed',
        ${this.client.json({ errorCode, deadLetter })}
      )
    `;
  }
}
