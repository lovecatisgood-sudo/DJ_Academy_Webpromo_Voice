"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { safeMutationFetch } from "@djay/shared";
import { WorkspaceSidebar } from "../WorkspaceSidebar";
import { WorkspaceAccessDenied, WorkspacePageLoadError, WorkspaceSessionLoadError } from "../WorkspaceAccess";
import { useWorkspaceSession } from "../useWorkspaceSession";

type Member = {
  membership_id: string;
  display_name: string;
  email_normalized: string;
  membership_role: string;
  membership_status: string;
};

type Invitation = { id: string; email_normalized: string; role: string; expires_at: string };
type TeamOverview = { members: Member[]; invitations: Invitation[]; transfers: { id: string }[] };

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
      setMessage("The invitation could not be created.");
      return;
    }
    form.reset();
    setMessage("Invitation queued for delivery.");
    await loadTeam();
  }

  async function transferOwnership(targetMembershipId: string) {
    if (!window.confirm("Send an ownership transfer request to this member?")) return;
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

  if (session.error) return <WorkspaceSessionLoadError onRetry={() => window.location.reload()} />;
  if (session.loading || !session.selectedTenantId) return <main className="workspace-loading">Loading team...</main>;
  if (!session.allows("team.read")) return <WorkspaceAccessDenied active="team" title="Team" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(tenantId) => void session.selectWorkspace(tenantId)} onLogout={() => void session.logout()} />;
  if (loadError) return <WorkspacePageLoadError active="team" title="Team" resource="workspace members" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(tenantId) => void session.selectWorkspace(tenantId)} onLogout={() => void session.logout()} onRetry={() => void loadTeam()} />;
  const isOwner = activeWorkspace?.role === "tenant_master_admin";
  const canInvite = isOwner || activeWorkspace?.role === "tenant_admin";

  return (
    <main className="workspace-shell">
      <WorkspaceSidebar
        active="team"
        workspaces={session.workspaces}
        selectedTenantId={session.selectedTenantId}
        onSelect={(tenantId) => void session.selectWorkspace(tenantId)}
        onLogout={() => void session.logout()}
      />
      <section className="workspace-main">
        <header className="workspace-header"><div><p>Workspace</p><h1>Team</h1></div><span className="role-label">{activeWorkspace?.businessName}</span></header>
        {canInvite ? (
          <section className="tool-band">
            <div className="band-heading"><div><p>Access</p><h2>Invite a team member</h2></div></div>
            <form className="inline-form" onSubmit={invite}>
              <label>Email<input name="email" type="email" autoComplete="email" required /></label>
              <label>Role<select name="role" defaultValue="tenant_operator"><option value="tenant_admin">Tenant Admin</option><option value="tenant_operator">Operator</option><option value="tenant_analyst">Analyst</option></select></label>
              <button type="submit" disabled={working}>Send invitation</button>
            </form>
            {message ? <p className="inline-message" role="status">{message}</p> : null}
          </section>
        ) : null}
        <section className="tool-band">
          <div className="band-heading"><div><p>Members</p><h2>Active team</h2></div><span>{team?.members.length || 0}</span></div>
          <div className="data-table" role="table" aria-label="Workspace members">
            {team?.members.map((member) => (
              <div className="data-row" role="row" key={member.membership_id}>
                <div><strong>{member.display_name}</strong><span>{member.email_normalized}</span></div>
                <span className="role-label">{member.membership_role.replaceAll("_", " ")}</span>
                {isOwner && member.membership_role !== "tenant_master_admin" ? (
                  <button className="secondary-command" type="button" disabled={working || Boolean(team.transfers.length)} onClick={() => void transferOwnership(member.membership_id)}>Transfer ownership</button>
                ) : <span />}
              </div>
            ))}
          </div>
        </section>
        {team?.invitations.length ? (
          <section className="tool-band muted-band"><div className="band-heading"><div><p>Pending</p><h2>Invitations</h2></div></div>{team.invitations.map((invitation) => <div className="pending-line" key={invitation.id}><strong>{invitation.email_normalized}</strong><span>{invitation.role.replaceAll("_", " ")}</span></div>)}</section>
        ) : null}
      </section>
    </main>
  );
}
