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
  | "inbox" | "contacts" | "leads" | "appointments" | "knowledge" | "operations"
  | "data" | "team" | "usage" | "security" | "support" | "test_center" | "notifications" | "reports";

type NavItem = Readonly<{
  area: WorkspaceArea;
  href: string;
  label: Readonly<{ en: string; th: string }>;
  permission: TenantPermission;
  group: "get_live" | "customers" | "products" | "workspace";
}>;

const workspaceNavigation: readonly NavItem[] = [
  { area: "overview", href: "/workspace", label: { en: "Overview", th: "ภาพรวม" }, permission: "tenant.read", group: "get_live" },
  { area: "setup", href: "/workspace/setup", label: { en: "Setup", th: "เริ่มใช้งาน" }, permission: "tenant.read", group: "get_live" },
  { area: "test_center", href: "/workspace/test-center", label: { en: "Test center", th: "ศูนย์ทดสอบ" }, permission: "flowbot.read", group: "get_live" },
  { area: "inbox", href: "/workspace/inbox", label: { en: "Inbox", th: "กล่องข้อความ" }, permission: "conversations.read", group: "customers" },
  { area: "contacts", href: "/workspace/contacts", label: { en: "Contacts", th: "ข้อมูลติดต่อ" }, permission: "contacts.read", group: "customers" },
  { area: "leads", href: "/workspace/leads", label: { en: "Leads", th: "ผู้สนใจ" }, permission: "leads.read", group: "customers" },
  { area: "appointments", href: "/workspace/appointments", label: { en: "Appointments", th: "นัดหมาย" }, permission: "leads.read", group: "customers" },
  { area: "notifications", href: "/workspace/notifications", label: { en: "Notifications", th: "การแจ้งเตือน" }, permission: "contacts.read", group: "customers" },
  { area: "reports", href: "/workspace/reports", label: { en: "Reports", th: "รายงาน" }, permission: "leads.read", group: "customers" },
  { area: "flowbot", href: "/workspace/flowbot", label: { en: "FlowBot", th: "FlowBot" }, permission: "flowbot.read", group: "products" },
  { area: "ai_chat", href: "/workspace/ai-chat", label: { en: "AI Chat", th: "แชต AI" }, permission: "ai_chat.read", group: "products" },
  { area: "voice", href: "/workspace/voice", label: { en: "Voice", th: "ระบบเสียง" }, permission: "voice.read", group: "products" },
  { area: "knowledge", href: "/workspace/knowledge", label: { en: "Knowledge", th: "คลังความรู้" }, permission: "knowledge.read", group: "products" },
  { area: "operations", href: "/workspace/operations", label: { en: "Services & add-ons", th: "บริการและส่วนเสริม" }, permission: "tenant.read", group: "products" },
  { area: "settings", href: "/workspace/settings", label: { en: "Business profile", th: "โปรไฟล์ธุรกิจ" }, permission: "tenant.read", group: "workspace" },
  { area: "team", href: "/workspace/team", label: { en: "Team", th: "ทีมงาน" }, permission: "team.read", group: "workspace" },
  { area: "usage", href: "/workspace/usage", label: { en: "Usage", th: "การใช้งานและแผน" }, permission: "usage.read", group: "workspace" },
  { area: "data", href: "/workspace/data", label: { en: "Data controls", th: "การจัดการข้อมูล" }, permission: "privacy.manage", group: "workspace" },
  { area: "security", href: "/workspace/security", label: { en: "Security", th: "ความปลอดภัย" }, permission: "security.sessions.read", group: "workspace" },
  { area: "support", href: "/workspace/support", label: { en: "Help & support", th: "ช่วยเหลือและสนับสนุน" }, permission: "support.read", group: "workspace" },
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
  chromeLocale = "th",
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
  const locale = chromeLocale === "en" ? "en" : "th";
  const labels = locale === "th"
    ? { menu: "เมนู", close: "ปิด", skip: "ข้ามไปยังเนื้อหาหลัก", workspace: "เวิร์กสเปซ", navigation: "เมนูเวิร์กสเปซ", access: "สิทธิ์", signOut: "ออกจากระบบ" }
    : { menu: "Menu", close: "Close", skip: "Skip to main content", workspace: "Workspace", navigation: "Workspace navigation", access: "access", signOut: "Sign out" };

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
      <a className="skip-link" href="#workspace-main">{labels.skip}</a>
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
          aria-label={labels.close}
          onClick={() => setDrawerOpen(false)}
        />
      ) : null}
      <aside id={drawerId} className={drawerOpen ? "workspace-drawer open" : "workspace-drawer"}>
        <div className="workspace-brand"><span className="mark">D</span><strong>DJAY BOT</strong></div>
        <label className="workspace-select-label">
          {labels.workspace}
          <select value={selectedTenantId} onChange={(event) => onSelect(event.target.value)}>
            {workspaces.map((workspace) => (
              <option key={workspace.tenantId} value={workspace.tenantId}>{workspace.businessName}</option>
            ))}
          </select>
        </label>
        <nav className="workspace-nav" aria-label={labels.navigation}>
          {groups.map((group) => (
            <div className="workspace-nav-group" key={group.id}>
              <p className="workspace-nav-group-label">{group.label}</p>
              {group.items.map((item) => {
                const label = item.label[locale];
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
          <p className="workspace-role">{humanizeTenantRole(role)} {labels.access}</p>
        ) : null}
        <button className="quiet-command" type="button" onClick={onLogout}>{labels.signOut}</button>
      </aside>
      <a className="workspace-help-launcher" href="/workspace/support" aria-label={locale === "th" ? "เปิดศูนย์ช่วยเหลือและติดต่อทีมสนับสนุน" : "Open help and contact support"}>
        <span className="workspace-help-icon" aria-hidden="true">?</span><span className="workspace-help-label">{locale === "th" ? "ขอความช่วยเหลือ" : "Get help"}</span>
      </a>
    </div>
  );
}
