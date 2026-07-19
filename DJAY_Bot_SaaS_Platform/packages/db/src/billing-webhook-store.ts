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

  async claim(now = new Date()) {
    return this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'billing_webhook_worker', true),
        set_config('app.request_id', ${crypto.randomUUID()}, true)`;
      const rows = await sql<{
        webhook_event_id: string; event_type: string; occurred_at: Date;
        payload_hash_hex: string; payload_ciphertext: string; attempt_count: number;
      }[]>`
        SELECT * FROM billing.claim_stripe_webhook(
          ${now}, ${new Date(now.getTime() - 10 * 60 * 1_000)}
        )
      `;
      const row = rows[0];
      return row ? Object.freeze({
        webhookEventId: row.webhook_event_id, eventType: row.event_type,
        occurredAt: row.occurred_at, payloadHash: row.payload_hash_hex,
        payloadCiphertext: row.payload_ciphertext, attemptCount: row.attempt_count,
      }) : null;
    });
  }

  async apply(webhookEventId: string, stripeObject: unknown, now = new Date()) {
    return this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'billing_webhook_worker', true),
        set_config('app.request_id', ${crypto.randomUUID()}, true)`;
      const eventRows = await sql<{ event_type: string }[]>`
        SELECT event_type FROM billing.webhook_events WHERE id = ${webhookEventId}::uuid
      `;
      const eventType = eventRows[0]?.event_type;
      const normalizedObject = eventType?.startsWith("customer.subscription.")
        && stripeObject && typeof stripeObject === "object"
        && typeof (stripeObject as { id?: unknown }).id === "string"
        ? { ...(stripeObject as Record<string, unknown>), subscription: (stripeObject as { id: string }).id }
        : stripeObject;
      const rows = await sql<{ status: string }[]>`
        SELECT billing.apply_stripe_webhook(
          ${webhookEventId}::uuid, ${sql.json(normalizedObject as never)}, ${now}
        ) AS status
      `;
      if (stripeObject && typeof stripeObject === "object"
        && typeof (stripeObject as { id?: unknown }).id === "string") {
        await sql`SELECT billing.synchronize_stripe_subscription_terms(
          ${webhookEventId}::uuid, ${sql.json(stripeObject as never)}, ${now}
        )`;
      }
      return { status: rows[0]?.status ?? "billing_webhook_apply_failed" };
    });
  }

  async fail(webhookEventId: string, errorCode: string, deadLetter: boolean) {
    return this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'billing_webhook_worker', true),
        set_config('app.request_id', ${crypto.randomUUID()}, true)`;
      const rows = await sql<{ finished: boolean }[]>`
        SELECT billing.fail_stripe_webhook(
          ${webhookEventId}::uuid, ${errorCode}, ${deadLetter}
        ) AS finished
      `;
      return rows[0]?.finished ?? false;
    });
  }
}

export class SubscriptionLifecycleWorkerStore {
  constructor(private readonly client: DatabaseClient) {}

  async applyNext(now = new Date()) {
    return this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'subscription_lifecycle_worker', true),
        set_config('app.request_id', ${crypto.randomUUID()}, true)`;
      const rows = await sql<{
        subscription_id: string; tenant_id: string; previous_status: string; next_status: string;
      }[]>`SELECT * FROM billing.apply_next_subscription_dunning_transition(${now})`;
      const row = rows[0];
      return row ? Object.freeze({ subscriptionId: row.subscription_id, tenantId: row.tenant_id,
        previousStatus: row.previous_status, nextStatus: row.next_status }) : null;
    });
  }
}

export class BillingWebhookRecoveryWorkerStore {
  constructor(private readonly client: DatabaseClient) {}

  async claim(now = new Date()) {
    return this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'billing_webhook_recovery_worker', true),
        set_config('app.request_id', ${crypto.randomUUID()}, true)`;
      const rows = await sql<{
        job_id: string; webhook_event_id: string; external_event_id: string;
        event_type: string; reason_code: string; attempt_count: number;
      }[]>`SELECT * FROM billing.claim_webhook_recovery(
        ${now}, ${new Date(now.getTime() - 10 * 60_000)}
      )`;
      const row = rows[0];
      return row ? Object.freeze({ jobId: row.job_id, webhookEventId: row.webhook_event_id,
        externalEventId: row.external_event_id, eventType: row.event_type,
        reasonCode: row.reason_code, attemptCount: row.attempt_count }) : null;
    });
  }

  async record(input: Readonly<{
    jobId: string; externalEventId: string; eventType: string; occurredAt: Date;
    payloadHash: Buffer; payloadCiphertext: string; retrievedAt?: Date;
  }>) {
    return this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'billing_webhook_recovery_worker', true),
        set_config('app.request_id', ${crypto.randomUUID()}, true)`;
      const rows = await sql<{ status: string }[]>`
        SELECT billing.record_webhook_recovery_evidence(
          ${input.jobId}::uuid, ${input.externalEventId}, ${input.eventType}, ${input.occurredAt},
          ${input.payloadHash}, ${input.payloadCiphertext}, ${input.retrievedAt ?? new Date()}
        ) AS status
      `;
      return { status: rows[0]?.status ?? "webhook_recovery_record_failed" };
    });
  }

  async fail(jobId: string, errorCode: string, deadLetter: boolean,
    retryAt = new Date(Date.now() + 5 * 60_000)) {
    return this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'billing_webhook_recovery_worker', true),
        set_config('app.request_id', ${crypto.randomUUID()}, true)`;
      const rows = await sql<{ finished: boolean }[]>`
        SELECT billing.fail_webhook_recovery(
          ${jobId}::uuid, ${errorCode}, ${deadLetter}, ${retryAt}
        ) AS finished
      `;
      return rows[0]?.finished ?? false;
    });
  }
}

export class FinancialReconciliationWorkerStore {
  constructor(private readonly client: DatabaseClient) {}

  async claim(now = new Date()) {
    return this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'billing_financial_reconciliation_worker', true),
        set_config('app.request_id', ${crypto.randomUUID()}, true)`;
      const rows = await sql<{
        job_id: string; invoice_document_id: string; tenant_id: string;
        external_invoice_ref: string; attempt_count: number;
      }[]>`SELECT * FROM billing.claim_financial_reconciliation(
        ${now}, ${new Date(now.getTime() - 10 * 60_000)}
      )`;
      const row = rows[0];
      return row ? Object.freeze({ jobId: row.job_id, invoiceDocumentId: row.invoice_document_id,
        tenantId: row.tenant_id, externalInvoiceRef: row.external_invoice_ref,
        attemptCount: row.attempt_count }) : null;
    });
  }

  async record(input: Readonly<{
    jobId: string; externalInvoiceRef: string; status: string; currency: string;
    totalMinor: number; amountPaidMinor: number; amountRemainingMinor: number;
    payloadHash: Buffer; payloadCiphertext: string; retrievedAt?: Date;
  }>) {
    return this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'billing_financial_reconciliation_worker', true),
        set_config('app.request_id', ${crypto.randomUUID()}, true)`;
      const rows = await sql<{ status: string }[]>`
        SELECT billing.record_financial_reconciliation(
          ${input.jobId}::uuid, ${input.externalInvoiceRef}, ${input.status}, ${input.currency},
          ${input.totalMinor}, ${input.amountPaidMinor}, ${input.amountRemainingMinor},
          ${input.payloadHash}, ${input.payloadCiphertext}, ${input.retrievedAt ?? new Date()}
        ) AS status
      `;
      return { status: rows[0]?.status ?? "financial_reconciliation_failed" };
    });
  }

  async fail(jobId: string, errorCode: string, deadLetter: boolean, retryAt = new Date(Date.now() + 5 * 60_000)) {
    return this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'billing_financial_reconciliation_worker', true),
        set_config('app.request_id', ${crypto.randomUUID()}, true)`;
      const rows = await sql<{ finished: boolean }[]>`
        SELECT billing.fail_financial_reconciliation(
          ${jobId}::uuid, ${errorCode}, ${deadLetter}, ${retryAt}
        ) AS finished
      `;
      return rows[0]?.finished ?? false;
    });
  }
}

export class FinancialEventReconciliationWorkerStore {
  constructor(private readonly client: DatabaseClient) {}

  async claim(now = new Date()) {
    return this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'billing_financial_event_reconciliation_worker', true),
        set_config('app.request_id', ${crypto.randomUUID()}, true)`;
      const rows = await sql<{
        job_id: string; tenant_id: string; evidence_kind: "payment" | "refund" | "credit_note";
        external_ref: string; attempt_count: number;
      }[]>`SELECT * FROM billing.claim_financial_event_reconciliation(
        ${now}, ${new Date(now.getTime() - 10 * 60_000)}
      )`;
      const row = rows[0];
      return row ? Object.freeze({ jobId: row.job_id, tenantId: row.tenant_id,
        evidenceKind: row.evidence_kind, externalRef: row.external_ref,
        attemptCount: row.attempt_count }) : null;
    });
  }

  async record(input: Readonly<{
    jobId: string; externalRef: string; relatedRef: string | null; status: string; currency: string;
    totalMinor: number; refundMinor: number | null; creditMinor: number | null;
    payloadHash: Buffer; payloadCiphertext: string; retrievedAt?: Date;
  }>) {
    return this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'billing_financial_event_reconciliation_worker', true),
        set_config('app.request_id', ${crypto.randomUUID()}, true)`;
      const rows = await sql<{ status: string }[]>`
        SELECT billing.record_financial_event_reconciliation(
          ${input.jobId}::uuid, ${input.externalRef}, ${input.relatedRef}, ${input.status},
          ${input.currency}, ${input.totalMinor}, ${input.refundMinor}, ${input.creditMinor},
          ${input.payloadHash}, ${input.payloadCiphertext}, ${input.retrievedAt ?? new Date()}
        ) AS status
      `;
      return { status: rows[0]!.status };
    });
  }

  async fail(jobId: string, errorCode: string, deadLetter: boolean,
    retryAt = new Date(Date.now() + 5 * 60_000)) {
    return this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'billing_financial_event_reconciliation_worker', true),
        set_config('app.request_id', ${crypto.randomUUID()}, true)`;
      const rows = await sql<{ finished: boolean }[]>`
        SELECT billing.fail_financial_event_reconciliation(
          ${jobId}::uuid, ${errorCode}, ${deadLetter}, ${retryAt}
        ) AS finished
      `;
      return rows[0]?.finished ?? false;
    });
  }
}

export class AccountingSyncWorkerStore {
  constructor(private readonly client: DatabaseClient) {}

  async claim(now = new Date()) {
    return this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'accounting_sync_worker', true),
        set_config('app.request_id', ${crypto.randomUUID()}, true)`;
      const rows = await sql<{
        job_id: string; tenant_id: string; document_kind: "invoice" | "credit_note";
        idempotency_reference: string; canonical_document: Record<string, unknown>; attempt_count: number;
      }[]>`SELECT * FROM billing.claim_accounting_sync(
        ${now}, ${new Date(now.getTime() - 10 * 60_000)}
      )`;
      const row = rows[0];
      return row ? Object.freeze({
        jobId: row.job_id, tenantId: row.tenant_id, documentKind: row.document_kind,
        idempotencyReference: row.idempotency_reference,
        canonicalDocument: Object.freeze(row.canonical_document), attemptCount: row.attempt_count,
      }) : null;
    });
  }

  async finish(input: Readonly<{
    jobId: string; outcome: "succeeded" | "rejected" | "unknown" | "rate_limited";
    requestHash: Buffer; requestCiphertext: string; responseHash: Buffer | null;
    responseCiphertext: string | null; externalRecordRef: string | null;
    externalDocumentRef: string | null; safeErrorCode: string | null;
    occurredAt?: Date; retryAt?: Date;
  }>) {
    return this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'accounting_sync_worker', true),
        set_config('app.request_id', ${crypto.randomUUID()}, true)`;
      const now = input.occurredAt ?? new Date();
      const rows = await sql<{ status: "synced" | "attention" | "retry_scheduled" }[]>`
        SELECT billing.finish_accounting_sync(
          ${input.jobId}::uuid, ${input.outcome}, ${input.requestHash}, ${input.requestCiphertext},
          ${input.responseHash}, ${input.responseCiphertext}, ${input.externalRecordRef},
          ${input.externalDocumentRef}, ${input.safeErrorCode}, ${now},
          ${input.retryAt ?? new Date(now.getTime() + 5 * 60_000)}
        ) AS status
      `;
      return { status: rows[0]!.status };
    });
  }

  async deadLetter(jobId: string, safeErrorCode: string, now = new Date()) {
    return this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'accounting_sync_worker', true),
        set_config('app.request_id', ${crypto.randomUUID()}, true)`;
      const rows = await sql<{ finished: boolean }[]>`
        SELECT billing.dead_letter_accounting_sync(${jobId}::uuid, ${safeErrorCode}, ${now}) AS finished
      `;
      return rows[0]?.finished ?? false;
    });
  }
}

export class AccountingReconciliationWorkerStore {
  constructor(private readonly client: DatabaseClient) {}

  async claim(now = new Date()) {
    return this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'accounting_reconciliation_worker', true),
        set_config('app.request_id', ${crypto.randomUUID()}, true)`;
      const rows = await sql<{
        job_id: string; tenant_id: string; accounting_reference_id: string;
        external_record_ref: string; external_document_ref: string | null;
        idempotency_reference: string; attempt_count: number;
      }[]>`SELECT * FROM billing.claim_accounting_reconciliation(
        ${now}, ${new Date(now.getTime() - 10 * 60_000)}
      )`;
      const row = rows[0];
      return row ? Object.freeze({ jobId: row.job_id, tenantId: row.tenant_id,
        accountingReferenceId: row.accounting_reference_id, externalRecordRef: row.external_record_ref,
        externalDocumentRef: row.external_document_ref, idempotencyReference: row.idempotency_reference,
        attemptCount: row.attempt_count }) : null;
    });
  }

  async record(input: Readonly<{
    jobId: string; found: boolean; externalRecordRef: string | null;
    externalDocumentRef: string | null; idempotencyReference: string | null;
    providerStatus: string | null; currency: string | null; totalMinor: number | null;
    payloadHash: Buffer; payloadCiphertext: string; retrievedAt?: Date;
  }>) {
    return this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'accounting_reconciliation_worker', true),
        set_config('app.request_id', ${crypto.randomUUID()}, true)`;
      const rows = await sql<{ status: string }[]>`
        SELECT billing.record_accounting_reconciliation(
          ${input.jobId}::uuid, ${input.found}, ${input.externalRecordRef},
          ${input.externalDocumentRef}, ${input.idempotencyReference}, ${input.providerStatus},
          ${input.currency}, ${input.totalMinor}, ${input.payloadHash}, ${input.payloadCiphertext},
          ${input.retrievedAt ?? new Date()}
        ) AS status
      `;
      return { status: rows[0]!.status };
    });
  }

  async fail(jobId: string, safeErrorCode: string, deadLetter: boolean,
    retryAt = new Date(Date.now() + 5 * 60_000)) {
    return this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'accounting_reconciliation_worker', true),
        set_config('app.request_id', ${crypto.randomUUID()}, true)`;
      const rows = await sql<{ finished: boolean }[]>`
        SELECT billing.fail_accounting_reconciliation(
          ${jobId}::uuid, ${safeErrorCode}, ${deadLetter}, ${retryAt}
        ) AS finished
      `;
      return rows[0]?.finished ?? false;
    });
  }
}
