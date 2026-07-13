import Link from "next/link";
import { AdminShell } from "../AdminShell";
import {
  createAdminUserAction,
  deactivateAdminUserAction,
  deleteAdminUserAction,
  resetAdminPasswordAction,
  setActiveBookingAdminAction,
  updateAdminUserAction,
} from "../actions";
import { ConfirmSubmitButton } from "../ConfirmSubmitButton";
import { requireMasterAdmin } from "@/lib/admin-auth";
import { getSql } from "@/lib/db";
import type { AdminRole } from "@/lib/types";

export const dynamic = "force-dynamic";

const inputClass = "mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm";
const smallInputClass = "rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm";
const sectionClass = "rounded-xl border border-slate-200 bg-white p-5 shadow-sm";

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string; error?: string; created?: string; updated?: string; deleted?: string; active?: string; password?: string; deactivated?: string }>;
}) {
  const currentAdmin = await requireMasterAdmin();
  const params = await searchParams;
  const showDeleted = params.show === "deleted";
  const sql = getSql();
  const [settings] = (await sql`
    select active_booking_admin_id, booking_enabled
    from settings
    where id = 1
    limit 1
  `) as { active_booking_admin_id: string | null; booking_enabled: boolean }[];
  const admins = (await sql`
    select
      au.id,
      au.name,
      au.username,
      au.email,
      au.role,
      au.is_active,
      au.last_login_at,
      au.created_at,
      au.deleted_at,
      acp.booking_slug,
      acp.is_active as calendar_active,
      count(a.id) filter (
        where a.start_at >= now()
          and a.status in ('pending_confirmation', 'confirmed')
          and a.deleted_at is null
      )::int as upcoming_appointments,
      count(a.id) filter (
        where a.start_at >= now()
          and a.status = 'pending_confirmation'
          and a.deleted_at is null
      )::int as pending_confirmations
    from admin_users au
    left join admin_calendar_profiles acp on acp.admin_user_id = au.id
    left join appointments a on a.assigned_admin_id = au.id
    where (${showDeleted}::boolean or au.deleted_at is null)
    group by au.id, acp.booking_slug, acp.is_active
    order by au.deleted_at nulls first, au.role desc, au.created_at asc
  `) as {
    id: string;
    name: string;
    username: string;
    email: string | null;
    role: AdminRole;
    is_active: boolean;
    last_login_at: string | null;
    created_at: string;
    deleted_at: string | null;
    booking_slug: string | null;
    calendar_active: boolean | null;
    upcoming_appointments: number;
    pending_confirmations: number;
  }[];
  const activeAdmins = admins.filter((admin) => admin.is_active && !admin.deleted_at);

  return (
    <AdminShell>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">Team</h2>
          <p className="mt-1 text-sm text-slate-600">Create admins, manage roles, and control which calendar the AI booking flow uses.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={showDeleted ? "/admin/team" : "/admin/team?show=deleted"}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm"
          >
            {showDeleted ? "Hide deleted" : "View deleted"}
          </Link>
        </div>
      </div>

      {params.error ? (
        <div className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Team action failed: {params.error.replaceAll("_", " ")}.
        </div>
      ) : null}
      {params.created || params.updated || params.deleted || params.active || params.password || params.deactivated ? (
        <div className="mb-5 rounded-md border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-800">
          Team settings updated.
        </div>
      ) : null}

      <section className={`mb-5 ${sectionClass}`}>
        <h3 className="text-lg font-semibold text-slate-950">Active AI booking admin</h3>
        <p className="mt-1 text-sm text-slate-600">Only one admin calendar is used by the voice-agent booking CTA at a time.</p>
        <form action={setActiveBookingAdminAction} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block flex-1 text-sm font-medium text-slate-700">
            Booking calendar
            <select name="admin_user_id" defaultValue={settings?.active_booking_admin_id || ""} className={inputClass}>
              <option value="">Disable booking</option>
              {activeAdmins.map((admin) => (
                <option key={admin.id} value={admin.id}>
                  {admin.name} ({admin.username})
                </option>
              ))}
            </select>
          </label>
          <button className="rounded-md bg-gradient-to-r from-cyan-400 to-blue-600 px-4 py-2 font-semibold text-white">
            Save active calendar
          </button>
        </form>
        <div className="mt-3 text-sm text-slate-500">
          Booking is currently {settings?.booking_enabled && settings.active_booking_admin_id ? "enabled" : "disabled"}.
        </div>
      </section>

      <section className={`mb-5 ${sectionClass}`}>
        <h3 className="text-lg font-semibold text-slate-950">Create admin</h3>
        <form action={createAdminUserAction} className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr_1fr_160px_120px_auto] lg:items-end">
          <label className="block text-sm font-medium text-slate-700">
            Name
            <input name="name" className={inputClass} required />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Username
            <input name="username" className={inputClass} autoComplete="username" required />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Email
            <input name="email" type="email" className={inputClass} />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Role
            <select name="role" className={inputClass} defaultValue="admin">
              <option value="admin">Admin</option>
              <option value="master_admin">Master admin</option>
            </select>
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm font-medium text-slate-700">
            <input name="is_active" type="checkbox" defaultChecked />
            Active
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Temp password
            <input name="password" type="password" minLength={10} className={inputClass} autoComplete="new-password" required />
          </label>
          <button className="rounded-md bg-gradient-to-r from-cyan-400 to-blue-600 px-4 py-2 font-semibold text-white lg:col-start-6">
            Create
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4 text-sm font-semibold text-slate-700">Admins</div>
        <div className="divide-y divide-slate-100">
          {admins.map((admin) => {
            const isActiveBookingAdmin = settings?.active_booking_admin_id === admin.id;
            const canDelete = currentAdmin.id !== admin.id && !admin.deleted_at;

            return (
              <div key={admin.id} className="grid gap-5 px-5 py-5 text-sm xl:grid-cols-[1fr_360px]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-semibold text-slate-950">{admin.name}</div>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
                      {admin.role === "master_admin" ? "Master admin" : "Admin"}
                    </span>
                    {isActiveBookingAdmin ? (
                      <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-800">
                        Active AI booking
                      </span>
                    ) : null}
                    {admin.deleted_at ? (
                      <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">Deleted</span>
                    ) : admin.is_active ? (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">Active</span>
                    ) : (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">Inactive</span>
                    )}
                  </div>
                  <div className="mt-2 text-slate-600">{admin.username}{admin.email ? ` · ${admin.email}` : ""}</div>
                  <div className="mt-2 grid gap-2 text-xs text-slate-500 sm:grid-cols-2 lg:grid-cols-4">
                    <div>Booking slug: {admin.booking_slug || "missing"}</div>
                    <div>Calendar: {admin.calendar_active ? "active" : "inactive"}</div>
                    <div>Upcoming: {admin.upcoming_appointments}</div>
                    <div>Pending: {admin.pending_confirmations}</div>
                    <div>Last login: {admin.last_login_at ? new Date(admin.last_login_at).toLocaleString() : "Never"}</div>
                    <div>Created: {new Date(admin.created_at).toLocaleDateString()}</div>
                  </div>
                </div>

                {!admin.deleted_at ? (
                  <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <form action={updateAdminUserAction} className="grid gap-3">
                      <input type="hidden" name="id" value={admin.id} />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <input name="name" defaultValue={admin.name} className={smallInputClass} aria-label="Name" />
                        <input name="username" defaultValue={admin.username} className={smallInputClass} aria-label="Username" />
                        <input name="email" defaultValue={admin.email || ""} className={smallInputClass} aria-label="Email" />
                        <select name="role" defaultValue={admin.role} className={smallInputClass} aria-label="Role">
                          <option value="admin">Admin</option>
                          <option value="master_admin">Master admin</option>
                        </select>
                      </div>
                      <label className="flex items-center gap-2 text-slate-700">
                        <input name="is_active" type="checkbox" defaultChecked={admin.is_active} disabled={currentAdmin.id === admin.id} />
                        Active account
                      </label>
                      <button className="rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800">
                        Save admin
                      </button>
                    </form>

                    <form action={resetAdminPasswordAction} className="flex gap-2">
                      <input type="hidden" name="id" value={admin.id} />
                      <input name="password" type="password" minLength={10} placeholder="New password" className={smallInputClass} required />
                      <button className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                        Reset
                      </button>
                    </form>

                    <div className="flex flex-wrap gap-2">
                      {currentAdmin.id !== admin.id && admin.is_active ? (
                        <form action={deactivateAdminUserAction}>
                          <input type="hidden" name="id" value={admin.id} />
                          <ConfirmSubmitButton
                            message="Deactivate this admin? They will no longer be able to log in."
                            className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800"
                          >
                            Deactivate
                          </ConfirmSubmitButton>
                        </form>
                      ) : null}

                      {canDelete ? (
                        <form action={deleteAdminUserAction} className="grid gap-2">
                          <input type="hidden" name="id" value={admin.id} />
                          <div className="grid gap-2 sm:grid-cols-3">
                            <select name="future_action" className={smallInputClass} defaultValue="unassign">
                              <option value="unassign">Unassign future</option>
                              <option value="reassign">Reassign future</option>
                              <option value="cancel">Cancel future</option>
                            </select>
                            <select name="reassignment_admin_id" className={smallInputClass} defaultValue="">
                              <option value="">Reassign to...</option>
                              {activeAdmins.filter((item) => item.id !== admin.id).map((item) => (
                                <option key={item.id} value={item.id}>{item.name}</option>
                              ))}
                            </select>
                            <select name="active_booking_replacement_id" className={smallInputClass} defaultValue="">
                              <option value="">Booking replacement...</option>
                              {activeAdmins.filter((item) => item.id !== admin.id).map((item) => (
                                <option key={item.id} value={item.id}>{item.name}</option>
                              ))}
                            </select>
                          </div>
                          <label className="flex items-center gap-2 text-xs text-slate-500">
                            <input name="disable_booking" type="checkbox" defaultChecked={!isActiveBookingAdmin} />
                            Disable booking if this admin is active booking admin
                          </label>
                          <ConfirmSubmitButton
                            message="Delete this admin? Historical records remain, but login will be revoked."
                            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"
                          >
                            Delete admin
                          </ConfirmSubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                    Deleted {new Date(admin.deleted_at).toLocaleString()}. Historical records remain linked by snapshot or ID.
                  </div>
                )}
              </div>
            );
          })}
          {admins.length === 0 ? <div className="px-5 py-6 text-sm text-slate-500">No admin accounts found.</div> : null}
        </div>
      </section>
    </AdminShell>
  );
}
