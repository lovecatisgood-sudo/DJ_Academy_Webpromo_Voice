export const tenantRoles = [
  "tenant_master_admin",
  "tenant_admin",
  "tenant_operator",
  "tenant_conversation_manager",
  "tenant_human_agent",
  "tenant_analyst",
  "tenant_billing_manager",
  "tenant_readonly_support",
] as const;

export type TenantRole = (typeof tenantRoles)[number];

export const tenantPermissions = [
  "tenant.read",
  "tenant.update",
  "team.read",
  "team.invite",
  "team.manage_roles",
  "ownership.transfer",
  "security.sessions.read",
  "security.sessions.revoke",
  "onboarding.read",
  "onboarding.update",
  "subscriptions.read",
  "subscriptions.manage",
  "billing.checkout",
  "billing.portal",
  "billing.tax.manage",
  "billing.overage.manage",
  "billing.packs.purchase",
  "billing.plan.change",
  "billing.cancel",
  "usage.read",
  "contacts.read",
  "contacts.write",
  "leads.read",
  "leads.write",
  "conversations.read",
  "conversations.reply",
  "conversations.assign",
  "knowledge.read",
  "knowledge.write",
  "actions.execute",
  "integrations.manage",
  "privacy.manage",
  "flowbot.read",
  "flowbot.author",
  "flowbot.publish",
  "flowbot.deploy",
  "ai_chat.read",
  "ai_chat.author",
  "ai_chat.publish",
  "ai_chat.deploy",
  "ai_chat.channels.manage",
  "voice.read",
  "voice.deploy",
] as const;

export type TenantPermission = (typeof tenantPermissions)[number];

const ownerPermissions = new Set<TenantPermission>(tenantPermissions);
const rolePermissions: Readonly<Record<TenantRole, ReadonlySet<TenantPermission>>> = {
  tenant_master_admin: ownerPermissions,
  tenant_admin: new Set([
    "tenant.read",
    "tenant.update",
    "team.read",
    "team.invite",
    "security.sessions.read",
    "security.sessions.revoke",
    "onboarding.read",
    "onboarding.update",
    "subscriptions.read",
    "usage.read",
    "contacts.read",
    "contacts.write",
    "leads.read",
    "leads.write",
    "conversations.read",
    "conversations.reply",
    "conversations.assign",
    "knowledge.read",
    "knowledge.write",
    "actions.execute",
    "integrations.manage",
    "flowbot.read",
    "flowbot.author",
    "flowbot.publish",
    "flowbot.deploy",
    "ai_chat.read",
    "ai_chat.author",
    "ai_chat.publish",
    "ai_chat.deploy",
    "ai_chat.channels.manage",
    "voice.read",
    "voice.deploy",
  ]),
  tenant_operator: new Set([
    "tenant.read", "team.read", "onboarding.read", "subscriptions.read", "usage.read",
    "contacts.read", "contacts.write", "leads.read", "leads.write",
    "conversations.read", "conversations.reply", "conversations.assign",
    "knowledge.read", "actions.execute",
    "flowbot.read",
    "ai_chat.read",
    "voice.read",
  ]),
  tenant_conversation_manager: new Set([
    "tenant.read", "team.read", "onboarding.read", "subscriptions.read", "usage.read",
    "contacts.read", "contacts.write", "leads.read", "leads.write",
    "conversations.read", "conversations.reply", "conversations.assign",
    "knowledge.read", "knowledge.write", "actions.execute", "integrations.manage",
    "flowbot.read", "flowbot.author", "flowbot.publish", "flowbot.deploy",
    "ai_chat.read", "ai_chat.author", "ai_chat.publish", "ai_chat.deploy",
    "ai_chat.channels.manage", "voice.read", "voice.deploy",
  ]),
  tenant_human_agent: new Set([
    "tenant.read", "team.read", "onboarding.read", "subscriptions.read",
    "contacts.read", "contacts.write", "leads.read", "leads.write",
    "conversations.read", "conversations.reply", "conversations.assign",
    "knowledge.read", "flowbot.read", "ai_chat.read", "voice.read",
  ]),
  tenant_analyst: new Set([
    "tenant.read", "onboarding.read", "subscriptions.read", "usage.read",
    "contacts.read", "leads.read", "conversations.read", "knowledge.read",
    "flowbot.read",
    "ai_chat.read",
    "voice.read",
  ]),
  tenant_billing_manager: new Set([
    "tenant.read", "team.read", "subscriptions.read", "usage.read",
    "billing.checkout", "billing.portal", "billing.tax.manage",
    "billing.overage.manage", "billing.packs.purchase", "billing.plan.change",
    "billing.cancel",
  ]),
  tenant_readonly_support: new Set([
    "tenant.read", "team.read", "onboarding.read", "subscriptions.read", "usage.read",
    "contacts.read", "leads.read", "conversations.read", "knowledge.read",
    "flowbot.read", "ai_chat.read", "voice.read",
  ]),
};

export function tenantRoleAllows(role: TenantRole, permission: TenantPermission): boolean {
  return rolePermissions[role]?.has(permission) ?? false;
}

export const sensitiveTenantPermissions = new Set<TenantPermission>([
  "ownership.transfer", "team.manage_roles", "privacy.manage", "integrations.manage", "ai_chat.channels.manage",
  "billing.checkout", "billing.portal", "billing.tax.manage", "billing.overage.manage",
  "billing.packs.purchase", "billing.plan.change", "billing.cancel", "subscriptions.manage",
]);

export function tenantPermissionRequiresAssurance(permission: TenantPermission): boolean {
  return sensitiveTenantPermissions.has(permission);
}

export function hasRecentTenantAssurance(input: Readonly<{
  reauthenticatedAt: Date;
  mfaVerifiedAt: Date | null | undefined;
  now?: Date;
  maxAgeMs?: number;
}>): boolean {
  const now = input.now ?? new Date();
  const maxAgeMs = input.maxAgeMs ?? 10 * 60 * 1000;
  const mfaAt = input.mfaVerifiedAt?.getTime() ?? 0;
  const reauthenticatedAt = input.reauthenticatedAt.getTime();
  return now.getTime() >= mfaAt && now.getTime() >= reauthenticatedAt
    && now.getTime() - mfaAt <= maxAgeMs
    && now.getTime() - reauthenticatedAt <= maxAgeMs;
}

export const platformRoles = [
  "platform_owner",
  "platform_ai_operations",
  "platform_support",
  "platform_finance",
] as const;

export type PlatformRole = (typeof platformRoles)[number];

export const platformPermissions = [
  "platform.health.read",
  "platform.audit.read",
  "platform.tenants.read",
  "platform.support.request",
  "platform.support.approve",
  "platform.support.revoke",
  "platform.recovery.read",
  "platform.recovery.request",
  "platform.recovery.review",
  "platform.routing.read",
  "platform.routing.change",
  "platform.billing.read",
  "platform.billing.manage",
  "platform.catalog.read",
  "platform.fulfillment.read",
  "platform.fulfillment.manage",
] as const;

export type PlatformPermission = (typeof platformPermissions)[number];

const platformRolePermissions: Readonly<Record<PlatformRole, ReadonlySet<PlatformPermission>>> = {
  platform_owner: new Set(platformPermissions),
  platform_ai_operations: new Set([
    "platform.health.read",
    "platform.audit.read",
    "platform.routing.read",
    "platform.routing.change",
    "platform.recovery.read",
    "platform.recovery.request",
  ]),
  platform_support: new Set([
    "platform.health.read",
    "platform.audit.read",
    "platform.tenants.read",
    "platform.support.request",
    "platform.recovery.read",
    "platform.recovery.request",
    "platform.fulfillment.read",
    "platform.fulfillment.manage",
  ]),
  platform_finance: new Set([
    "platform.health.read",
    "platform.audit.read",
    "platform.tenants.read",
    "platform.billing.read",
    "platform.catalog.read",
    "platform.fulfillment.read",
  ]),
};

export function platformRoleAllows(role: PlatformRole, permission: PlatformPermission): boolean {
  return platformRolePermissions[role]?.has(permission) ?? false;
}
