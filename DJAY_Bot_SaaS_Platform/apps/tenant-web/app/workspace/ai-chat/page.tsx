"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { WorkspaceSidebar } from "../WorkspaceSidebar";
import { WorkspaceSupportBanner } from "../WorkspaceSupportBanner";
import { useWorkspaceSession } from "../useWorkspaceSession";

type Agent = { id: string; name: string; status: string; defaultLanguage: "th" | "en"; currentPublishedPlaybookVersionId: string | null; draftRevision: number; deploymentCount: number };
type Capabilities = { planKey: "ai_chat_basic" | "ai_chat_premium"; accessMode: string; web: boolean; social: Record<string, boolean>; limits: { deployments: number | null; knowledgeDocuments: number | null } };
type Draft = { revision: number; definition: Record<string, unknown>; knowledgeRevisionIds: string[]; updatedAt: string };
type Knowledge = { id: string; revisionId: string; name: string; sourceKind: string; status: string; version: number };
type Deployment = { id: string; name: string; channel: string; keyPrefix: string | null; allowedOrigins: string[]; status: string; createdAt: string };
type Notification = { id: string; name: string; allowedTemplateKeys: string[]; status: string };
type Preview = { stage: string; text: string; proposedActionTypes: string[]; citationCount: number; handover: boolean };
type Analytics = { periodDays: number; level: string; sessions: number; completedTurns: number; failedTurns: number; handovers: number; leads: number; appointmentRequests: number; settledResponses: number };
type SocialConnection = { id: string; agentId: string; channel: "line"; name: string; externalAccountRef: string; status: string; healthStatus: string; safeErrorCode: string | null; lastHealthAt: string | null };

function notificationProfileFrom(value: string) {
  try { const parsed = JSON.parse(value) as { notificationProfileId?: unknown }; return typeof parsed.notificationProfileId === "string" ? parsed.notificationProfileId : ""; }
  catch { return ""; }
}

export default function AiChatPage() {
  const session = useWorkspaceSession();
  const [agents, setAgents] = useState<Agent[]>([]); const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState(""); const [draft, setDraft] = useState<Draft | null>(null);
  const [definitionText, setDefinitionText] = useState(""); const [knowledge, setKnowledge] = useState<Knowledge[]>([]);
  const [selectedKnowledge, setSelectedKnowledge] = useState<string[]>([]); const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]); const [newDeploymentKey, setNewDeploymentKey] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null); const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [socialConnections, setSocialConnections] = useState<SocialConnection[]>([]); const [newSocialWebhookKey, setNewSocialWebhookKey] = useState("");
  const [message, setMessage] = useState(""); const [working, setWorking] = useState(false);
  const workspace = useMemo(() => session.workspaces.find((item) => item.tenantId === session.selectedTenantId), [session]);
  const canAuthor = workspace?.role === "tenant_master_admin" || workspace?.role === "tenant_admin";
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId);

  async function loadAgents() {
    const response = await fetch("/tenant/ai-chat/agents", { cache: "no-store" }); if (!response.ok) return;
    const result = await response.json(); const next = result.agents || []; setAgents(next); setCapabilities(result.capabilities || null);
    setSelectedAgentId((current) => current && next.some((agent: Agent) => agent.id === current) ? current : next[0]?.id || "");
  }
  async function loadShared() {
    const [knowledgeResponse, notificationResponse, analyticsResponse, socialResponse] = await Promise.all([
      fetch("/tenant/knowledge", { cache: "no-store" }), fetch("/tenant/ai-chat/notifications", { cache: "no-store" }),
      fetch("/tenant/ai-chat/analytics", { cache: "no-store" }),
      fetch("/tenant/ai-chat/social-connections", { cache: "no-store" }),
    ]);
    if (knowledgeResponse.ok) setKnowledge((await knowledgeResponse.json()).sources || []);
    if (notificationResponse.ok) setNotifications((await notificationResponse.json()).notifications || []);
    if (analyticsResponse.ok) setAnalytics((await analyticsResponse.json()).analytics || null);
    if (socialResponse.ok) setSocialConnections((await socialResponse.json()).connections || []);
  }
  async function loadAgent(agentId: string) {
    if (!agentId) { setDraft(null); setDeployments([]); return; }
    const [draftResponse, deploymentResponse] = await Promise.all([
      fetch(`/tenant/ai-chat/agents/${agentId}/draft`, { cache: "no-store" }),
      fetch(`/tenant/ai-chat/agents/${agentId}/deployments`, { cache: "no-store" }),
    ]);
    if (draftResponse.ok) { const value = (await draftResponse.json()).draft as Draft; setDraft(value); setDefinitionText(JSON.stringify(value.definition, null, 2)); setSelectedKnowledge(value.knowledgeRevisionIds); }
    if (deploymentResponse.ok) setDeployments((await deploymentResponse.json()).deployments || []);
  }
  useEffect(() => { if (session.selectedTenantId) { void loadAgents(); void loadShared(); } }, [session.selectedTenantId]);
  useEffect(() => { void loadAgent(selectedAgentId); setPreview(null); }, [selectedAgentId]);

  async function createAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setWorking(true); setMessage("");
    const response = await fetch("/tenant/ai-chat/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: data.get("name"), businessName: data.get("businessName"), defaultLanguage: data.get("defaultLanguage") }) });
    const result = await response.json(); setWorking(false); if (!response.ok) { setMessage("AI agent could not be created."); return; }
    form.reset(); await loadAgents(); setSelectedAgentId(result.agentId); setMessage("AI agent created.");
  }
  async function saveDraft() {
    if (!draft || !selectedAgentId) return; setWorking(true); setMessage("");
    try {
      const definition = JSON.parse(definitionText);
      const response = await fetch(`/tenant/ai-chat/agents/${selectedAgentId}/draft`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: draft.revision, definition, knowledgeRevisionIds: selectedKnowledge }) });
      setWorking(false); if (!response.ok) { setMessage(response.status === 409 ? "Draft changed elsewhere. Reload before saving." : "Draft validation failed."); return; }
      setMessage("Draft and knowledge pins saved."); await loadAgent(selectedAgentId);
    } catch { setWorking(false); setMessage("Playbook must be valid JSON."); }
  }
  async function publish() {
    if (!selectedAgentId) return; setWorking(true);
    const response = await fetch(`/tenant/ai-chat/agents/${selectedAgentId}/publish`, { method: "POST" }); const result = await response.json(); setWorking(false);
    setMessage(response.ok ? `Playbook version ${result.version} published.` : "Publish failed."); if (response.ok) { await loadAgents(); await loadAgent(selectedAgentId); }
  }
  async function createDeployment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedAgentId) return; const form = event.currentTarget; const data = new FormData(form); setWorking(true); setNewDeploymentKey("");
    const response = await fetch(`/tenant/ai-chat/agents/${selectedAgentId}/deployments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: data.get("name"), allowedOrigins: [data.get("origin")] }) }); const result = await response.json(); setWorking(false);
    if (!response.ok) { setMessage("Website deployment could not be created."); return; } setNewDeploymentKey(result.deploymentKey); setMessage("Deployment key created. It is shown once."); form.reset(); await loadAgent(selectedAgentId);
  }
  async function createNotification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setWorking(true);
    const response = await fetch("/tenant/ai-chat/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: data.get("name"), recipientEmail: data.get("recipientEmail") }) }); setWorking(false);
    setMessage(response.ok ? "Qualified-lead recipient added." : "Notification recipient could not be added."); if (response.ok) { form.reset(); await loadShared(); }
  }
  async function runTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedAgentId) return; const data = new FormData(event.currentTarget); setWorking(true); setPreview(null);
    const response = await fetch(`/tenant/ai-chat/agents/${selectedAgentId}/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inputId: crypto.randomUUID(), language: data.get("language"), message: data.get("testMessage") }) }); const result = await response.json(); setWorking(false);
    if (!response.ok) { setMessage("Test mode is temporarily unavailable."); return; } setPreview(result.preview); setMessage("Preview generated. No action was executed and no customer usage was charged.");
  }
  async function createLineConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedAgentId) return; const form = event.currentTarget; const data = new FormData(form);
    setWorking(true); setMessage(""); setNewSocialWebhookKey("");
    const response = await fetch("/tenant/ai-chat/social-connections", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        channel: "line", agentId: selectedAgentId, name: data.get("name"),
        externalAccountRef: data.get("externalAccountRef"), channelAccessToken: data.get("channelAccessToken"),
        channelSecret: data.get("channelSecret"),
      }),
    });
    const result = await response.json(); setWorking(false);
    if (!response.ok) { setMessage(response.status === 403 ? "LINE requires AI Chat Premium." : "LINE connection could not be created."); return; }
    setNewSocialWebhookKey(result.webhookKey); form.reset(); setMessage("LINE connected. Copy the webhook URL now; its key is shown once."); await loadShared(); await loadAgent(selectedAgentId);
  }
  async function checkSocialHealth(connectionId: string) {
    setWorking(true); setMessage(""); const response = await fetch(`/tenant/ai-chat/social-connections/${connectionId}/health`, { method: "POST" });
    setWorking(false); setMessage(response.ok ? "Connection health check completed." : "Connection health check could not run."); await loadShared();
  }
  async function rotateLineCredentials(event: FormEvent<HTMLFormElement>, connectionId: string) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setWorking(true); setMessage("");
    const response = await fetch(`/tenant/ai-chat/social-connections/${connectionId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        channel: "line", channelAccessToken: data.get("channelAccessToken"), channelSecret: data.get("channelSecret"),
      }),
    });
    setWorking(false); setMessage(response.ok ? "LINE credentials rotated. Run a health check next." : "Credentials could not be rotated.");
    if (response.ok) { form.reset(); await loadShared(); }
  }
  async function revokeSocial(connectionId: string) {
    if (!window.confirm("Revoke this channel connection? Its webhook and credentials will stop working immediately.")) return;
    setWorking(true); const response = await fetch(`/tenant/ai-chat/social-connections/${connectionId}`, { method: "DELETE" }); setWorking(false);
    setMessage(response.ok ? "Channel connection revoked." : "Connection could not be revoked."); await loadShared(); await loadAgent(selectedAgentId);
  }
  function setNotificationProfile(profileId: string) {
    try { const value = JSON.parse(definitionText); if (profileId) value.notificationProfileId = profileId; else delete value.notificationProfileId; setDefinitionText(JSON.stringify(value, null, 2)); }
    catch { setMessage("Fix the playbook JSON before selecting a recipient."); }
  }

  if (session.loading || !session.selectedTenantId) return <main className="workspace-loading">Loading AI Chat…</main>;
  return <main className="workspace-shell"><WorkspaceSidebar active="ai_chat" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} />
    <section className="workspace-main"><WorkspaceSupportBanner tenantId={session.selectedTenantId} />
      <header className="workspace-header"><div><p>Grounded sales conversations</p><h1>AI Chat</h1></div><span className="role-label">{capabilities?.planKey.replace("ai_chat_", "") || "unavailable"} / {capabilities?.accessMode || "none"}</span></header>
      <section className="tool-band flowbot-control-band"><div className="band-heading"><div><p>Agents</p><h2>Sales assistants</h2></div><span>{agents.length}</span></div>
        {canAuthor ? <form className="ai-agent-create" onSubmit={createAgent}><label>Agent name<input name="name" minLength={2} maxLength={100} required /></label><label>Business name<input name="businessName" minLength={2} maxLength={200} required /></label><label>Language<select name="defaultLanguage" defaultValue="en"><option value="en">English</option><option value="th">Thai</option></select></label><button disabled={working}>Create agent</button></form> : null}
        <div className="flowbot-tabs">{agents.map((agent) => <button type="button" className={agent.id === selectedAgentId ? "selected" : ""} key={agent.id} onClick={() => setSelectedAgentId(agent.id)}><strong>{agent.name}</strong><span>{agent.status} / {agent.deploymentCount} deployments</span></button>)}</div>
        {!agents.length ? <div className="pending-line"><strong>No AI agents</strong><span>Create the first grounded sales assistant.</span></div> : null}
      </section>
      {selectedAgent && draft ? <>
        <section className="tool-band"><div className="band-heading"><div><p>Draft revision {draft.revision}</p><h2>{selectedAgent.name} playbook</h2></div><span>{selectedKnowledge.length} knowledge pins</span></div>
          <div className="ai-authoring-grid"><div><label>Approved knowledge</label><div className="knowledge-picker">{knowledge.map((source) => <label key={source.revisionId}><input type="checkbox" checked={selectedKnowledge.includes(source.revisionId)} disabled={!canAuthor} onChange={(event) => setSelectedKnowledge((current) => event.target.checked ? [...current, source.revisionId] : current.filter((id) => id !== source.revisionId))} /> {source.name} <small>v{source.version}</small></label>)}</div></div>
            <label>Qualified-lead recipient<select disabled={!canAuthor} value={notificationProfileFrom(definitionText)} onChange={(event) => setNotificationProfile(event.target.value)}><option value="">No email action</option>{notifications.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label></div>
          <details className="advanced-definition" open><summary>Sales Core playbook JSON</summary><textarea aria-label="AI sales playbook" readOnly={!canAuthor} value={definitionText} onChange={(event) => setDefinitionText(event.target.value)} /></details>
          {canAuthor ? <div className="flowbot-actions"><button type="button" className="secondary-command" disabled={working} onClick={() => void saveDraft()}>Save draft</button><button type="button" disabled={working} onClick={() => void publish()}>Publish immutable version</button></div> : null}
          {message ? <p className="inline-message" role="status">{message}</p> : null}
        </section>
        {canAuthor ? <section className="tool-band muted-band"><div className="band-heading"><div><p>Merchant-authorized test mode</p><h2>Preview without side effects</h2></div><span>20 / minute</span></div>
          <form className="ai-test-form" onSubmit={runTest}><label>Language<select name="language" defaultValue={selectedAgent.defaultLanguage}><option value="en">English</option><option value="th">Thai</option></select></label><label>Customer message<textarea name="testMessage" rows={3} maxLength={2000} required defaultValue="What can your consultation help me improve?" /></label><button disabled={working}>Run safe preview</button></form>
          {preview ? <div className="ai-preview"><strong>{preview.stage}</strong><p>{preview.text}</p><span>{preview.citationCount} citations / {preview.proposedActionTypes.join(", ") || "no actions"}</span></div> : null}
        </section> : null}
        <section className="tool-band"><div className="band-heading"><div><p>Qualified lead delivery</p><h2>Merchant email notifications</h2></div><span>{notifications.length} active</span></div>
          {canAuthor ? <form className="flowbot-deploy" onSubmit={createNotification}><label>Name<input name="name" minLength={2} maxLength={160} required /></label><label>Recipient email<input name="recipientEmail" type="email" maxLength={320} required /></label><button disabled={working}>Add recipient</button></form> : null}
          <p className="field-help">Addresses are encrypted. Only the fixed qualified-lead template is allowed.</p><div className="data-table">{notifications.map((item) => <div className="data-row" key={item.id}><strong>{item.name}</strong><span>{item.allowedTemplateKeys.join(", ")}</span><span>{item.status}</span></div>)}</div>
        </section>
        <section className="tool-band muted-band"><div className="band-heading"><div><p>Basic channel</p><h2>Website deployments</h2></div><span>{deployments.length}{capabilities?.limits.deployments ? ` / ${capabilities.limits.deployments}` : ""}</span></div>
          {canAuthor && selectedAgent.currentPublishedPlaybookVersionId ? <form className="flowbot-deploy" onSubmit={createDeployment}><label>Name<input name="name" minLength={2} maxLength={160} required /></label><label>Exact allowed origin<input name="origin" type="url" placeholder="https://www.example.com" required /></label><button disabled={working}>Create web deployment</button></form> : null}
          {newDeploymentKey ? <div className="deployment-secret"><strong>One-time deployment key</strong><code>{newDeploymentKey}</code><pre>{`<script type="module">\n  import { mountAiChatWidget } from "https://cdn.djaybot.com/ai-chat/v1/index.js";\n  mountAiChatWidget({ deploymentKey: "${newDeploymentKey}", apiBaseUrl: "${process.env.NEXT_PUBLIC_API_APP_URL || "https://api.djaybot.com"}" });\n</script>`}</pre></div> : null}
          <div className="data-table">{deployments.map((item) => <div className="data-row" key={item.id}><div><strong>{item.name}</strong><span>{item.allowedOrigins.join(", ")}</span></div><span>{item.channel}</span><span>{item.status}</span></div>)}{!deployments.length ? <div className="pending-line"><strong>No deployments</strong><span>Publish before creating a web deployment.</span></div> : null}</div>
        </section>
        <section className="tool-band"><div className="band-heading"><div><p>Premium social channels</p><h2>LINE connections</h2></div><span>{socialConnections.filter((item) => item.agentId === selectedAgentId && item.status !== "revoked").length} active</span></div>
          {!capabilities?.social.line ? <div className="pending-line"><strong>Premium feature</strong><span>Upgrade to AI Chat Premium to connect LINE.</span></div> : null}
          {canAuthor && capabilities?.social.line && selectedAgent.currentPublishedPlaybookVersionId ? <details className="advanced-definition social-connection-setup"><summary>Connect a LINE Official Account</summary>
            <form className="flowbot-deploy" onSubmit={createLineConnection}><label>Connection name<input name="name" minLength={2} maxLength={160} required /></label><label>LINE account reference<input name="externalAccountRef" minLength={3} maxLength={200} required /></label><label>Channel access token<input name="channelAccessToken" type="password" minLength={16} maxLength={4096} autoComplete="off" required /></label><label>Channel secret<input name="channelSecret" type="password" minLength={16} maxLength={4096} autoComplete="off" required /></label><button disabled={working}>Connect LINE</button></form>
            <p className="field-help">Credentials are encrypted and never shown again. Use a stable internal account reference, not a secret.</p>
          </details> : null}
          {newSocialWebhookKey ? <div className="deployment-secret"><strong>One-time LINE webhook URL</strong><code>{`${process.env.NEXT_PUBLIC_API_APP_URL || "https://api.djaybot.com"}/public/ai-chat/social/line/${newSocialWebhookKey}`}</code><p className="field-help">Paste this into LINE Developers, enable webhooks, then run a health check below.</p></div> : null}
          <div className="data-table social-connection-list">{socialConnections.filter((item) => item.agentId === selectedAgentId).map((item) => <div className="social-connection-row" key={item.id}><div className="social-connection-summary"><div><strong>{item.name}</strong><span>{item.externalAccountRef}</span></div><div><span className={`health-pill health-${item.healthStatus}`}>{item.healthStatus}</span><span>{item.status}</span></div></div>
            {item.safeErrorCode ? <p className="field-help">Action needed: {item.safeErrorCode.replaceAll("_", " ")}</p> : null}
            {item.lastHealthAt ? <p className="field-help">Last checked {new Date(item.lastHealthAt).toLocaleString()}</p> : null}
            {canAuthor && item.status !== "revoked" ? <div className="flowbot-actions"><button type="button" className="secondary-command" disabled={working} onClick={() => void checkSocialHealth(item.id)}>Check health</button><button type="button" className="secondary-command" disabled={working} onClick={() => void revokeSocial(item.id)}>Revoke</button></div> : null}
            {canAuthor && item.status !== "revoked" ? <details className="credential-rotation"><summary>Rotate credentials</summary><form className="flowbot-deploy" onSubmit={(event) => void rotateLineCredentials(event, item.id)}><label>New access token<input name="channelAccessToken" type="password" minLength={16} maxLength={4096} autoComplete="off" required /></label><label>New channel secret<input name="channelSecret" type="password" minLength={16} maxLength={4096} autoComplete="off" required /></label><button disabled={working}>Rotate</button></form></details> : null}
          </div>)}{!socialConnections.some((item) => item.agentId === selectedAgentId) ? <div className="pending-line"><strong>No LINE connection</strong><span>Publish the agent, then connect its LINE Official Account.</span></div> : null}</div>
        </section>
        {analytics ? <section className="tool-band"><div className="band-heading"><div><p>{analytics.periodDays}-day {analytics.level}</p><h2>AI Chat analytics</h2></div><span>{analytics.settledResponses} metered responses</span></div><div className="metric-grid"><div><strong>{analytics.sessions}</strong><span>Sessions</span></div><div><strong>{analytics.completedTurns}</strong><span>Completed turns</span></div><div><strong>{analytics.leads}</strong><span>Leads</span></div><div><strong>{analytics.appointmentRequests}</strong><span>Appointment requests</span></div><div><strong>{analytics.handovers}</strong><span>Handovers</span></div></div></section> : null}
      </> : null}
    </section>
  </main>;
}
