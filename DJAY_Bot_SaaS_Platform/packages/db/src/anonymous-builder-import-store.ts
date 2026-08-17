import { createHash, randomUUID } from "node:crypto";
import type { DatabaseClient } from "./client";

export type AnonymousBuilderImportJob = Readonly<{
  id: string;
  draftRevision: number;
  requestedUrl: string;
  normalizedUrl: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled" | "stale";
  generation: number;
  profile: unknown | null;
  errorReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}>;

type JobRow = Readonly<{
  id: string;
  expected_draft_revision: number;
  requested_url: string;
  normalized_url: string;
  status: AnonymousBuilderImportJob["status"];
  generation: number;
  profile: unknown | null;
  error_reason: string | null;
  created_at: Date;
  updated_at: Date;
}>;

function mapJob(row: JobRow): AnonymousBuilderImportJob {
  return Object.freeze({
    id: row.id,
    draftRevision: row.expected_draft_revision,
    requestedUrl: row.requested_url,
    normalizedUrl: row.normalized_url,
    status: row.status,
    generation: row.generation,
    profile: row.profile,
    errorReason: row.error_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class AnonymousBuilderImportStore {
  constructor(private readonly client: DatabaseClient) {}

  async createJob(input: Readonly<{
    sessionId: string;
    idempotencyKey: string;
    draftRevision: number;
    requestedUrl: string;
    normalizedUrl: string;
    now?: Date;
  }>): Promise<Readonly<{ status: "created" | "replayed" | "conflict" | "unavailable"; job?: AnonymousBuilderImportJob }>> {
    const now = input.now ?? new Date();
    return this.client.begin(async (sql) => {
      const existing = await sql<JobRow[]>`
        SELECT job.id, job.expected_draft_revision, job.requested_url, job.normalized_url,
          job.status, job.generation, job.profile_json AS profile, job.error_reason,
          job.created_at, job.updated_at
        FROM builder.website_import_jobs job
        JOIN builder.anonymous_sessions session ON session.id = job.session_id
        WHERE job.session_id = ${input.sessionId}::uuid
          AND job.idempotency_key = ${input.idempotencyKey}::uuid
          AND session.status = 'active' AND session.expires_at > ${now}
        LIMIT 1
      `;
      if (existing[0]) {
        const same = existing[0].expected_draft_revision === input.draftRevision
          && existing[0].normalized_url === input.normalizedUrl;
        return same
          ? { status: "replayed" as const, job: mapJob(existing[0]) }
          : { status: "conflict" as const };
      }
      const drafts = await sql<{ id: string }[]>`
        SELECT draft.id FROM builder.drafts draft
        JOIN builder.anonymous_sessions session ON session.id = draft.session_id
        WHERE draft.session_id = ${input.sessionId}::uuid
          AND draft.status = 'active' AND session.status = 'active'
          AND session.pending_registration_id IS NULL
          AND draft.expires_at > ${now} AND session.expires_at > ${now}
          AND draft.revision = ${input.draftRevision}
        FOR UPDATE OF draft
      `;
      if (!drafts[0]) return { status: "unavailable" as const };
      const rows = await sql<JobRow[]>`
        INSERT INTO builder.website_import_jobs (
          id, session_id, draft_id, idempotency_key, expected_draft_revision,
          requested_url, normalized_url, status, created_at, updated_at
        ) VALUES (
          ${randomUUID()}::uuid, ${input.sessionId}::uuid, ${drafts[0].id}::uuid,
          ${input.idempotencyKey}::uuid, ${input.draftRevision}, ${input.requestedUrl},
          ${input.normalizedUrl}, 'queued', ${now}, ${now}
        )
        RETURNING id, expected_draft_revision, requested_url, normalized_url, status,
          generation, profile_json AS profile, error_reason, created_at, updated_at
      `;
      return { status: "created" as const, job: mapJob(rows[0]!) };
    });
  }

  async getJob(sessionId: string, jobId: string, now = new Date()) {
    const rows = await this.client<JobRow[]>`
      SELECT job.id, job.expected_draft_revision, job.requested_url, job.normalized_url,
        job.status, job.generation, job.profile_json AS profile, job.error_reason,
        job.created_at, job.updated_at
      FROM builder.website_import_jobs job
      JOIN builder.anonymous_sessions session ON session.id = job.session_id
      WHERE job.id = ${jobId}::uuid AND job.session_id = ${sessionId}::uuid
        AND session.status = 'active' AND session.expires_at > ${now}
      LIMIT 1
    `;
    return rows[0] ? mapJob(rows[0]) : null;
  }

  async claimJob(sessionId: string, jobId: string, now = new Date()): Promise<Readonly<{
    status: "started" | "in_progress" | "completed" | "stale" | "retry_exhausted" | "unavailable";
    job?: AnonymousBuilderImportJob;
  }>> {
    return this.client.begin(async (sql) => {
      const rows = await sql<(JobRow & { current_revision: number; started_at: Date | null })[]>`
        SELECT job.id, job.expected_draft_revision, job.requested_url, job.normalized_url,
          job.status, job.generation, job.profile_json AS profile, job.error_reason,
          job.created_at, job.updated_at, draft.revision AS current_revision, job.started_at
        FROM builder.website_import_jobs job
        JOIN builder.drafts draft ON draft.id = job.draft_id AND draft.session_id = job.session_id
        JOIN builder.anonymous_sessions session ON session.id = job.session_id
        WHERE job.id = ${jobId}::uuid AND job.session_id = ${sessionId}::uuid
          AND session.status = 'active' AND session.expires_at > ${now}
          AND session.pending_registration_id IS NULL
        FOR UPDATE OF job
      `;
      const row = rows[0];
      if (!row) return { status: "unavailable" as const };
      if (row.status === "completed") return { status: "completed" as const, job: mapJob(row) };
      if (row.status === "running") return { status: "in_progress" as const, job: mapJob(row) };
      const nextGeneration = row.status === "queued" ? row.generation : row.generation + 1;
      if (nextGeneration > 3) return { status: "retry_exhausted" as const, job: mapJob(row) };
      if (row.current_revision !== row.expected_draft_revision) {
        await sql`
          UPDATE builder.website_import_jobs SET status = 'stale', generation = ${nextGeneration},
            started_at = ${now}, completed_at = ${now}, error_reason = 'draft_revision_changed', updated_at = ${now}
          WHERE id = ${row.id}::uuid
        `;
        await sql`
          INSERT INTO builder.website_import_attempts (
            job_id, generation, status, started_at, completed_at, error_reason
          ) VALUES (${row.id}::uuid, ${nextGeneration}, 'stale', ${now}, ${now}, 'draft_revision_changed')
        `;
        return { status: "stale" as const };
      }
      const started = await sql<JobRow[]>`
        UPDATE builder.website_import_jobs SET status = 'running', generation = ${nextGeneration},
          started_at = ${now}, completed_at = NULL, profile_json = NULL, error_reason = NULL, updated_at = ${now}
        WHERE id = ${row.id}::uuid
        RETURNING id, expected_draft_revision, requested_url, normalized_url, status,
          generation, profile_json AS profile, error_reason, created_at, updated_at
      `;
      return { status: "started" as const, job: mapJob(started[0]!) };
    });
  }

  async completeJob(input: Readonly<{
    sessionId: string;
    jobId: string;
    generation: number;
    profile: object;
    warnings: readonly string[];
    provenance: ReadonlyArray<Readonly<{ name: string; url: string }>>;
    pageCount: number;
    now?: Date;
  }>): Promise<Readonly<{ status: "completed" | "cancelled" | "stale" | "unavailable"; job?: AnonymousBuilderImportJob }>> {
    const now = input.now ?? new Date();
    return this.client.begin(async (sql) => {
      const rows = await sql<(JobRow & { current_revision: number; started_at: Date | null })[]>`
        SELECT job.id, job.expected_draft_revision, job.requested_url, job.normalized_url,
          job.status, job.generation, job.profile_json AS profile, job.error_reason,
          job.created_at, job.updated_at, draft.revision AS current_revision, job.started_at
        FROM builder.website_import_jobs job
        JOIN builder.drafts draft ON draft.id = job.draft_id AND draft.session_id = job.session_id
        WHERE job.id = ${input.jobId}::uuid AND job.session_id = ${input.sessionId}::uuid
        FOR UPDATE OF job
      `;
      const row = rows[0];
      if (!row) return { status: "unavailable" as const };
      if (row.status === "cancelled") return { status: "cancelled" as const };
      if (row.status !== "running" || row.generation !== input.generation || !row.started_at) {
        return { status: "unavailable" as const };
      }
      if (row.current_revision !== row.expected_draft_revision) {
        await sql`
          UPDATE builder.website_import_jobs SET status = 'stale', completed_at = ${now},
            error_reason = 'draft_revision_changed', updated_at = ${now}
          WHERE id = ${row.id}::uuid
        `;
        await sql`
          INSERT INTO builder.website_import_attempts (
            job_id, generation, status, started_at, completed_at, error_reason
          ) VALUES (${row.id}::uuid, ${row.generation}, 'stale', ${row.started_at}, ${now}, 'draft_revision_changed')
        `;
        return { status: "stale" as const };
      }
      const serialized = JSON.stringify(input.profile);
      const completed = await sql<JobRow[]>`
        UPDATE builder.website_import_jobs SET status = 'completed', profile_json = ${sql.json(input.profile as never)},
          completed_at = ${now}, error_reason = NULL, updated_at = ${now}
        WHERE id = ${row.id}::uuid
        RETURNING id, expected_draft_revision, requested_url, normalized_url, status,
          generation, profile_json AS profile, error_reason, created_at, updated_at
      `;
      await sql`
        INSERT INTO builder.website_import_attempts (
          job_id, generation, status, started_at, completed_at, page_count,
          warnings_json, profile_sha256, provenance_json
        ) VALUES (
          ${row.id}::uuid, ${row.generation}, 'completed', ${row.started_at}, ${now}, ${input.pageCount},
          ${sql.json(input.warnings as never)}, ${createHash("sha256").update(serialized).digest()},
          ${sql.json(input.provenance as never)}
        )
      `;
      return { status: "completed" as const, job: mapJob(completed[0]!) };
    });
  }

  async failJob(input: Readonly<{
    sessionId: string;
    jobId: string;
    generation: number;
    reason: string;
    now?: Date;
  }>) {
    const now = input.now ?? new Date();
    return this.client.begin(async (sql) => {
      const rows = await sql<{ id: string; status: string; started_at: Date; generation: number }[]>`
        SELECT id, status, started_at, generation FROM builder.website_import_jobs
        WHERE id = ${input.jobId}::uuid AND session_id = ${input.sessionId}::uuid
        FOR UPDATE
      `;
      const row = rows[0];
      if (!row || row.status !== "running" || row.generation !== input.generation) {
        return { status: row?.status === "cancelled" ? "cancelled" as const : "unavailable" as const };
      }
      await sql`
        UPDATE builder.website_import_jobs SET status = 'failed', completed_at = ${now},
          error_reason = ${input.reason}, updated_at = ${now} WHERE id = ${row.id}::uuid
      `;
      await sql`
        INSERT INTO builder.website_import_attempts (
          job_id, generation, status, started_at, completed_at, error_reason
        ) VALUES (${row.id}::uuid, ${row.generation}, 'failed', ${row.started_at}, ${now}, ${input.reason})
      `;
      return { status: "failed" as const };
    });
  }

  async cancelJob(sessionId: string, jobId: string, now = new Date()) {
    return this.client.begin(async (sql) => {
      const rows = await sql<{ id: string; status: string; generation: number; started_at: Date | null }[]>`
        SELECT job.id, job.status, job.generation, job.started_at
        FROM builder.website_import_jobs job
        JOIN builder.anonymous_sessions session ON session.id = job.session_id
        WHERE job.id = ${jobId}::uuid AND job.session_id = ${sessionId}::uuid
          AND session.status = 'active' AND session.expires_at > ${now}
        FOR UPDATE OF job
      `;
      const row = rows[0];
      if (!row) return { status: "unavailable" as const };
      if (["completed", "cancelled"].includes(row.status)) return { status: row.status as "completed" | "cancelled" };
      await sql`
        UPDATE builder.website_import_jobs SET status = 'cancelled', completed_at = ${now},
          error_reason = NULL, updated_at = ${now} WHERE id = ${row.id}::uuid
      `;
      if (row.status === "running" && row.started_at) await sql`
        INSERT INTO builder.website_import_attempts (
          job_id, generation, status, started_at, completed_at
        ) VALUES (${row.id}::uuid, ${row.generation}, 'cancelled', ${row.started_at}, ${now})
      `;
      return { status: "cancelled" as const };
    });
  }
}
