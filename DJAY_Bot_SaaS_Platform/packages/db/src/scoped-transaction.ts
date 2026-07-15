import type { PlatformContext, SystemContext, TenantContext } from "@djay/tenancy";
import type postgres from "postgres";
import type { DatabaseClient } from "./client";

export type TenantTransaction = Readonly<{
  context: TenantContext;
  sql: postgres.TransactionSql;
}>;

export type PlatformTransaction = Readonly<{
  context: PlatformContext;
  sql: postgres.TransactionSql;
}>;

export type SystemTransaction = Readonly<{
  context: SystemContext;
  sql: postgres.TransactionSql;
}>;

export async function withTenantTransaction<T>(
  client: DatabaseClient,
  context: TenantContext,
  operation: (transaction: TenantTransaction) => Promise<T>,
): Promise<T> {
  return client.begin(async (sql) => {
    await sql`
      SELECT
        set_config('app.tenant_id', ${context.tenantId}, true),
        set_config('app.user_id', ${context.userId}, true),
        set_config('app.membership_id', ${context.membershipId}, true),
        set_config('app.session_id', ${context.sessionId}, true),
        set_config('app.request_id', ${context.requestId}, true)
    `;
    return operation(Object.freeze({ context, sql }));
  }) as Promise<T>;
}

export async function withPlatformTransaction<T>(
  client: DatabaseClient,
  context: PlatformContext,
  operation: (transaction: PlatformTransaction) => Promise<T>,
): Promise<T> {
  return client.begin(async (sql) => {
    await sql`
      SELECT
        set_config('app.tenant_id', '', true),
        set_config('app.platform_user_id', ${context.platformUserId}, true),
        set_config('app.platform_role', ${context.role}, true),
        set_config('app.session_id', ${context.sessionId}, true),
        set_config('app.request_id', ${context.requestId}, true)
    `;
    return operation(Object.freeze({ context, sql }));
  }) as Promise<T>;
}

export async function withSystemTransaction<T>(
  client: DatabaseClient,
  context: SystemContext,
  operation: (transaction: SystemTransaction) => Promise<T>,
): Promise<T> {
  return client.begin(async (sql) => {
    await sql`
      SELECT
        set_config('app.tenant_id', '', true),
        set_config('app.service', ${context.service}, true),
        set_config('app.request_id', ${context.requestId}, true)
    `;
    return operation(Object.freeze({ context, sql }));
  }) as Promise<T>;
}
