import { advanceFlow, type FlowEngineResult } from "@djay/flowbot-engine";
import { flowExecutionStateSchema, flowSnapshotSchema, type FlowEntitlements, type FlowInput } from "@djay/flowbot-domain";
import { z } from "zod";
import type { DatabaseClient } from "./client";
import { flowbotEnvironment, flowBusinessSchedulesSchema } from "./flowbot-environment";

const claimSchema = z.object({
  timer_id: z.uuid(), tenant_id: z.uuid(), execution_id: z.uuid(),
  session_token_hash: z.instanceof(Buffer), flow_version_id: z.uuid(), node_id: z.uuid(),
  snapshot_json: flowSnapshotSchema, state_json: flowExecutionStateSchema,
  authority_json: z.object({
    planKey: z.literal("flowbot_premium"), accessMode: z.literal("active"),
    entitlements: z.record(z.string(), z.union([z.boolean(), z.string(), z.number(), z.null()])),
    limits: z.record(z.string(), z.number().nullable()),
  }).strict(),
  next_input_sequence: z.number().int().positive(),
}).strict();

const dispatchClaimSchema = z.object({
  dispatch_id: z.uuid(), tenant_id: z.uuid(), execution_id: z.uuid(),
  session_token_hash: z.instanceof(Buffer), flow_version_id: z.uuid(), node_id: z.uuid(),
  snapshot_json: flowSnapshotSchema, state_json: flowExecutionStateSchema,
  authority_json: z.object({
    planKey: z.literal("flowbot_premium"), accessMode: z.literal("active"),
    entitlements: z.record(z.string(), z.union([z.boolean(), z.string(), z.number(), z.null()])),
    limits: z.record(z.string(), z.number().nullable()),
  }).strict(),
  next_input_sequence: z.number().int().positive(), endpoint_ciphertext: z.string(),
  payload_ciphertext: z.string(), template_key: z.string(), attempt_count: z.number().int().positive(),
}).strict();

export type FlowbotDispatchClaim = Readonly<{
  dispatchId: string; tenantId: string; executionId: string; sessionTokenHash: Buffer;
  flowVersionId: string; nodeId: string; snapshot: z.infer<typeof flowSnapshotSchema>;
  state: z.infer<typeof flowExecutionStateSchema>; authority: FlowEntitlements;
  nextInputSequence: number; endpointCiphertext: string; payloadCiphertext: string;
  templateKey: string; attemptCount: number;
}>;

function jsonValue(value: unknown) { return JSON.parse(JSON.stringify(value)); }

export class FlowbotWorkerStore {
  constructor(private readonly client: DatabaseClient) {}

  async processNextTimer() {
    return this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'flowbot_worker', true), set_config('app.request_id', ${crypto.randomUUID()}, true)`;
      const rows = await sql<Record<string, unknown>[]>`SELECT * FROM tenancy.claim_flowbot_timer()`;
      if (!rows[0]) return { status: "idle" as const };
      const timer = claimSchema.parse(rows[0]);
      await sql`SELECT set_config('app.tenant_id', ${timer.tenant_id}, true)`;
      const scheduleRows = await sql<{ scheduleKey: string; timezone: string; weeklyWindows: unknown; closedDates: string[] }[]>`
        SELECT schedule_key AS "scheduleKey", timezone, weekly_windows AS "weeklyWindows", closed_dates AS "closedDates"
        FROM tenancy.flow_business_schedules WHERE tenant_id = ${timer.tenant_id}::uuid
      `;
      const schedules = flowBusinessSchedulesSchema.parse(scheduleRows);
      const input: FlowInput = { type: "timer_fired", payload: { timerId: timer.timer_id, nodeId: timer.node_id } };
      let result: FlowEngineResult;
      try {
        result = advanceFlow({
          tenantId: timer.tenant_id, deploymentId: "00000000-0000-4000-8000-000000000000",
          executionId: timer.execution_id, flowVersionId: timer.flow_version_id,
          sequence: timer.next_input_sequence, inputId: timer.timer_id, input,
          snapshot: timer.snapshot_json, state: timer.state_json,
          authority: timer.authority_json as FlowEntitlements,
          environment: flowbotEnvironment(new Date(), schedules),
        });
      } catch (error) {
        const code = error instanceof Error && "code" in error ? String(error.code) : "engine_rejected";
        await sql`SELECT tenancy.finish_flowbot_timer(${timer.timer_id}::uuid, ${code})`;
        return { status: "failed" as const, timerId: timer.timer_id, errorCode: code };
      }
      const response = { timerId: timer.timer_id, status: result.nextState.status };
      await sql`
        SELECT tenancy.commit_flowbot_step(
          ${timer.session_token_hash}, ${timer.timer_id}::uuid, ${timer.next_input_sequence},
          ${sql.json(jsonValue(input))}, ${sql.json(jsonValue(result))}, ${sql.json(response)}
        )
      `;
      const finished = await sql<{ finish_flowbot_timer: boolean }[]>`
        SELECT tenancy.finish_flowbot_timer(${timer.timer_id}::uuid, NULL) AS finish_flowbot_timer
      `;
      if (!finished[0]?.finish_flowbot_timer) throw new Error("flowbot_timer_finish_conflict");
      return { status: "fired" as const, timerId: timer.timer_id, executionId: timer.execution_id };
    }) as Promise<
      | { status: "idle" }
      | { status: "failed"; timerId: string; errorCode: string }
      | { status: "fired"; timerId: string; executionId: string }
    >;
  }

  async claimNextDispatch() {
    return this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'flowbot_worker', true), set_config('app.request_id', ${crypto.randomUUID()}, true)`;
      const rows = await sql<Record<string, unknown>[]>`SELECT * FROM tenancy.claim_flowbot_dispatch()`;
      const row = rows[0] ? dispatchClaimSchema.parse(rows[0]) : null;
      return row ? {
        dispatchId: row.dispatch_id, tenantId: row.tenant_id, executionId: row.execution_id,
        sessionTokenHash: row.session_token_hash, flowVersionId: row.flow_version_id,
        nodeId: row.node_id, snapshot: row.snapshot_json, state: row.state_json,
        authority: row.authority_json as FlowEntitlements, nextInputSequence: row.next_input_sequence,
        endpointCiphertext: row.endpoint_ciphertext, payloadCiphertext: row.payload_ciphertext,
        templateKey: row.template_key, attemptCount: row.attempt_count,
      } satisfies FlowbotDispatchClaim : null;
    });
  }

  async completeDispatch(dispatch: FlowbotDispatchClaim, delivered: boolean, errorCode?: string) {
    return this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'flowbot_worker', true), set_config('app.request_id', ${crypto.randomUUID()}, true)`;
      const input: FlowInput = {
        type: "webhook_result",
        payload: { dispatchId: dispatch.dispatchId, nodeId: dispatch.nodeId, success: delivered },
      };
      await sql`SELECT set_config('app.tenant_id', ${dispatch.tenantId}, true)`;
      const scheduleRows = await sql<{ scheduleKey: string; timezone: string; weeklyWindows: unknown; closedDates: string[] }[]>`
        SELECT schedule_key AS "scheduleKey", timezone, weekly_windows AS "weeklyWindows", closed_dates AS "closedDates"
        FROM tenancy.flow_business_schedules WHERE tenant_id = ${dispatch.tenantId}::uuid
      `;
      const schedules = flowBusinessSchedulesSchema.parse(scheduleRows);
      const result = advanceFlow({
        tenantId: dispatch.tenantId, deploymentId: "00000000-0000-4000-8000-000000000000",
        executionId: dispatch.executionId, flowVersionId: dispatch.flowVersionId,
        sequence: dispatch.nextInputSequence, inputId: dispatch.dispatchId, input,
        snapshot: dispatch.snapshot, state: dispatch.state, authority: dispatch.authority,
        environment: flowbotEnvironment(new Date(), schedules),
      });
      const response = { dispatchId: dispatch.dispatchId, delivered, status: result.nextState.status };
      await sql`
        SELECT tenancy.commit_flowbot_step(
          ${dispatch.sessionTokenHash}, ${dispatch.dispatchId}::uuid, ${dispatch.nextInputSequence},
          ${sql.json(jsonValue(input))}, ${sql.json(jsonValue(result))}, ${sql.json(response)}
        )
      `;
      const rows = await sql<{ finished: boolean }[]>`
        SELECT tenancy.finish_flowbot_dispatch(
          ${dispatch.dispatchId}::uuid, ${delivered}, ${errorCode ?? null}
        ) AS finished
      `;
      if (!rows[0]?.finished) throw new Error("flowbot_dispatch_finish_conflict");
      return { status: delivered ? "succeeded" as const : "dead_letter" as const, executionStatus: result.nextState.status };
    });
  }

  async finishDispatch(dispatchId: string, delivered: boolean, errorCode?: string) {
    return this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'flowbot_worker', true), set_config('app.request_id', ${crypto.randomUUID()}, true)`;
      const rows = await sql<{ finished: boolean }[]>`
        SELECT tenancy.finish_flowbot_dispatch(${dispatchId}::uuid, ${delivered}, ${errorCode ?? null}) AS finished
      `;
      return rows[0]?.finished ?? false;
    });
  }
}
