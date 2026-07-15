import { readFileSync } from "node:fs";

const migration = readFileSync("scripts/migrate.mjs", "utf8");

function assertIncludes(value, message) {
  if (!migration.includes(value)) {
    console.error(message);
    process.exitCode = 1;
  }
}

const requiredTables = [
  "settings",
  "conversations",
  "conversation_messages",
  "leads",
  "admin_users",
  "admin_calendar_profiles",
  "availability_rules",
  "availability_overrides",
  "booking_links",
  "meeting_types",
  "appointments",
];
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
  "analysis_enabled boolean",
  "analysis_model_id text",
  "booking_enabled boolean",
  "active_booking_admin_id uuid references admin_users(id)",
  "active_booking_link_id uuid",
  "default_timezone text",
  "require_booking_confirmation boolean",
  "default_booking_window_days int",
  "text_chat_enabled boolean",
  "text_chat_model_id text",
  "text_chat_greeting text",
  "text_chat_max_messages int",
  "text_chat_daily_session_cap int",
];
const requiredConversationColumns = [
  "started_at timestamptz",
  "ended_at timestamptz",
  "duration_seconds int",
  "language text",
  "page_url text",
  "transcript jsonb",
  "had_lead boolean",
  "summary text",
  "business_type text",
  "main_problem text",
  "business_goal text",
  "interest_level text",
  "concern_or_objection text",
  "recommended_service text",
  "next_action text",
  "analysis_status text",
  "analysis_error text",
  "analysis_model_id text",
  "analysis_updated_at timestamptz",
  "starred boolean",
  "deleted_at timestamptz",
  "assigned_admin_id uuid references admin_users(id)",
  "channel text",
  "interaction_mode text",
  "provider text",
  "model_id text",
  "last_message_at timestamptz",
  "message_count int",
];
const requiredConversationMessageColumns = [
  "conversation_id uuid not null references conversations(id)",
  "channel text not null",
  "role text not null",
  "content text not null",
  "token_count int",
  "metadata jsonb",
  "created_at timestamptz not null",
];
const requiredLeadColumns = [
  "conversation_id uuid references conversations(id)",
  "name text",
  "contact text",
  "contact_type text",
  "need text",
  "preferred_time text",
  "status text",
  "client_name text",
  "company_name text",
  "phone text",
  "email text",
  "line_id text",
  "whatsapp text",
  "other_contact text",
  "preferred_contact_method text",
  "preferred_meeting_day text",
  "preferred_meeting_time text",
  "admin_notes text",
  "assigned_admin_id uuid references admin_users(id)",
  "updated_at timestamptz",
  "source_channel text",
  "source_mode text",
];
const requiredAdminUserColumns = [
  "name text not null",
  "username text unique not null",
  "email text unique",
  "password_hash text not null",
  "role text not null",
  "is_active boolean not null",
  "last_login_at timestamptz",
  "deleted_at timestamptz",
];
const requiredCalendarColumns = [
  "admin_user_id uuid not null references admin_users(id)",
  "display_name text not null",
  "booking_slug text unique not null",
  "timezone text not null",
  "meeting_title text not null",
  "meeting_location text",
  "default_duration_minutes int not null",
  "buffer_before_minutes int not null",
  "buffer_after_minutes int not null",
  "minimum_notice_minutes int not null",
  "max_bookings_per_day int",
  "booking_window_days int not null",
  "allow_admin_self_edit boolean not null",
];
const requiredAvailabilityColumns = [
  "admin_user_id uuid not null references admin_users(id)",
  "weekday int not null",
  "start_time time not null",
  "end_time time not null",
  "override_type text not null",
  "starts_at timestamptz not null",
  "ends_at timestamptz not null",
  "created_by_admin_id uuid references admin_users(id)",
];
const requiredBookingLinkColumns = [
  "owner_admin_id uuid not null references admin_users(id)",
  "name text not null",
  "slug text unique not null",
  "title text not null",
  "description text",
  "meeting_location text",
  "duration_minutes int not null",
  "buffer_before_minutes int not null",
  "buffer_after_minutes int not null",
  "minimum_notice_minutes int not null",
  "max_bookings_per_day int",
  "booking_window_days int not null",
  "require_confirmation boolean not null",
  "is_active boolean not null",
  "is_ai_active boolean not null",
  "deleted_at timestamptz",
];
const requiredMeetingTypeColumns = [
  "name text not null",
  "duration_minutes int not null",
  "is_default boolean not null",
  "is_active boolean not null",
];
const requiredAppointmentColumns = [
  "lead_id uuid references leads(id)",
  "conversation_id uuid references conversations(id)",
  "assigned_admin_id uuid references admin_users(id)",
  "assigned_admin_name_snapshot text",
  "meeting_type_id uuid references meeting_types(id)",
  "booking_link_id uuid references booking_links(id)",
  "status text not null",
  "source text not null",
  "start_at timestamptz not null",
  "end_at timestamptz not null",
  "duration_minutes int not null",
  "client_name text not null",
  "email text not null",
  "confirmed_at timestamptz",
  "rejected_at timestamptz",
  "cancelled_at timestamptz",
  "completed_at timestamptz",
  "no_show_at timestamptz",
];
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
  "conversations_channel_started_idx",
  "conversations_channel_interest_idx",
  "leads_assigned_admin_idx",
  "leads_status_channel_updated_idx",
  "admin_calendar_profiles_admin_unique",
  "admin_calendar_profiles_admin_idx",
  "availability_rules_admin_weekday_idx",
  "availability_overrides_admin_time_idx",
  "booking_links_slug_unique",
  "booking_links_owner_idx",
  "booking_links_active_idx",
  "booking_links_single_ai_active_idx",
  "appointments_assigned_admin_time_idx",
  "appointments_lead_idx",
  "appointments_conversation_idx",
  "appointments_booking_link_idx",
  "appointments_status_idx",
  "appointments_source_start_idx",
  "conversation_messages_conversation_time_idx",
  "conversation_messages_channel_time_idx",
];

for (const table of requiredTables) {
  assertIncludes(`create table if not exists ${table}`, `Missing table migration for ${table}.`);
}

for (const column of [
  ...requiredSettingsColumns,
  ...requiredConversationColumns,
  ...requiredConversationMessageColumns,
  ...requiredLeadColumns,
  ...requiredAdminUserColumns,
  ...requiredCalendarColumns,
  ...requiredAvailabilityColumns,
  ...requiredBookingLinkColumns,
  ...requiredMeetingTypeColumns,
  ...requiredAppointmentColumns,
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
