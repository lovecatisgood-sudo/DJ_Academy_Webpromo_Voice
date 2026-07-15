export type WorkspaceSummary = Readonly<{
  tenantId: string;
  slug: string;
  businessName: string;
  role: string;
}>;

export function WorkspaceSidebar({
  active,
  workspaces,
  selectedTenantId,
  onSelect,
  onLogout,
}: Readonly<{
  active: "overview" | "flowbot" | "ai_chat" | "inbox" | "contacts" | "leads" | "knowledge" | "data" | "team" | "usage" | "security";
  workspaces: readonly WorkspaceSummary[];
  selectedTenantId: string;
  onSelect: (tenantId: string) => void;
  onLogout: () => void;
}>) {
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
        <a className={active === "overview" ? "active" : ""} href="/workspace">Overview</a>
        <a className={active === "flowbot" ? "active" : ""} href="/workspace/flowbot">FlowBot</a>
        <a className={active === "ai_chat" ? "active" : ""} href="/workspace/ai-chat">AI Chat</a>
        <a className={active === "inbox" ? "active" : ""} href="/workspace/inbox">Inbox</a>
        <a className={active === "contacts" ? "active" : ""} href="/workspace/contacts">Contacts</a>
        <a className={active === "leads" ? "active" : ""} href="/workspace/leads">Leads</a>
        <a className={active === "knowledge" ? "active" : ""} href="/workspace/knowledge">Knowledge</a>
        <a className={active === "data" ? "active" : ""} href="/workspace/data">Data controls</a>
        <a className={active === "team" ? "active" : ""} href="/workspace/team">Team</a>
        <a className={active === "usage" ? "active" : ""} href="/workspace/usage">Usage</a>
        <a className={active === "security" ? "active" : ""} href="/workspace/security">Security</a>
      </nav>
      <button className="quiet-command" type="button" onClick={onLogout}>Sign out</button>
    </aside>
  );
}
