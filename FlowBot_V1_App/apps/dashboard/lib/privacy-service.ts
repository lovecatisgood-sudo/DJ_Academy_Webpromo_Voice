import { createSqlClient, type AdminUser } from "@flowbot/db";
import { Pool, type PoolClient } from "@neondatabase/serverless";

type Sql = any;
let pgPool: Pool | null = null;

function requireOwner(admin: AdminUser) {
  if (admin.role !== "owner") {
    throw Object.assign(new Error("Owner role required."), { statusCode: 403 });
  }
}

export async function exportCustomerData(admin: AdminUser, customerId: string, sql: Sql = createSqlClient()) {
  requireOwner(admin);
  const customerRows = await sql`
    SELECT id, name, email::text, phone, line_id, whatsapp, note, created_at, updated_at, deleted_at
    FROM flowbot_customers
    WHERE tenant_id = ${admin.tenantId}
      AND id = ${customerId}
    LIMIT 1
  `;
  const customer = customerRows[0];
  if (!customer) return null;

  const conversations = await sql`
    SELECT id, bot_id, flow_version_id, channel, status, crm_status, lang, starred, archived, started_at, last_activity_at, deleted_at
    FROM flowbot_conversations
    WHERE tenant_id = ${admin.tenantId}
      AND customer_id = ${customerId}
    ORDER BY last_activity_at DESC
  `;
  const conversationIds = conversations.map((conversation: Record<string, unknown>) => conversation.id);
  const messages = conversationIds.length
    ? await sql`
        SELECT id, conversation_id, sequence::text, sender, type, content, created_at
        FROM flowbot_messages
        WHERE tenant_id = ${admin.tenantId}
          AND conversation_id = ANY(${conversationIds})
        ORDER BY sequence ASC
      `
    : [];
  const leads = await sql`
    SELECT id, conversation_id, customer_id, name, phone, email::text, extra, created_at, updated_at, deleted_at
    FROM flowbot_leads
    WHERE tenant_id = ${admin.tenantId}
      AND customer_id = ${customerId}
    ORDER BY created_at DESC
  `;
  const notes = conversationIds.length
    ? await sql`
        SELECT id, conversation_id, note, created_at
        FROM flowbot_conversation_notes
        WHERE tenant_id = ${admin.tenantId}
          AND conversation_id = ANY(${conversationIds})
        ORDER BY created_at DESC
      `
    : [];

  return {
    exportedAt: new Date().toISOString(),
    customer,
    conversations,
    messages,
    leads,
    notes
  };
}

export async function eraseCustomerData(admin: AdminUser, customerId: string) {
  requireOwner(admin);
  return withPgTransaction(async (sql) => {
    const customerRows = await sql`
      SELECT id
      FROM flowbot_customers
      WHERE tenant_id = ${admin.tenantId}
        AND id = ${customerId}
      LIMIT 1
      FOR UPDATE
    `;
    if (!customerRows[0]) return null;

    const conversationRows = await sql`
      SELECT DISTINCT id
      FROM flowbot_conversations
      WHERE tenant_id = ${admin.tenantId}
        AND customer_id = ${customerId}
    `;
    const leadConversationRows = await sql`
      SELECT DISTINCT conversation_id AS id
      FROM flowbot_leads
      WHERE tenant_id = ${admin.tenantId}
        AND customer_id = ${customerId}
        AND conversation_id IS NOT NULL
    `;
    const conversationIds = [...new Set([...conversationRows, ...leadConversationRows].map((row: Record<string, unknown>) => String(row.id)))];

    await sql`
      UPDATE flowbot_customers
      SET name = NULL,
          email = NULL,
          phone = NULL,
          phone_normalized = NULL,
          line_id = NULL,
          whatsapp = NULL,
          note = '',
          deleted_at = now(),
          updated_at = now()
      WHERE tenant_id = ${admin.tenantId}
        AND id = ${customerId}
    `;

    await sql`
      UPDATE flowbot_leads
      SET name = NULL,
          phone = NULL,
          phone_normalized = NULL,
          email = NULL,
          extra = '{"redacted":true}'::jsonb,
          deleted_at = now(),
          updated_at = now()
      WHERE tenant_id = ${admin.tenantId}
        AND customer_id = ${customerId}
    `;

    await sql`
      UPDATE flowbot_conversations
      SET customer_id = NULL
      WHERE tenant_id = ${admin.tenantId}
        AND customer_id = ${customerId}
    `;

    if (conversationIds.length) {
      await sql`
        UPDATE flowbot_messages
        SET content = '{"redacted":true}'::jsonb
        WHERE tenant_id = ${admin.tenantId}
          AND conversation_id = ANY(${conversationIds})
      `;
      await sql`
        UPDATE flowbot_conversation_notes
        SET note = '[erased]'
        WHERE tenant_id = ${admin.tenantId}
          AND conversation_id = ANY(${conversationIds})
      `;
      await sql`
        UPDATE flowbot_events
        SET payload = '{"redacted":true}'::jsonb
        WHERE tenant_id = ${admin.tenantId}
          AND conversation_id = ANY(${conversationIds})
      `;
      await sql`
        UPDATE flowbot_notification_outbox
        SET payload = '{"redacted":true}'::jsonb,
            updated_at = now()
        WHERE tenant_id = ${admin.tenantId}
          AND conversation_id = ANY(${conversationIds})
      `;
    }

    await sql`
      INSERT INTO flowbot_audit_logs (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
      VALUES (
        ${admin.tenantId},
        ${admin.id},
        'customer.erase_personal_data',
        'customer',
        ${customerId},
        ${JSON.stringify({ conversationCount: conversationIds.length })}
      )
    `;

    return {
      erased: true,
      customerId,
      conversationCount: conversationIds.length
    };
  });
}

async function withPgTransaction<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  const client = await getPgPool().connect();
  const sql = createTxSql(client);
  try {
    await client.query("BEGIN");
    const result = await fn(sql);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function createTxSql(client: PoolClient): Sql {
  return async (strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = "";
    for (let index = 0; index < strings.length; index += 1) {
      text += strings[index];
      if (index < values.length) text += `$${index + 1}`;
    }
    const result = await client.query(text, values);
    return result.rows;
  };
}

function getPgPool(): Pool {
  if (!pgPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is required.");
    pgPool = new Pool({ connectionString });
  }
  return pgPool;
}
