"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { emailFieldConstraints, safeMutationFetch, uiCopy } from "@djay/shared";
import { WorkspaceSidebar } from "../WorkspaceSidebar";
import { WorkspaceAccessDenied, WorkspacePageLoadError, WorkspaceSessionLoadError } from "../WorkspaceAccess";
import { useWorkspaceSession } from "../useWorkspaceSession";
import { humanizeTenantRole, humanizeToken } from "../../../lib/workspace-labels";

type Member = {
  membership_id: string;
  display_name: string;
  email_normalized: string;
  membership_role: string;
  membership_status: string;
};

type Invitation = { id: string; email_normalized: string; role: string; expires_at: string };
type TeamOverview = { members: Member[]; invitations: Invitation[]; transfers: { id: string }[]; capacity: { allowed: boolean; seatLimit: number; occupied: number } };

const manageableRoles = [
  ["tenant_admin", "Tenant admin"],
  ["tenant_conversation_manager", "Conversation manager"],
  ["tenant_human_agent", "Human agent"],
  ["tenant_billing_manager", "Billing manager"],
  ["tenant_analyst", "Analyst / viewer"],
] as const;

export default function TeamPage() {
  const session = useWorkspaceSession();
  const [team, setTeam] = useState<TeamOverview | null>(null);
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const activeWorkspace = useMemo(
    () => session.workspaces.find((workspace) => workspace.tenantId === session.selectedTenantId),
    [session.workspaces, session.selectedTenantId],
  );

  async function loadTeam() {
    try {
      const response = await fetch("/tenant/team", { cache: "no-store" });
      if (!response.ok) throw new Error("team_unavailable"); setTeam((await response.json()).team); setLoadError(false);
    } catch { setLoadError(true); }
  }

  useEffect(() => {
    if (session.selectedTenantId && session.allows("team.read")) void loadTeam();
  }, [session.selectedTenantId, activeWorkspace?.role]);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setMessage("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const response = await safeMutationFetch("/tenant/team/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: data.get("email"), role: data.get("role") }),
    });
    setWorking(false);
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setMessage(result.status === "seat_limit_reached"
        ? "This workspace has reached its administrator seat allowance."
        : "The invitation could not be created.");
      return;
    }
    form.reset();
    setMessage("Invitation queued for delivery.");
    await loadTeam();
  }

  async function transferOwnership(targetMembershipId: string) {
    if (!window.confirm(uiCopy("ส่งคำขอโอนความเป็นเจ้าของให้สมาชิกคนนี้หรือไม่?", "Send an ownership transfer request to this member?"))) return;
    setWorking(true);
    const response = await safeMutationFetch("/tenant/ownership-transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetMembershipId }),
    });
    const result = await response.json().catch(() => ({}));
    setWorking(false);
    setMessage(response.ok ? "Ownership transfer sent." : result.status === "reauthentication_required"
      ? "Sign in again before transferring ownership."
      : "The ownership transfer could not be created.");
    await loadTeam();
  }

  async function changeRole(membershipId: string, role: string) {
    setWorking(true);
    setMessage("");
    const response = await safeMutationFetch(`/tenant/team/${membershipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const result = await response.json().catch(() => ({}));
    setWorking(false);
    setMessage(response.ok ? "Member role updated." : result.status === "reauthentication_required"
      ? "Sign in again and complete MFA before changing access."
      : result.status === "owner_protected"
        ? "The workspace owner role cannot be changed here."
        : "The member role could not be updated.");
    await loadTeam();
  }

  async function removeMember(membershipId: string, displayName: string) {
    if (!window.confirm(uiCopy(`ลบสิทธิ์เข้าถึงพื้นที่ทำงานของ ${displayName} หรือไม่?`, `Remove ${displayName}'s workspace access?`))) return;
    setWorking(true);
    setMessage("");
    const response = await safeMutationFetch(`/tenant/team/${membershipId}`, { method: "DELETE" });
    const result = await response.json().catch(() => ({}));
    setWorking(false);
    setMessage(response.ok ? "Member access removed." : result.status === "reauthentication_required"
      ? "Sign in again and complete MFA before removing access."
      : result.status === "owner_protected"
        ? "Transfer ownership before removing the workspace owner."
        : "The member could not be removed.");
    await loadTeam();
  }

  if (session.error) return <WorkspaceSessionLoadError onRetry={() => window.location.reload()} />;
  if (session.loading || !session.selectedTenantId) return <main className="workspace-loading">กำลังโหลดทีมงาน...</main>;
  if (!session.allows("team.read")) return <WorkspaceAccessDenied active="team" title="ทีมงาน" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(tenantId) => void session.selectWorkspace(tenantId)} onLogout={() => void session.logout()} />;
  if (loadError) return <WorkspacePageLoadError active="team" title="ทีมงาน" resource="workspace members" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(tenantId) => void session.selectWorkspace(tenantId)} onLogout={() => void session.logout()} onRetry={() => void loadTeam()} />;
  const isOwner = activeWorkspace?.role === "tenant_master_admin";
  const canInvite = session.allows("team.invite");

  return (
    <main className="workspace-shell">
      <WorkspaceSidebar
        active="team"
        workspaces={session.workspaces}
        selectedTenantId={session.selectedTenantId}
        onSelect={(tenantId) => void session.selectWorkspace(tenantId)}
        onLogout={() => void session.logout()}
      />
      <section id="workspace-main" className="workspace-main" tabIndex={-1}>
        <header className="workspace-header"><div><p>เวิร์กสเปซ</p><h1>ทีมงาน</h1></div><span className="role-label">{activeWorkspace?.businessName}</span></header>
        {canInvite ? (
          <section className="tool-band">
            <div className="band-heading"><div><p>สิทธิ์ใช้งาน</p><h2>เชิญสมาชิกทีม</h2></div><span>{team ? `${team.capacity.occupied} / ${team.capacity.seatLimit} seats` : "Loading"}</span></div>
            <form className="inline-form" onSubmit={invite}>
              <label>อีเมล<input name="email" type="email" autoComplete="email" {...emailFieldConstraints} required /></label>
              <label>บทบาท<select name="role" defaultValue="tenant_human_agent">
                {manageableRoles.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select></label>
              <button type="submit" disabled={working}>ส่งคำเชิญ</button>
            </form>
            {message ? <p className="inline-message" role="status">{message}</p> : null}
            {team && !team.capacity.allowed ? <p className="field-help">จำนวนผู้ใช้เต็มตามแผนแล้ว <a href="/workspace/operations">ขอผู้ดูแลเพิ่มเติม</a> ก่อนเชิญสมาชิกเพิ่ม</p> : null}
          </section>
        ) : null}
        <section className="tool-band">
          <div className="band-heading"><div><p>สมาชิก</p><h2>ทีมที่ใช้งานอยู่</h2></div><span>{team?.members.length || 0}</span></div>
          <div className="data-table" role="table" aria-label="สมาชิกเวิร์กสเปซ">
            {team?.members.map((member) => (
              <div className="data-row" role="row" key={member.membership_id}>
                <div><strong data-no-localize>{member.display_name}</strong><span data-no-localize>{member.email_normalized}</span></div>
                <span className="role-label">{humanizeTenantRole(member.membership_role)} · {humanizeToken(member.membership_status)}</span>
                {isOwner && member.membership_role !== "tenant_master_admin" ? (
                  <div className="member-actions">
                    <label className="visually-hidden" htmlFor={`role-${member.membership_id}`}>บทบาทของ <span data-no-localize>{member.display_name}</span></label>
                    <select id={`role-${member.membership_id}`} aria-label={`บทบาทของ ${member.display_name}`} value={member.membership_role} disabled={working} onChange={(event) => void changeRole(member.membership_id, event.target.value)}>
                      {manageableRoles.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                    </select>
                    <button className="secondary-command" type="button" disabled={working || Boolean(team.transfers.length)} onClick={() => void transferOwnership(member.membership_id)}>โอนสิทธิ์เจ้าของ</button>
                    <button className="danger-command" type="button" disabled={working} onClick={() => void removeMember(member.membership_id, member.display_name)}>นำสิทธิ์ออก</button>
                  </div>
                ) : <span />}
              </div>
            ))}
          </div>
        </section>
        {team?.invitations.length ? (
          <section className="tool-band muted-band"><div className="band-heading"><div><p>รอดำเนินการ</p><h2>คำเชิญ</h2></div></div>{team.invitations.map((invitation) => <div className="pending-line" key={invitation.id}><strong>{invitation.email_normalized}</strong><span>{humanizeTenantRole(invitation.role)}</span></div>)}</section>
        ) : null}
      </section>
    </main>
  );
}
