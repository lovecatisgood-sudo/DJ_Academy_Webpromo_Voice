"use client";

import { useEffect, useState, type FormEvent } from "react";

type PlatformUser = { id: string; displayName: string; role: string; mfaVerifiedAt: string };
type SocialHealth = { channel: "line" | "whatsapp" | "messenger"; activeConnections: number; reauthorizationRequired: number; queuedInbound: number; oldestInboundQueueSeconds: number; deadLetterInbound: number; queuedDeliveries: number; oldestDeliveryQueueSeconds: number; deadLetterDeliveries: number; serviceWindowClosed24h: number; attemptedQuantity24h: number; failedAttempts24h: number };
type Health = { platformUsers: number; activeSessions: number; socialChannels?: SocialHealth[] };
type Commerce = { tenants: number; subscriptions: number; pending: number; active: number };
type Subscription = {
  id: string; tenantId: string; businessName: string; productKey: string;
  planKey: string; publicName: string; status: string; createdAt: string;
};
type Tenant = { id: string; businessName: string; slug: string; status: string };
type SupportGrant = { id: string; tenantId: string; businessName: string; requestedByPlatformUserId: string; approvedByPlatformUserId: string | null; reason: string; status: string; startsAt: string; expiresAt: string };
type VoiceControl = { mode: "running" | "paused" | "emergency_stop"; reasonCode: string; version: number; changedAt: string; activeSessions: number; reconnectingSessions: number; expiredGrants: number; staleConnections: number };

export default function PlatformMasterPage() {
  const [stage, setStage] = useState<"loading" | "password" | "mfa" | "dashboard">("loading");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [user, setUser] = useState<PlatformUser | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [commerce, setCommerce] = useState<Commerce | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [supportGrants, setSupportGrants] = useState<SupportGrant[]>([]);
  const [voiceControl, setVoiceControl] = useState<VoiceControl | null>(null);
  const [voiceReason, setVoiceReason] = useState("scheduled_maintenance");

  async function loadCurrent() {
    const response = await fetch("/platform/me", { cache: "no-store" });
    if (!response.ok) {
      setStage("password");
      return;
    }
    const result = await response.json();
    setUser(result.user);
    setStage("dashboard");
    const healthResponse = await fetch("/platform/health-summary", { cache: "no-store" });
    if (healthResponse.ok) setHealth((await healthResponse.json()).health);
    const commerceResponse = await fetch("/platform/commerce-overview", { cache: "no-store" });
    if (commerceResponse.ok) setCommerce((await commerceResponse.json()).commerce);
    const subscriptionsResponse = await fetch("/platform/subscriptions", { cache: "no-store" });
    if (subscriptionsResponse.ok) setSubscriptions((await subscriptionsResponse.json()).subscriptions || []);
    const tenantResponse = await fetch("/platform/tenants", { cache: "no-store" });
    if (tenantResponse.ok) setTenants((await tenantResponse.json()).tenants || []);
    const grantResponse = await fetch("/platform/support-grants", { cache: "no-store" });
    if (grantResponse.ok) setSupportGrants((await grantResponse.json()).grants || []);
    const voiceResponse = await fetch("/platform/voice/runtime-control", { cache: "no-store" });
    if (voiceResponse.ok) setVoiceControl((await voiceResponse.json()).control);
  }

  useEffect(() => { void loadCurrent(); }, []);

  async function passwordLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/platform/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
    });
    setWorking(false);
    if (!response.ok) {
      setMessage("Platform credentials are invalid.");
      return;
    }
    setStage("mfa");
  }

  async function verifyMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/platform/auth/mfa/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: data.get("code") }),
    });
    setWorking(false);
    if (!response.ok) {
      setMessage("The verification code is invalid or expired.");
      return;
    }
    await loadCurrent();
  }

  async function logout() {
    await fetch("/platform/auth/logout", { method: "POST" });
    setUser(null);
    setHealth(null);
    setCommerce(null);
    setSubscriptions([]);
    setTenants([]);
    setSupportGrants([]);
    setVoiceControl(null);
    setStage("password");
  }

  async function activate(subscriptionId: string) {
    if (!window.confirm("Activate this subscription for the pilot workspace?")) return;
    setWorking(true);
    const response = await fetch(`/platform/subscriptions/${subscriptionId}/activate`, { method: "POST" });
    setWorking(false);
    if (!response.ok) {
      setMessage("Subscription activation requires a recent Platform Owner sign-in.");
      return;
    }
    await loadCurrent();
  }

  async function requestSupport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setWorking(true); setMessage(""); const form = event.currentTarget; const data = new FormData(form);
    const response = await fetch("/platform/support-grants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId: data.get("tenantId"), reason: data.get("reason"), durationMinutes: Number(data.get("durationMinutes")) }) });
    setWorking(false); if (!response.ok) { setMessage("Support access request could not be created."); return; }
    form.reset(); await loadCurrent();
  }

  async function decideSupport(grantId: string, command: "approve" | "revoke") {
    setWorking(true); setMessage(""); const response = await fetch(`/platform/support-grants/${grantId}/${command}`, { method: "POST" }); setWorking(false);
    if (!response.ok) { setMessage(command === "approve" ? "Approval requires another platform user and recent authentication." : "Grant could not be revoked."); return; }
    await loadCurrent();
  }

  async function changeVoiceMode(mode: VoiceControl["mode"]) {
    const warning = mode === "emergency_stop"
      ? "Emergency stop ends every active Voice session and prevents new sessions. Continue?"
      : mode === "running"
        ? "Resume new Voice sessions? Confirm deployment readiness first."
        : "Pause admission of new Voice sessions? Active sessions will continue.";
    if (!window.confirm(warning)) return;
    setWorking(true); setMessage("");
    const response = await fetch("/platform/voice/runtime-control", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, reasonCode: voiceReason }),
    });
    setWorking(false);
    if (!response.ok) {
      setMessage(response.status === 403
        ? "Voice controls require recent authentication. Sign out and verify again."
        : "Voice runtime control could not be changed.");
      return;
    }
    await loadCurrent();
  }

  if (stage === "loading") return <main className="platform-loading">Checking platform session...</main>;
  if (stage === "dashboard" && user) {
    return (
      <main className="platform-shell">
        <aside>
          <div className="platform-brand"><span className="mark">D</span><strong>DJAY BOT</strong></div>
          <p>Platform Master</p>
          <nav><a className="active" href="/">Overview</a><span>Tenants</span><span>Catalog</span><span>Audit</span><span>Operations</span></nav>
          <button className="quiet-button" type="button" onClick={() => void logout()}>Sign out</button>
        </aside>
        <section className="platform-content">
          <header><div><p>Internal operations</p><h1>Platform health</h1></div><span>{user.displayName}<small>{user.role.replaceAll("_", " ")}</small></span></header>
          {message ? <div className="platform-message dashboard-message" role="alert">{message}</div> : null}
          <div className="metrics-band">
            <div><span>Platform users</span><strong>{health?.platformUsers ?? "-"}</strong></div>
            <div><span>Active sessions</span><strong>{health?.activeSessions ?? "-"}</strong></div>
            <div><span>MFA status</span><strong>Verified</strong></div>
            <div><span>SME tenants</span><strong>{commerce?.tenants ?? "-"}</strong></div>
            <div><span>Subscriptions</span><strong>{commerce?.subscriptions ?? "-"}</strong></div>
            <div><span>Pending activation</span><strong>{commerce?.pending ?? "-"}</strong></div>
          </div>
          <div className="operations-band"><p>System</p><h2>Identity and commerce foundations operational</h2></div>
          {voiceControl ? <div className={`subscription-band voice-control-band mode-${voiceControl.mode}`}>
            <div><p>Voice operations</p><h2>Runtime admission and recovery</h2></div>
            <div className="voice-control-summary">
              <div><span>Mode</span><strong>{voiceControl.mode.replaceAll("_", " ")}</strong><small>{voiceControl.reasonCode.replaceAll("_", " ")}</small></div>
              <div><span>Active</span><strong>{voiceControl.activeSessions}</strong><small>{voiceControl.reconnectingSessions} reconnecting</small></div>
              <div><span>Recovery queue</span><strong>{voiceControl.expiredGrants + voiceControl.staleConnections}</strong><small>{voiceControl.staleConnections} stale connections</small></div>
            </div>
            <label className="voice-reason">Operational reason<input value={voiceReason} minLength={3} maxLength={200} onChange={(event) => setVoiceReason(event.target.value)} /></label>
            <div className="voice-control-actions">
              <button type="button" disabled={working || voiceControl.mode === "running"} onClick={() => void changeVoiceMode("running")}>Resume admission</button>
              <button className="outline-button" type="button" disabled={working || voiceControl.mode === "paused"} onClick={() => void changeVoiceMode("paused")}>Pause new sessions</button>
              <button className="danger-button" type="button" disabled={working || voiceControl.mode === "emergency_stop"} onClick={() => void changeVoiceMode("emergency_stop")}>Emergency stop</button>
            </div>
            <small>Version {voiceControl.version} · changed {new Date(voiceControl.changedAt).toLocaleString()}</small>
          </div> : null}
          {health?.socialChannels?.length ? <div className="subscription-band"><div><p>AI Chat operations</p><h2>Social channel health</h2></div><div className="platform-table" role="table" aria-label="Social channel health">{health.socialChannels.map((channel) => <div className="platform-row" role="row" key={channel.channel}><div><strong>{channel.channel === "line" ? "LINE" : channel.channel === "whatsapp" ? "WhatsApp" : "Messenger"}</strong><span>{channel.activeConnections} active / {channel.reauthorizationRequired} reauthorization</span></div><span>{channel.queuedInbound} inbound queued / {channel.oldestInboundQueueSeconds}s oldest</span><span>{channel.queuedDeliveries} delivery queued / {channel.oldestDeliveryQueueSeconds}s oldest</span><span>{channel.deadLetterInbound + channel.deadLetterDeliveries} dead letters / {channel.failedAttempts24h} failed attempts</span></div>)}</div></div> : null}
          <div className="subscription-band">
            <div><p>Commerce</p><h2>Product subscriptions</h2></div>
            <div className="platform-table" role="table" aria-label="Product subscriptions">
              {subscriptions.map((subscription) => (
                <div className="platform-row" role="row" key={subscription.id}>
                  <div><strong>{subscription.businessName}</strong><span>{subscription.publicName}</span></div>
                  <span>{subscription.status.replaceAll("_", " ")}</span>
                  {user.role === "platform_owner" && subscription.status === "pending" ? (
                    <button type="button" disabled={working} onClick={() => void activate(subscription.id)}>Activate pilot</button>
                  ) : <span />}
                </div>
              ))}
              {!subscriptions.length ? <p className="empty-row">No product subscriptions</p> : null}
            </div>
          </div>
          <div className="subscription-band support-band">
            <div><p>Controlled support</p><h2>Time-limited tenant access grants</h2></div>
            {(user.role === "platform_owner" || user.role === "platform_support") && tenants.length ? <form className="support-request-form" onSubmit={requestSupport}>
              <label>Tenant<select name="tenantId" required defaultValue=""><option value="" disabled>Select tenant</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.businessName}</option>)}</select></label>
              <label>Reason<input name="reason" minLength={12} maxLength={500} required /></label>
              <label>Duration<select name="durationMinutes" defaultValue="60"><option value="30">30 minutes</option><option value="60">1 hour</option><option value="120">2 hours</option><option value="240">4 hours</option></select></label>
              <button type="submit" disabled={working}>Request</button>
            </form> : null}
            <div className="platform-table" role="table" aria-label="Support access grants">
              {supportGrants.map((grant) => <div className="platform-row support-row" role="row" key={grant.id}>
                <div><strong>{grant.businessName}</strong><span>{grant.reason}</span></div><span>{grant.status}</span><span>{new Date(grant.expiresAt).toLocaleString()}</span>
                <div className="row-actions">{user.role === "platform_owner" && grant.status === "requested" ? <button type="button" disabled={working || grant.requestedByPlatformUserId === user.id} onClick={() => void decideSupport(grant.id, "approve")}>Approve</button> : null}{user.role === "platform_owner" && ["requested", "approved", "active"].includes(grant.status) ? <button className="outline-button" type="button" disabled={working} onClick={() => void decideSupport(grant.id, "revoke")}>Revoke</button> : null}</div>
              </div>)}
              {!supportGrants.length ? <p className="empty-row">No support access grants</p> : null}
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main>
      <div className="topline" />
      <header><span className="mark">D</span><strong>DJAY BOT</strong><span>Platform operations</span></header>
      <section aria-labelledby="platform-login-title">
        <p>Restricted access</p>
        <h1 id="platform-login-title">{stage === "mfa" ? "Verify your identity" : "Platform sign in"}</h1>
        {stage === "mfa" ? (
          <form onSubmit={verifyMfa}>
            <label>Authenticator code<input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} name="code" autoComplete="one-time-code" required /></label>
            <button type="submit" disabled={working}>{working ? "Verifying..." : "Verify"}</button>
          </form>
        ) : (
          <form onSubmit={passwordLogin}>
            <label>Platform email<input type="email" name="email" autoComplete="email" required /></label>
            <label>Password<input type="password" name="password" autoComplete="current-password" required /></label>
            <button type="submit" disabled={working}>{working ? "Checking..." : "Continue"}</button>
          </form>
        )}
        {message ? <div className="platform-message" role="alert">{message}</div> : null}
        <small>Multi-factor verification is required.</small>
      </section>
    </main>
  );
}
