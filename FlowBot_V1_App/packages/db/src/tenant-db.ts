import type { SqlClient } from "./client";
import { createSqlClient } from "./client";

export type TenantTransaction = {
  sql: SqlClient;
  tenantId: string;
};

export async function tenantDb<T>(
  tenantId: string,
  fn: (tx: TenantTransaction) => Promise<T>,
  sql = createSqlClient()
): Promise<T> {
  await sql`BEGIN`;
  try {
    await sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    const result = await fn({ sql, tenantId });
    await sql`COMMIT`;
    return result;
  } catch (error) {
    await sql`ROLLBACK`;
    throw error;
  }
}
