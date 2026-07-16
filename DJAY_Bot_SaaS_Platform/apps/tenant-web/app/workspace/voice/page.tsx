"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { WorkspaceSidebar } from "../WorkspaceSidebar";
import { WorkspacePageLoadError, WorkspaceSessionLoadError } from "../WorkspaceAccess";
import { WorkspaceSupportBanner } from "../WorkspaceSupportBanner";
import { useWorkspaceSession } from "../useWorkspaceSession";

type Playbook = {
  schemaVersion: 1; playbookVersionId: string; businessName: string; agentName: string;
  languages: ("th" | "en")[]; tone: string; salesGoal: string; approvedClaims: string[];
  prohibitedClaims: string[]; discoveryQuestions: string[]; ctaPolicy: string[];
  requiredContactFields: string[]; notificationProfileId?: string;
  greeting: { th: string; en: string }; offlineMessage: { th: string; en: string };
  timezone: string; weeklyWindows: { dayOfWeek: number; startMinute: number; endMinute: number }[];
};
type Deployment = {
  id: string; name: string; keyPrefix: string; allowedOrigins: string[]; defaultLocale: "th" | "en";
  maxCallSeconds: number; reconnectWindowSeconds: number; status: "active" | "disabled" | "revoked";
  agentName: string; businessName: string;
  publicLabel: "First-Generation Voice Engine" | "Second-Generation Voice Engine";
};
type Studio = {
  publicLabel: "First-Generation Voice Engine" | "Second-Generation Voice Engine";
  health: "ready" | "disabled" | "revoked" | "setup_required" | "route_unavailable";
  runtimeAvailability: "available" | "unavailable";
  editable: boolean;
  deployment: Deployment & {
    greetingTh: string; greetingEn: string; automatedDisclosureTh: string; automatedDisclosureEn: string;
    agentId: string; currentPublishedPlaybookVersionId: string | null; currentPublishedVersion: number | null;
    draftRevision: number; definition: Playbook; knowledgeRevisionIds: string[]; draftUpdatedAt: string;
  };
  usage: {
    includedMinutes: number | null; usedMinutes: number; reservedMinutes: number; activeCalls: number;
    concurrencyLimit: number | null; periodStart: string | null; periodEnd: string | null;
  };
  actions: { leadCapture: boolean; appointmentRequest: boolean; merchantEmail: boolean; humanHandover: boolean };
  quality: {
    totalCalls: number; completedCalls: number; failedCalls: number; transcriptTurns: number;
    averageConnectedSeconds: number | null; lastCallAt: string | null;
  };
};
type Analytics = {
  periodDays: number; level: "core" | "advanced"; deploymentId: string | null;
  summary: {
    sessions: number; connectedCalls: number; completedCalls: number; failedCalls: number;
    completedTurns: number; failedTurns: number; leads: number; appointmentRequests: number;
    callbackRequests: number; settledMinutes: number; reconnectingCalls: number;
    averageConnectedSeconds: number | null; averageTurnMilliseconds: number | null;
    p95TurnMilliseconds: number | null;
  };
  outcomes: { outcome: string; calls: number }[];
  languages: { locale: "th" | "en"; calls: number }[];
  terminalReasons: { reason: string; calls: number }[];
  turnFailures: { errorCode: string; turns: number }[];
  daily: { date: string; sessions: number; completedCalls: number; failedCalls: number; leads: number }[];
};
type VoiceResult = { capability: { enabled: true; publicLabel: "First-Generation Voice Engine" | "Second-Generation Voice Engine" } | null; deployments: Deployment[] };
type Knowledge = { id: string; revisionId: string; name: string; sourceKind: string; status: string; version: number };
type Notification = { id: string; name: string; allowedTemplateKeys: string[]; status: string };
type Tab = "voice" | "playbook" | "knowledge" | "entry" | "disclosure" | "transfer" | "actions" | "test" | "quality" | "deploy";

const tabs: { id: Tab; label: string; hint: string }[] = [
  { id: "voice", label: "Voice & Languages", hint: "Identity, language and greeting" },
  { id: "playbook", label: "Sales Playbook", hint: "Goal, discovery and CTA" },
  { id: "knowledge", label: "Knowledge", hint: "Approved revision pins" },
  { id: "entry", label: "Call / Session Entry", hint: "Origin and session limits" },
  { id: "disclosure", label: "Disclosure & Recording", hint: "Consent-safe opening" },
  { id: "transfer", label: "Transfer & Callback", hint: "Human follow-up behavior" },
  { id: "actions", label: "Actions", hint: "Lead and appointment authority" },
  { id: "test", label: "Test Call", hint: "Deployment readiness" },
  { id: "quality", label: "Quality Evaluation", hint: "30-day call evidence" },
  { id: "deploy", label: "Deploy", hint: "Publish, install and control" },
];

function lineList(value: string) { return value.split("\n").map((item) => item.trim()).filter(Boolean); }
function listText(value: string[]) { return value.join("\n"); }
function formatLimit(value: number | null, suffix = "") { return value === null ? "Not configured" : `${value}${suffix}`; }
function formatDuration(seconds: number | null) {
  if (seconds === null) return "—";
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  const minutes = Math.floor(seconds / 60); const remainder = Math.round(seconds % 60);
  return `${minutes}m ${remainder}s`;
}
function formatLatency(milliseconds: number | null) {
  if (milliseconds === null) return "—";
  return milliseconds < 1000 ? `${Math.round(milliseconds)} ms` : `${(milliseconds / 1000).toFixed(1)} sec`;
}
function percent(value: number, total: number) { return total ? `${Math.round((value / total) * 100)}%` : "—"; }
function friendlyMetric(value: string) { return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()); }

export default function VoicePage() {
  const session = useWorkspaceSession();
  const [result, setResult] = useState<VoiceResult>({ capability: null, deployments: [] });
  const [selectedId, setSelectedId] = useState(""); const [studio, setStudio] = useState<Studio | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("voice"); const [knowledge, setKnowledge] = useState<Knowledge[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]); const [deploymentKey, setDeploymentKey] = useState("");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [message, setMessage] = useState(""); const [working, setWorking] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const workspace = useMemo(() => session.workspaces.find((item) => item.tenantId === session.selectedTenantId), [session.workspaces, session.selectedTenantId]);
  const canDeploy = workspace?.role === "tenant_master_admin" || workspace?.role === "tenant_admin";
  const canEdit = Boolean(canDeploy && studio?.editable && studio.deployment.status !== "revoked");
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_APP_URL || "https://api.djaybot.com";
  const installSnippet = deploymentKey ? `<script type="module">\n  import { mountVoiceWidget } from "https://cdn.djaybot.com/voice/v1/index.js";\n  mountVoiceWidget({ deploymentKey: "${deploymentKey}", apiBaseUrl: "${apiBaseUrl}" });\n</script>` : "";

  async function loadStudio(id: string) {
    if (!id) { setStudio(null); setAnalytics(null); return; }
    const [studioResponse, knowledgeResponse, notificationResponse, analyticsResponse] = await Promise.all([
      fetch(`/tenant/voice/deployments/${id}/studio`, { cache: "no-store" }),
      fetch("/tenant/knowledge", { cache: "no-store" }),
      fetch("/tenant/ai-chat/notifications", { cache: "no-store" }),
      fetch(`/tenant/voice/analytics?deploymentId=${encodeURIComponent(id)}&days=30`, { cache: "no-store" }),
    ]);
    if (!studioResponse.ok) throw new Error("voice_studio_unavailable");
    setStudio((await studioResponse.json()).studio);
    if (knowledgeResponse.ok) setKnowledge((await knowledgeResponse.json()).sources || []);
    if (notificationResponse.ok) setNotifications((await notificationResponse.json()).notifications || []);
    if (analyticsResponse.ok) setAnalytics((await analyticsResponse.json()).analytics || null);
    else setAnalytics(null);
  }

  async function load(preferredId?: string) {
    try {
      const response = await fetch("/tenant/voice/deployments", { cache: "no-store" });
      if (!response.ok) throw new Error("voice_unavailable");
      const next = await response.json() as VoiceResult; setResult(next);
      const id = preferredId && next.deployments.some((item) => item.id === preferredId)
        ? preferredId : selectedId && next.deployments.some((item) => item.id === selectedId)
          ? selectedId : next.deployments[0]?.id || "";
      setSelectedId(id); await loadStudio(id); setLoadError(false);
    } catch { setLoadError(true); }
  }
  useEffect(() => { if (session.selectedTenantId) void load(); }, [session.selectedTenantId]);

  function patchDeployment(patch: Partial<Studio["deployment"]>) {
    setStudio((current) => current ? { ...current, deployment: { ...current.deployment, ...patch } } : current);
  }
  function patchDefinition(patch: Partial<Playbook>) {
    setStudio((current) => current ? {
      ...current, deployment: { ...current.deployment, definition: { ...current.deployment.definition, ...patch } },
    } : current);
  }
  function setNotificationProfile(value: string) {
    setStudio((current) => {
      if (!current) return current;
      const { notificationProfileId: _currentProfile, ...definition } = current.deployment.definition;
      return {
        ...current,
        deployment: {
          ...current.deployment,
          definition: value ? { ...definition, notificationProfileId: value } : definition,
        },
      };
    });
  }

  async function saveStudio() {
    if (!studio || !canEdit) return;
    for (const origin of studio.deployment.allowedOrigins) {
      try {
        const parsed = new URL(origin);
        if (parsed.origin !== origin || (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1")) throw new Error();
      } catch { setMessage("Every website entry must be an exact HTTPS origin without a path, query, or fragment."); return; }
    }
    setWorking(true); setMessage("");
    const response = await fetch(`/tenant/voice/deployments/${studio.deployment.id}/studio`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        revision: studio.deployment.draftRevision, name: studio.deployment.name,
        agentName: studio.deployment.agentName, businessName: studio.deployment.definition.businessName,
        defaultLocale: studio.deployment.defaultLocale, allowedOrigins: studio.deployment.allowedOrigins,
        greetingTh: studio.deployment.greetingTh, greetingEn: studio.deployment.greetingEn,
        automatedDisclosureTh: studio.deployment.automatedDisclosureTh,
        automatedDisclosureEn: studio.deployment.automatedDisclosureEn,
        maxCallSeconds: studio.deployment.maxCallSeconds,
        reconnectWindowSeconds: studio.deployment.reconnectWindowSeconds,
        definition: studio.deployment.definition,
        knowledgeRevisionIds: studio.deployment.knowledgeRevisionIds,
      }),
    });
    const body = await response.json(); setWorking(false);
    if (!response.ok) {
      setMessage(body.status === "conflict" ? "This draft changed elsewhere. Reloaded the latest revision; review before saving again."
        : body.status === "not_entitled" ? "Voice editing is unavailable under the current subscription state."
          : "Voice Studio changes could not be saved.");
      await loadStudio(studio.deployment.id); return;
    }
    setMessage("Draft saved. Active calls remain pinned to their original published version.");
    await load(studio.deployment.id);
  }

  async function publish() {
    if (!studio || !canEdit) return;
    setWorking(true); setMessage("");
    const response = await fetch(`/tenant/voice/deployments/${studio.deployment.id}/studio`, { method: "POST" });
    const body = await response.json(); setWorking(false);
    setMessage(response.ok ? `Published immutable Voice playbook version ${body.version}. New sessions will use it.`
      : "The Voice playbook could not be published. Save and validate the draft first.");
    await load(studio.deployment.id);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    setWorking(true); setMessage(""); setDeploymentKey("");
    const origin = String(data.get("origin") || "");
    try {
      const parsed = new URL(origin);
      if (parsed.origin !== origin || (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1")) throw new Error();
    } catch { setWorking(false); setMessage("Enter an exact HTTPS origin without a path, query, or fragment."); return; }
    const response = await fetch("/tenant/voice/deployments", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: data.get("name"), agentName: data.get("agentName"), businessName: data.get("businessName"),
        allowedOrigins: [origin], defaultLocale: data.get("defaultLocale"),
        greetingTh: data.get("greetingTh"), greetingEn: data.get("greetingEn"),
        automatedDisclosureTh: data.get("automatedDisclosureTh"), automatedDisclosureEn: data.get("automatedDisclosureEn"),
        maxCallSeconds: Number(data.get("maxCallSeconds")), reconnectWindowSeconds: Number(data.get("reconnectWindowSeconds")),
      }),
    });
    const body = await response.json(); setWorking(false);
    if (!response.ok) { setMessage(response.status === 403 ? "An active Voice Agent subscription is required for this workspace." : "Deployment could not be created."); return; }
    setDeploymentKey(body.deploymentKey); setMessage("Deployment created. Copy its key now; it will not be shown again.");
    form.reset(); setActiveTab("deploy"); await load(body.deploymentId);
  }

  async function changeStatus(deploymentId: string, action: "enable" | "disable" | "revoke") {
    if (action === "revoke" && !window.confirm("Revoke this deployment permanently? This cannot be undone and the key will stop working immediately.")) return;
    setWorking(true); setMessage("");
    const response = await fetch(`/tenant/voice/deployments/${deploymentId}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }),
    });
    setWorking(false); setMessage(response.ok ? `Deployment ${action} request completed.` : "Deployment state could not be changed.");
    await load(deploymentId);
  }

  const saveBar = canEdit ? <div className="studio-save-bar"><span>Draft revision {studio?.deployment.draftRevision}</span><button type="button" disabled={working} onClick={() => void saveStudio()}>{working ? "Saving…" : "Save draft"}</button></div> : null;
  if (session.error) return <WorkspaceSessionLoadError onRetry={() => window.location.reload()} />;
  if (session.loading || !session.selectedTenantId) return <main className="workspace-loading">Loading Voice Studio...</main>;
  if (loadError) return <WorkspacePageLoadError active="voice" title="Voice Agent Studio" resource="Voice Agent Studio" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} onRetry={() => void load()} />;
  return <main className="workspace-shell">
    <WorkspaceSidebar active="voice" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} />
    <section className="workspace-main"><WorkspaceSupportBanner tenantId={session.selectedTenantId} />
      <header className="workspace-header voice-studio-header"><div><p>Voice Agent Studio</p><h1>{studio?.deployment.agentName || (result.capability?.publicLabel === "Second-Generation Voice Engine" ? "Voice Agent Advanced" : "Voice Agent Basic")}</h1></div><div className="voice-header-state"><span className="generation-pill">{studio?.publicLabel || result.capability?.publicLabel || "Unavailable"}</span>{studio ? <span className={`health-pill health-${studio.health}`}>{studio.health.replaceAll("_", " ")}</span> : null}</div></header>
      {studio ? <>
        {studio.publicLabel === "Second-Generation Voice Engine" && studio.runtimeAvailability === "unavailable" ? <div className="voice-availability-notice" role="status"><strong>Second-Generation activation is pending internal route qualification.</strong><span>The deployment can be prepared now, but calls return neutral unavailability until a reviewed Gen2 route is active. It will never fall back to First-Generation.</span></div> : null}
        <section className="voice-summary-band" aria-label="Voice Agent summary">
          <label>Agent<select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setMessage(""); void loadStudio(event.target.value); }}>{result.deployments.map((item) => <option key={item.id} value={item.id}>{item.agentName} · {item.name}</option>)}</select></label>
          <div><strong>{studio.usage.usedMinutes}</strong><span>Minutes used</span><small>{formatLimit(studio.usage.includedMinutes, " included")}</small></div>
          <div><strong>{studio.usage.activeCalls}</strong><span>Active calls</span><small>{formatLimit(studio.usage.concurrencyLimit, " concurrent")}</small></div>
          <div><strong>v{studio.deployment.currentPublishedVersion || "—"}</strong><span>Published playbook</span><small>{studio.deployment.status}</small></div>
        </section>
        <nav className="voice-studio-tabs" aria-label="Voice Agent Studio sections">{tabs.map((tab) => <button type="button" role="tab" aria-selected={activeTab === tab.id} className={activeTab === tab.id ? "selected" : ""} key={tab.id} onClick={() => { setActiveTab(tab.id); setMessage(""); }}><strong>{tab.label}</strong><span>{tab.hint}</span></button>)}</nav>
        {message ? <p className="studio-message" role="status">{message}</p> : null}

        {activeTab === "voice" ? <section className="tool-band studio-panel"><div className="band-heading"><div><p>Identity and conversation opening</p><h2>Voice & Languages</h2></div><span>English + Thai</span></div><div className="studio-form-grid">
          <label>Public agent name<input disabled={!canEdit} value={studio.deployment.agentName} onChange={(event) => patchDeployment({ agentName: event.target.value })} /></label>
          <label>Default language<select disabled={!canEdit} value={studio.deployment.defaultLocale} onChange={(event) => patchDeployment({ defaultLocale: event.target.value as "th" | "en" })}><option value="en">English</option><option value="th">Thai</option></select></label>
          <label className="wide-field">English greeting<textarea disabled={!canEdit} rows={3} value={studio.deployment.greetingEn} onChange={(event) => { patchDeployment({ greetingEn: event.target.value }); patchDefinition({ greeting: { ...studio.deployment.definition.greeting, en: event.target.value } }); }} /></label>
          <label className="wide-field">Thai greeting<textarea disabled={!canEdit} rows={3} value={studio.deployment.greetingTh} onChange={(event) => { patchDeployment({ greetingTh: event.target.value }); patchDefinition({ greeting: { ...studio.deployment.definition.greeting, th: event.target.value } }); }} /></label>
        </div>{saveBar}</section> : null}

        {activeTab === "playbook" ? <section className="tool-band studio-panel"><div className="band-heading"><div><p>Published sales behavior</p><h2>Sales Playbook</h2></div><span>Immutable on publish</span></div><div className="studio-form-grid">
          <label>Business name<input disabled={!canEdit} value={studio.deployment.definition.businessName} onChange={(event) => patchDefinition({ businessName: event.target.value })} /></label>
          <label>Timezone<input disabled={!canEdit} value={studio.deployment.definition.timezone} onChange={(event) => patchDefinition({ timezone: event.target.value })} /></label>
          <label className="wide-field">Tone<input disabled={!canEdit} value={studio.deployment.definition.tone} onChange={(event) => patchDefinition({ tone: event.target.value })} /></label>
          <label className="wide-field">Sales goal<textarea disabled={!canEdit} rows={3} value={studio.deployment.definition.salesGoal} onChange={(event) => patchDefinition({ salesGoal: event.target.value })} /></label>
          <label>Discovery questions <small>One per line</small><textarea disabled={!canEdit} rows={7} value={listText(studio.deployment.definition.discoveryQuestions)} onChange={(event) => patchDefinition({ discoveryQuestions: lineList(event.target.value) })} /></label>
          <label>CTA policy <small>One approved instruction per line</small><textarea disabled={!canEdit} rows={7} value={listText(studio.deployment.definition.ctaPolicy)} onChange={(event) => patchDefinition({ ctaPolicy: lineList(event.target.value) })} /></label>
          <label>Approved claims <small>Leave empty until verified</small><textarea disabled={!canEdit} rows={6} value={listText(studio.deployment.definition.approvedClaims)} onChange={(event) => patchDefinition({ approvedClaims: lineList(event.target.value) })} /></label>
          <label>Prohibited claims <small>One guardrail per line</small><textarea disabled={!canEdit} rows={6} value={listText(studio.deployment.definition.prohibitedClaims)} onChange={(event) => patchDefinition({ prohibitedClaims: lineList(event.target.value) })} /></label>
          <label className="wide-field">Required contact fields <small>One field per line</small><textarea disabled={!canEdit} rows={3} value={listText(studio.deployment.definition.requiredContactFields)} onChange={(event) => patchDefinition({ requiredContactFields: lineList(event.target.value) })} /></label>
        </div>{saveBar}</section> : null}

        {activeTab === "knowledge" ? <section className="tool-band studio-panel"><div className="band-heading"><div><p>Grounded business facts</p><h2>Knowledge</h2></div><span>{studio.deployment.knowledgeRevisionIds.length} pinned</span></div><p className="control-copy">Only selected ready revisions are copied into the next immutable playbook. Existing calls remain pinned to their original knowledge.</p><div className="knowledge-picker studio-knowledge">{knowledge.map((source) => <label key={source.revisionId}><input type="checkbox" disabled={!canEdit || source.status !== "ready"} checked={studio.deployment.knowledgeRevisionIds.includes(source.revisionId)} onChange={(event) => patchDeployment({ knowledgeRevisionIds: event.target.checked ? [...studio.deployment.knowledgeRevisionIds, source.revisionId] : studio.deployment.knowledgeRevisionIds.filter((id) => id !== source.revisionId) })} /><span>{source.name}</span><small>{source.sourceKind} · v{source.version} · {source.status}</small></label>)}{!knowledge.length ? <div className="pending-line"><strong>No approved knowledge</strong><span>Add a source in Knowledge & Sales Setup.</span></div> : null}</div><a className="secondary-link studio-link" href="/workspace/knowledge">Open Knowledge & Sales Setup</a>{saveBar}</section> : null}

        {activeTab === "entry" ? <section className="tool-band studio-panel"><div className="band-heading"><div><p>Browser admission boundary</p><h2>Call / Session Entry</h2></div><span>{studio.deployment.allowedOrigins.length} origins</span></div><div className="studio-form-grid">
          <label>Deployment name<input disabled={!canEdit} value={studio.deployment.name} onChange={(event) => patchDeployment({ name: event.target.value })} /></label>
          <label>Maximum call seconds<input disabled={!canEdit} type="number" min={30} max={14400} value={studio.deployment.maxCallSeconds} onChange={(event) => patchDeployment({ maxCallSeconds: Number(event.target.value) })} /></label>
          <label>Reconnect window seconds<input disabled={!canEdit} type="number" min={0} max={300} value={studio.deployment.reconnectWindowSeconds} onChange={(event) => patchDeployment({ reconnectWindowSeconds: Number(event.target.value) })} /></label>
          <label className="wide-field">Allowed website origins <small>Exact HTTPS origins, one per line</small><textarea disabled={!canEdit} rows={5} value={listText(studio.deployment.allowedOrigins)} onChange={(event) => patchDeployment({ allowedOrigins: lineList(event.target.value) })} /></label>
        </div>{saveBar}</section> : null}

        {activeTab === "disclosure" ? <section className="tool-band studio-panel"><div className="band-heading"><div><p>Mandatory opening policy</p><h2>Disclosure & Recording</h2></div><span>Recording off</span></div><div className="policy-callout"><strong>Automated-agent disclosure is required before ordinary assistant speech.</strong><span>Recording remains disabled until consent, jurisdiction, retention, erasure, and legal review are configured and accepted.</span></div><div className="studio-form-grid">
          <label className="wide-field">English automated-agent disclosure<textarea disabled={!canEdit} rows={3} value={studio.deployment.automatedDisclosureEn} onChange={(event) => patchDeployment({ automatedDisclosureEn: event.target.value })} /></label>
          <label className="wide-field">Thai automated-agent disclosure<textarea disabled={!canEdit} rows={3} value={studio.deployment.automatedDisclosureTh} onChange={(event) => patchDeployment({ automatedDisclosureTh: event.target.value })} /></label>
        </div>{saveBar}</section> : null}

        {activeTab === "transfer" ? <section className="tool-band studio-panel"><div className="band-heading"><div><p>Graceful escalation</p><h2>Transfer & Callback</h2></div><span>{studio.actions.humanHandover ? "Enabled" : "Unavailable"}</span></div><div className="policy-callout"><strong>Human handover changes the shared conversation to human mode.</strong><span>Callback intent is captured as an authorized follow-up with customer-provided contact details and time preference. The agent never promises an unconfirmed appointment.</span></div><div className="studio-form-grid">
          <label>English follow-up message<textarea disabled={!canEdit} rows={4} value={studio.deployment.definition.offlineMessage.en} onChange={(event) => patchDefinition({ offlineMessage: { ...studio.deployment.definition.offlineMessage, en: event.target.value } })} /></label>
          <label>Thai follow-up message<textarea disabled={!canEdit} rows={4} value={studio.deployment.definition.offlineMessage.th} onChange={(event) => patchDefinition({ offlineMessage: { ...studio.deployment.definition.offlineMessage, th: event.target.value } })} /></label>
        </div>{saveBar}</section> : null}

        {activeTab === "actions" ? <section className="tool-band studio-panel"><div className="band-heading"><div><p>Current entitlement authority</p><h2>Actions</h2></div><span>Validated at commit time</span></div><div className="action-authority-grid">
          <div><strong>Lead & sales facts</strong><span>{studio.actions.leadCapture ? "Available" : "Not included"}</span></div>
          <div><strong>Appointment request</strong><span>{studio.actions.appointmentRequest ? "Available" : "Not included"}</span></div>
          <div><strong>Human handover</strong><span>{studio.actions.humanHandover ? "Available" : "Not included"}</span></div>
          <div><strong>Merchant email</strong><span>{studio.actions.merchantEmail ? "Available" : "Not included"}</span></div>
        </div><label className="studio-select-field">Qualified-lead email profile<select disabled={!canEdit || !studio.actions.merchantEmail} value={studio.deployment.definition.notificationProfileId || ""} onChange={(event) => setNotificationProfile(event.target.value)}><option value="">No email action</option>{notifications.filter((item) => item.status === "active").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><p className="control-copy">Every action is revalidated against the active subscription and allow-list inside the same database transaction as the transcript response.</p>{saveBar}</section> : null}

        {activeTab === "test" ? <section className="tool-band studio-panel"><div className="band-heading"><div><p>Safe preflight</p><h2>Test Call</h2></div><span>{studio.health === "ready" ? "Ready on approved origin" : "Action required"}</span></div><div className="readiness-list">
          <div><strong>Published playbook</strong><span>{studio.deployment.currentPublishedVersion ? `Version ${studio.deployment.currentPublishedVersion}` : "Publish required"}</span></div>
          <div><strong>Browser origin</strong><span>{studio.deployment.allowedOrigins.join(", ")}</span></div>
          <div><strong>Voice engine availability</strong><span>{studio.runtimeAvailability === "available" ? "Available" : "Pending internal activation"}</span></div>
          <div><strong>Audio contract</strong><span>Microphone permission · PCM16 · interruption enabled</span></div>
          <div><strong>Runtime policy</strong><span>Disclosure first · recording off · bounded reconnect</span></div>
        </div><p className="control-copy">Run the installed widget on an approved origin. Test sessions consume reserved minutes and create real transcript/action evidence; use staging contact details only.</p></section> : null}

        {activeTab === "quality" ? <section className="tool-band studio-panel"><div className="band-heading"><div><p>Last {analytics?.periodDays || 30} days</p><h2>Quality Evaluation</h2></div><div className="analytics-heading-actions"><span>{analytics?.level === "advanced" ? "Advanced analytics" : "Core analytics"}</span>{analytics ? <a className="secondary-link" href={`/tenant/voice/analytics?deploymentId=${encodeURIComponent(studio.deployment.id)}&days=${analytics.periodDays}&format=csv`}>Export CSV</a> : null}</div></div>
          {analytics ? <><div className="quality-grid quality-grid-primary">
            <div><strong>{analytics.summary.sessions}</strong><span>Sessions</span></div><div><strong>{analytics.summary.completedCalls}</strong><span>Completed</span></div><div><strong>{analytics.summary.failedCalls}</strong><span>Failed / expired</span></div><div><strong>{analytics.summary.completedTurns}</strong><span>Grounded turns</span></div><div><strong>{analytics.summary.leads}</strong><span>Leads captured</span></div><div><strong>{analytics.summary.appointmentRequests}</strong><span>Appointment requests</span></div>
          </div><div className="quality-grid quality-grid-secondary">
            <div><strong>{percent(analytics.summary.completedCalls, analytics.summary.connectedCalls)}</strong><span>Completion rate</span></div><div><strong>{formatDuration(analytics.summary.averageConnectedSeconds)}</strong><span>Average connected time</span></div><div><strong>{formatLatency(analytics.summary.averageTurnMilliseconds)}</strong><span>Average turn response</span></div><div><strong>{analytics.level === "advanced" ? formatLatency(analytics.summary.p95TurnMilliseconds) : "Advanced"}</strong><span>95th percentile response</span></div><div><strong>{analytics.summary.reconnectingCalls}</strong><span>Calls reconnected</span></div><div><strong>{analytics.summary.settledMinutes}</strong><span>Settled minutes</span></div>
          </div></> : <div className="pending-line"><strong>Analytics are temporarily unavailable</strong><span>Call records remain intact. Reload this page to try again.</span></div>}
          {analytics?.level === "advanced" ? <div className="voice-analytics-breakdowns">
            <section><h3>Sales outcomes</h3>{analytics.outcomes.length ? analytics.outcomes.map((item) => <div key={item.outcome}><span>{friendlyMetric(item.outcome)}</span><strong>{item.calls}</strong></div>) : <p>No classified outcomes yet.</p>}</section>
            <section><h3>Language mix</h3>{analytics.languages.length ? analytics.languages.map((item) => <div key={item.locale}><span>{item.locale === "th" ? "Thai" : "English"}</span><strong>{item.calls}</strong></div>) : <p>No sessions yet.</p>}</section>
            <section><h3>Terminal reasons</h3>{analytics.terminalReasons.length ? analytics.terminalReasons.map((item) => <div key={item.reason}><span>{friendlyMetric(item.reason)}</span><strong>{item.calls}</strong></div>) : <p>No terminal calls yet.</p>}</section>
            <section><h3>Turn failures</h3>{analytics.turnFailures.length ? analytics.turnFailures.map((item) => <div key={item.errorCode}><span>{friendlyMetric(item.errorCode)}</span><strong>{item.turns}</strong></div>) : <p>No failed turns.</p>}</section>
          </div> : null}
          {analytics?.level === "advanced" ? <div className="voice-analytics-trend"><div className="analytics-subheading"><div><p>UTC calendar days</p><h3>Recent call trend</h3></div><span>Last 14 days shown · full period in CSV</span></div><div className="data-table"><div className="data-row voice-trend-heading"><strong>Date</strong><span>Sessions</span><span>Completed / failed</span><span>Leads</span></div>{analytics.daily.slice(-14).map((item) => <div className="data-row voice-trend-row" key={item.date}><strong>{new Date(`${item.date}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}</strong><span>{item.sessions}</span><span>{item.completedCalls} / {item.failedCalls}</span><span>{item.leads}</span></div>)}</div></div> : null}
          <div className="policy-callout"><strong>Operational analytics do not replace the production quality gate.</strong><span>English and Thai recognition, latency, interruption, silence, noise, reconnect, callback, and handover still require restricted staging evaluation against approved thresholds.</span></div>{studio.quality.lastCallAt ? <p className="control-copy">Last session: {new Date(studio.quality.lastCallAt).toLocaleString()}</p> : null}</section> : null}

        {activeTab === "deploy" ? <section className="tool-band studio-panel"><div className="band-heading"><div><p>Immutable release and browser install</p><h2>Deploy</h2></div><span>{studio.deployment.status}</span></div><div className="deploy-command-row"><button type="button" disabled={!canEdit || working} onClick={() => void publish()}>Publish immutable version</button>{canDeploy && studio.deployment.status !== "revoked" ? <><button type="button" className="secondary-command" disabled={working} onClick={() => void changeStatus(studio.deployment.id, studio.deployment.status === "active" ? "disable" : "enable")}>{studio.deployment.status === "active" ? "Disable deployment" : "Enable deployment"}</button><button type="button" className="secondary-command danger-command" disabled={working} onClick={() => void changeStatus(studio.deployment.id, "revoke")}>Revoke permanently</button></> : null}</div><div className="deployment-identity"><strong>Safe deployment key prefix</strong><code>{studio.deployment.keyPrefix}…</code><span>The full key is never stored or displayed again.</span></div>
          {deploymentKey ? <div className="deployment-secret"><strong>One-time Voice deployment key and install snippet</strong><code>{deploymentKey}</code><p className="field-help">Add this snippet only to the approved website origin.</p><pre>{installSnippet}</pre><button type="button" className="secondary-command" onClick={() => { if (!navigator.clipboard) { setMessage("Select the snippet and copy it manually."); return; } void navigator.clipboard.writeText(installSnippet).then(() => setMessage("Install snippet copied."), () => setMessage("Copy was blocked. Select the snippet and copy it manually.")); }}>Copy install snippet</button></div> : null}
          {canDeploy && result.capability ? <details className="advanced-definition create-voice-deployment"><summary>Create another Voice Agent deployment</summary><form className="voice-deploy" onSubmit={create}>
            <label>Deployment name<input name="name" minLength={2} maxLength={160} required /></label><label>Business name<input name="businessName" minLength={2} maxLength={200} required /></label><label>Voice agent name<input name="agentName" minLength={2} maxLength={100} required /></label><label>Allowed website origin<input name="origin" type="url" placeholder="https://www.example.com" required /></label><label>Default language<select name="defaultLocale" defaultValue="en"><option value="en">English</option><option value="th">Thai</option></select></label><label>English greeting<input name="greetingEn" defaultValue="Hello, how can I help?" maxLength={1000} required /></label><label>Thai greeting<input name="greetingTh" defaultValue="สวัสดีครับ มีอะไรให้ช่วยได้บ้าง?" maxLength={1000} required /></label><label>English disclosure<input name="automatedDisclosureEn" defaultValue="This is our automated voice assistant." minLength={8} maxLength={500} required /></label><label>Thai disclosure<input name="automatedDisclosureTh" defaultValue="นี่คือผู้ช่วยเสียงอัตโนมัติของเรา" minLength={8} maxLength={500} required /></label><label>Maximum call seconds<input name="maxCallSeconds" type="number" min={30} max={14400} defaultValue={900} required /></label><label>Reconnect window seconds<input name="reconnectWindowSeconds" type="number" min={0} max={300} defaultValue={30} required /></label><button disabled={working}>Create deployment</button>
          </form></details> : null}
        </section> : null}
      </> : <section className="tool-band"><div className="band-heading"><div><p>Voice Agent Studio</p><h2>No Voice deployment</h2></div></div><p className="control-copy">{result.capability ? `Create the first exact-origin ${result.capability.publicLabel} deployment to open the Studio.` : "Voice Agent is not active for this workspace."}</p>{canDeploy && result.capability ? <form className="voice-deploy first-voice-deploy" onSubmit={create}><label>Deployment name<input name="name" minLength={2} maxLength={160} required /></label><label>Business name<input name="businessName" minLength={2} maxLength={200} required /></label><label>Voice agent name<input name="agentName" minLength={2} maxLength={100} required /></label><label>Allowed website origin<input name="origin" type="url" placeholder="https://www.example.com" required /></label><label>Default language<select name="defaultLocale" defaultValue="en"><option value="en">English</option><option value="th">Thai</option></select></label><label>English greeting<input name="greetingEn" defaultValue="Hello, how can I help?" required /></label><label>Thai greeting<input name="greetingTh" defaultValue="สวัสดีครับ มีอะไรให้ช่วยได้บ้าง?" required /></label><label>English disclosure<input name="automatedDisclosureEn" defaultValue="This is our automated voice assistant." minLength={8} required /></label><label>Thai disclosure<input name="automatedDisclosureTh" defaultValue="นี่คือผู้ช่วยเสียงอัตโนมัติของเรา" minLength={8} required /></label><label>Maximum call seconds<input name="maxCallSeconds" type="number" min={30} max={14400} defaultValue={900} required /></label><label>Reconnect window seconds<input name="reconnectWindowSeconds" type="number" min={0} max={300} defaultValue={30} required /></label><button disabled={working}>Create deployment</button></form> : null}</section>}
    </section>
  </main>;
}
