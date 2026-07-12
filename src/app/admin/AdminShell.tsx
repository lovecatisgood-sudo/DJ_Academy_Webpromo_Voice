import Link from "next/link";
import { logoutAction } from "./actions";

const navItems = [
  ["Overview", "/admin"],
  ["Conversations", "/admin/conversations"],
  ["Leads", "/admin/leads"],
  ["Settings", "/admin/settings"],
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#050b1d] px-4 py-5 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-cyan-200">DJAI Academy</div>
            <h1 className="mt-1 text-2xl font-semibold text-white">Voice Sales Agent</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {navItems.map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-200 hover:border-cyan-300/50"
              >
                {label}
              </Link>
            ))}
            <form action={logoutAction}>
              <button className="rounded-md border border-red-300/20 bg-red-400/10 px-3 py-2 text-sm text-red-100">
                Logout
              </button>
            </form>
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}
