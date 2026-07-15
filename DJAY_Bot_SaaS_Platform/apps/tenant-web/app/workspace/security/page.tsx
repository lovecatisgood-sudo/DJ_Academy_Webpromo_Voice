"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { WorkspaceSidebar } from "../WorkspaceSidebar";
import { useWorkspaceSession } from "../useWorkspaceSession";

type SecuritySession = {
  sessionId: string;
  current: boolean;
  createdAt: string;
  lastSeenAt: string;
  absoluteExpiresAt: string;
};

export default function SecurityPage() {
  const workspaceSession = useWorkspaceSession();
  const [sessions, setSessions] = useState<SecuritySession[]>([]);
  const [enrollment, setEnrollment] = useState<{ factorId: string; secret: string } | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [mfaMessage, setMfaMessage] = useState("");
  const activeWorkspace = useMemo(
    () => workspaceSession.workspaces.find((workspace) => workspace.tenantId === workspaceSession.selectedTenantId),
    [workspaceSession.workspaces, workspaceSession.selectedTenantId],
  );

  async function loadSessions() {
    const response = await fetch("/tenant/security/sessions", { cache: "no-store" });
    if (response.ok) setSessions((await response.json()).sessions || []);
  }

  useEffect(() => { if (workspaceSession.selectedTenantId) void loadSessions(); }, [workspaceSession.selectedTenantId]);

  async function revoke(sessionId: string) {
    const response = await fetch(`/tenant/security/sessions/${sessionId}`, { method: "DELETE" });
    if (!response.ok) return;
    const result = await response.json();
    if (result.revokedCurrent) window.location.replace("/");
    else await loadSessions();
  }

  async function startMfaEnrollment() {
    setMfaMessage("");
    const response = await fetch("/tenant/security/mfa/enroll", { method: "POST" });
    if (!response.ok) {
      setMfaMessage("MFA enrollment could not be started.");
      return;
    }
    const result = await response.json();
    const url = new URL(result.enrollment.otpauthUrl);
    setEnrollment({ factorId: result.enrollment.factorId, secret: url.searchParams.get("secret") || "" });
  }

  async function verifyMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enrollment) return;
    const data = new FormData(event.currentTarget);
    const response = await fetch("/tenant/security/mfa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ factorId: enrollment.factorId, code: data.get("code") }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMfaMessage("The verification code is invalid.");
      return;
    }
    setRecoveryCodes(result.recoveryCodes || []);
    setEnrollment(null);
    setMfaMessage("Multi-factor authentication is active.");
  }

  if (workspaceSession.loading || !workspaceSession.selectedTenantId) return <main className="workspace-loading">Loading security...</main>;
  return (
    <main className="workspace-shell">
      <WorkspaceSidebar
        active="security"
        workspaces={workspaceSession.workspaces}
        selectedTenantId={workspaceSession.selectedTenantId}
        onSelect={(tenantId) => void workspaceSession.selectWorkspace(tenantId)}
        onLogout={() => void workspaceSession.logout()}
      />
      <section className="workspace-main">
        <header className="workspace-header"><div><p>Account</p><h1>Security</h1></div><span className="role-label">{activeWorkspace?.businessName}</span></header>
        <section className="tool-band">
          <div className="band-heading"><div><p>Authentication</p><h2>Multi-factor authentication</h2></div><span>{workspaceSession.mfaVerifiedAt ? "Verified" : "Not verified"}</span></div>
          {recoveryCodes.length ? (
            <div className="recovery-codes" role="status"><strong>Recovery codes</strong>{recoveryCodes.map((code) => <code key={code}>{code}</code>)}</div>
          ) : enrollment ? (
            <form className="mfa-enrollment" onSubmit={verifyMfa}>
              <label>Setup key<input readOnly value={enrollment.secret} /></label>
              <label>Authenticator code<input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} name="code" autoComplete="one-time-code" required /></label>
              <button type="submit">Verify MFA</button>
            </form>
          ) : (
            <button className="secondary-command mfa-command" type="button" onClick={() => void startMfaEnrollment()}>{workspaceSession.mfaVerifiedAt ? "Replace authenticator" : "Set up authenticator"}</button>
          )}
          {mfaMessage ? <p className="inline-message" role="status">{mfaMessage}</p> : null}
        </section>
        <section className="tool-band">
          <div className="band-heading"><div><p>Sessions</p><h2>Signed-in devices</h2></div><span>{sessions.length}</span></div>
          <div className="data-table" role="table" aria-label="Active sessions">
            {sessions.map((session) => (
              <div className="data-row session-row" role="row" key={session.sessionId}>
                <div><strong>{session.current ? "Current session" : "Active session"}</strong><span>Last active {new Date(session.lastSeenAt).toLocaleString()}</span></div>
                <span>Expires {new Date(session.absoluteExpiresAt).toLocaleDateString()}</span>
                <button className="secondary-command danger-command" type="button" onClick={() => void revoke(session.sessionId)}>{session.current ? "Sign out" : "Revoke"}</button>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
