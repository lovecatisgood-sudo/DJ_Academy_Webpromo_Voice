"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { currentIntlLocale, safeMutationFetch } from "@djay/shared";
import { WorkspaceSidebar } from "../WorkspaceSidebar";
import { WorkspaceAccessDenied, WorkspacePageLoadError, WorkspaceSessionLoadError } from "../WorkspaceAccess";
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
  const [enrollment, setEnrollment] = useState<{ factorId: string; secret: string; otpauthUrl: string; qrDataUrl: string } | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [mfaMessage, setMfaMessage] = useState("");
  const [loadError, setLoadError] = useState(false);
  const activeWorkspace = useMemo(
    () => workspaceSession.workspaces.find((workspace) => workspace.tenantId === workspaceSession.selectedTenantId),
    [workspaceSession.workspaces, workspaceSession.selectedTenantId],
  );

  async function loadSessions() {
    try {
      const response = await fetch("/tenant/security/sessions", { cache: "no-store" });
      if (!response.ok) throw new Error("security_unavailable");
      setSessions((await response.json()).sessions || []);
      setLoadError(false);
    } catch { setLoadError(true); }
  }

  useEffect(() => {
    if (workspaceSession.selectedTenantId && workspaceSession.allows("security.sessions.read")) void loadSessions();
  }, [workspaceSession.selectedTenantId, activeWorkspace?.role]);

  async function revoke(sessionId: string) {
    setMfaMessage("");
    const response = await safeMutationFetch(`/tenant/security/sessions/${sessionId}`, { method: "DELETE" });
    if (!response.ok) {
      setMfaMessage("The session could not be revoked. No session state changed.");
      return;
    }
    const result = await response.json();
    if (result.revokedCurrent) window.location.replace("/");
    else await loadSessions();
  }

  async function startMfaEnrollment() {
    setMfaMessage("");
    const response = await safeMutationFetch("/tenant/security/mfa/enroll", { method: "POST" });
    if (!response.ok) {
      setMfaMessage("MFA enrollment could not be started.");
      return;
    }
    const result = await response.json();
    const otpauthUrl = String(result.enrollment.otpauthUrl || "");
    const url = new URL(otpauthUrl);
    const secret = url.searchParams.get("secret") || "";
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { width: 196, margin: 1 });
    setEnrollment({ factorId: result.enrollment.factorId, secret, otpauthUrl, qrDataUrl });
  }

  async function verifyMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enrollment) return;
    const data = new FormData(event.currentTarget);
    const response = await safeMutationFetch("/tenant/security/mfa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ factorId: enrollment.factorId, code: data.get("code") }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMfaMessage(response.status >= 500 ? "MFA verification is temporarily unavailable. Try again." : "The verification code is invalid.");
      return;
    }
    setRecoveryCodes(result.recoveryCodes || []);
    setEnrollment(null);
    setMfaMessage("Multi-factor authentication is active. Download your recovery codes now — they are shown once.");
  }

  function downloadRecoveryCodes() {
    if (!recoveryCodes.length) return;
    const blob = new Blob(
      [`DJAY Bot recovery codes\nGenerated ${new Date().toISOString()}\n\n${recoveryCodes.join("\n")}\n`],
      { type: "text/plain;charset=utf-8" },
    );
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = "djay-bot-recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(href);
  }

  if (workspaceSession.error) return <WorkspaceSessionLoadError onRetry={() => window.location.reload()} />;
  if (workspaceSession.loading || !workspaceSession.selectedTenantId) return <main className="workspace-loading">Loading security...</main>;
  if (!workspaceSession.allows("security.sessions.read")) {
    return (
      <WorkspaceAccessDenied
        active="security"
        title="Security"
        workspaces={workspaceSession.workspaces}
        selectedTenantId={workspaceSession.selectedTenantId}
        onSelect={(tenantId) => void workspaceSession.selectWorkspace(tenantId)}
        onLogout={() => void workspaceSession.logout()}
      />
    );
  }
  if (loadError) {
    return (
      <WorkspacePageLoadError
        active="security"
        title="Security"
        resource="account security"
        workspaces={workspaceSession.workspaces}
        selectedTenantId={workspaceSession.selectedTenantId}
        onSelect={(tenantId) => void workspaceSession.selectWorkspace(tenantId)}
        onLogout={() => void workspaceSession.logout()}
        onRetry={() => void loadSessions()}
      />
    );
  }

  return (
    <main className="workspace-shell">
      <WorkspaceSidebar
        active="security"
        workspaces={workspaceSession.workspaces}
        selectedTenantId={workspaceSession.selectedTenantId}
        onSelect={(tenantId) => void workspaceSession.selectWorkspace(tenantId)}
        onLogout={() => void workspaceSession.logout()}
      />
      <section id="workspace-main" className="workspace-main" tabIndex={-1}>
        <header className="workspace-header">
          <div><p>Account</p><h1>Security</h1></div>
          <span className="role-label">{activeWorkspace?.businessName}</span>
        </header>
        <section className="tool-band">
          <div className="band-heading">
            <div><p>Authentication</p><h2>Multi-factor authentication</h2></div>
            <span>{workspaceSession.mfaVerifiedAt ? "Verified" : "Not verified"}</span>
          </div>
          {recoveryCodes.length ? (
            <div className="recovery-codes" role="status">
              <strong>Recovery codes</strong>
              {recoveryCodes.map((code) => <code key={code}>{code}</code>)}
              <button type="button" className="secondary-command" onClick={downloadRecoveryCodes}>
                Download recovery codes
              </button>
            </div>
          ) : enrollment ? (
            <form className="mfa-enrollment" onSubmit={verifyMfa}>
              <div className="mfa-qr">
                <img src={enrollment.qrDataUrl} width={196} height={196} alt="Authenticator QR code" />
                <p className="field-help">Scan with your authenticator app, or enter the setup key manually.</p>
              </div>
              <label>Setup key<input readOnly value={enrollment.secret} /></label>
              <label>
                Authenticator code
                <input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} name="code" autoComplete="one-time-code" required />
              </label>
              <button type="submit">Verify MFA</button>
            </form>
          ) : (
            <button className="secondary-command mfa-command" type="button" onClick={() => void startMfaEnrollment()}>
              {workspaceSession.mfaVerifiedAt ? "Replace authenticator" : "Set up authenticator"}
            </button>
          )}
          {mfaMessage ? <p className="inline-message" role="status">{mfaMessage}</p> : null}
        </section>
        <section className="tool-band">
          <div className="band-heading">
            <div><p>Sessions</p><h2>Signed-in devices</h2></div>
            <span>{sessions.length}</span>
          </div>
          <div className="data-table" role="table" aria-label="Active sessions">
            {sessions.map((session) => (
              <div className="data-row session-row" role="row" key={session.sessionId}>
                <div>
                  <strong>{session.current ? "Current session" : "Active session"}</strong>
                  <span>Last active {new Date(session.lastSeenAt).toLocaleString(currentIntlLocale())}</span>
                </div>
                <span>Expires {new Date(session.absoluteExpiresAt).toLocaleDateString(currentIntlLocale())}</span>
                <button className="secondary-command danger-command" type="button" onClick={() => void revoke(session.sessionId)}>
                  {session.current ? "Sign out" : "Revoke"}
                </button>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
