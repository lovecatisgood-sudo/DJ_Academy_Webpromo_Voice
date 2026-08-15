import { describe, expect, it } from "vitest";
import {
  defaultWorkspaceHome,
  humanizeAccessMode,
  humanizeOnboardingStage,
  humanizePlanKey,
  humanizeTenantRole,
  humanizeToken,
  inboxHomeRoles,
} from "./workspace-labels";

describe("workspace labels and homes", () => {
  it("humanizes roles and stages", () => {
    expect(humanizeTenantRole("tenant_master_admin")).toBe("Workspace owner");
    expect(humanizeTenantRole("tenant_human_agent")).toBe("Human agent");
    expect(humanizeOnboardingStage("account_created")).toBe("Account created");
    expect(humanizeToken("flow_execution")).toBe("Flow Execution");
    expect(humanizePlanKey("flowbot_basic")).toBe("Flow Bot Starter");
    expect(humanizeToken("ai_chat")).toBe("AI Chat");
    expect(humanizeAccessMode("read_only")).toBe("Read only");
  });

  it("routes staff to inbox and honors explicit next", () => {
    expect(inboxHomeRoles.has("tenant_human_agent")).toBe(true);
    expect(defaultWorkspaceHome({ role: "tenant_human_agent" })).toBe("/workspace/inbox");
    expect(defaultWorkspaceHome({ role: "tenant_operator" })).toBe("/workspace/inbox");
    expect(defaultWorkspaceHome({ role: "tenant_billing_manager" })).toBe("/workspace/usage");
    expect(defaultWorkspaceHome({
      role: "tenant_master_admin",
      launchReady: false,
    })).toBe("/workspace");
    expect(defaultWorkspaceHome({
      role: "tenant_master_admin",
      launchReady: true,
    })).toBe("/workspace");
    expect(defaultWorkspaceHome({
      role: "tenant_human_agent",
      explicitNext: "/workspace/team",
    })).toBe("/workspace/team");
  });
});
