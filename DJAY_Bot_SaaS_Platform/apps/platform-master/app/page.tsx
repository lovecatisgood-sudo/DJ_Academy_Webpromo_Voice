"use client";

import { useEffect, useState, type FormEvent } from "react";

type PlatformUser = { id: string; displayName: string; role: string; mfaVerifiedAt: string };
type SocialHealth = { channel: "line" | "whatsapp" | "messenger"; activeConnections: number; reauthorizationRequired: number; queuedInbound: number; oldestInboundQueueSeconds: number; deadLetterInbound: number; queuedDeliveries: number; oldestDeliveryQueueSeconds: number; deadLetterDeliveries: number; serviceWindowClosed24h: number; attemptedQuantity24h: number; failedAttempts24h: number };
type Health = { platformUsers: number; activeSessions: number; socialChannels?: SocialHealth[] };
type Commerce = { tenants: number; subscriptions: number; pending: number; active: number };
type UsageReconciliation = {
  asOf: string;
  status: "healthy" | "attention";
  summary: {
    quotaAccounts: number; displayedAccounts: number; healthyAccounts: number;
    attentionAccounts: number; activeWithoutCurrentAccount: number;
    orphanUsageEvents: number; expiredOpenReservations: number;
  };
  accounts: Array<{
    quotaAccountId: string; tenantId: string; businessName: string;
    productKey: "flowbot" | "ai_chat" | "voice"; publicName: string;
    customerUnit: "flow_execution" | "ai_response" | "voice_minute";
    periodStart: string; periodEnd: string; accountReserved: number;
    reservationReserved: number; accountSettled: number; reservationSettled: number;
    settledEvents: number; creditedEvents: number; waivedEvents: number;
    netSettledEvents: number; openReservations: number; expiredOpenReservations: number;
    reservedVariance: number; settledVariance: number; eventVariance: number;
    status: "healthy" | "attention";
  }>;
};
type ReleaseReadiness = {
  asOf: string; environment: "staging" | "production"; releaseVersion: string;
  status: "ready" | "blocked";
  services: Array<{
    serviceKey: string; publicLabel: string; status: "passing" | "failing" | "missing";
    passing: boolean; issues: string[];
    objective: { availabilityTargetBasisPoints: number; latencyP95TargetMs: number; maxQueueAgeSeconds: number | null; maxDeadLetters: number; minimumSampleCount: number; minimumWindowMinutes: number; maximumAgeMinutes: number };
    observation: null | { windowEnd: string; availabilityBasisPoints: number; latencyP95Ms: number; queueAgeSeconds: number | null; deadLetterCount: number; sampleCount: number; sourceReference: string };
  }>;
  attestations: Array<{
    kind: "on_call" | "restore" | "support_runbook" | "security_review" | "privacy_review" | "event_replay" | "queue_recovery" | "pool_exhaustion";
    passing: boolean; status: "passed" | "failed" | "missing";
    validUntil: string | null; sourceReference: string | null;
  }>;
  incidents: { passing: boolean; blocking: number; oldestOpenedAt: string | null };
  usage: { passing: boolean; status: "healthy" | "attention"; attentionAccounts?: number; activeWithoutCurrentAccount?: number; orphanUsageEvents?: number; expiredOpenReservations?: number };
};
type Subscription = {
  id: string; tenantId: string; businessName: string; productKey: string;
  planKey: string; publicName: string; status: string; createdAt: string;
};
type Tenant = { id: string; businessName: string; slug: string; status: string };
type SupportGrant = { id: string; tenantId: string; businessName: string; requestedByPlatformUserId: string; approvedByPlatformUserId: string | null; reason: string; status: string; startsAt: string; expiresAt: string };
type VoiceControl = { mode: "running" | "paused" | "emergency_stop"; reasonCode: string; version: number; changedAt: string; activeSessions: number; reconnectingSessions: number; expiredGrants: number; staleConnections: number };
type VoiceIncident = { id: string; capabilityProfile: "voice_gen2"; severity: "minor" | "major" | "critical"; status: "open" | "monitoring" | "resolved"; reason: string; resolution: string | null; routingChangeId: string | null; creditReviewStatus: "not_required" | "required" | "approved" | "rejected"; openedByPlatformUserId: string; openedAt: string; resolvedAt: string | null };
type VoiceCandidate = { id: string; capabilityProfile: "voice_gen2"; providerKey: string; modelKey: string; regionKey: string; status: "proposed" | "qualified" | "rejected" | "paused"; proposedByPlatformUserId: string; reviewedByPlatformUserId: string | null; proposedAt: string; reviewedAt: string | null };
type VoiceChange = { id: string; capabilityProfile: "voice_gen2"; candidateId: string; previousCandidateId: string | null; canaryPercent: number; status: "requested" | "approved" | "rejected" | "canary" | "active" | "rolled_back"; reason: string; requestedByPlatformUserId: string; approvedByPlatformUserId: string | null; requestedAt: string; approvedAt: string | null; canaryStartedAt: string | null; activatedAt: string | null; rolledBackAt: string | null; rollbackReason: string | null };
type VoiceAdmissionChange = { id: string; capabilityProfile: "voice_gen2"; targetEnabled: boolean; status: "requested" | "approved" | "rejected" | "applied"; reason: string; requestedByPlatformUserId: string; approvedByPlatformUserId: string | null; requestedAt: string; approvedAt: string | null; appliedAt: string | null };
type VoiceRouting = { admissionEnabled: boolean; admissionChanges: VoiceAdmissionChange[]; profiles: { capabilityProfile: "voice_gen2"; mode: "paused" | "canary" | "running" | "degraded"; reasonCode: string; version: number; changedAt: string; primaryCandidateId: string | null; canaryCandidateId: string | null; canaryPercent: number }[]; candidates: VoiceCandidate[]; changes: VoiceChange[]; incidents: VoiceIncident[] };

export default function PlatformMasterPage() {
  const [stage, setStage] = useState<"loading" | "password" | "mfa" | "dashboard">("loading");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [user, setUser] = useState<PlatformUser | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [commerce, setCommerce] = useState<Commerce | null>(null);
  const [reconciliation, setReconciliation] = useState<UsageReconciliation | null>(null);
  const [reconciliationStage, setReconciliationStage] = useState<"hidden" | "loading" | "ready" | "error">("hidden");
  const [readiness, setReadiness] = useState<ReleaseReadiness | null>(null);
  const [readinessStage, setReadinessStage] = useState<"loading" | "ready" | "error">("loading");
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [supportGrants, setSupportGrants] = useState<SupportGrant[]>([]);
  const [voiceControl, setVoiceControl] = useState<VoiceControl | null>(null);
  const [voiceRouting, setVoiceRouting] = useState<VoiceRouting | null>(null);
  const [voiceIncidents, setVoiceIncidents] = useState<VoiceIncident[] | null>(null);
  const [voiceReason, setVoiceReason] = useState("scheduled_maintenance");
  const [routingActionReason, setRoutingActionReason] = useState("Reviewed Advanced Voice operational change");

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
    setReadiness(null);
    setReadinessStage("loading");
    try {
      const readinessResponse = await fetch("/platform/release-readiness", { cache: "no-store" });
      if (!readinessResponse.ok) throw new Error("readiness_unavailable");
      const nextReadiness = (await readinessResponse.json()).readiness;
      if (!nextReadiness) throw new Error("readiness_unavailable");
      setReadiness(nextReadiness);
      setReadinessStage("ready");
    } catch {
      setReadinessStage("error");
    }
    const commerceResponse = await fetch("/platform/commerce-overview", { cache: "no-store" });
    if (commerceResponse.ok) setCommerce((await commerceResponse.json()).commerce);
    if (["platform_owner", "platform_finance"].includes(result.user.role)) {
      setReconciliation(null);
      setReconciliationStage("loading");
      try {
        const reconciliationResponse = await fetch("/platform/usage-reconciliation", { cache: "no-store" });
        if (!reconciliationResponse.ok) throw new Error("reconciliation_unavailable");
        setReconciliation((await reconciliationResponse.json()).reconciliation);
        setReconciliationStage("ready");
      } catch {
        setReconciliation(null);
        setReconciliationStage("error");
      }
    } else {
      setReconciliation(null);
      setReconciliationStage("hidden");
    }
    const subscriptionsResponse = await fetch("/platform/subscriptions", { cache: "no-store" });
    if (subscriptionsResponse.ok) setSubscriptions((await subscriptionsResponse.json()).subscriptions || []);
    const tenantResponse = await fetch("/platform/tenants", { cache: "no-store" });
    if (tenantResponse.ok) setTenants((await tenantResponse.json()).tenants || []);
    const grantResponse = await fetch("/platform/support-grants", { cache: "no-store" });
    if (grantResponse.ok) setSupportGrants((await grantResponse.json()).grants || []);
    const voiceResponse = await fetch("/platform/voice/runtime-control", { cache: "no-store" });
    if (voiceResponse.ok) setVoiceControl((await voiceResponse.json()).control);
    if (["platform_owner", "platform_ai_operations"].includes(result.user.role)) {
      const routingResponse = await fetch("/platform/voice/routing", { cache: "no-store" });
      if (routingResponse.ok) setVoiceRouting((await routingResponse.json()).routing);
    } else setVoiceRouting(null);
    if (["platform_owner", "platform_ai_operations", "platform_finance"].includes(result.user.role)) {
      const incidentResponse = await fetch("/platform/voice/incidents", { cache: "no-store" });
      if (incidentResponse.ok) setVoiceIncidents((await incidentResponse.json()).incidents || []);
    } else setVoiceIncidents(null);
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
    setReconciliation(null);
    setReconciliationStage("hidden");
    setReadiness(null);
    setReadinessStage("loading");
    setSubscriptions([]);
    setTenants([]);
    setSupportGrants([]);
    setVoiceControl(null);
    setVoiceRouting(null);
    setVoiceIncidents(null);
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

  async function sendVoiceRoutingCommand(command: Record<string, unknown>, successMessage: string) {
    setWorking(true); setMessage("");
    const response = await fetch("/platform/voice/routing", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command),
    });
    setWorking(false);
    if (!response.ok) {
      setMessage(response.status === 403
        ? "Advanced Voice changes require recent authentication. Sign out and verify again."
        : "Advanced Voice command was rejected. Check review separation, evidence, and current route state.");
      return false;
    }
    setMessage(successMessage);
    await loadCurrent();
    return true;
  }

  async function proposeVoiceCandidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const succeeded = await sendVoiceRoutingCommand({
      command: "candidate.propose", capabilityProfile: "voice_gen2",
      providerKey: data.get("providerKey"), modelKey: data.get("modelKey"), regionKey: data.get("regionKey"),
    }, "Route candidate submitted for independent qualification.");
    if (succeeded) form.reset();
  }

  async function reviewVoiceCandidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    await sendVoiceRoutingCommand({
      command: "candidate.review", candidateId: data.get("candidateId"), decision: data.get("decision"),
      evidenceSha256: String(data.get("evidenceSha256") || "").toLowerCase(),
    }, "Candidate qualification review recorded.");
  }

  async function requestVoiceChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    await sendVoiceRoutingCommand({
      command: "change.request", capabilityProfile: "voice_gen2", candidateId: data.get("candidateId"),
      canaryPercent: Number(data.get("canaryPercent")), reason: data.get("reason"),
      evidenceSha256: String(data.get("evidenceSha256") || "").toLowerCase(),
    }, "Canary change submitted for independent approval.");
  }

  async function reviewVoiceChange(changeId: string, decision: "approve" | "reject") {
    if (!window.confirm(`${decision === "approve" ? "Approve" : "Reject"} this Advanced Voice routing change?`)) return;
    await sendVoiceRoutingCommand({ command: "change.review", changeId, decision }, `Routing change ${decision}d.`);
  }

  async function applyVoiceChange(changeId: string, action: "start_canary" | "promote" | "rollback") {
    if (!window.confirm(`${action.replaceAll("_", " ")} this reviewed Advanced Voice change?`)) return;
    await sendVoiceRoutingCommand({ command: "change.apply", changeId, action, reason: routingActionReason }, `Routing action ${action.replaceAll("_", " ")} completed.`);
  }

  async function requestVoiceAdmission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const enabled = data.get("enabled") === "true";
    const succeeded = await sendVoiceRoutingCommand({
      command: "admission.request", enabled, reason: data.get("reason"),
      evidenceSha256: String(data.get("evidenceSha256") || "").toLowerCase(),
    }, `${enabled ? "Activation" : "Deactivation"} submitted for independent approval.`);
    if (succeeded) form.reset();
  }

  async function reviewVoiceAdmission(changeId: string, decision: "approve" | "reject") {
    if (!window.confirm(`${decision === "approve" ? "Approve" : "Reject"} this Advanced Voice admission change?`)) return;
    await sendVoiceRoutingCommand({ command: "admission.review", changeId, decision }, `Admission change ${decision}d.`);
  }

  async function applyVoiceAdmission(changeId: string, enabled: boolean) {
    if (!window.confirm(`${enabled ? "Enable" : "Disable"} Advanced Voice production admission now?`)) return;
    await sendVoiceRoutingCommand({ command: "admission.apply", changeId }, `Advanced Voice admission ${enabled ? "enabled" : "disabled"}.`);
  }

  async function openVoiceIncident(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const succeeded = await sendVoiceRoutingCommand({
      command: "incident.open", capabilityProfile: "voice_gen2", severity: data.get("severity"),
      reason: data.get("reason"), routingChangeId: data.get("routingChangeId") || null,
      creditReviewRequired: data.get("creditReviewRequired") === "on",
    }, "Advanced Voice incident opened and the profile moved to a safe state.");
    if (succeeded) form.reset();
  }

  async function reviewVoiceCredit(incidentId: string, decision: "approve" | "reject") {
    if (!window.confirm(`${decision === "approve" ? "Approve" : "Reject"} the credit review recommendation?`)) return;
    await sendVoiceRoutingCommand({ command: "incident.credit_review", incidentId, decision }, `Credit review ${decision}d.`);
  }

  async function resolveVoiceIncident(incidentId: string) {
    const resolution = window.prompt("Record the incident resolution (at least 12 characters):");
    if (!resolution) return;
    await sendVoiceRoutingCommand({ command: "incident.resolve", incidentId, resolution }, "Incident resolved; routing remains explicit and fail-closed.");
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
          {readinessStage === "loading" ? <div className="subscription-band release-readiness-band readiness-placeholder" aria-live="polite"><div><p>Release operations</p><h2>Checking release readiness…</h2></div><p className="operational-note">Loading current SLO, incident, on-call, restore, replay, queue, pool, security, privacy, support, and usage evidence.</p></div> : null}
          {readinessStage === "error" ? <div className="subscription-band release-readiness-band status-blocked readiness-placeholder" role="alert"><div><p>Release operations</p><h2>Release evidence unavailable</h2></div><p className="operational-note">The release gate is blocked. No service should be promoted while current evidence cannot be verified.</p><button type="button" disabled={working} onClick={() => void loadCurrent()}>Retry readiness check</button></div> : null}
          {readiness ? <div className={`subscription-band release-readiness-band status-${readiness.status}`}>
            <div className="readiness-heading"><div><p>Release operations</p><h2>Public release readiness</h2></div><span className="readiness-status" role="status">{readiness.status === "ready" ? "Ready for reviewed release" : "Release blocked"}</span></div>
            <p className="operational-note">A release remains fail-closed until all seven service objectives, eight time-limited operational attestations, incident review, and usage reconciliation pass together.</p>
            <div className="readiness-summary">
              <div><span>Environment</span><strong>{readiness.environment}</strong><small>{readiness.releaseVersion}</small></div>
              <div><span>Service objectives</span><strong>{readiness.services.filter((service) => service.passing).length}/{readiness.services.length}</strong><small>passing</small></div>
              <div><span>Attestations</span><strong>{readiness.attestations.filter((item) => item.passing).length}/{readiness.attestations.length}</strong><small>current</small></div>
              <div><span>Blocking incidents</span><strong>{readiness.incidents.blocking}</strong><small>major or critical</small></div>
              <div><span>Usage ledger</span><strong>{readiness.usage.passing ? "Healthy" : "Review"}</strong><small>{readiness.usage.status}</small></div>
            </div>
            <div className="readiness-service-grid">
              {readiness.services.map((service) => <article className={`readiness-service-card ${service.status}`} key={service.serviceKey}>
                <div><span className="readiness-dot" aria-hidden="true" /><strong>{service.publicLabel}</strong></div><span>{service.status}</span>
                {service.observation ? <small>{(service.observation.availabilityBasisPoints / 100).toFixed(2)}% availability · {service.observation.latencyP95Ms}ms P95</small> : <small>24-hour evidence required</small>}
                {!service.passing ? <em>{service.issues.join(" · ")}</em> : null}
              </article>)}
            </div>
            <div className="readiness-attestations" aria-label="Operational attestations">
              {readiness.attestations.map((item) => <div className={item.passing ? "passing" : "blocked"} key={item.kind}><strong>{item.kind.replaceAll("_", " ")}</strong><span>{item.passing ? "Current" : item.status}</span><small>{item.validUntil ? `Valid until ${new Date(item.validUntil).toLocaleString()}` : "Evidence required"}</small></div>)}
            </div>
            <div className="readiness-authority"><strong>{user.role === "platform_owner" ? "Platform Owner" : user.role === "platform_support" ? "Support operations" : user.role === "platform_ai_operations" ? "AI operations" : "Platform Finance"}</strong><span>{user.role === "platform_owner" ? "Approve deployment only through the reviewed release workflow after this gate is ready."
              : user.role === "platform_support" ? "Keep on-call and support-runbook evidence current; escalate every blocking incident."
                : user.role === "platform_ai_operations" ? "Resolve failing runtime objectives without exposing internal routing to customer surfaces."
                  : "This technical gate does not authorize prices, invoices, tax, or payment collection."}</span><small>Checked {new Date(readiness.asOf).toLocaleString()}</small></div>
          </div> : null}
          {reconciliationStage === "loading" ? <div className="subscription-band reconciliation-band reconciliation-placeholder" aria-live="polite">
            <div><p>Billing operations · restricted</p><h2>Checking usage reconciliation…</h2></div>
            <p className="operational-note">Comparing customer-unit balances with reservation and immutable event evidence.</p>
          </div> : null}
          {reconciliationStage === "error" ? <div className="subscription-band reconciliation-band status-attention reconciliation-placeholder" role="alert">
            <div><p>Billing operations · restricted</p><h2>Usage reconciliation unavailable</h2></div>
            <p className="operational-note">No balance or billing state was changed. Treat the gate as not reconciled until the evidence can be loaded.</p>
            <button type="button" disabled={working} onClick={() => void loadCurrent()}>Retry reconciliation</button>
          </div> : null}
          {reconciliation ? <div className={`subscription-band reconciliation-band status-${reconciliation.status}`}>
            <div className="reconciliation-heading">
              <div><p>Billing operations · restricted</p><h2>Usage reconciliation</h2></div>
              <span className="reconciliation-status" role="status">{reconciliation.status === "healthy" ? "Reconciled" : "Attention required"}</span>
            </div>
            <p className="operational-note">Customer-unit balances are checked against open reservations and immutable settlement events. This is operational evidence only; it does not enable charging or create invoice authority.</p>
            <div className="reconciliation-summary">
              <div><span>Accounts checked</span><strong>{reconciliation.summary.quotaAccounts}</strong><small>{reconciliation.summary.healthyAccounts} reconciled</small></div>
              <div><span>Needs attention</span><strong>{reconciliation.summary.attentionAccounts}</strong><small>balance or event variance</small></div>
              <div><span>Missing current account</span><strong>{reconciliation.summary.activeWithoutCurrentAccount}</strong><small>active subscriptions</small></div>
              <div><span>Unmapped events</span><strong>{reconciliation.summary.orphanUsageEvents}</strong><small>period mapping required</small></div>
              <div><span>Expired reservations</span><strong>{reconciliation.summary.expiredOpenReservations}</strong><small>past-period open records</small></div>
            </div>
            <div className="reconciliation-authority">
              <strong>{user.role === "platform_finance" ? "Finance review" : "Platform Owner review"}</strong>
              <span>{user.role === "platform_finance"
                ? "Read-only evidence. Escalate a variance; never repair immutable usage or quota totals with direct SQL."
                : "Pause rollout expansion when a variance appears and use the documented idempotent recovery workflow."}</span>
              <small>As of {new Date(reconciliation.asOf).toLocaleString()}</small>
            </div>
            <div className="platform-table reconciliation-table" role="table" aria-label="Usage reconciliation accounts">
              {reconciliation.accounts.map((account) => <div className={`platform-row reconciliation-row ${account.status}`} role="row" key={account.quotaAccountId}>
                <div><strong>{account.businessName}</strong><span>{account.publicName} · {account.customerUnit.replaceAll("_", " ")}</span></div>
                <div><strong>{account.accountSettled}</strong><span>settled · {account.accountReserved} reserved</span></div>
                <div><strong>{account.status === "healthy" ? "Reconciled" : "Review"}</strong><span>{account.status === "healthy" ? "No variance" : `Settled ${account.settledVariance} · reserved ${account.reservedVariance} · event ${account.eventVariance}`}</span></div>
                <span>{new Date(account.periodStart).toLocaleDateString()} – {new Date(account.periodEnd).toLocaleDateString()}</span>
              </div>)}
              {!reconciliation.accounts.length ? <p className="empty-row">No quota accounts to reconcile</p> : null}
            </div>
            {reconciliation.summary.quotaAccounts > reconciliation.summary.displayedAccounts ? <small className="reconciliation-limit">Showing the {reconciliation.summary.displayedAccounts} highest-priority accounts. Aggregate checks cover all {reconciliation.summary.quotaAccounts} accounts.</small> : null}
          </div> : null}
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
          {voiceRouting ? <div className={`subscription-band advanced-voice-band mode-${voiceRouting.profiles[0]?.mode || "paused"}`}>
            <div><p>Advanced Voice · restricted</p><h2>Second-Generation route governance</h2></div>
            <p className="operational-note">Provider and model identifiers are visible only to Platform Owner and AI Operations. A route stays unavailable until a different reviewer qualifies it and approves a canary; there is no fallback to First-Generation.</p>
            <div className="voice-control-summary">
              <div><span>Profile</span><strong>Second-Generation</strong><small>voice_gen2</small></div>
              <div><span>Mode</span><strong>{voiceRouting.profiles[0]?.mode || "paused"}</strong><small>{voiceRouting.profiles[0]?.reasonCode.replaceAll("_", " ") || "qualification required"}</small></div>
              <div><span>Admission</span><strong>{voiceRouting.admissionEnabled ? "enabled" : "disabled"}</strong><small>{voiceRouting.admissionEnabled ? "reviewed production traffic" : "fail-closed"}</small></div>
              <div><span>Canary</span><strong>{voiceRouting.profiles[0]?.canaryPercent || 0}%</strong><small>Version {voiceRouting.profiles[0]?.version || 1}</small></div>
            </div>
            <div className="voice-governance-grid">
              <form onSubmit={proposeVoiceCandidate}><h3>1. Propose route</h3><label>Provider key<input name="providerKey" pattern="[a-z0-9][a-z0-9._-]{1,79}" required /></label><label>Model key<input name="modelKey" minLength={2} maxLength={160} required /></label><label>Region key<input name="regionKey" pattern="[a-z0-9][a-z0-9._-]{1,79}" required /></label><button disabled={working} type="submit">Submit candidate</button></form>
              <form onSubmit={reviewVoiceCandidate}><h3>2. Independent qualification</h3><label>Proposed candidate<select name="candidateId" required defaultValue=""><option value="" disabled>Select candidate</option>{voiceRouting.candidates.filter((candidate) => candidate.status === "proposed").map((candidate) => <option key={candidate.id} value={candidate.id} disabled={candidate.proposedByPlatformUserId === user.id}>{candidate.providerKey} / {candidate.modelKey}{candidate.proposedByPlatformUserId === user.id ? " · another reviewer required" : ""}</option>)}</select></label><label>Decision<select name="decision" defaultValue="qualify"><option value="qualify">Qualify</option><option value="reject">Reject</option></select></label><label>Qualification evidence SHA-256<input name="evidenceSha256" pattern="[a-fA-F0-9]{64}" minLength={64} maxLength={64} required /></label><button disabled={working} type="submit">Record review</button></form>
              <form onSubmit={requestVoiceChange}><h3>3. Request canary</h3><label>Qualified candidate<select name="candidateId" required defaultValue=""><option value="" disabled>Select candidate</option>{voiceRouting.candidates.filter((candidate) => candidate.status === "qualified").map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.providerKey} / {candidate.modelKey}</option>)}</select></label><label>Canary percent<input name="canaryPercent" type="number" min={1} max={100} defaultValue={10} required /></label><label>Operational reason<input name="reason" minLength={12} maxLength={500} required /></label><label>Evaluation evidence SHA-256<input name="evidenceSha256" pattern="[a-fA-F0-9]{64}" minLength={64} maxLength={64} required /></label><button disabled={working} type="submit">Request change</button></form>
            </div>
            <label className="voice-reason">Action reason<input value={routingActionReason} minLength={12} maxLength={500} onChange={(event) => setRoutingActionReason(event.target.value)} /></label>
            <div className="platform-table" role="table" aria-label="Advanced Voice routing changes">
              {voiceRouting.changes.map((change) => <div className="platform-row voice-route-row" role="row" key={change.id}><div><strong>{voiceRouting.candidates.find((candidate) => candidate.id === change.candidateId)?.modelKey || change.candidateId}</strong><span>{change.reason} · {change.canaryPercent}% canary</span></div><span>{change.status.replaceAll("_", " ")}</span><div className="row-actions">{change.status === "requested" ? <><button disabled={working || change.requestedByPlatformUserId === user.id} onClick={() => void reviewVoiceChange(change.id, "approve")}>Approve</button><button className="outline-button" disabled={working || change.requestedByPlatformUserId === user.id} onClick={() => void reviewVoiceChange(change.id, "reject")}>Reject</button></> : null}{change.status === "approved" ? <button disabled={working} onClick={() => void applyVoiceChange(change.id, "start_canary")}>Start canary</button> : null}{change.status === "canary" ? <><button disabled={working} onClick={() => void applyVoiceChange(change.id, "promote")}>Promote</button><button className="outline-button" disabled={working} onClick={() => void applyVoiceChange(change.id, "rollback")}>Rollback</button></> : null}{change.status === "active" ? <button className="danger-button" disabled={working} onClick={() => void applyVoiceChange(change.id, "rollback")}>Rollback</button> : null}</div></div>)}
              {!voiceRouting.changes.length ? <p className="empty-row">No routing changes</p> : null}
            </div>
            <div className="voice-governance-grid admission-governance-grid">
              <form onSubmit={requestVoiceAdmission}><h3>4. Production admission</h3><label>Requested state<select name="enabled" defaultValue={voiceRouting.admissionEnabled ? "false" : "true"}><option value="true">Enable production traffic</option><option value="false">Disable production traffic</option></select></label><label>Acceptance reason<input name="reason" minLength={12} maxLength={500} required /></label><label>Acceptance evidence SHA-256<input name="evidenceSha256" pattern="[a-fA-F0-9]{64}" minLength={64} maxLength={64} required /></label><button disabled={working} type="submit">Request admission change</button></form>
              <div className="platform-table" role="table" aria-label="Advanced Voice admission changes">{voiceRouting.admissionChanges.map((change) => <div className="platform-row voice-route-row" role="row" key={change.id}><div><strong>{change.targetEnabled ? "Enable" : "Disable"} admission</strong><span>{change.reason}</span></div><span>{change.status}</span><div className="row-actions">{change.status === "requested" ? <><button disabled={working || change.requestedByPlatformUserId === user.id} onClick={() => void reviewVoiceAdmission(change.id, "approve")}>Approve</button><button className="outline-button" disabled={working || change.requestedByPlatformUserId === user.id} onClick={() => void reviewVoiceAdmission(change.id, "reject")}>Reject</button></> : null}{change.status === "approved" ? <button className={change.targetEnabled ? "danger-button" : undefined} disabled={working} onClick={() => void applyVoiceAdmission(change.id, change.targetEnabled)}>{change.targetEnabled ? "Enable traffic" : "Disable traffic"}</button> : null}</div></div>)}{!voiceRouting.admissionChanges.length ? <p className="empty-row">No admission changes</p> : null}</div>
            </div>
            <form className="incident-open-form" onSubmit={openVoiceIncident}><h3>Open incident</h3><label>Severity<select name="severity" defaultValue="major"><option value="minor">Minor · degraded</option><option value="major">Major · pause</option><option value="critical">Critical · pause</option></select></label><label>Related change<select name="routingChangeId" defaultValue=""><option value="">No related change</option>{voiceRouting.changes.map((change) => <option key={change.id} value={change.id}>{change.status} · {change.reason}</option>)}</select></label><label>Incident reason<input name="reason" minLength={12} maxLength={1000} required /></label><label className="checkbox-label"><input name="creditReviewRequired" type="checkbox" />Credit review required</label><button disabled={working} type="submit">Open and safeguard</button></form>
          </div> : null}
          {voiceIncidents ? <div className="subscription-band incident-band">
            <div><p>Advanced Voice</p><h2>Incident and credit review</h2></div>
            <div className="platform-table" role="table" aria-label="Advanced Voice incidents">{voiceIncidents.map((incident) => <div className="platform-row incident-row" role="row" key={incident.id}><div><strong>{incident.severity} · {incident.status}</strong><span>{incident.reason}</span></div><span>{incident.creditReviewStatus.replaceAll("_", " ")}</span><div className="row-actions">{incident.creditReviewStatus === "required" && ["platform_owner", "platform_finance"].includes(user.role) ? <><button disabled={working || incident.openedByPlatformUserId === user.id} onClick={() => void reviewVoiceCredit(incident.id, "approve")}>Approve credit review</button><button className="outline-button" disabled={working || incident.openedByPlatformUserId === user.id} onClick={() => void reviewVoiceCredit(incident.id, "reject")}>Reject</button></> : null}{incident.status !== "resolved" && ["platform_owner", "platform_ai_operations"].includes(user.role) ? <button disabled={working} onClick={() => void resolveVoiceIncident(incident.id)}>Resolve</button> : null}</div></div>)}{!voiceIncidents.length ? <p className="empty-row">No Advanced Voice incidents</p> : null}</div>
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
