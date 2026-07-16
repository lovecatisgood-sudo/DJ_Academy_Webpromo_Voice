import type { PlatformContext } from "@djay/tenancy";
import type { DatabaseClient, DatabaseTransaction } from "./client";
import { withPlatformTransaction } from "./scoped-transaction";

export const operationalServiceKeys = [
  "public_site", "tenant_api", "flowbot_runtime", "ai_chat_runtime",
  "social_delivery", "voice_gateway", "worker",
] as const;
export type OperationalServiceKey = (typeof operationalServiceKeys)[number];
export type OperationsEnvironment = "staging" | "production";
export const operationalAttestationKinds = [
  "on_call", "restore", "support_runbook", "security_review", "privacy_review",
] as const;
export type OperationalAttestationKind = (typeof operationalAttestationKinds)[number];

type ObjectiveRow = {
  service_key: OperationalServiceKey; public_label: string;
  availability_target_basis_points: number; latency_p95_target_ms: number;
  max_queue_age_seconds: number | null; max_dead_letters: number;
  minimum_sample_count: number; minimum_window_minutes: number;
  maximum_age_minutes: number; display_order: number;
  observation_id: string | null; window_start: Date | null; window_end: Date | null;
  sample_count: string | null; successful_count: string | null;
  availability_basis_points: number | null; latency_p95_ms: number | null;
  queue_age_seconds: number | null; dead_letter_count: number | null;
  source_reference: string | null; recorded_at: Date | null;
};

function evaluateService(row: ObjectiveRow, now: Date) {
  if (!row.observation_id || !row.window_start || !row.window_end || row.sample_count === null
      || row.successful_count === null || row.availability_basis_points === null
      || row.latency_p95_ms === null || row.dead_letter_count === null || !row.recorded_at) {
    return Object.freeze({
      serviceKey: row.service_key, publicLabel: row.public_label, status: "missing" as const,
      passing: false, issues: Object.freeze(["No operational evidence"]), observation: null,
      objective: objective(row),
    });
  }
  const sampleCount = Number(row.sample_count);
  const successfulCount = Number(row.successful_count);
  const windowMinutes = Math.floor((row.window_end.getTime() - row.window_start.getTime()) / 60_000);
  const ageMinutes = Math.floor((now.getTime() - row.window_end.getTime()) / 60_000);
  const issues: string[] = [];
  if (sampleCount < row.minimum_sample_count) issues.push("Insufficient sample size");
  if (windowMinutes < row.minimum_window_minutes) issues.push("Observation window is too short");
  if (ageMinutes < -5 || ageMinutes > row.maximum_age_minutes) issues.push("Evidence is stale or future-dated");
  if (row.availability_basis_points < row.availability_target_basis_points) issues.push("Availability below objective");
  if (row.latency_p95_ms > row.latency_p95_target_ms) issues.push("P95 latency above objective");
  if (row.max_queue_age_seconds !== null
      && (row.queue_age_seconds === null || row.queue_age_seconds > row.max_queue_age_seconds)) {
    issues.push("Queue age above objective or missing");
  }
  if (row.dead_letter_count > row.max_dead_letters) issues.push("Dead-letter budget exceeded");
  return Object.freeze({
    serviceKey: row.service_key,
    publicLabel: row.public_label,
    status: issues.length ? "failing" as const : "passing" as const,
    passing: issues.length === 0,
    issues: Object.freeze(issues),
    objective: objective(row),
    observation: Object.freeze({
      id: row.observation_id,
      windowStart: row.window_start,
      windowEnd: row.window_end,
      windowMinutes,
      ageMinutes,
      sampleCount,
      successfulCount,
      availabilityBasisPoints: row.availability_basis_points,
      latencyP95Ms: row.latency_p95_ms,
      queueAgeSeconds: row.queue_age_seconds,
      deadLetterCount: row.dead_letter_count,
      sourceReference: row.source_reference,
      recordedAt: row.recorded_at,
    }),
  });
}

function objective(row: ObjectiveRow) {
  return Object.freeze({
    availabilityTargetBasisPoints: row.availability_target_basis_points,
    latencyP95TargetMs: row.latency_p95_target_ms,
    maxQueueAgeSeconds: row.max_queue_age_seconds,
    maxDeadLetters: row.max_dead_letters,
    minimumSampleCount: row.minimum_sample_count,
    minimumWindowMinutes: row.minimum_window_minutes,
    maximumAgeMinutes: row.maximum_age_minutes,
  });
}

export class PlatformOperationsStore {
  constructor(private readonly client: DatabaseClient) {}

  async ingestObservation(input: Readonly<{
    environment: OperationsEnvironment; serviceKey: OperationalServiceKey;
    windowStart: Date; windowEnd: Date; sampleCount: number; successfulCount: number;
    latencyP95Ms: number; queueAgeSeconds: number | null; deadLetterCount: number;
    evidenceSha256: Buffer; sourceReference: string; requestId: string; now: Date;
  }>) {
    return this.client.begin(async (sql) => {
      const inserted = await sql<{ id: string }[]>`
        INSERT INTO platform.service_level_observations (
          environment, service_key, window_start, window_end, sample_count,
          successful_count, latency_p95_ms, queue_age_seconds, dead_letter_count,
          evidence_sha256, source_reference, recorded_at
        ) VALUES (
          ${input.environment}, ${input.serviceKey}, ${input.windowStart}, ${input.windowEnd},
          ${input.sampleCount}, ${input.successfulCount}, ${input.latencyP95Ms},
          ${input.queueAgeSeconds}, ${input.deadLetterCount}, ${input.evidenceSha256},
          ${input.sourceReference}, ${input.now}
        )
        ON CONFLICT (environment, service_key, evidence_sha256) DO NOTHING
        RETURNING id
      `;
      if (!inserted[0]) return { status: "replayed" as const };
      await sql`
        INSERT INTO platform.audit_logs (
          action, target_type, target_id, request_id, reason, result, metadata
        ) VALUES (
          'operations.slo_observation.recorded', 'service_level_observation',
          ${inserted[0].id}, ${input.requestId}, 'authenticated_monitor_ingestion',
          'succeeded', ${sql.json({ environment: input.environment, serviceKey: input.serviceKey })}
        )
      `;
      return { status: "recorded" as const, observationId: inserted[0].id };
    });
  }

  async ingestAttestation(input: Readonly<{
    environment: OperationsEnvironment; attestationKind: OperationalAttestationKind;
    status: "passed" | "failed"; validFrom: Date; validUntil: Date;
    evidenceSha256: Buffer; sourceReference: string; requestId: string; now: Date;
  }>) {
    return this.client.begin(async (sql) => {
      const inserted = await sql<{ id: string }[]>`
        INSERT INTO platform.operational_attestations (
          environment, attestation_kind, status, valid_from, valid_until,
          evidence_sha256, source_reference, recorded_at
        ) VALUES (
          ${input.environment}, ${input.attestationKind}, ${input.status},
          ${input.validFrom}, ${input.validUntil}, ${input.evidenceSha256},
          ${input.sourceReference}, ${input.now}
        )
        ON CONFLICT (environment, attestation_kind, evidence_sha256) DO NOTHING
        RETURNING id
      `;
      if (!inserted[0]) return { status: "replayed" as const };
      await sql`
        INSERT INTO platform.audit_logs (
          action, target_type, target_id, request_id, reason, result, metadata
        ) VALUES (
          'operations.attestation.recorded', 'operational_attestation',
          ${inserted[0].id}, ${input.requestId}, 'authenticated_operations_ingestion',
          'succeeded', ${sql.json({
            environment: input.environment, attestationKind: input.attestationKind,
            status: input.status,
          })}
        )
      `;
      return { status: "recorded" as const, attestationId: inserted[0].id };
    });
  }

  async readinessOverview(context: PlatformContext, environment: OperationsEnvironment, now = new Date()) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const rows = await latestObjectiveRows(sql, environment);
      const services = rows.map((row) => evaluateService(row, now));
      const attestationRows = await sql<{
        attestation_kind: OperationalAttestationKind; status: "passed" | "failed";
        valid_from: Date; valid_until: Date; source_reference: string; recorded_at: Date;
      }[]>`
        SELECT DISTINCT ON (attestation_kind) attestation_kind, status, valid_from,
               valid_until, source_reference, recorded_at
        FROM platform.operational_attestations
        WHERE environment = ${environment}
        ORDER BY attestation_kind, recorded_at DESC, id DESC
      `;
      const latest = new Map(attestationRows.map((row) => [row.attestation_kind, row]));
      const attestations = operationalAttestationKinds.map((kind) => {
        const row = latest.get(kind);
        const passing = Boolean(row && row.status === "passed"
          && row.valid_from <= now && row.valid_until > now);
        return Object.freeze({
          kind, passing, status: row?.status ?? "missing" as const,
          validFrom: row?.valid_from ?? null, validUntil: row?.valid_until ?? null,
          sourceReference: row?.source_reference ?? null, recordedAt: row?.recorded_at ?? null,
        });
      });
      const incidents = await sql<{
        summary: { blocking: number; oldestOpenedAt: string | null };
      }[]>`
        SELECT platform.blocking_incident_summary() AS summary
      `;
      const blockingIncidents = incidents[0]?.summary.blocking ?? 0;
      const passing = services.every((service) => service.passing)
        && attestations.every((attestation) => attestation.passing)
        && blockingIncidents === 0;
      return Object.freeze({
        asOf: now, environment, status: passing ? "ready" as const : "blocked" as const,
        services: Object.freeze(services), attestations: Object.freeze(attestations),
        incidents: Object.freeze({
          passing: blockingIncidents === 0, blocking: blockingIncidents,
          oldestOpenedAt: incidents[0]?.summary.oldestOpenedAt
            ? new Date(incidents[0].summary.oldestOpenedAt) : null,
        }),
      });
    });
  }

  async publicStatus(now = new Date()) {
    const rows = await latestObjectiveRows(this.client, "production");
    const incidents = await this.client<{ summary: { blocking: number } }[]>`
      SELECT platform.blocking_incident_summary() AS summary
    `;
    const blockingVoice = (incidents[0]?.summary.blocking ?? 0) > 0;
    const services = rows.map((row) => {
      const evaluated = evaluateService(row, now);
      let status: "operational" | "degraded" | "outage" | "unknown";
      if (!evaluated.observation) status = "unknown";
      else if (evaluated.observation.ageMinutes < -5
        || evaluated.observation.ageMinutes > evaluated.objective.maximumAgeMinutes) status = "unknown";
      else if (evaluated.observation.availabilityBasisPoints < 9000) status = "outage";
      else status = evaluated.passing ? "operational" : "degraded";
      if (row.service_key === "voice_gateway" && blockingVoice && status !== "outage") status = "degraded";
      return Object.freeze({
        label: row.public_label, status,
        lastUpdatedAt: evaluated.observation?.windowEnd ?? null,
      });
    });
    const overall = services.some((service) => service.status === "outage") ? "outage" as const
      : services.some((service) => service.status === "degraded") ? "degraded" as const
        : services.some((service) => service.status === "unknown") ? "unknown" as const
          : "operational" as const;
    return Object.freeze({ asOf: now, overall, services: Object.freeze(services) });
  }
}

function latestObjectiveRows(sql: DatabaseClient | DatabaseTransaction, environment: OperationsEnvironment) {
  return sql<ObjectiveRow[]>`
    SELECT objective.service_key, objective.public_label,
           objective.availability_target_basis_points, objective.latency_p95_target_ms,
           objective.max_queue_age_seconds, objective.max_dead_letters,
           objective.minimum_sample_count, objective.minimum_window_minutes,
           objective.maximum_age_minutes, objective.display_order,
           observation.id AS observation_id, observation.window_start, observation.window_end,
           observation.sample_count, observation.successful_count,
           observation.availability_basis_points, observation.latency_p95_ms,
           observation.queue_age_seconds, observation.dead_letter_count,
           observation.source_reference, observation.recorded_at
    FROM platform.service_objectives objective
    LEFT JOIN LATERAL (
      SELECT candidate.* FROM platform.service_level_observations candidate
      WHERE candidate.environment = ${environment}
        AND candidate.service_key = objective.service_key
      ORDER BY candidate.window_end DESC, candidate.id DESC LIMIT 1
    ) observation ON true
    ORDER BY objective.display_order
  `;
}
