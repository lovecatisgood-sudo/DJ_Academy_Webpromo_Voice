import { logoutAction } from "./actions";
import { AdminNav } from "./AdminNav";
import { requireAdmin } from "@/lib/admin-auth";
import { getSql } from "@/lib/db";

type ShellCounts = {
  conversations: string;
  pending_leads: string;
  pending_appointments: string;
  agent_enabled: boolean;
  booking_enabled: boolean;
  voice_provider: string | null;
  model_id: string | null;
};

export async function AdminShell({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const sql = getSql();
  const [counts] = (await sql`
    select
      (
        select count(*)::text
        from conversations
        where deleted_at is null
          and started_at >= now() - interval '7 days'
          and (
            ${admin.role === "master_admin"}::boolean
            or assigned_admin_id = ${admin.id}
            or exists (
              select 1 from leads
              where leads.conversation_id = conversations.id
                and leads.assigned_admin_id = ${admin.id}
            )
          )
      ) as conversations,
      (
        select count(*)::text
        from leads
        where status = 'pending_follow_up'
          and (
            ${admin.role === "master_admin"}::boolean
            or assigned_admin_id = ${admin.id}
          )
      ) as pending_leads,
      (
        select count(*)::text
        from appointments
        where status = 'pending_confirmation'
          and deleted_at is null
          and (
            ${admin.role === "master_admin"}::boolean
            or assigned_admin_id = ${admin.id}
          )
      ) as pending_appointments,
      coalesce(settings.agent_enabled, false) as agent_enabled,
      coalesce(settings.booking_enabled, false) as booking_enabled,
      settings.voice_provider,
      settings.model_id
    from settings
    where settings.id = 1
    limit 1
  `) as ShellCounts[];
  const shellCounts = counts ?? {
    conversations: "0",
    pending_leads: "0",
    pending_appointments: "0",
    agent_enabled: false,
    booking_enabled: false,
    voice_provider: null,
    model_id: null,
  };

  return (
    <main className="min-h-screen bg-[#edf3f7] text-slate-950 lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="flex min-h-screen flex-col bg-[#071f26] px-3 py-4 text-slate-100">
        <div className="mb-6 flex items-center gap-3 px-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-cyan-400/20 text-sm font-black text-cyan-100">
            DJ
          </div>
          <div>
            <div className="text-base font-semibold text-white">DJAI</div>
            <div className="text-xs text-cyan-100/70">Sales Agent Admin</div>
          </div>
        </div>
        <AdminNav
          counts={{
            inbox: Number(shellCounts.conversations) || 0,
            leads: Number(shellCounts.pending_leads) || 0,
            appointments: Number(shellCounts.pending_appointments) || 0,
          }}
          isMasterAdmin={admin.role === "master_admin"}
        />
        <div className="mt-auto rounded-lg border border-white/10 bg-white/[0.06] p-3">
          <div className="text-sm font-semibold text-white">{admin.name}</div>
          <div className="mt-1 text-xs text-slate-300">
            {admin.role === "master_admin" ? "Master admin" : "Admin"}
          </div>
          <form action={logoutAction} className="mt-3">
            <button className="rounded-md border border-cyan-200/20 px-3 py-2 text-sm font-semibold text-cyan-100 hover:bg-white/10">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">DJAI Academy</div>
              <h1 className="mt-1 text-xl font-semibold text-slate-950">Voice Sales Agent</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className={`rounded-full px-3 py-1 text-xs font-semibold ${
                shellCounts.agent_enabled ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
              }`}>
                {shellCounts.agent_enabled ? "Voice agent live" : "Voice agent disabled"}
              </div>
              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {(shellCounts.voice_provider || "provider").toUpperCase()} · {shellCounts.model_id || "no model"}
              </div>
              <div className={`rounded-full px-3 py-1 text-xs font-semibold ${
                shellCounts.booking_enabled ? "bg-cyan-100 text-cyan-700" : "bg-slate-100 text-slate-600"
              }`}>
                {shellCounts.booking_enabled ? "Booking enabled" : "Booking disabled"}
              </div>
              <label className="relative hidden min-w-72 lg:block">
                <span className="sr-only">Global search</span>
                <input
                  className="w-full rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700 placeholder:text-slate-400"
                  placeholder="Search customers, leads, conversations..."
                />
              </label>
              <div className="grid h-9 w-9 place-items-center rounded-full bg-[#0e7c86] text-sm font-bold text-white">
                {admin.name.slice(0, 1).toUpperCase()}
              </div>
            </div>
          </div>
        </header>
        <div className="px-4 py-5 sm:px-6">{children}</div>
      </div>
    </main>
  );
}
