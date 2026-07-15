import { assertProviderNeutralCustomerText, ProviderGatewayError, type TextProviderGateway } from "@djay/provider-gateway";
import {
  aiPlaybookSchema, buildSalesCorePolicy, salesCoreOutputSchema, selectRelevantKnowledge,
  type SalesCoreOutput,
} from "@djay/sales-core";
import { z } from "zod";

const historySchema = z.array(z.object({
  sequence: z.number().int().positive(), role: z.enum(["user", "assistant"]), content: z.string().max(5000),
}).strict()).max(19);
const chunkSchema = z.array(z.object({
  sourceRevisionId: z.uuid(), chunkId: z.uuid(), content: z.string().max(5000),
}).strict()).max(1000);
const authoritySchema = z.object({
  entitlements: z.record(z.string(), z.union([z.boolean(), z.string(), z.number(), z.null()])),
  limits: z.record(z.string(), z.number().nullable()),
}).strict();

export type AiPublicResponse = Readonly<{
  status: "completed" | "handover";
  inputId: string;
  text: string;
  quickReplies: readonly string[];
  nextTurnSequence: number;
}>;

export type AiTurnContext = Readonly<{
  sessionId: string;
  tenantId: string;
  conversationId: string;
  playbook: unknown | null;
  language: "th" | "en";
  authority: unknown | null;
  turnSequence: number;
  recentMessages: unknown;
  knowledgeChunks: unknown;
  replayResponse: AiPublicResponse | null;
}>;

export interface AiTurnRepository {
  begin(input: Readonly<{ deploymentKey: string; sessionToken: string; origin: string; inputId: string; message: string }>): Promise<AiTurnContext>;
  commit(input: Readonly<{
    deploymentKey: string; sessionToken: string; origin: string; inputId: string; output: SalesCoreOutput;
    publicResponse: AiPublicResponse; nativeUsage: { inputUnits: number; outputUnits: number; cachedUnits?: number };
  }>): Promise<AiPublicResponse | Readonly<{ status: "handover" }>>;
  fail(input: Readonly<{ deploymentKey: string; sessionToken: string; origin: string; inputId: string; errorCode: string }>): Promise<void>;
}

export class AiTextRuntimeError extends Error {
  constructor(
    readonly code: "turn_busy" | "structured_output_invalid" | "action_not_entitled" | "grounding_invalid" | "generation_failed",
    options?: ErrorOptions,
  ) {
    super(code, options);
  }
}

export async function generateAiTurn(input: Readonly<{
  gateway: TextProviderGateway;
  inputId: string;
  message: string;
  context: AiTurnContext;
}>) {
  if (!input.context.playbook || !input.context.authority || input.context.turnSequence < 1) {
    throw new AiTextRuntimeError("turn_busy");
  }
  const playbook = aiPlaybookSchema.parse(input.context.playbook);
  const history = historySchema.parse(input.context.recentMessages);
  const allChunks = chunkSchema.parse(input.context.knowledgeChunks);
  const selectedChunks = selectRelevantKnowledge(allChunks, input.message, 6);
  const recentMessages = history.at(-1)?.role === "user" ? history.slice(0, -1) : history;
  const systemPolicy = buildSalesCorePolicy({
    locale: input.context.language, businessName: playbook.businessName, agentName: playbook.agentName,
    tone: playbook.tone, salesGoal: playbook.salesGoal, approvedClaims: playbook.approvedClaims,
    prohibitedClaims: playbook.prohibitedClaims, discoveryQuestions: playbook.discoveryQuestions,
    ctaPolicy: playbook.ctaPolicy, knowledge: selectedChunks, recentMessages,
    customerMessage: input.message,
  });
  const generated = await input.gateway.generate({
    correlationId: input.inputId, locale: input.context.language, systemPolicy,
    messages: recentMessages, customerMessage: input.message,
    structuredOutputSchemaVersion: "sales-core.v1",
  });
  const output = salesCoreOutputSchema.parse(generated.output);
  assertProviderNeutralCustomerText(output.customerResponse);
  validateActionAuthority(output, input.context.authority);
  validateCitations(output, selectedChunks);
  const publicResponse: AiPublicResponse = {
    status: output.handover ? "handover" : "completed", inputId: input.inputId,
    text: output.customerResponse, quickReplies: output.channelResponse.quickReplies,
    nextTurnSequence: input.context.turnSequence + 1,
  };
  return {
    output,
    publicResponse,
    nativeUsage: {
      inputUnits: generated.nativeUsage.inputUnits,
      outputUnits: generated.nativeUsage.outputUnits,
      cachedUnits: generated.nativeUsage.cachedUnits ?? 0,
    },
  };
}

function validateActionAuthority(output: SalesCoreOutput, authorityValue: unknown) {
  const authority = authoritySchema.parse(authorityValue);
  const required: Partial<Record<SalesCoreOutput["proposedActions"][number]["type"], string>> = {
    "lead.capture": "lead_capture.enabled",
    "sales_fact.record": "lead_capture.enabled",
    "appointment.request": "appointment_request.enabled",
    "follow_up.create": "lead_capture.enabled",
    "handover.request": "human_handover.enabled",
    "merchant_email.send": "sales_email_action.enabled",
  };
  if (output.proposedActions.some((action) => authority.entitlements[required[action.type]!] !== true)) {
    throw new AiTextRuntimeError("action_not_entitled");
  }
}

function validateCitations(output: SalesCoreOutput, chunks: readonly { sourceRevisionId: string; chunkId: string }[]) {
  const allowed = new Set(chunks.map((chunk) => `${chunk.sourceRevisionId}:${chunk.chunkId}`));
  if (output.knowledgeCitations.some((citation) => !allowed.has(`${citation.sourceRevisionId}:${citation.chunkId}`))) {
    throw new AiTextRuntimeError("grounding_invalid");
  }
}

function errorCode(error: unknown) {
  if (error instanceof AiTextRuntimeError) return error.code;
  if (error instanceof ProviderGatewayError) return error.code;
  if (error instanceof z.ZodError) return "structured_output_invalid";
  return "generation_failed";
}

export class AiTextRuntime {
  constructor(private readonly repository: AiTurnRepository, private readonly gateway: TextProviderGateway) {}

  async turn(input: Readonly<{ deploymentKey: string; sessionToken: string; origin: string; inputId: string; message: string }>) {
    let began = false;
    try {
      const context = await this.repository.begin(input);
      if (context.replayResponse) return context.replayResponse;
      began = true;
      const generated = await generateAiTurn({ gateway: this.gateway, inputId: input.inputId, message: input.message, context });
      const committed = await this.repository.commit({
        deploymentKey: input.deploymentKey, sessionToken: input.sessionToken,
        origin: input.origin, inputId: input.inputId,
        output: generated.output, publicResponse: generated.publicResponse, nativeUsage: generated.nativeUsage,
      });
      return committed.status === "handover" && !("text" in committed)
        ? { ...generated.publicResponse, status: "handover" as const, text: "" }
        : committed;
    } catch (error) {
      if (began) await this.repository.fail({
        deploymentKey: input.deploymentKey, sessionToken: input.sessionToken,
        origin: input.origin, inputId: input.inputId,
        errorCode: errorCode(error),
      }).catch(() => undefined);
      if (error instanceof AiTextRuntimeError) throw error;
      if (error instanceof ProviderGatewayError || error instanceof z.ZodError) {
        throw new AiTextRuntimeError(
          errorCode(error) === "structured_output_invalid" ? "structured_output_invalid" : "generation_failed",
          { cause: error },
        );
      }
      throw new AiTextRuntimeError("generation_failed", { cause: error });
    }
  }
}

export async function runAiTextPreview(input: Readonly<{
  gateway: TextProviderGateway;
  inputId: string;
  playbook: unknown;
  language: "th" | "en";
  knowledgeChunks: unknown;
  message: string;
}>) {
  const playbook = aiPlaybookSchema.parse(input.playbook);
  const allChunks = chunkSchema.parse(input.knowledgeChunks);
  const selectedChunks = selectRelevantKnowledge(allChunks, input.message, 6);
  const systemPolicy = buildSalesCorePolicy({
    locale: input.language,
    businessName: playbook.businessName,
    agentName: playbook.agentName,
    tone: playbook.tone,
    salesGoal: playbook.salesGoal,
    approvedClaims: playbook.approvedClaims,
    prohibitedClaims: playbook.prohibitedClaims,
    discoveryQuestions: playbook.discoveryQuestions,
    ctaPolicy: playbook.ctaPolicy,
    knowledge: selectedChunks,
    recentMessages: [],
    customerMessage: input.message,
  });
  const generated = await input.gateway.generate({
    correlationId: input.inputId,
    locale: input.language,
    systemPolicy,
    messages: [],
    customerMessage: input.message,
    structuredOutputSchemaVersion: "sales-core.v1",
  });
  const output = salesCoreOutputSchema.parse(generated.output);
  assertProviderNeutralCustomerText(output.customerResponse);
  validateCitations(output, selectedChunks);
  return Object.freeze({
    status: "completed" as const,
    stage: output.stage,
    text: output.customerResponse,
    quickReplies: output.channelResponse.quickReplies,
    proposedActionTypes: output.proposedActions.map((action) => action.type),
    citationCount: output.knowledgeCitations.length,
    handover: Boolean(output.handover),
  });
}
