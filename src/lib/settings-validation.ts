export type SettingsInput = {
  agent_enabled?: unknown;
  greeting?: unknown;
  voice?: unknown;
  voice_provider?: unknown;
  language_mode?: unknown;
  knowledge_md?: unknown;
  max_call_seconds?: unknown;
  daily_session_cap?: unknown;
  model_id?: unknown;
  transcription_model?: unknown;
  analysis_enabled?: unknown;
  analysis_model_id?: unknown;
  booking_enabled?: unknown;
  active_booking_admin_id?: unknown;
  active_booking_link_id?: unknown;
  default_timezone?: unknown;
  require_booking_confirmation?: unknown;
  default_booking_window_days?: unknown;
  text_chat_enabled?: unknown;
  text_chat_model_id?: unknown;
  text_chat_greeting?: unknown;
  text_chat_max_messages?: unknown;
  text_chat_daily_session_cap?: unknown;
};

export type NormalizedSettings = {
  agent_enabled?: boolean;
  greeting?: string;
  voice?: string;
  voice_provider?: "openai" | "gemini";
  language_mode?: string;
  knowledge_md?: string;
  max_call_seconds?: number;
  daily_session_cap?: number;
  model_id?: string;
  transcription_model?: string;
  analysis_enabled?: boolean;
  analysis_model_id?: string;
  booking_enabled?: boolean;
  active_booking_admin_id?: string | null;
  active_booking_link_id?: string | null;
  default_timezone?: string;
  require_booking_confirmation?: boolean;
  default_booking_window_days?: number;
  text_chat_enabled?: boolean;
  text_chat_model_id?: string;
  text_chat_greeting?: string;
  text_chat_max_messages?: number;
  text_chat_daily_session_cap?: number;
};

function cleanString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return undefined;
  return value.trim().slice(0, maxLength);
}

function requiredIdentifier(value: unknown, label: string) {
  const clean = cleanString(value, 96);

  if (!clean || !/^[A-Za-z0-9._:-]+$/.test(clean)) {
    throw new Error(`${label} is invalid.`);
  }

  return clean;
}

function clampNumber(value: unknown, min: number, max: number, fallback?: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(parsed)));
}

export function normalizeSettingsInput(input: SettingsInput, mode: "form" | "patch"): NormalizedSettings {
  const output: NormalizedSettings = {};

  if (typeof input.agent_enabled === "boolean") {
    output.agent_enabled = input.agent_enabled;
  }

  if (mode === "form") {
    output.agent_enabled = input.agent_enabled === "on";
  }

  if (typeof input.analysis_enabled === "boolean") {
    output.analysis_enabled = input.analysis_enabled;
  }

  if (mode === "form" && input.analysis_enabled !== undefined) {
    output.analysis_enabled = input.analysis_enabled === "on";
  }

  if (typeof input.booking_enabled === "boolean") {
    output.booking_enabled = input.booking_enabled;
  }

  if (mode === "form" && input.booking_enabled !== undefined) {
    output.booking_enabled = input.booking_enabled === "on";
  }

  if (typeof input.text_chat_enabled === "boolean") {
    output.text_chat_enabled = input.text_chat_enabled;
  }

  if (mode === "form" && input.text_chat_enabled !== undefined) {
    output.text_chat_enabled = input.text_chat_enabled === "on";
  }

  if (typeof input.require_booking_confirmation === "boolean") {
    output.require_booking_confirmation = input.require_booking_confirmation;
  }

  if (mode === "form" && input.require_booking_confirmation !== undefined) {
    output.require_booking_confirmation = input.require_booking_confirmation === "on";
  }

  const greeting = cleanString(input.greeting, 4000);
  if (greeting !== undefined) output.greeting = greeting;

  const languageMode = cleanString(input.language_mode, 64);
  if (languageMode !== undefined) {
    if (!languageMode || !/^[A-Za-z0-9._:-]+$/.test(languageMode)) {
      throw new Error("Language mode is invalid.");
    }
    output.language_mode = languageMode;
  }

  const knowledge = cleanString(input.knowledge_md, 60000);
  if (knowledge !== undefined) output.knowledge_md = knowledge;

  if (input.max_call_seconds !== undefined) {
    const maxCallSeconds = clampNumber(input.max_call_seconds, 60, 3600);
    if (!maxCallSeconds) throw new Error("Max call length is invalid.");
    output.max_call_seconds = maxCallSeconds;
  }

  if (input.daily_session_cap !== undefined) {
    const dailySessionCap = clampNumber(input.daily_session_cap, 1, 1000);
    if (!dailySessionCap) throw new Error("Daily session cap is invalid.");
    output.daily_session_cap = dailySessionCap;
  }

  if (input.text_chat_max_messages !== undefined) {
    const maxMessages = clampNumber(input.text_chat_max_messages, 1, 200);
    if (!maxMessages) throw new Error("Text chat max messages is invalid.");
    output.text_chat_max_messages = maxMessages;
  }

  if (input.text_chat_daily_session_cap !== undefined) {
    const dailyTextCap = clampNumber(input.text_chat_daily_session_cap, 1, 5000);
    if (!dailyTextCap) throw new Error("Text chat daily cap is invalid.");
    output.text_chat_daily_session_cap = dailyTextCap;
  }

  if (input.default_booking_window_days !== undefined) {
    const bookingWindowDays = clampNumber(input.default_booking_window_days, 1, 365);
    if (!bookingWindowDays) throw new Error("Booking window is invalid.");
    output.default_booking_window_days = bookingWindowDays;
  }

  if (input.voice !== undefined) {
    output.voice = requiredIdentifier(input.voice, "Voice");
  }

  if (input.voice_provider !== undefined) {
    const provider = cleanString(input.voice_provider, 20);

    if (provider !== "openai" && provider !== "gemini") {
      throw new Error("Voice provider is invalid.");
    }

    output.voice_provider = provider;
  }

  if (input.model_id !== undefined) {
    output.model_id = requiredIdentifier(input.model_id, "Model ID");
  }

  if (input.transcription_model !== undefined) {
    output.transcription_model = requiredIdentifier(input.transcription_model, "Transcription model");
  }

  if (input.analysis_model_id !== undefined) {
    output.analysis_model_id = requiredIdentifier(input.analysis_model_id, "Analysis model ID");
  }

  if (input.text_chat_model_id !== undefined) {
    output.text_chat_model_id = requiredIdentifier(input.text_chat_model_id, "Text chat model ID");
  }

  const textChatGreeting = cleanString(input.text_chat_greeting, 4000);
  if (textChatGreeting !== undefined) output.text_chat_greeting = textChatGreeting;

  if (input.active_booking_admin_id !== undefined) {
    const value = cleanString(input.active_booking_admin_id, 80);
    if (!value) {
      output.active_booking_admin_id = null;
    } else if (/^[0-9a-fA-F-]{36}$/.test(value)) {
      output.active_booking_admin_id = value;
    } else {
      throw new Error("Active booking admin is invalid.");
    }
  }

  if (input.active_booking_link_id !== undefined) {
    const value = cleanString(input.active_booking_link_id, 80);
    if (!value) {
      output.active_booking_link_id = null;
    } else if (/^[0-9a-fA-F-]{36}$/.test(value)) {
      output.active_booking_link_id = value;
    } else {
      throw new Error("Active booking link is invalid.");
    }
  }

  if (input.default_timezone !== undefined) {
    const timezone = cleanString(input.default_timezone, 80);

    if (!timezone || !/^[A-Za-z0-9_+\-./]+$/.test(timezone)) {
      throw new Error("Default timezone is invalid.");
    }

    output.default_timezone = timezone;
  }

  return output;
}
