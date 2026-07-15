import { createCipheriv, randomBytes, randomUUID } from "node:crypto";
import { createOpaqueToken, hashOpaqueToken } from "@djay/auth";
import {
  flowExecutionStateSchema,
  flowSnapshotSchema,
  publicFlowInputSchema,
  type FlowEntitlements,
  type FlowInput,
  type PublicFlowInput,
} from "@djay/flowbot-domain";
import { advanceFlow, type FlowEngineResult } from "@djay/flowbot-engine";
import { z } from "zod";
import type { DatabaseClient } from "./client";
import { flowbotEnvironment, flowBusinessSchedulesSchema } from "./flowbot-environment";

const authoritySchema = z.object({
  planKey: z.enum(["flowbot_basic", "flowbot_premium"]),
  accessMode: z.literal("active"),
  entitlements: z.record(z.string(), z.union([z.boolean(), z.string(), z.number(), z.null()])),
  limits: z.record(z.string(), z.number().nullable()),
}).strict();

const runtimeRowSchema = z.object({
  execution_id: z.uuid(),
  flow_version_id: z.uuid(),
  snapshot_json: flowSnapshotSchema,
  state_json: flowExecutionStateSchema,
  authority_json: authoritySchema,
  next_input_sequence: z.number().int().positive(),
  replay_response_json: z.unknown().nullable().optional(),
}).passthrough();

const syncedMessageSchema = z.object({
  sequence: z.number().int().positive(),
  message: z.object({
    type: z.enum(["text", "media", "options", "form", "system"]),
    nodeId: z.uuid(),
    content: z.record(z.string(), z.unknown()),
  }).strict(),
}).strict();

const syncRowSchema = z.object({
  execution_status: z.enum(["active", "waiting", "handover", "completed"]),
  automation_mode: z.enum(["flowbot", "human"]),
  last_message_sequence: z.number().int().nonnegative(),
  messages_json: z.array(syncedMessageSchema),
}).passthrough();

export type FlowbotRuntimeResponse = Readonly<{
  inputId: string;
  messages: FlowEngineResult["messages"];
  status: "active" | "waiting" | "handover" | "completed";
  nextSequence: number;
}>;

export type FlowbotSyncResponse = Readonly<{
  status: FlowbotRuntimeResponse["status"];
  lastMessageSequence: number;
  messages: readonly z.infer<typeof syncedMessageSchema>[];
}>;

function encryptJson(value: unknown, key: Buffer): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", nonce.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

function prepareResult(result: FlowEngineResult, integrationKey: Buffer | null): FlowEngineResult {
  const commands = result.commands.map((command) => {
    if (command.type !== "integration.dispatch") return command;
    if (!integrationKey) throw new FlowbotRuntimeError("integration_encryption_unavailable");
    return {
      ...command,
      payload: { ...command.payload, payloadCiphertext: encryptJson(command.payload, integrationKey) },
    };
  });
  return { ...result, commands };
}

function responseFor(inputId: string, result: FlowEngineResult, sequence: number): FlowbotRuntimeResponse {
  return {
    inputId,
    messages: result.messages,
    status: result.nextState.status,
    nextSequence: sequence + 1,
  };
}

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

export class FlowbotRuntimeStore {
  constructor(
    private readonly client: DatabaseClient,
    private readonly integrationEnvelopeKey: Buffer | null = null,
  ) {}

  async config(deploymentKey: string, origin: string) {
    const rows = await this.client<{ bot_name: string; default_language: "th" | "en"; branding_removed: boolean }[]>`
      SELECT * FROM tenancy.flowbot_runtime_config(${hashOpaqueToken(deploymentKey)}, ${origin})
    `;
    const row = rows[0];
    return row ? {
      name: row.bot_name,
      defaultLanguage: row.default_language,
      brandingRemoved: row.branding_removed,
    } : null;
  }

  async reportInstall(deploymentKey: string, origin: string) {
    const rows = await this.client<{ report_flowbot_install: number }[]>`
      SELECT tenancy.report_flowbot_install(${hashOpaqueToken(deploymentKey)}, ${origin})
    `;
    return rows[0]?.report_flowbot_install ?? 0;
  }

  async start(input: Readonly<{ deploymentKey: string; origin: string; language?: "th" | "en" }>) {
    const sessionToken = `djay_flow_session_${createOpaqueToken()}`;
    const executionId = randomUUID();
    const inputId = randomUUID();
    const now = new Date();
    return this.client.begin(async (sql) => {
      const rows = await sql<Record<string, unknown>[]>`
        SELECT * FROM tenancy.start_flowbot_execution(
          ${hashOpaqueToken(input.deploymentKey)}, ${hashOpaqueToken(sessionToken)}, ${input.origin},
          ${executionId}::uuid, ${randomUUID()}::uuid, ${randomUUID()}::uuid, ${randomUUID()}::uuid,
          ${new Date(now.getTime() + 24 * 60 * 60 * 1000)}, ${input.language ?? "en"}
        )
      `;
      const row = runtimeRowSchema.parse(rows[0]);
      const scheduleRows = await sql<{ schedules: unknown }[]>`
        SELECT tenancy.flowbot_runtime_schedules(${hashOpaqueToken(sessionToken)}, ${input.origin}) AS schedules
      `;
      const schedules = flowBusinessSchedulesSchema.parse(scheduleRows[0]?.schedules ?? []);
      const flowInput: FlowInput = { type: "start", payload: {} };
      const result = prepareResult(advanceFlow({
        tenantId: "00000000-0000-4000-8000-000000000000",
        deploymentId: "00000000-0000-4000-8000-000000000000",
        executionId: row.execution_id,
        flowVersionId: row.flow_version_id,
        sequence: row.next_input_sequence,
        inputId,
        input: flowInput,
        snapshot: row.snapshot_json,
        state: row.state_json,
        authority: row.authority_json as FlowEntitlements,
        environment: flowbotEnvironment(now, schedules),
      }), this.integrationEnvelopeKey);
      const response = responseFor(inputId, result, row.next_input_sequence);
      await sql`
        SELECT tenancy.commit_flowbot_step(
          ${hashOpaqueToken(sessionToken)}, ${inputId}::uuid, ${row.next_input_sequence},
          ${sql.json(jsonValue(flowInput))}, ${sql.json(jsonValue(result))}, ${sql.json(jsonValue(response))}
        )
      `;
      return { sessionToken, response };
    }) as Promise<{ sessionToken: string; response: FlowbotRuntimeResponse }>;
  }

  async advance(input: Readonly<{
    sessionToken: string;
    origin: string;
    inputId: string;
    input: PublicFlowInput;
  }>): Promise<FlowbotRuntimeResponse | null> {
    const parsedInput = publicFlowInputSchema.parse(input.input);
    const now = new Date();
    return this.client.begin(async (sql) => {
      const rows = await sql<Record<string, unknown>[]>`
        SELECT * FROM tenancy.lock_flowbot_execution(
          ${hashOpaqueToken(input.sessionToken)}, ${input.origin}, ${input.inputId}::uuid
        )
      `;
      if (!rows[0]) return null;
      const row = runtimeRowSchema.parse(rows[0]);
      if (row.replay_response_json) return row.replay_response_json as FlowbotRuntimeResponse;
      const scheduleRows = await sql<{ schedules: unknown }[]>`
        SELECT tenancy.flowbot_runtime_schedules(${hashOpaqueToken(input.sessionToken)}, ${input.origin}) AS schedules
      `;
      const schedules = flowBusinessSchedulesSchema.parse(scheduleRows[0]?.schedules ?? []);
      const result = prepareResult(advanceFlow({
        tenantId: "00000000-0000-4000-8000-000000000000",
        deploymentId: "00000000-0000-4000-8000-000000000000",
        executionId: row.execution_id,
        flowVersionId: row.flow_version_id,
        sequence: row.next_input_sequence,
        inputId: input.inputId,
        input: parsedInput,
        snapshot: row.snapshot_json,
        state: row.state_json,
        authority: row.authority_json as FlowEntitlements,
        environment: flowbotEnvironment(now, schedules),
      }), this.integrationEnvelopeKey);
      const response = responseFor(input.inputId, result, row.next_input_sequence);
      const committed = await sql<{ commit_flowbot_step: FlowbotRuntimeResponse }[]>`
        SELECT tenancy.commit_flowbot_step(
          ${hashOpaqueToken(input.sessionToken)}, ${input.inputId}::uuid, ${row.next_input_sequence},
          ${sql.json(jsonValue(parsedInput))}, ${sql.json(jsonValue(result))}, ${sql.json(jsonValue(response))}
        )
      `;
      return committed[0]?.commit_flowbot_step ?? response;
    }) as Promise<FlowbotRuntimeResponse | null>;
  }

  async sync(input: Readonly<{
    deploymentKey: string;
    sessionToken: string;
    origin: string;
    afterSequence: number;
  }>): Promise<FlowbotSyncResponse | null> {
    const rows = await this.client<Record<string, unknown>[]>`
      SELECT * FROM tenancy.sync_flowbot_execution(
        ${hashOpaqueToken(input.sessionToken)}, ${hashOpaqueToken(input.deploymentKey)},
        ${input.origin}, ${input.afterSequence}
      )
    `;
    if (!rows[0]) return null;
    const row = syncRowSchema.parse(rows[0]);
    return {
      status: row.automation_mode === "human" ? "handover" : row.execution_status,
      lastMessageSequence: row.last_message_sequence,
      messages: row.messages_json,
    };
  }
}

export class FlowbotRuntimeError extends Error {
  constructor(readonly code: string) {
    super("FlowBot runtime request failed.");
    this.name = "FlowbotRuntimeError";
  }
}
