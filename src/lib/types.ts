export type ContactType = "phone" | "line" | "email" | "other";
export type LeadStatus = "pending_follow_up" | "appointment_set" | "follow_up_later" | "deal_closed" | "no_deal";
export type ConversationLanguage = "th" | "en" | "mixed";
export type VoiceProvider = "openai" | "gemini";
export type InterestLevel = "low" | "medium" | "high" | "unknown";
export type AnalysisStatus = "pending" | "completed" | "failed" | "skipped";
export type AdminRole = "master_admin" | "admin";
export type ConversationChannel = "voice_widget" | "text_widget";
export type InteractionMode = "voice" | "text";
export type ConversationMessageRole = "user" | "assistant" | "system" | "tool";
export type AppointmentStatus =
  | "pending_confirmation"
  | "confirmed"
  | "rejected"
  | "cancelled"
  | "completed"
  | "no_show";
export type AppointmentSource = "voice_agent" | "text_chat" | "manual" | "public_booking";
export type AvailabilityOverrideType = "blocked" | "extra_available";

export type Settings = {
  id: number;
  agent_enabled: boolean;
  greeting: string | null;
  voice: string;
  voice_provider: VoiceProvider;
  language_mode: string;
  knowledge_md: string | null;
  knowledge_version: number;
  max_call_seconds: number;
  daily_session_cap: number;
  model_id: string;
  transcription_model: string;
  analysis_enabled: boolean;
  analysis_model_id: string;
  booking_enabled: boolean;
  active_booking_admin_id: string | null;
  active_booking_link_id: string | null;
  default_timezone: string;
  require_booking_confirmation: boolean;
  default_booking_window_days: number;
  text_chat_enabled: boolean;
  text_chat_model_id: string;
  text_chat_greeting: string | null;
  text_chat_max_messages: number;
  text_chat_daily_session_cap: number;
  updated_at: string;
};

export type AdminUser = {
  id: string;
  name: string;
  username: string;
  email: string | null;
  role: AdminRole;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type TranscriptItem = {
  role: "user" | "assistant" | "tool" | "system";
  text: string;
  t: number;
};

export type ConversationMessage = {
  id: string;
  conversation_id: string;
  channel: ConversationChannel;
  role: ConversationMessageRole;
  content: string;
  token_count: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type LeadPayload = {
  name: string;
  contact: string;
  contact_type: ContactType;
  need: string;
  preferred_time: string;
};

export type ConversationSummaryFields = {
  summary: string | null;
  business_type: string | null;
  main_problem: string | null;
  business_goal: string | null;
  interest_level: InterestLevel;
  concern_or_objection: string | null;
  recommended_service: string | null;
  next_action: string | null;
  analysis_status: AnalysisStatus;
  analysis_error: string | null;
  analysis_model_id: string | null;
  analysis_updated_at: string | null;
  starred: boolean;
  deleted_at: string | null;
};

export type LeadClientFields = {
  client_name: string | null;
  company_name: string | null;
  phone: string | null;
  email: string | null;
  line_id: string | null;
  whatsapp: string | null;
  other_contact: string | null;
  preferred_contact_method: string | null;
  preferred_meeting_day: string | null;
  preferred_meeting_time: string | null;
  admin_notes: string | null;
  assigned_admin_id: string | null;
  updated_at: string | null;
  source_channel: ConversationChannel;
  source_mode: InteractionMode;
};

export type CalendarProfile = {
  id: string;
  admin_user_id: string;
  display_name: string;
  booking_slug: string;
  timezone: string;
  meeting_title: string;
  meeting_location: string | null;
  default_duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  minimum_notice_minutes: number;
  max_bookings_per_day: number | null;
  booking_window_days: number;
  is_active: boolean;
  allow_admin_self_edit: boolean;
  created_at: string;
  updated_at: string;
};

export type BookingLink = {
  id: string;
  owner_admin_id: string;
  name: string;
  slug: string;
  title: string;
  description: string | null;
  meeting_location: string | null;
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  minimum_notice_minutes: number;
  max_bookings_per_day: number | null;
  booking_window_days: number;
  require_confirmation: boolean;
  is_active: boolean;
  is_ai_active: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Appointment = {
  id: string;
  lead_id: string | null;
  conversation_id: string | null;
  assigned_admin_id: string | null;
  assigned_admin_name_snapshot: string | null;
  meeting_type_id: string | null;
  booking_link_id: string | null;
  status: AppointmentStatus;
  source: AppointmentSource;
  start_at: string;
  end_at: string;
  timezone: string;
  duration_minutes: number;
  client_name: string;
  company_name: string | null;
  email: string;
  phone: string | null;
  line_id: string | null;
  whatsapp: string | null;
  note: string | null;
  meeting_location: string | null;
  admin_notes: string | null;
  confirmed_at: string | null;
  rejected_at: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
  no_show_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
