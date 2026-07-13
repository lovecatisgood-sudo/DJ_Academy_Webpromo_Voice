import { readFileSync } from "node:fs";

const migration = readFileSync("scripts/migrate.mjs", "utf8");

function assertIncludes(value, message) {
  if (!migration.includes(value)) {
    console.error(message);
    process.exitCode = 1;
  }
}

const requiredTables = ["settings", "conversations", "leads"];
const requiredSettingsColumns = [
  "agent_enabled boolean",
  "greeting text",
  "voice text",
  "voice_provider text",
  "language_mode text",
  "knowledge_md text",
  "knowledge_version int",
  "max_call_seconds int",
  "daily_session_cap int",
  "model_id text",
  "transcription_model text",
];
const requiredConversationColumns = [
  "started_at timestamptz",
  "ended_at timestamptz",
  "duration_seconds int",
  "language text",
  "page_url text",
  "transcript jsonb",
  "had_lead boolean",
];
const requiredLeadColumns = [
  "conversation_id uuid references conversations(id)",
  "name text",
  "contact text",
  "contact_type text",
  "need text",
  "preferred_time text",
  "status text",
];
const requiredIndexes = [
  "leads_conversation_contact_unique",
  "conversations_started_at_idx",
  "conversations_had_lead_idx",
  "leads_created_at_idx",
  "leads_status_idx",
];

for (const table of requiredTables) {
  assertIncludes(`create table if not exists ${table}`, `Missing table migration for ${table}.`);
}

for (const column of [
  ...requiredSettingsColumns,
  ...requiredConversationColumns,
  ...requiredLeadColumns,
]) {
  assertIncludes(column, `Missing required schema column: ${column}`);
}

for (const index of requiredIndexes) {
  assertIncludes(index, `Missing required index: ${index}`);
}

assertIncludes("insert into settings", "Migration must seed the settings row.");
assertIncludes("on conflict (id) do nothing", "Settings seed must be idempotent.");

if (!process.exitCode) {
  console.log("Schema invariants verified.");
}
