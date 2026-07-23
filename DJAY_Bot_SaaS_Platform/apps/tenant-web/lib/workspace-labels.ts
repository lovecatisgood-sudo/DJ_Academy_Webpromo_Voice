import type { TenantRole } from "@djay/authorization";
import { tenantRoles } from "@djay/authorization";

const roleLabels: Readonly<Record<TenantRole, string>> = {
  tenant_master_admin: "Workspace owner",
  tenant_admin: "Tenant admin",
  tenant_operator: "Operator",
  tenant_conversation_manager: "Conversation manager",
  tenant_human_agent: "Human agent",
  tenant_analyst: "Analyst",
  tenant_billing_manager: "Billing manager",
  tenant_readonly_support: "Read-only support",
};

const stageLabels: Readonly<Record<string, string>> = {
  account_created: "Account created",
  business_profile: "Business profile",
  product_selection: "Product selection",
  ready: "Launch ready",
};

const statusLabels: Readonly<Record<string, string>> = {
  open: "Open",
  closed: "Closed",
  human: "Human",
  automation: "Automation",
  bot: "Bot",
  active: "Active",
  pending: "Pending",
  revoked: "Revoked",
  none: "None",
  read_only: "Read only",
  past_due: "Past due",
  cancelled: "Cancelled",
};

const planLabels: Readonly<Record<string, string>> = {
  flowbot: "Flow Bot",
  ai_chat: "AI Chat",
  voice: "Voice",
  flowbot_basic: "Flow Bot Starter",
  flowbot_premium: "Flow Bot Advanced",
  ai_chat_basic: "AI Chat Starter",
  ai_chat_premium: "AI Chat Advanced",
  voice_basic_gen1: "Voice Basic",
  voice_advanced_gen2: "Voice Advanced",
};

/** Roles whose day-2 home is Inbox rather than Overview. */
export const inboxHomeRoles = new Set<TenantRole>([
  "tenant_operator",
  "tenant_conversation_manager",
  "tenant_human_agent",
]);

/** Pure agent-style roles: hide product studios from nav. */
export const studioHiddenRoles = new Set<TenantRole>([
  "tenant_human_agent",
]);

export function humanizeTenantRole(role: string): string {
  if (tenantRoles.includes(role as TenantRole)) return roleLabels[role as TenantRole];
  return humanizeToken(role);
}

export function humanizeOnboardingStage(stage: string): string {
  return stageLabels[stage] ?? humanizeToken(stage);
}

export function humanizeToken(value: string): string {
  const mapped = statusLabels[value] ?? planLabels[value];
  if (mapped) return mapped;
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function humanizePlanKey(planKey: string | null | undefined): string {
  if (!planKey) return "Unavailable";
  return planLabels[planKey] ?? humanizeToken(planKey);
}

export function humanizeAccessMode(accessMode: string | null | undefined): string {
  if (!accessMode) return "Unavailable";
  return statusLabels[accessMode] ?? humanizeToken(accessMode);
}

export function defaultWorkspaceHome(input: Readonly<{
  role: string | null | undefined;
  explicitNext?: string | null;
  launchReady?: boolean;
}>): string {
  if (input.explicitNext) return input.explicitNext;
  const role = input.role;
  if (role && tenantRoles.includes(role as TenantRole)) {
    if (inboxHomeRoles.has(role as TenantRole)) return "/workspace/inbox";
    if (role === "tenant_billing_manager") return "/workspace/usage";
    if (
      (role === "tenant_master_admin" || role === "tenant_admin")
      && input.launchReady === false
    ) {
      return "/workspace/setup";
    }
  }
  return "/workspace";
}
