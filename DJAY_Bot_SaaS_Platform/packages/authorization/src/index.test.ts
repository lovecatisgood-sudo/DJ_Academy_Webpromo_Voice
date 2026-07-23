import { describe, expect, it } from "vitest";
import {
  platformPermissions,
  platformRoleAllows,
  hasRecentTenantAssurance,
  tenantPermissions,
  tenantRoleAllows,
  tenantPermissionRequiresAssurance,
} from "./index";

describe("authorization policy", () => {
  it("gives the Tenant Master Admin all tenant permissions but no platform policy", () => {
    expect(tenantPermissions.every((permission) => tenantRoleAllows("tenant_master_admin", permission))).toBe(true);
    expect(platformRoleAllows("platform_support", "platform.routing.change")).toBe(false);
  });

  it("restricts provider routing to internal owner and AI operations roles", () => {
    expect(platformRoleAllows("platform_owner", "platform.routing.change")).toBe(true);
    expect(platformRoleAllows("platform_ai_operations", "platform.routing.change")).toBe(true);
    expect(platformRoleAllows("platform_support", "platform.routing.change")).toBe(false);
    expect(platformRoleAllows("platform_finance", "platform.routing.change")).toBe(false);
  });

  it("keeps operational tenant roles deny-by-default", () => {
    expect(tenantRoleAllows("tenant_operator", "team.invite")).toBe(false);
    expect(tenantRoleAllows("tenant_analyst", "tenant.update")).toBe(false);
    expect(tenantRoleAllows("tenant_operator", "voice.deploy")).toBe(false);
    expect(tenantRoleAllows("tenant_analyst", "voice.read")).toBe(true);
  });

  it("reserves subscription changes for the Tenant Master Admin", () => {
    expect(tenantRoleAllows("tenant_master_admin", "subscriptions.manage")).toBe(true);
    expect(tenantRoleAllows("tenant_admin", "subscriptions.manage")).toBe(false);
    expect(tenantRoleAllows("tenant_operator", "subscriptions.manage")).toBe(false);
  });

  it("separates billing, conversation design, human-agent, analyst, and support jobs", () => {
    expect(tenantRoleAllows("tenant_billing_manager", "billing.checkout")).toBe(true);
    expect(tenantRoleAllows("tenant_billing_manager", "flowbot.author")).toBe(false);
    expect(tenantRoleAllows("tenant_conversation_manager", "flowbot.author")).toBe(true);
    expect(tenantRoleAllows("tenant_conversation_manager", "flowbot.publish")).toBe(false);
    expect(tenantRoleAllows("tenant_conversation_manager", "flowbot.deploy")).toBe(false);
    expect(tenantRoleAllows("tenant_conversation_manager", "ai_chat.publish")).toBe(false);
    expect(tenantRoleAllows("tenant_conversation_manager", "voice.deploy")).toBe(false);
    expect(tenantRoleAllows("tenant_conversation_manager", "integrations.manage")).toBe(false);
    expect(tenantRoleAllows("tenant_conversation_manager", "billing.cancel")).toBe(false);
    expect(tenantRoleAllows("tenant_human_agent", "conversations.reply")).toBe(true);
    expect(tenantRoleAllows("tenant_human_agent", "ai_chat.publish")).toBe(false);
    expect(tenantRoleAllows("tenant_analyst", "conversations.reply")).toBe(false);
    expect(tenantRoleAllows("tenant_readonly_support", "contacts.write")).toBe(false);
  });

  it("requires recent password and MFA assurance for every sensitive billing job", () => {
    for (const permission of [
      "billing.checkout", "billing.portal", "billing.tax.manage", "billing.overage.manage",
      "billing.packs.purchase", "billing.plan.change", "billing.cancel",
    ] as const) expect(tenantPermissionRequiresAssurance(permission)).toBe(true);
    const now = new Date("2026-07-18T12:00:00Z");
    expect(hasRecentTenantAssurance({ reauthenticatedAt: now, mfaVerifiedAt: now, now })).toBe(true);
    expect(hasRecentTenantAssurance({
      reauthenticatedAt: new Date(now.getTime() - 11 * 60 * 1000), mfaVerifiedAt: now, now,
    })).toBe(false);
    expect(hasRecentTenantAssurance({ reauthenticatedAt: now, mfaVerifiedAt: null, now })).toBe(false);
  });

  it("keeps billing reconciliation restricted to Platform Owner and Finance", () => {
    expect(platformRoleAllows("platform_owner", "platform.billing.read")).toBe(true);
    expect(platformRoleAllows("platform_finance", "platform.billing.read")).toBe(true);
    expect(platformRoleAllows("platform_support", "platform.billing.read")).toBe(false);
    expect(platformRoleAllows("platform_ai_operations", "platform.billing.read")).toBe(false);
  });

  it("requires an owner to review recovery requested by operations or support", () => {
    expect(platformRoleAllows("platform_support", "platform.recovery.request")).toBe(true);
    expect(platformRoleAllows("platform_ai_operations", "platform.recovery.request")).toBe(true);
    expect(platformRoleAllows("platform_support", "platform.recovery.review")).toBe(false);
    expect(platformRoleAllows("platform_ai_operations", "platform.recovery.review")).toBe(false);
    expect(platformRoleAllows("platform_finance", "platform.recovery.read")).toBe(false);
    expect(platformRoleAllows("platform_owner", "platform.recovery.review")).toBe(true);
  });

  it("covers every declared permission in the owner sets", () => {
    expect(platformPermissions.every((permission) => platformRoleAllows("platform_owner", permission))).toBe(true);
  });
});
