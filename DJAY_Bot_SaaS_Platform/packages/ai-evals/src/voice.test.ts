import { describe, expect, it } from "vitest";
import { evaluateVoiceProfileArtifact, voiceEvaluationScenarios } from "./voice";

function artifact() {
  return {
    schemaVersion: "voice-eval-artifact.v1",
    artifactId: "10000000-0000-4000-8000-000000000001",
    capturedAt: "2026-07-16T07:00:00+00:00",
    environment: "equivalent_profile",
    profileGeneration: "voice_gen2",
    thresholds: {
      schemaVersion: "voice-eval-thresholds.v1",
      approvalReference: "test-only-threshold-approval",
      approvalEvidenceDigest: "a".repeat(64),
      minQualityScore: 4,
      maxWordErrorRate: 0.12,
      maxFirstAudioMs: 1_000,
      maxTurnLatencyMs: 2_000,
      maxInterruptionStopMs: 300,
    },
    observations: (["en", "th"] as const).flatMap((locale) => voiceEvaluationScenarios.map((scenario, index) => ({
      caseId: `${locale}-${scenario}-${index}`,
      locale,
      scenario,
      executed: true,
      providerNeutral: true,
      disclosureExact: scenario === "disclosure" ? true : null,
      approvedResponseExact: scenario === "sales_turn" ? true : null,
      outputAudioProduced: scenario === "disclosure" || scenario === "sales_turn" || scenario === "interruption",
      toolCallCount: scenario === "sales_turn" ? 1 : 0,
      qualityScore: scenario === "disclosure" || scenario === "sales_turn" ? 4.5 : null,
      transcriptWordErrorRate: scenario === "disclosure" || scenario === "sales_turn" ? 0.05 : null,
      firstAudioMs: scenario === "disclosure" || scenario === "sales_turn" ? 700 : null,
      turnLatencyMs: scenario === "sales_turn" ? 1_500 : null,
      interruptionStopMs: scenario === "interruption" ? 180 : null,
      reconnectSucceeded: scenario === "reconnect" ? true : null,
      settled: true,
      concurrencyReleased: true,
      duplicateActionCount: 0,
      unsolicitedSpeech: false,
      terminalErrorCode: scenario === "upstream_outage" ? "media_unavailable" : null,
    }))),
  };
}

describe("P8 bilingual Voice evaluation contract", () => {
  it("requires both languages across every safety and media scenario", () => {
    const value = artifact();
    const repeatedSales = value.observations.find((item) => item.locale === "en" && item.scenario === "sales_turn")!;
    value.observations.push({ ...repeatedSales, caseId: "en-sales-turn-repeat" });
    const result = evaluateVoiceProfileArtifact(value);
    expect(result.passed).toBe(true);
    expect(result.report).toMatchObject({
      schemaVersion: "voice-eval-report.v1",
      totalObservations: voiceEvaluationScenarios.length * 2 + 1,
      failedObservations: 0,
      p95FirstAudioMs: 700,
      p95TurnLatencyMs: 1_500,
      maxInterruptionStopMs: 180,
      maxWordErrorRate: 0.05,
      minQualityScore: 4.5,
      findingCounts: {},
    });
  });

  it("fails missing language coverage and safety-critical lifecycle errors", () => {
    const value = artifact();
    value.observations = value.observations.filter((item) => !(item.locale === "th" && item.scenario === "background_noise"));
    const reconnect = value.observations.find((item) => item.locale === "en" && item.scenario === "reconnect")!;
    reconnect.reconnectSucceeded = false;
    reconnect.duplicateActionCount = 1;
    const disclosure = value.observations.find((item) => item.locale === "en" && item.scenario === "disclosure")!;
    value.observations.push({ ...disclosure, scenario: "sales_turn" });
    const outage = value.observations.find((item) => item.locale === "en" && item.scenario === "upstream_outage")!;
    outage.terminalErrorCode = "session_unavailable";
    outage.concurrencyReleased = false;
    const result = evaluateVoiceProfileArtifact(value);
    expect(result.passed).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      "scenario_missing", "case_id_duplicate", "reconnect_failed", "duplicate_action", "outage_not_neutral", "cleanup_failed",
    ]));
  });

  it("rejects raw or routing-specific fields instead of copying them into reports", () => {
    const value = artifact() as ReturnType<typeof artifact> & { providerKey?: string; rawTranscript?: string };
    value.providerKey = "restricted";
    value.rawTranscript = "customer content";
    const result = evaluateVoiceProfileArtifact(value);
    expect(result).toEqual({
      passed: false,
      findings: [{ code: "artifact_invalid", caseId: null, detail: "Artifact does not match voice-eval-artifact.v1." }],
      report: null,
    });
  });

  it("enforces externally supplied quality and latency thresholds", () => {
    const value = artifact();
    const sales = value.observations.find((item) => item.locale === "th" && item.scenario === "sales_turn")!;
    sales.qualityScore = 3.5;
    sales.transcriptWordErrorRate = 0.2;
    sales.firstAudioMs = 1_200;
    sales.turnLatencyMs = 2_500;
    const result = evaluateVoiceProfileArtifact(value);
    expect(result.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      "quality_below_threshold", "word_error_rate_above_threshold", "first_audio_above_threshold", "turn_latency_above_threshold",
    ]));
  });
});
