export const tenantRoles = [
  "tenant_master_admin",
  "tenant_admin",
  "tenant_operator",
  "tenant_analyst",
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
  tenant_analyst: new Set([
    "tenant.read", "onboarding.read", "subscriptions.read", "usage.read",
    "contacts.read", "leads.read", "conversations.read", "knowledge.read",
    "flowbot.read",
    "ai_chat.read",
    "voice.read",
  ]),
};

export function tenantRoleAllows(role: TenantRole, permission: TenantPermission): boolean {
  return rolePermissions[role]?.has(permission) ?? false;
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
  ]),
  platform_finance: new Set([
    "platform.health.read",
    "platform.audit.read",
    "platform.tenants.read",
    "platform.billing.read",
    "platform.catalog.read",
  ]),
};

export function platformRoleAllows(role: PlatformRole, permission: PlatformPermission): boolean {
  return platformRolePermissions[role]?.has(permission) ?? false;
}
