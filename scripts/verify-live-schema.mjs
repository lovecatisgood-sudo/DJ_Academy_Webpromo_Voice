import { neon } from "@neondatabase/serverless";
import { loadLocalEnv } from "./local-env.mjs";
import { redactError, requireDatabaseUrl } from "./env-utils.mjs";

loadLocalEnv();

const requiredColumns = {
  settings: [
    "agent_enabled",
    "greeting",
    "voice",
    "voice_provider",
    "language_mode",
    "knowledge_md",
    "knowledge_version",
    "max_call_seconds",
    "daily_session_cap",
    "model_id",
    "transcription_model",
    "analysis_enabled",
    "analysis_model_id",
    "booking_enabled",
    "active_booking_admin_id",
    "default_timezone",
    "require_booking_confirmation",
    "default_booking_window_days",
    "updated_at",
  ],
  conversations: [
    "started_at",
    "ended_at",
    "duration_seconds",
    "language",
    "page_url",
    "transcript",
    "had_lead",
    "summary",
    "business_type",
    "main_problem",
    "business_goal",
    "interest_level",
    "concern_or_objection",
    "recommended_service",
    "next_action",
    "analysis_status",
    "analysis_error",
    "analysis_model_id",
    "analysis_updated_at",
    "starred",
    "deleted_at",
    "assigned_admin_id",
  ],
  leads: [
    "conversation_id",
    "created_at",
    "name",
    "contact",
    "contact_type",
    "need",
    "preferred_time",
    "status",
    "client_name",
    "company_name",
    "phone",
    "email",
    "line_id",
    "whatsapp",
    "other_contact",
    "preferred_contact_method",
    "preferred_meeting_day",
    "preferred_meeting_time",
    "admin_notes",
    "assigned_admin_id",
    "updated_at",
  ],
  admin_users: [
    "name",
    "username",
    "email",
    "password_hash",
    "role",
    "is_active",
    "last_login_at",
    "created_at",
    "updated_at",
    "deleted_at",
  ],
  admin_calendar_profiles: [
    "admin_user_id",
    "display_name",
    "booking_slug",
    "timezone",
    "meeting_title",
    "meeting_location",
    "default_duration_minutes",
    "buffer_before_minutes",
    "buffer_after_minutes",
    "minimum_notice_minutes",
    "max_bookings_per_day",
    "booking_window_days",
    "is_active",
    "allow_admin_self_edit",
    "created_at",
    "updated_at",
  ],
  availability_rules: [
    "admin_user_id",
    "weekday",
    "start_time",
    "end_time",
    "timezone",
    "is_active",
    "created_at",
    "updated_at",
  ],
  availability_overrides: [
    "admin_user_id",
    "override_type",
    "starts_at",
    "ends_at",
    "reason",
    "created_by_admin_id",
    "created_at",
    "updated_at",
  ],
  meeting_types: [
    "name",
    "description",
    "duration_minutes",
    "is_default",
    "is_active",
    "created_at",
    "updated_at",
  ],
  appointments: [
    "lead_id",
    "conversation_id",
    "assigned_admin_id",
    "assigned_admin_name_snapshot",
    "meeting_type_id",
    "status",
    "source",
    "start_at",
    "end_at",
    "timezone",
    "duration_minutes",
    "client_name",
    "company_name",
    "email",
    "phone",
    "line_id",
    "whatsapp",
    "note",
    "meeting_location",
    "admin_notes",
    "confirmed_at",
    "rejected_at",
    "cancelled_at",
    "completed_at",
    "no_show_at",
    "created_at",
    "updated_at",
    "deleted_at",
  ],
};

const requiredIndexes = [
  "leads_conversation_contact_unique",
  "conversations_started_at_idx",
  "conversations_had_lead_idx",
  "leads_created_at_idx",
  "leads_status_idx",
  "conversations_starred_idx",
  "conversations_deleted_at_idx",
  "conversations_analysis_status_idx",
  "leads_updated_at_idx",
  "admin_users_role_idx",
  "admin_users_deleted_at_idx",
  "conversations_assigned_admin_idx",
  "leads_assigned_admin_idx",
  "admin_calendar_profiles_admin_unique",
  "admin_calendar_profiles_admin_idx",
  "availability_rules_admin_weekday_idx",
  "availability_overrides_admin_time_idx",
  "appointments_assigned_admin_time_idx",
  "appointments_lead_idx",
  "appointments_conversation_idx",
  "appointments_status_idx",
];

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

async function main() {
  const sql = neon(requireDatabaseUrl());
  const columnRows = await sql`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        'settings',
        'conversations',
        'leads',
        'admin_users',
        'admin_calendar_profiles',
        'availability_rules',
        'availability_overrides',
        'meeting_types',
        'appointments'
      )
  `;
  const actualColumns = new Set(columnRows.map((row) => `${row.table_name}.${row.column_name}`));

  for (const [table, columns] of Object.entries(requiredColumns)) {
    for (const column of columns) {
      if (!actualColumns.has(`${table}.${column}`)) {
        fail(`Live schema is missing ${table}.${column}.`);
      }
    }
  }

  const indexRows = await sql`
    select indexname
    from pg_indexes
    where schemaname = 'public'
      and indexname in (
        'leads_conversation_contact_unique',
        'conversations_started_at_idx',
        'conversations_had_lead_idx',
        'leads_created_at_idx',
        'leads_status_idx',
        'conversations_starred_idx',
        'conversations_deleted_at_idx',
        'conversations_analysis_status_idx',
        'leads_updated_at_idx',
        'admin_users_role_idx',
        'admin_users_deleted_at_idx',
        'conversations_assigned_admin_idx',
        'leads_assigned_admin_idx',
        'admin_calendar_profiles_admin_unique',
        'admin_calendar_profiles_admin_idx',
        'availability_rules_admin_weekday_idx',
        'availability_overrides_admin_time_idx',
        'appointments_assigned_admin_time_idx',
        'appointments_lead_idx',
        'appointments_conversation_idx',
        'appointments_status_idx'
      )
  `;
  const actualIndexes = new Set(indexRows.map((row) => row.indexname));

  for (const index of requiredIndexes) {
    if (!actualIndexes.has(index)) {
      fail(`Live schema is missing index ${index}.`);
    }
  }

  const settingsRows = await sql`select id from settings where id = 1 limit 1`;

  if (!settingsRows[0]) {
    fail("Live schema is missing settings row id=1.");
  }

  const meetingTypeRows = await sql`
    select id from meeting_types where is_default = true and is_active = true limit 1
  `;

  if (!meetingTypeRows[0]) {
    fail("Live schema is missing an active default meeting type.");
  }

  const masterRows = await sql`
    select id from admin_users where role = 'master_admin' and is_active = true and deleted_at is null limit 1
  `;

  if (!masterRows[0]) {
    fail("Live schema is missing an active master admin.");
  }

  if (!process.exitCode) {
    console.log("Live schema verified.");
  }
}

main().catch((error) => {
  console.error(`Live schema verification failed: ${redactError(error)}`);
  process.exit(1);
});
