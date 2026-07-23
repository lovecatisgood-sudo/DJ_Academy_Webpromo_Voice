import { describe, expect, it } from "vitest";
import { workspaceNavigationForRole } from "./WorkspaceSidebar";

const paths = (role: string) => workspaceNavigationForRole(role).map((item) => item.href);
const areas = (role: string) => workspaceNavigationForRole(role).map((item) => item.area);

describe("role-aware workspace navigation", () => {
  it("shows every governed workspace area to the owner", () => {
    expect(paths("tenant_master_admin")).toHaveLength(15);
    expect(paths("tenant_master_admin")).toContain("/workspace/setup");
  });

  it("hides product studios from human agents", () => {
    expect(areas("tenant_human_agent")).not.toContain("flowbot");
    expect(areas("tenant_human_agent")).not.toContain("ai_chat");
    expect(areas("tenant_human_agent")).not.toContain("voice");
    expect(areas("tenant_human_agent")).not.toContain("setup");
    expect(paths("tenant_human_agent")).toContain("/workspace/inbox");
  });

  it("keeps admin, operator, and analyst navigation inside their permissions", () => {
    expect(paths("tenant_admin")).not.toContain("/workspace/data");
    expect(paths("tenant_operator")).toContain("/workspace/team");
    expect(paths("tenant_operator")).not.toContain("/workspace/security");
    expect(paths("tenant_analyst")).not.toContain("/workspace/team");
    expect(paths("tenant_analyst")).not.toContain("/workspace/security");
    expect(paths("tenant_analyst")).not.toContain("/workspace/data");
    expect(paths("tenant_analyst")).toContain("/workspace/usage");
  });

  it("fails closed for an unknown role", () => {
    expect(paths("tenant_unknown")).toEqual([]);
  });
});
