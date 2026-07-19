import {
  tenantRoleAllows, tenantRoles, type TenantPermission, type TenantRole,
} from "@djay/authorization";

export type WorkspaceSummary = Readonly<{
  tenantId: string;
  slug: string;
  businessName: string;
  role: string;
}>;

export type WorkspaceArea = "overview" | "flowbot" | "ai_chat" | "voice" | "inbox" | "contacts" | "leads" | "knowledge" | "operations" | "data" | "team" | "usage" | "security";

const workspaceNavigation: ReadonlyArray<Readonly<{
  area: WorkspaceArea; href: string; label: string; permission: TenantPermission;
}>> = [
  { area: "overview", href: "/workspace", label: "Overview", permission: "tenant.read" },
  { area: "flowbot", href: "/workspace/flowbot", label: "FlowBot", permission: "flowbot.read" },
  { area: "ai_chat", href: "/workspace/ai-chat", label: "AI Chat", permission: "ai_chat.read" },
  { area: "voice", href: "/workspace/voice", label: "Voice", permission: "voice.read" },
  { area: "inbox", href: "/workspace/inbox", label: "Inbox", permission: "conversations.read" },
  { area: "contacts", href: "/workspace/contacts", label: "Contacts", permission: "contacts.read" },
  { area: "leads", href: "/workspace/leads", label: "Leads", permission: "leads.read" },
  { area: "knowledge", href: "/workspace/knowledge", label: "Knowledge", permission: "knowledge.read" },
  { area: "operations", href: "/workspace/operations", label: "Services & add-ons", permission: "tenant.read" },
  { area: "data", href: "/workspace/data", label: "Data controls", permission: "privacy.manage" },
  { area: "team", href: "/workspace/team", label: "Team", permission: "team.read" },
  { area: "usage", href: "/workspace/usage", label: "Usage", permission: "usage.read" },
  { area: "security", href: "/workspace/security", label: "Security", permission: "security.sessions.read" },
];

export function workspaceNavigationForRole(role: string) {
  if (!tenantRoles.includes(role as TenantRole)) return [];
  return workspaceNavigation.filter((item) => tenantRoleAllows(role as TenantRole, item.permission));
}

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

export function WorkspaceSidebar({
  active,
  workspaces,
  selectedTenantId,
  onSelect,
  onLogout,
}: Readonly<{
  active: WorkspaceArea;
  workspaces: readonly WorkspaceSummary[];
  selectedTenantId: string;
  onSelect: (tenantId: string) => void;
  onLogout: () => void;
}>) {
  const activeWorkspace = workspaces.find((workspace) => workspace.tenantId === selectedTenantId);
  const role = activeWorkspace?.role || "";
  const navigation = workspaceNavigationForRole(role);
  return (
    <aside>
      <div className="workspace-brand"><span className="mark">D</span><strong>DJAY BOT</strong></div>
      <label className="workspace-select-label">
        Workspace
        <select value={selectedTenantId} onChange={(event) => onSelect(event.target.value)}>
          {workspaces.map((workspace) => (
            <option key={workspace.tenantId} value={workspace.tenantId}>{workspace.businessName}</option>
          ))}
        </select>
      </label>
      <nav className="workspace-nav" aria-label="Workspace navigation">
        {navigation.map((item) => (
          <a aria-current={active === item.area ? "page" : undefined} className={active === item.area ? "active" : ""} href={item.href} key={item.area}>{item.label}</a>
        ))}
      </nav>
      {tenantRoles.includes(role as TenantRole) ? <p className="workspace-role">{roleLabels[role as TenantRole]} access</p> : null}
      <button className="quiet-command" type="button" onClick={onLogout}>Sign out</button>
    </aside>
  );
}
