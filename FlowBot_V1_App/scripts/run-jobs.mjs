import { Pool } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");

const pool = new Pool({ connectionString });
const outboxLimit = Number(process.env.FLOWBOT_OUTBOX_LIMIT ?? "25");
const autoCloseDays = Number(process.env.FLOWBOT_AUTO_CLOSE_DAYS ?? "30");
const keepRetiredVersions = Number(process.env.FLOWBOT_KEEP_RETIRED_VERSIONS ?? "5");

const totals = {
  outboxClaimed: 0,
  outboxSent: 0,
  outboxFailed: 0,
  conversationsClosed: 0,
  messagesRedacted: 0,
  eventsRedacted: 0,
  outboxRedacted: 0,
  versionsDeleted: 0
};

try {
  const tenants = await query(`SELECT id, settings FROM flowbot_tenants ORDER BY created_at ASC`);
  for (const tenant of tenants.rows) {
    await runTenantJob(tenant.id, "notification_outbox", () => processOutbox(tenant.id));
    await runTenantJob(tenant.id, "auto_close", () => autoCloseConversations(tenant.id));
    await runTenantJob(tenant.id, "retention_purge", () => retentionPurge(tenant.id, tenant.settings ?? {}));
    await runTenantJob(tenant.id, "version_cleanup", () => cleanupVersions(tenant.id));
  }

  console.log(JSON.stringify({ ok: true, ...totals }, null, 2));
} finally {
  await pool.end();
}

async function runTenantJob(tenantId, jobName, fn) {
  await heartbeat(tenantId, jobName, "started");
  try {
    const result = await fn();
    await heartbeat(tenantId, jobName, "succeeded", null, result);
  } catch (error) {
    await heartbeat(tenantId, jobName, "failed", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

async function processOutbox(tenantId) {
  const claimed = await query(
    `
      WITH due AS (
        SELECT id
        FROM flowbot_notification_outbox
        WHERE tenant_id = $1
          AND (
            status IN ('pending','failed')
            OR (status = 'processing' AND locked_at < now() - interval '15 minutes')
          )
          AND next_attempt_at <= now()
        ORDER BY next_attempt_at ASC, created_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
      UPDATE flowbot_notification_outbox o
      SET status = 'processing',
          attempts = attempts + 1,
          locked_at = now(),
          updated_at = now()
      FROM due
      WHERE o.id = due.id
      RETURNING o.id, o.tenant_id, o.type, o.payload, o.attempts
    `,
    [tenantId, outboxLimit]
  );
  totals.outboxClaimed += claimed.rowCount;

  for (const row of claimed.rows) {
    try {
      await sendNotification(row);
      await query(
        `
          UPDATE flowbot_notification_outbox
          SET status = 'sent',
              sent_at = now(),
              locked_at = NULL,
              last_error = NULL,
              updated_at = now()
          WHERE tenant_id = $1 AND id = $2
        `,
        [tenantId, row.id]
      );
      totals.outboxSent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retrySeconds = Math.min(3600, 60 * 2 ** Math.min(Number(row.attempts ?? 1), 5));
      await query(
        `
          UPDATE flowbot_notification_outbox
          SET status = 'failed',
              locked_at = NULL,
              last_error = $3,
              next_attempt_at = now() + ($4 || ' seconds')::interval,
              updated_at = now()
          WHERE tenant_id = $1 AND id = $2
        `,
        [tenantId, row.id, message.slice(0, 1000), retrySeconds]
      );
      totals.outboxFailed += 1;
    }
  }

  return { claimed: claimed.rowCount };
}

async function sendNotification(row) {
  const webhookUrl = process.env.FLOWBOT_NOTIFICATION_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new Error("Notification provider not configured. Set FLOWBOT_NOTIFICATION_WEBHOOK_URL.");
  }
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: row.type,
      tenantId: row.tenant_id,
      payload: row.payload
    })
  });
  if (!response.ok) {
    throw new Error(`Notification webhook failed with ${response.status}`);
  }
}

async function autoCloseConversations(tenantId) {
  const result = await query(
    `
      UPDATE flowbot_conversations
      SET status = 'closed',
          archived = true,
          last_activity_at = last_activity_at
      WHERE tenant_id = $1
        AND deleted_at IS NULL
        AND status IN ('bot','awaiting_admin')
        AND last_activity_at < now() - ($2 || ' days')::interval
      RETURNING id
    `,
    [tenantId, autoCloseDays]
  );
  totals.conversationsClosed += result.rowCount;
  return { closed: result.rowCount };
}

async function retentionPurge(tenantId, settings) {
  const retentionDays = Number(settings.transcriptRetentionDays ?? 365);
  const conversations = await query(
    `
      SELECT id
      FROM flowbot_conversations
      WHERE tenant_id = $1
        AND started_at < now() - ($2 || ' days')::interval
    `,
    [tenantId, retentionDays]
  );
  const conversationIds = conversations.rows.map((row) => row.id);
  if (conversationIds.length === 0) return { messages: 0, events: 0, outbox: 0 };

  const messages = await query(
    `
      UPDATE flowbot_messages
      SET content = '{"redacted":true,"reason":"retention"}'::jsonb
      WHERE tenant_id = $1
        AND conversation_id = ANY($2::uuid[])
        AND content <> '{"redacted":true,"reason":"retention"}'::jsonb
      RETURNING id
    `,
    [tenantId, conversationIds]
  );
  const events = await query(
    `
      UPDATE flowbot_events
      SET payload = '{"redacted":true,"reason":"retention"}'::jsonb
      WHERE tenant_id = $1
        AND conversation_id = ANY($2::uuid[])
        AND payload <> '{"redacted":true,"reason":"retention"}'::jsonb
      RETURNING id
    `,
    [tenantId, conversationIds]
  );
  const outbox = await query(
    `
      UPDATE flowbot_notification_outbox
      SET payload = '{"redacted":true,"reason":"retention"}'::jsonb,
          updated_at = now()
      WHERE tenant_id = $1
        AND conversation_id = ANY($2::uuid[])
        AND payload <> '{"redacted":true,"reason":"retention"}'::jsonb
      RETURNING id
    `,
    [tenantId, conversationIds]
  );

  totals.messagesRedacted += messages.rowCount;
  totals.eventsRedacted += events.rowCount;
  totals.outboxRedacted += outbox.rowCount;
  return { messages: messages.rowCount, events: events.rowCount, outbox: outbox.rowCount };
}

async function cleanupVersions(tenantId) {
  const result = await query(
    `
      WITH ranked AS (
        SELECT fv.id,
               row_number() OVER (PARTITION BY fv.bot_id ORDER BY fv.version_no DESC) AS rank
        FROM flowbot_flow_versions fv
        WHERE fv.tenant_id = $1
          AND fv.status = 'retired'
          AND NOT EXISTS (
            SELECT 1 FROM flowbot_conversations c
            WHERE c.tenant_id = fv.tenant_id AND c.flow_version_id = fv.id AND c.deleted_at IS NULL
          )
          AND NOT EXISTS (
            SELECT 1 FROM flowbot_bots b
            WHERE b.tenant_id = fv.tenant_id AND b.published_version_id = fv.id
          )
      )
      DELETE FROM flowbot_flow_versions fv
      USING ranked
      WHERE fv.tenant_id = $1
        AND fv.id = ranked.id
        AND ranked.rank > $2
      RETURNING fv.id
    `,
    [tenantId, keepRetiredVersions]
  );
  totals.versionsDeleted += result.rowCount;
  return { deleted: result.rowCount };
}

async function heartbeat(tenantId, jobName, state, error = null, metadata = {}) {
  await query(
    `
      INSERT INTO flowbot_job_heartbeats (
        tenant_id, job_name, last_started_at, last_succeeded_at, last_failed_at, last_error
      )
      VALUES (
        $1,
        $2,
        CASE WHEN $3 = 'started' THEN now() ELSE NULL END,
        CASE WHEN $3 = 'succeeded' THEN now() ELSE NULL END,
        CASE WHEN $3 = 'failed' THEN now() ELSE NULL END,
        $4
      )
      ON CONFLICT (tenant_id, job_name)
      DO UPDATE SET
        last_started_at = CASE WHEN $3 = 'started' THEN now() ELSE flowbot_job_heartbeats.last_started_at END,
        last_succeeded_at = CASE WHEN $3 = 'succeeded' THEN now() ELSE flowbot_job_heartbeats.last_succeeded_at END,
        last_failed_at = CASE WHEN $3 = 'failed' THEN now() ELSE flowbot_job_heartbeats.last_failed_at END,
        last_error = CASE WHEN $3 = 'failed' THEN $4 ELSE NULL END
    `,
    [tenantId, jobName, state, error ? `${error} ${JSON.stringify(metadata)}`.slice(0, 1000) : null]
  );
}

function query(text, params = []) {
  return pool.query(text, params);
}
