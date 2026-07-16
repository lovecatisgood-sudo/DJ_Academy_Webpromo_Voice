"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { safeMutationFetch } from "@djay/shared";
import { WorkspaceSidebar } from "../WorkspaceSidebar";
import { WorkspacePageLoadError, WorkspaceSessionLoadError } from "../WorkspaceAccess";
import { WorkspaceSupportBanner } from "../WorkspaceSupportBanner";
import { useWorkspaceSession } from "../useWorkspaceSession";
import { FlowVisualEditor } from "./FlowVisualEditor";

type Bot = { id: string; name: string; status: string; defaultLanguage: "th" | "en"; currentPublishedVersionId: string | null; draftRevision: number; deploymentCount: number };
type Capabilities = { planKey: "flowbot_basic" | "flowbot_premium"; accessMode: string; advancedNodes: boolean; approvedWebhooks: boolean; teamRouting: boolean; brandingRemoval: boolean; limits: { activeBots: number | null; nodesPerBot: number | null; deployments: number | null } };
type Draft = { revision: number; definition: Record<string, unknown>; updatedAt: string };
type Version = { id: string; version: number; sourceVersionId: string | null; publishedAt: string };
type Deployment = { id: string; name: string; keyPrefix: string; status: string; allowedOrigins: string[]; createdAt: string };
type Analytics = { periodDays: number; level: "core" | "advanced"; executions: number; completed: number; handovers: number; leads: number; messages: number };
type InstallCheck = { id: string; deploymentId: string; targetOrigin: string; status: string; safeResultCode: string | null; createdAt: string };
type TeamMember = { membership_id: string; display_name: string; membership_status: string };
type DowngradePreflight = { allowed: boolean; blockers: { code: string; detail?: string }[]; remediation: { action: string }[] };
type NotificationProfile = { id: string; name: string; allowedTemplateKeys: string[]; status: "active" | "disabled"; createdAt: string };

function greetingTemplate() {
  const root = crypto.randomUUID(); const end = crypto.randomUUID(); const flowVersionId = crypto.randomUUID();
  return { schemaVersion: 1, flowVersionId, rootNodeId: root, keywords: [], nodes: {
    [root]: { id: root, type: "message", title: "Welcome", content: { th: "สวัสดีครับ ยินดีให้บริการ", en: "Welcome. How can we help?" }, nextNodeId: end },
    [end]: { id: end, type: "end", title: "Complete", message: { th: "ขอบคุณครับ", en: "Thank you." } },
  } };
}

function leadTemplate() {
  const root = crypto.randomUUID(); const form = crypto.randomUUID(); const end = crypto.randomUUID(); const flowVersionId = crypto.randomUUID();
  return { schemaVersion: 1, flowVersionId, rootNodeId: root, keywords: [], nodes: {
    [root]: { id: root, type: "message", title: "Welcome", content: { th: "ฝากข้อมูลไว้ แล้วทีมงานจะติดต่อกลับ", en: "Leave your details and our team will contact you." }, nextNodeId: form },
    [form]: { id: form, type: "form", title: "Contact details", prompt: { th: "ข้อมูลติดต่อ", en: "Contact details" }, fields: [
      { key: "name", label: { th: "ชื่อ", en: "Name" }, type: "text", required: true },
      { key: "phone", label: { th: "เบอร์โทร", en: "Phone" }, type: "phone", required: false },
      { key: "email", label: { th: "อีเมล", en: "Email" }, type: "email", required: true },
    ], nextNodeId: end },
    [end]: { id: end, type: "end", title: "Complete", message: { th: "รับข้อมูลแล้ว ขอบคุณครับ", en: "Your details have been received. Thank you." } },
  } };
}

function premiumTemplate() {
  const root = crypto.randomUUID(); const wait = crypto.randomUUID(); const end = crypto.randomUUID(); const flowVersionId = crypto.randomUUID();
  return { schemaVersion: 1, flowVersionId, rootNodeId: root, keywords: [], nodes: {
    [root]: { id: root, type: "message", title: "Welcome", content: { th: "เราจะติดตามให้ในอีกสักครู่", en: "We will follow up shortly." }, nextNodeId: wait },
    [wait]: { id: wait, type: "delay", title: "Follow-up delay", delaySeconds: 300, nextNodeId: end },
    [end]: { id: end, type: "end", title: "Complete", message: { th: "ขอบคุณที่รอครับ", en: "Thank you for waiting." } },
  } };
}

export default function FlowBotPage() {
  const session = useWorkspaceSession(); const [bots, setBots] = useState<Bot[]>([]); const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [selectedBotId, setSelectedBotId] = useState(""); const [draft, setDraft] = useState<Draft | null>(null); const [definitionText, setDefinitionText] = useState("");
  const [versions, setVersions] = useState<Version[]>([]); const [deployments, setDeployments] = useState<Deployment[]>([]); const [message, setMessage] = useState(""); const [working, setWorking] = useState(false); const [newDeploymentKey, setNewDeploymentKey] = useState("");
  const [analytics, setAnalytics] = useState<Analytics | null>(null); const [installChecks, setInstallChecks] = useState<InstallCheck[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]); const [preflight, setPreflight] = useState<DowngradePreflight | null>(null);
  const [notifications, setNotifications] = useState<NotificationProfile[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [analyticsLoadError, setAnalyticsLoadError] = useState(false); const [installChecksLoadError, setInstallChecksLoadError] = useState(false);
  const [teamLoadError, setTeamLoadError] = useState(false); const [preflightLoadError, setPreflightLoadError] = useState(false);
  const [notificationsLoadError, setNotificationsLoadError] = useState(false);
  const workspace = useMemo(() => session.workspaces.find((item) => item.tenantId === session.selectedTenantId), [session]);
  const canAuthor = workspace?.role === "tenant_master_admin" || workspace?.role === "tenant_admin";
  const selectedBot = bots.find((bot) => bot.id === selectedBotId);

  async function loadBots() {
    try {
      const response = await fetch("/tenant/flowbot/bots", { cache: "no-store" }); if (!response.ok) throw new Error("flowbot_unavailable");
      const result = await response.json(); const nextBots = result.bots || []; setBots(nextBots); setCapabilities(result.capabilities || null);
      setSelectedBotId((current) => current && nextBots.some((bot: Bot) => bot.id === current) ? current : nextBots[0]?.id || ""); setLoadError(false);
    } catch { setLoadError(true); }
  }
  async function loadBot(botId: string) {
    if (!botId) { setDraft(null); setVersions([]); setDeployments([]); return; }
    try {
      const [draftResponse, versionResponse, deploymentResponse] = await Promise.all([
        fetch(`/tenant/flowbot/bots/${botId}/draft`, { cache: "no-store" }), fetch(`/tenant/flowbot/bots/${botId}/versions`, { cache: "no-store" }), fetch(`/tenant/flowbot/bots/${botId}/deployments`, { cache: "no-store" }),
      ]);
      if (!draftResponse.ok || !versionResponse.ok || !deploymentResponse.ok) throw new Error("flowbot_detail_unavailable");
      const value = (await draftResponse.json()).draft as Draft; setDraft(value); setDefinitionText(JSON.stringify(value.definition, null, 2));
      setVersions((await versionResponse.json()).versions || []);
      setDeployments((await deploymentResponse.json()).deployments || []); setLoadError(false);
    } catch { setLoadError(true); }
  }
  async function loadOperations() {
    const canReadTeam = session.allows("team.read"); const canManageSubscriptions = session.allows("subscriptions.manage");
    const [analyticsResponse, checksResponse, teamResponse, preflightResponse, notificationResponse] = await Promise.all([
      fetch("/tenant/flowbot/analytics", { cache: "no-store" }).catch(() => null),
      fetch("/tenant/flowbot/install-checks", { cache: "no-store" }).catch(() => null),
      canReadTeam ? fetch("/tenant/team", { cache: "no-store" }).catch(() => null) : null,
      canManageSubscriptions ? fetch("/tenant/flowbot/downgrade-preflight", { cache: "no-store" }).catch(() => null) : null,
      fetch("/tenant/flowbot/notifications", { cache: "no-store" }).catch(() => null),
    ]);
    try {
      if (analyticsResponse?.ok) { setAnalytics((await analyticsResponse.json()).analytics || null); setAnalyticsLoadError(false); }
      else { setAnalytics(null); setAnalyticsLoadError(analyticsResponse?.status !== 404); }
    } catch { setAnalytics(null); setAnalyticsLoadError(true); }
    try {
      if (checksResponse?.ok) { setInstallChecks((await checksResponse.json()).checks || []); setInstallChecksLoadError(false); }
      else { setInstallChecks([]); setInstallChecksLoadError(true); }
    } catch { setInstallChecks([]); setInstallChecksLoadError(true); }
    try {
      if (!canReadTeam) { setTeamMembers([]); setTeamLoadError(false); }
      else if (teamResponse?.ok) { setTeamMembers((await teamResponse.json()).team?.members || []); setTeamLoadError(false); }
      else { setTeamMembers([]); setTeamLoadError(true); }
    } catch { setTeamMembers([]); setTeamLoadError(true); }
    try {
      if (!canManageSubscriptions) { setPreflight(null); setPreflightLoadError(false); }
      else if (preflightResponse?.ok) { setPreflight((await preflightResponse.json()).preflight || null); setPreflightLoadError(false); }
      else { setPreflight(null); setPreflightLoadError(preflightResponse?.status !== 404); }
    } catch { setPreflight(null); setPreflightLoadError(true); }
    try {
      if (notificationResponse?.ok) { setNotifications((await notificationResponse.json()).notifications || []); setNotificationsLoadError(false); }
      else { setNotifications([]); setNotificationsLoadError(true); }
    } catch { setNotifications([]); setNotificationsLoadError(true); }
  }
  useEffect(() => { if (session.selectedTenantId) { void loadBots(); void loadOperations(); } }, [session.selectedTenantId]);
  useEffect(() => { void loadBot(selectedBotId); }, [selectedBotId]);

  async function createBot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setWorking(true); setMessage(""); const form = event.currentTarget; const data = new FormData(form);
    const response = await safeMutationFetch("/tenant/flowbot/bots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: data.get("name"), defaultLanguage: data.get("defaultLanguage") }) });
    const result = await response.json(); setWorking(false);
    if (!response.ok) { setMessage(result.status === "limit_reached" ? "Active bot limit reached." : "Bot could not be created."); return; }
    form.reset(); await loadBots(); setSelectedBotId(result.botId); setMessage("Bot created.");
  }
  async function saveDraft() {
    if (!draft || !selectedBotId) return; setWorking(true); setMessage("");
    try {
      const definition = JSON.parse(definitionText);
      const response = await safeMutationFetch(`/tenant/flowbot/bots/${selectedBotId}/draft`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: draft.revision, definition }) });
      setWorking(false); if (!response.ok) { setMessage(response.status === 409 ? "Draft changed in another session. Reload before saving." : "Draft validation failed."); return; }
      setMessage("Draft saved."); await loadBot(selectedBotId);
    } catch { setWorking(false); setMessage("Definition must be valid JSON."); }
  }
  async function publish() {
    if (!selectedBotId) return; setWorking(true); setMessage("");
    const response = await safeMutationFetch(`/tenant/flowbot/bots/${selectedBotId}/publish`, { method: "POST" }); const result = await response.json(); setWorking(false);
    if (!response.ok) { setMessage(result.issues?.map((issue: { code: string }) => issue.code).join(", ") || "Publish failed."); return; }
    setMessage(`Version ${result.version} published.`); await loadBots(); await loadBot(selectedBotId);
  }
  async function rollback(versionId: string) {
    if (!selectedBotId || !window.confirm("Publish this historical definition as a new version?")) return; setWorking(true);
    const response = await safeMutationFetch(`/tenant/flowbot/bots/${selectedBotId}/rollback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceVersionId: versionId }) }); const result = await response.json(); setWorking(false);
    setMessage(response.ok ? `Version ${result.version} published from history.` : "Rollback publish failed."); if (response.ok) await loadBot(selectedBotId);
  }
  async function createDeployment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedBotId) return; setWorking(true); setNewDeploymentKey(""); const form = event.currentTarget; const data = new FormData(form);
    const response = await safeMutationFetch(`/tenant/flowbot/bots/${selectedBotId}/deployments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: data.get("name"), allowedOrigins: [data.get("origin")] }) }); const result = await response.json(); setWorking(false);
    if (!response.ok) { setMessage("Deployment could not be created."); return; } setNewDeploymentKey(result.deploymentKey); setMessage("Deployment key created. It is shown once."); form.reset(); await loadBot(selectedBotId);
  }
  async function requestInstallCheck(deployment: Deployment) {
    const targetOrigin = deployment.allowedOrigins[0]; if (!targetOrigin) return;
    setWorking(true);
    const response = await safeMutationFetch("/tenant/flowbot/install-checks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deploymentId: deployment.id, targetOrigin }) });
    setWorking(false); setMessage(response.ok ? "Install check requested. Reload the website containing the widget to verify it." : "Install check could not be requested.");
    if (response.ok) await loadOperations();
  }
  async function saveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setWorking(true);
    const weeklyWindows = [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, startMinute: 540, endMinute: 1020 }));
    const response = await safeMutationFetch("/tenant/flowbot/schedules", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scheduleKey: data.get("scheduleKey"), name: data.get("name"), timezone: data.get("timezone"), weeklyWindows, closedDates: [] }) });
    setWorking(false); setMessage(response.ok ? "Business schedule saved (Monday-Friday, 09:00-17:00)." : "Business schedule could not be saved.");
  }
  async function saveRoutingTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setWorking(true);
    const response = await safeMutationFetch("/tenant/flowbot/routing-teams", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teamKey: data.get("teamKey"), name: data.get("name"), membershipIds: data.getAll("membershipIds") }) });
    setWorking(false); setMessage(response.ok ? "Routing team saved." : "Routing team could not be saved.");
  }
  async function createNotification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setWorking(true);
    const response = await safeMutationFetch("/tenant/flowbot/notifications", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: data.get("name"), recipientEmail: data.get("recipientEmail") }),
    });
    setWorking(false); setMessage(response.ok ? "Lead notification recipient added." : "Notification recipient could not be added.");
    if (response.ok) { form.reset(); await loadOperations(); }
  }
  function applyTemplate(template: "greeting" | "lead" | "premium") {
    const value = template === "greeting" ? greetingTemplate() : template === "lead" ? leadTemplate() : premiumTemplate(); setDefinitionText(JSON.stringify(value, null, 2)); setMessage("");
  }
  if (session.error) return <WorkspaceSessionLoadError onRetry={() => window.location.reload()} />;
  if (session.loading || !session.selectedTenantId) return <main className="workspace-loading">Loading FlowBot...</main>;
  if (loadError) return <WorkspacePageLoadError active="flowbot" title="FlowBot" resource="FlowBot Studio" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} onRetry={() => window.location.reload()} />;
  return <main className="workspace-shell"><WorkspaceSidebar active="flowbot" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} />
    <section className="workspace-main"><WorkspaceSupportBanner tenantId={session.selectedTenantId} />
      <header className="workspace-header"><div><p>Website automation</p><h1>FlowBot</h1></div><span className="role-label">{capabilities?.planKey.replace("flowbot_", "")} / {capabilities?.accessMode || "unavailable"}</span></header>
      <section className="tool-band flowbot-control-band"><div className="band-heading"><div><p>Bots</p><h2>Published assistants</h2></div><span>{bots.length}{capabilities?.limits.activeBots ? ` / ${capabilities.limits.activeBots}` : ""}</span></div>
        {canAuthor ? <form className="flowbot-create" onSubmit={createBot}><label>Name<input name="name" minLength={2} maxLength={160} required /></label><label>Language<select name="defaultLanguage" defaultValue="en"><option value="en">English</option><option value="th">Thai</option></select></label><button type="submit" disabled={working}>Create bot</button></form> : null}
        <div className="flowbot-tabs" role="tablist">{bots.map((bot) => <button type="button" role="tab" aria-selected={bot.id === selectedBotId} className={bot.id === selectedBotId ? "selected" : ""} key={bot.id} onClick={() => setSelectedBotId(bot.id)}><strong>{bot.name}</strong><span>{bot.status} / {bot.deploymentCount} deployments</span></button>)}</div>
        {!bots.length ? <div className="pending-line"><strong>No FlowBots</strong><span>{canAuthor ? "Create the first bot." : "An administrator can create one."}</span></div> : null}
      </section>
      {selectedBot && draft ? <>
        <section className="tool-band"><div className="band-heading"><div><p>Draft revision {draft.revision}</p><h2>{selectedBot.name}</h2></div><span>{Object.keys((draft.definition.nodes as object) || {}).length} nodes</span></div>
          {canAuthor ? <div className="template-control" aria-label="Flow templates"><button type="button" onClick={() => applyTemplate("greeting")}>Greeting</button><button type="button" onClick={() => applyTemplate("lead")}>Lead capture</button>{capabilities?.advancedNodes ? <button type="button" onClick={() => applyTemplate("premium")}>Timed follow-up</button> : null}</div> : null}
          <FlowVisualEditor value={definitionText} onChange={setDefinitionText} readOnly={!canAuthor} premium={Boolean(capabilities?.advancedNodes)} />
          {canAuthor ? <div className="flowbot-actions"><button type="button" className="secondary-command" onClick={() => void saveDraft()} disabled={working}>Save draft</button><button type="button" onClick={() => void publish()} disabled={working}>Publish</button></div> : null}
          {message ? <p className="inline-message" role="status">{message}</p> : null}
        </section>
        <section className="tool-band muted-band"><div className="band-heading"><div><p>Deployments</p><h2>Website origins</h2></div><span>{deployments.length}{capabilities?.limits.deployments ? ` / ${capabilities.limits.deployments}` : ""}</span></div>
          {installChecksLoadError ? <div className="inline-message inline-retry" role="alert"><span>Install verification status could not be loaded. Deployment records remain available.</span><button className="secondary-command" type="button" onClick={() => void loadOperations()}>Try again</button></div> : null}
          {canAuthor && selectedBot.currentPublishedVersionId ? <form className="flowbot-deploy" onSubmit={createDeployment}><label>Name<input name="name" minLength={2} maxLength={160} required /></label><label>Allowed origin<input name="origin" type="url" placeholder="https://www.example.com" required /></label><button type="submit" disabled={working}>Create deployment</button></form> : null}
          {newDeploymentKey ? <div className="deployment-secret"><strong>One-time deployment key</strong><code>{newDeploymentKey}</code><pre>{`<script type="module">\n  import { mountFlowbotWidget } from "https://cdn.djaybot.com/flowbot/v1/index.js";\n  mountFlowbotWidget({ deploymentKey: "${newDeploymentKey}", apiBaseUrl: "${process.env.NEXT_PUBLIC_API_APP_URL || "https://api.djaybot.com"}" });\n</script>`}</pre></div> : null}
          <div className="data-table">{deployments.map((item) => { const check = installChecks.find((candidate) => candidate.deploymentId === item.id); return <div className="data-row" key={item.id}><div><strong>{item.name}</strong><span>{item.allowedOrigins.join(", ")}</span></div><span>{check?.status || item.status}</span>{canAuthor ? <button type="button" className="secondary-command" disabled={working} onClick={() => void requestInstallCheck(item)}>Verify install</button> : <code>{item.keyPrefix}...</code>}</div>; })}{!deployments.length ? <div className="pending-line"><strong>No deployments</strong><span>Publish before creating a website deployment.</span></div> : null}</div>
        </section>
        {capabilities?.advancedNodes && canAuthor ? <section className="tool-band"><div className="band-heading"><div><p>Premium operations</p><h2>Schedules and routing</h2></div><span>Deterministic</span></div>
          <div className="flowbot-operations-grid"><form onSubmit={saveSchedule}><h3>Business hours</h3><label>Key<input name="scheduleKey" defaultValue="sales" required pattern="[a-z][a-z0-9_-]*" /></label><label>Name<input name="name" defaultValue="Sales hours" required /></label><label>Timezone<input name="timezone" defaultValue="Asia/Bangkok" required /></label><button disabled={working}>Save 09:00-17:00 weekdays</button></form>
            <form onSubmit={saveRoutingTeam}><h3>Routing team</h3><label>Key<input name="teamKey" defaultValue="sales" required pattern="[a-z][a-z0-9_-]*" /></label><label>Name<input name="name" defaultValue="Sales team" required /></label>{teamLoadError ? <div className="inline-message inline-retry" role="alert"><span>Active team members could not be loaded.</span><button className="secondary-command" type="button" onClick={() => void loadOperations()}>Try again</button></div> : <fieldset><legend>Active members</legend>{teamMembers.filter((member) => member.membership_status === "active").map((member) => <label key={member.membership_id}><input type="checkbox" name="membershipIds" value={member.membership_id} defaultChecked /> {member.display_name}</label>)}</fieldset>}<button disabled={working || teamLoadError}>Save routing team</button></form></div>
        </section> : null}
        {canAuthor ? <section className="tool-band"><div className="band-heading"><div><p>Lead delivery</p><h2>Merchant email notifications</h2></div><span>{notificationsLoadError ? "Unavailable" : `${notifications.filter((item) => item.status === "active").length} active`}</span></div>
          <form className="flowbot-deploy" onSubmit={createNotification}><label>Recipient name<input name="name" minLength={2} maxLength={160} placeholder="Sales inbox" required /></label><label>Recipient email<input name="recipientEmail" type="email" maxLength={320} placeholder="sales@example.com" required /></label><button type="submit" disabled={working || notificationsLoadError}>Add recipient</button></form>
          <p className="field-help">Recipient addresses are encrypted. Only the approved lead-captured template can be sent.</p>
          <div className="data-table">{notificationsLoadError ? <div className="pending-line inline-retry" role="alert"><strong>Notification recipients could not be loaded</strong><span>Existing delivery settings have not changed.</span><button className="secondary-command" type="button" onClick={() => void loadOperations()}>Try again</button></div> : <>{notifications.map((profile) => <div className="data-row" key={profile.id}><div><strong>{profile.name}</strong><span>{profile.allowedTemplateKeys.join(", ")}</span></div><span>{profile.status}</span></div>)}{!notifications.length ? <div className="pending-line"><strong>No recipients</strong><span>Add a merchant inbox to receive durable lead notifications.</span></div> : null}</>}</div>
        </section> : null}
        {analyticsLoadError ? <section className="tool-band"><div className="pending-line inline-retry" role="alert"><strong>FlowBot analytics could not be loaded</strong><span>Bot and deployment records remain available.</span><button className="secondary-command" type="button" onClick={() => void loadOperations()}>Try again</button></div></section> : null}
        {analytics ? <section className="tool-band"><div className="band-heading"><div><p>{analytics.periodDays}-day {analytics.level}</p><h2>FlowBot analytics</h2></div><a className="secondary-command" href="/tenant/flowbot/analytics?format=csv">Export CSV</a></div><div className="metric-grid"><div><strong>{analytics.executions}</strong><span>Executions</span></div><div><strong>{analytics.completed}</strong><span>Completed</span></div><div><strong>{analytics.leads}</strong><span>Leads</span></div><div><strong>{analytics.handovers}</strong><span>Handovers</span></div><div><strong>{analytics.messages}</strong><span>Messages</span></div></div></section> : null}
        {preflightLoadError ? <section className="tool-band muted-band"><div className="pending-line inline-retry" role="alert"><strong>Downgrade compatibility could not be checked</strong><span>No subscription change has been made.</span><button className="secondary-command" type="button" onClick={() => void loadOperations()}>Try again</button></div></section> : null}
        {preflight ? <section className="tool-band muted-band"><div className="band-heading"><div><p>Plan safety</p><h2>Basic downgrade preflight</h2></div><span>{preflight.allowed ? "Ready" : `${preflight.blockers.length} blockers`}</span></div>{preflight.allowed ? <p className="inline-message">Current definitions are compatible with FlowBot Basic.</p> : <div className="data-table">{preflight.blockers.map((blocker, index) => <div className="data-row" key={`${blocker.code}-${index}`}><strong>{blocker.code}</strong><span>{blocker.detail || "Configuration dependency"}</span><span>{preflight.remediation[index]?.action}</span></div>)}</div>}</section> : null}
        <section className="tool-band"><div className="band-heading"><div><p>Immutable history</p><h2>Published versions</h2></div><span>{versions.length}</span></div><div className="data-table">{versions.map((version) => <div className="data-row" key={version.id}><div><strong>Version {version.version}</strong><span>{new Date(version.publishedAt).toLocaleString()}</span></div><span>{version.sourceVersionId ? "Derived" : "Published"}</span>{canAuthor ? <button type="button" className="secondary-command" onClick={() => void rollback(version.id)} disabled={working}>Publish copy</button> : <span />}</div>)}</div></section>
      </> : null}
    </section>
  </main>;
}
