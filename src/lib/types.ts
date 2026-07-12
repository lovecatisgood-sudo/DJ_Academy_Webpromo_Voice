export type ContactType = "phone" | "line" | "email" | "other";
export type LeadStatus = "new" | "contacted" | "closed";
export type ConversationLanguage = "th" | "en" | "mixed";

export type Settings = {
  id: number;
  agent_enabled: boolean;
  greeting: string | null;
  voice: string;
  language_mode: string;
  knowledge_md: string | null;
  knowledge_version: number;
  max_call_seconds: number;
  daily_session_cap: number;
  model_id: string;
  transcription_model: string;
  updated_at: string;
};

export type TranscriptItem = {
  role: "user" | "assistant" | "tool" | "system";
  text: string;
  t: number;
};

export type LeadPayload = {
  name: string;
  contact: string;
  contact_type: ContactType;
  need: string;
  preferred_time: string;
};
