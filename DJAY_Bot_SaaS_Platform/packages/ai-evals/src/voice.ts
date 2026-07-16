import { z } from "zod";

export const voiceEvaluationScenarios = [
  "disclosure",
  "sales_turn",
  "interruption",
  "silence",
  "background_noise",
  "reconnect",
  "timeout_cleanup",
  "upstream_outage",
] as const;

const digestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const scenarioSchema = z.enum(voiceEvaluationScenarios);
const nullableMetric = z.number().nonnegative().nullable();

export const voiceEvaluationThresholdsSchema = z.object({
  schemaVersion: z.literal("voice-eval-thresholds.v1"),
  approvalReference: z.string().trim().min(8).max(200),
  approvalEvidenceDigest: digestSchema,
  minQualityScore: z.number().min(1).max(5),
  maxWordErrorRate: z.number().min(0).max(1),
  maxFirstAudioMs: z.number().int().positive(),
  maxTurnLatencyMs: z.number().int().positive(),
  maxInterruptionStopMs: z.number().int().positive(),
}).strict();

export const voiceEvaluationObservationSchema = z.object({
  caseId: z.string().regex(/^[a-z0-9][a-z0-9_-]{2,79}$/u),
  locale: z.enum(["th", "en"]),
  scenario: scenarioSchema,
  executed: z.boolean(),
  providerNeutral: z.boolean(),
  disclosureExact: z.boolean().nullable(),
  approvedResponseExact: z.boolean().nullable(),
  outputAudioProduced: z.boolean(),
  toolCallCount: z.number().int().nonnegative(),
  qualityScore: z.number().min(1).max(5).nullable(),
  transcriptWordErrorRate: z.number().min(0).max(1).nullable(),
  firstAudioMs: nullableMetric,
  turnLatencyMs: nullableMetric,
  interruptionStopMs: nullableMetric,
  reconnectSucceeded: z.boolean().nullable(),
  settled: z.boolean(),
  concurrencyReleased: z.boolean(),
  duplicateActionCount: z.number().int().nonnegative(),
  unsolicitedSpeech: z.boolean(),
  terminalErrorCode: z.enum(["media_unavailable", "session_unavailable"]).nullable(),
}).strict();

export const voiceEvaluationArtifactSchema = z.object({
  schemaVersion: z.literal("voice-eval-artifact.v1"),
  artifactId: z.uuid(),
  capturedAt: z.iso.datetime({ offset: true }),
  environment: z.enum(["equivalent_profile", "live_provider"]),
  profileGeneration: z.literal("voice_gen2"),
  thresholds: voiceEvaluationThresholdsSchema,
  observations: z.array(voiceEvaluationObservationSchema).min(1).max(1_000),
}).strict();

export type VoiceEvaluationArtifact = z.infer<typeof voiceEvaluationArtifactSchema>;
export type VoiceEvaluationObservation = z.infer<typeof voiceEvaluationObservationSchema>;

export type VoiceEvaluationFinding = Readonly<{
  code: string;
  caseId: string | null;
  detail: string;
}>;

function percentile(values: readonly number[], fraction: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? null;
}

function requireMetric(
  findings: VoiceEvaluationFinding[],
  observation: VoiceEvaluationObservation,
  key: "qualityScore" | "transcriptWordErrorRate" | "firstAudioMs" | "turnLatencyMs" | "interruptionStopMs",
) {
  const value = observation[key];
  if (value === null) findings.push({ code: "metric_missing", caseId: observation.caseId, detail: `${key} is required for ${observation.scenario}.` });
  return value;
}

export function evaluateVoiceProfileArtifact(value: unknown) {
  const parsed = voiceEvaluationArtifactSchema.safeParse(value);
  if (!parsed.success) {
    return Object.freeze({
      passed: false,
      findings: Object.freeze([{ code: "artifact_invalid", caseId: null, detail: "Artifact does not match voice-eval-artifact.v1." }]),
      report: null,
    });
  }
  const artifact = parsed.data;
  const thresholds = artifact.thresholds;
  const findings: VoiceEvaluationFinding[] = [];
  const observedPairs = new Set<string>();
  const observedCaseIds = new Set<string>();

  for (const observation of artifact.observations) {
    const pair = `${observation.locale}:${observation.scenario}`;
    observedPairs.add(pair);
    if (observedCaseIds.has(observation.caseId)) findings.push({ code: "case_id_duplicate", caseId: observation.caseId, detail: "Case ID must be unique within the artifact." });
    else observedCaseIds.add(observation.caseId);

    if (!observation.executed) findings.push({ code: "scenario_not_executed", caseId: observation.caseId, detail: "Scenario was not executed." });
    if (!observation.providerNeutral) findings.push({ code: "provider_identity_exposed", caseId: observation.caseId, detail: "Customer-facing result was not provider-neutral." });
    if (observation.duplicateActionCount > 0) findings.push({ code: "duplicate_action", caseId: observation.caseId, detail: "A customer action was duplicated." });
    if (!observation.settled || !observation.concurrencyReleased) findings.push({ code: "cleanup_failed", caseId: observation.caseId, detail: "Scenario did not settle usage and release concurrency." });

    if (observation.scenario === "disclosure") {
      if (observation.disclosureExact !== true) findings.push({ code: "disclosure_mismatch", caseId: observation.caseId, detail: "Required disclosure was not exact." });
      if (!observation.outputAudioProduced) findings.push({ code: "audio_missing", caseId: observation.caseId, detail: "Disclosure produced no audio." });
      if (observation.toolCallCount !== 0) findings.push({ code: "unexpected_tool_call", caseId: observation.caseId, detail: "Opening disclosure called a tool." });
    }
    if (observation.scenario === "sales_turn") {
      if (observation.approvedResponseExact !== true) findings.push({ code: "response_mismatch", caseId: observation.caseId, detail: "Spoken response did not match the approved Sales Core response." });
      if (!observation.outputAudioProduced) findings.push({ code: "audio_missing", caseId: observation.caseId, detail: "Sales turn produced no audio." });
      if (observation.toolCallCount !== 1) findings.push({ code: "tool_call_count", caseId: observation.caseId, detail: "Sales turn must call its planning tool exactly once." });
    }
    if ((observation.scenario === "silence" || observation.scenario === "background_noise") && observation.unsolicitedSpeech) {
      findings.push({ code: "unsolicited_speech", caseId: observation.caseId, detail: "Silence/noise caused unsolicited assistant speech." });
    }
    if ((observation.scenario === "silence" || observation.scenario === "background_noise") && observation.toolCallCount !== 0) {
      findings.push({ code: "unexpected_tool_call", caseId: observation.caseId, detail: "Silence/noise caused a tool call." });
    }
    if (observation.scenario === "reconnect" && observation.reconnectSucceeded !== true) {
      findings.push({ code: "reconnect_failed", caseId: observation.caseId, detail: "Session did not resume safely." });
    }
    if (observation.scenario === "interruption" && !observation.outputAudioProduced) {
      findings.push({ code: "audio_missing", caseId: observation.caseId, detail: "Interruption case did not begin assistant audio." });
    }
    if (observation.scenario === "upstream_outage") {
      if (observation.terminalErrorCode !== "media_unavailable") findings.push({ code: "outage_not_neutral", caseId: observation.caseId, detail: "Outage did not return media_unavailable." });
    }

    if (observation.scenario === "disclosure" || observation.scenario === "sales_turn") {
      const quality = requireMetric(findings, observation, "qualityScore");
      const errorRate = requireMetric(findings, observation, "transcriptWordErrorRate");
      const firstAudio = requireMetric(findings, observation, "firstAudioMs");
      if (quality !== null && quality < thresholds.minQualityScore) findings.push({ code: "quality_below_threshold", caseId: observation.caseId, detail: "Audio quality is below the approved threshold." });
      if (errorRate !== null && errorRate > thresholds.maxWordErrorRate) findings.push({ code: "word_error_rate_above_threshold", caseId: observation.caseId, detail: "Word error rate exceeds the approved threshold." });
      if (firstAudio !== null && firstAudio > thresholds.maxFirstAudioMs) findings.push({ code: "first_audio_above_threshold", caseId: observation.caseId, detail: "First audio latency exceeds the approved threshold." });
    }
    if (observation.scenario === "sales_turn") {
      const turnLatency = requireMetric(findings, observation, "turnLatencyMs");
      if (turnLatency !== null && turnLatency > thresholds.maxTurnLatencyMs) findings.push({ code: "turn_latency_above_threshold", caseId: observation.caseId, detail: "Turn latency exceeds the approved threshold." });
    }
    if (observation.scenario === "interruption") {
      const interruption = requireMetric(findings, observation, "interruptionStopMs");
      if (interruption !== null && interruption > thresholds.maxInterruptionStopMs) findings.push({ code: "interruption_above_threshold", caseId: observation.caseId, detail: "Interruption stop latency exceeds the approved threshold." });
    }
  }

  for (const locale of ["en", "th"] as const) {
    for (const scenario of voiceEvaluationScenarios) {
      if (!observedPairs.has(`${locale}:${scenario}`)) findings.push({ code: "scenario_missing", caseId: null, detail: `Missing ${locale}:${scenario} observation.` });
    }
  }

  const caseFailures = new Set(findings.flatMap((finding) => finding.caseId ? [finding.caseId] : []));
  const metric = <K extends "qualityScore" | "transcriptWordErrorRate" | "firstAudioMs" | "turnLatencyMs" | "interruptionStopMs">(key: K) =>
    artifact.observations.flatMap((observation) => observation[key] === null ? [] : [observation[key] as number]);
  const quality = metric("qualityScore");
  const wordErrorRate = metric("transcriptWordErrorRate");
  const report = Object.freeze({
    schemaVersion: "voice-eval-report.v1" as const,
    artifactId: artifact.artifactId,
    capturedAt: artifact.capturedAt,
    environment: artifact.environment,
    thresholdApprovalReference: thresholds.approvalReference,
    thresholdApprovalEvidenceDigest: thresholds.approvalEvidenceDigest,
    totalObservations: artifact.observations.length,
    failedObservations: caseFailures.size,
    p95FirstAudioMs: percentile(metric("firstAudioMs"), 0.95),
    p95TurnLatencyMs: percentile(metric("turnLatencyMs"), 0.95),
    maxInterruptionStopMs: metric("interruptionStopMs").length ? Math.max(...metric("interruptionStopMs")) : null,
    maxWordErrorRate: wordErrorRate.length ? Math.max(...wordErrorRate) : null,
    minQualityScore: quality.length ? Math.min(...quality) : null,
    findingCounts: Object.freeze(findings.reduce<Record<string, number>>((counts, finding) => {
      counts[finding.code] = (counts[finding.code] ?? 0) + 1; return counts;
    }, {})),
  });
  return Object.freeze({ passed: findings.length === 0, findings: Object.freeze(findings), report });
}
