"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const baseNavItems = [
  { label: "Overview", href: "/admin", key: "overview" },
  { label: "Inbox", href: "/admin/inbox", key: "inbox" },
  { label: "Leads", href: "/admin/leads", key: "leads" },
  { label: "Appointments", href: "/admin/appointments", key: "appointments" },
  { label: "Customers", href: "/admin/customers", key: "customers" },
  { label: "Channels", href: "/admin/channels", key: "channels" },
  { label: "Settings", href: "/admin/settings", key: "settings" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  if (href === "/admin/inbox") return pathname.startsWith("/admin/inbox") || pathname.startsWith("/admin/conversations");
  return pathname === href || pathname.startsWith(`${href}/`);
}

function navMark(key: string) {
  const marks: Record<string, string> = {
    overview: "OV",
    inbox: "IN",
    leads: "LD",
    appointments: "AP",
    customers: "CU",
    channels: "CH",
    team: "TM",
    settings: "ST",
  };
  return marks[key] || "DJ";
}

export function AdminNav({
  counts,
  isMasterAdmin,
}: {
  counts: { inbox: number; leads: number; appointments: number };
  isMasterAdmin: boolean;
}) {
  const pathname = usePathname();
  const navItems = isMasterAdmin
    ? [
        ...baseNavItems.slice(0, 6),
        { label: "Team", href: "/admin/team", key: "team" },
        ...baseNavItems.slice(6),
      ]
    : baseNavItems;

  return (
    <nav className="flex flex-col gap-1">
      {navItems.map(({ label, href, key }) => {
        const count = key === "inbox" ? counts.inbox : key === "leads" ? counts.leads : key === "appointments" ? counts.appointments : 0;
        const active = isActive(pathname, href);
        return (
        <Link
          key={href}
          href={href}
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
            active
              ? "bg-[#0e7c86] text-white shadow-sm"
              : "text-slate-300 hover:bg-white/[0.07] hover:text-white"
          }`}
        >
          <span className={`grid h-7 w-7 place-items-center rounded-md text-[10px] ${
            active ? "bg-white/18 text-white" : "bg-white/[0.08] text-cyan-100"
          }`}>
            {navMark(key)}
          </span>
          <span className="min-w-0 flex-1">{label}</span>
          {count > 0 ? (
            <span className={`rounded-full px-2 py-0.5 text-xs ${
              active ? "bg-white/20 text-white" : "bg-red-400 text-white"
            }`}>
              {count > 99 ? "99+" : count}
            </span>
          ) : null}
        </Link>
      )})}
    </nav>
  );
}
