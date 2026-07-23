"use client";

import { useEffect, useId, useState } from "react";
import {
  tenantRoleAllows, tenantRoles, type TenantPermission, type TenantRole,
} from "@djay/authorization";
import {
  humanizeTenantRole,
  studioHiddenRoles,
} from "../../lib/workspace-labels";

export type WorkspaceSummary = Readonly<{
  tenantId: string;
  slug: string;
  businessName: string;
  role: string;
}>;

export type WorkspaceArea =
  | "overview" | "setup" | "settings" | "flowbot" | "ai_chat" | "voice"
  | "inbox" | "contacts" | "leads" | "knowledge" | "operations"
  | "data" | "team" | "usage" | "security";

type NavItem = Readonly<{
  area: WorkspaceArea;
  href: string;
  label: string;
  permission: TenantPermission;
  group: "get_live" | "customers" | "products" | "workspace";
}>;

const workspaceNavigation: readonly NavItem[] = [
  { area: "overview", href: "/workspace", label: "Overview", permission: "tenant.read", group: "get_live" },
  { area: "setup", href: "/workspace/setup", label: "Setup", permission: "tenant.read", group: "get_live" },
  { area: "inbox", href: "/workspace/inbox", label: "Inbox", permission: "conversations.read", group: "customers" },
  { area: "contacts", href: "/workspace/contacts", label: "Contacts", permission: "contacts.read", group: "customers" },
  { area: "leads", href: "/workspace/leads", label: "Leads", permission: "leads.read", group: "customers" },
  { area: "flowbot", href: "/workspace/flowbot", label: "FlowBot", permission: "flowbot.read", group: "products" },
  { area: "ai_chat", href: "/workspace/ai-chat", label: "AI Chat", permission: "ai_chat.read", group: "products" },
  { area: "voice", href: "/workspace/voice", label: "Voice", permission: "voice.read", group: "products" },
  { area: "knowledge", href: "/workspace/knowledge", label: "Knowledge", permission: "knowledge.read", group: "products" },
  { area: "operations", href: "/workspace/operations", label: "Services & add-ons", permission: "tenant.read", group: "products" },
  { area: "settings", href: "/workspace/settings", label: "Business profile", permission: "tenant.read", group: "workspace" },
  { area: "team", href: "/workspace/team", label: "Team", permission: "team.read", group: "workspace" },
  { area: "usage", href: "/workspace/usage", label: "Usage", permission: "usage.read", group: "workspace" },
  { area: "data", href: "/workspace/data", label: "Data controls", permission: "privacy.manage", group: "workspace" },
  { area: "security", href: "/workspace/security", label: "Security", permission: "security.sessions.read", group: "workspace" },
];

const groupLabels = {
  get_live: { en: "Get live", th: "เริ่มใช้งาน" },
  customers: { en: "Customers", th: "ลูกค้า" },
  products: { en: "Products", th: "สินค้า" },
  workspace: { en: "Workspace", th: "เวิร์กสเปซ" },
} as const;

const studioAreas = new Set<WorkspaceArea>(["flowbot", "ai_chat", "voice"]);

export function workspaceNavigationForRole(role: string) {
  if (!tenantRoles.includes(role as TenantRole)) return [];
  const hideStudios = studioHiddenRoles.has(role as TenantRole);
  return workspaceNavigation.filter((item) => {
    if (!tenantRoleAllows(role as TenantRole, item.permission)) return false;
    if (hideStudios && studioAreas.has(item.area)) return false;
    if (hideStudios && (item.area === "setup" || item.area === "operations")) return false;
    return true;
  });
}

export function WorkspaceSidebar({
  active,
  workspaces,
  selectedTenantId,
  onSelect,
  onLogout,
  chromeLocale = "en",
}: Readonly<{
  active: WorkspaceArea;
  workspaces: readonly WorkspaceSummary[];
  selectedTenantId: string;
  onSelect: (tenantId: string) => void;
  onLogout: () => void;
  chromeLocale?: "en" | "th";
}>) {
  const activeWorkspace = workspaces.find((workspace) => workspace.tenantId === selectedTenantId);
  const role = activeWorkspace?.role || "";
  const navigation = workspaceNavigationForRole(role);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerId = useId();
  const locale = chromeLocale === "th" ? "th" : "en";
  const labels = locale === "th"
    ? { overview: "ภาพรวม", setup: "เริ่มใช้งาน", menu: "เมนู", close: "ปิด" }
    : { overview: "Overview", setup: "Setup", menu: "Menu", close: "Close" };

  useEffect(() => {
    setDrawerOpen(false);
  }, [active, selectedTenantId]);

  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setDrawerOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const groups = (["get_live", "customers", "products", "workspace"] as const)
    .map((group) => ({
      id: group,
      label: groupLabels[group][locale],
      items: navigation.filter((item) => item.group === group),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="workspace-chrome">
      <a className="skip-link" href="#workspace-main">Skip to main content</a>
      <div className="workspace-mobile-bar">
        <button
          type="button"
          className="workspace-nav-toggle"
          aria-expanded={drawerOpen}
          aria-controls={drawerId}
          onClick={() => setDrawerOpen((open) => !open)}
        >
          {drawerOpen ? labels.close : labels.menu}
        </button>
        <strong className="workspace-mobile-title">{activeWorkspace?.businessName || "DJAY BOT"}</strong>
      </div>
      {drawerOpen ? (
        <button
          type="button"
          className="workspace-nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setDrawerOpen(false)}
        />
      ) : null}
      <aside id={drawerId} className={drawerOpen ? "workspace-drawer open" : "workspace-drawer"}>
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
          {groups.map((group) => (
            <div className="workspace-nav-group" key={group.id}>
              <p className="workspace-nav-group-label">{group.label}</p>
              {group.items.map((item) => {
                const label = item.area === "overview" ? labels.overview
                  : item.area === "setup" ? labels.setup
                    : item.label;
                return (
                  <a
                    aria-current={active === item.area ? "page" : undefined}
                    className={active === item.area ? "active" : ""}
                    href={item.href}
                    key={item.area}
                  >
                    {label}
                  </a>
                );
              })}
            </div>
          ))}
        </nav>
        {tenantRoles.includes(role as TenantRole) ? (
          <p className="workspace-role">{humanizeTenantRole(role)} access</p>
        ) : null}
        <button className="quiet-command" type="button" onClick={onLogout}>Sign out</button>
      </aside>
    </div>
  );
}
