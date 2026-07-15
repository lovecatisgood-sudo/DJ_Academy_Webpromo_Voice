export const conversationStatuses = ["bot", "awaiting_admin", "admin_active", "closed"] as const;
export type ConversationStatus = (typeof conversationStatuses)[number];

export const crmStatuses = [
  "new",
  "pending_follow_up",
  "appointment_made",
  "not_closed_follow",
  "closed_deal"
] as const;
export type CrmStatus = (typeof crmStatuses)[number];

export const channels = ["web", "line", "messenger", "whatsapp", "voice"] as const;
export type Channel = (typeof channels)[number];

export const messageSenders = ["bot", "visitor", "admin", "system"] as const;
export type MessageSender = (typeof messageSenders)[number];

export const messageTypes = ["text", "options", "cta", "form", "image", "audio", "system"] as const;
export type MessageType = (typeof messageTypes)[number];

export const flowNodeTypes = [
  "message",
  "options",
  "cta_link",
  "cta_lead_form",
  "cta_contact_card",
  "cta_live_chat",
  "cta_scheduler"
] as const;
export type FlowNodeType = (typeof flowNodeTypes)[number];

export const languages = ["th", "en"] as const;
export type Language = (typeof languages)[number];

export const userRoles = ["owner", "admin"] as const;
export type UserRole = (typeof userRoles)[number];

export const flowVersionStatuses = ["draft", "published", "retired"] as const;
export type FlowVersionStatus = (typeof flowVersionStatuses)[number];
