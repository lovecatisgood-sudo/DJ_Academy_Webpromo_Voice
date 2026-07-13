"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  ["Overview", "/admin"],
  ["Conversations", "/admin/conversations"],
  ["Leads", "/admin/leads"],
  ["Settings", "/admin/settings"],
];

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav() {
  const pathname = usePathname();

  return (
    <>
      {navItems.map(([label, href]) => (
        <Link
          key={href}
          href={href}
          className={`rounded-md border px-3 py-2 text-sm hover:border-cyan-300/50 ${
            isActive(pathname, href)
              ? "border-cyan-300/60 bg-cyan-300/15 text-cyan-100"
              : "border-white/10 bg-white/[0.04] text-slate-200"
          }`}
        >
          {label}
        </Link>
      ))}
    </>
  );
}
