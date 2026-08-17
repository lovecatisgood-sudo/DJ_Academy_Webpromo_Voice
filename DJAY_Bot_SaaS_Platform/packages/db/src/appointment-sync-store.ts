import type { DatabaseClient } from "./client";

export type AppointmentSyncClaim = Readonly<{
  job_id: string;
  tenant_id: string;
  appointment_request_id: string;
  operation: "create" | "update" | "cancel";
  provider_kind: "google_calendar" | "webhook";
  config_ciphertext: string;
  start_at: Date | null;
  end_at: Date | null;
  timezone: string;
  external_event_ref: string | null;
  attempt_count: number;
}>;

export class AppointmentSyncWorkerStore {
  constructor(private readonly client: DatabaseClient) {}

  async claim() {
    return this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'appointment_sync_worker', true)`;
      const rows = await sql<AppointmentSyncClaim[]>`
        SELECT * FROM tenancy.claim_appointment_sync_job(
          transaction_timestamp(),
          transaction_timestamp() - interval '5 minutes'
        )
      `;
      return rows[0] ?? null;
    });
  }

  async finish(jobId: string, input: Readonly<{
    succeeded: boolean;
    externalEventRef?: string;
    safeErrorCode?: string;
  }>) {
    const rows = await this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'appointment_sync_worker', true)`;
      return sql<{ changed: boolean }[]>`
        SELECT tenancy.finish_appointment_sync_job(
          ${jobId}::uuid, ${input.succeeded}, ${input.externalEventRef ?? null}, ${input.safeErrorCode ?? null}
        ) AS changed
      `;
    });
    return rows[0]?.changed === true;
  }
}
