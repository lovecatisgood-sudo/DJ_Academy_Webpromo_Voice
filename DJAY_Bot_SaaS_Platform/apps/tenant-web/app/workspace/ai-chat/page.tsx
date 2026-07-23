"use client";

import { useEffect, useState, type FormEvent } from "react";
import { aiPlaybookSchema, type AiPlaybook } from "@djay/sales-core";
import { safeMutationFetch } from "@djay/shared";
import { createSocialCallbackUrl, createWidgetInstallSnippet } from "@djay/shared/widget-install";
import { tenantWidgetInstallEnvironment } from "../../../lib/widget-install-environment";
import { WorkspaceSidebar } from "../WorkspaceSidebar";
import { WorkspacePageLoadError, WorkspaceSessionLoadError } from "../WorkspaceAccess";
import { WorkspaceSupportBanner } from "../WorkspaceSupportBanner";
import { WebsiteDeploymentForm } from "../WebsiteDeploymentForm";
import { useWorkspaceSession } from "../useWorkspaceSession";
import { humanizeAccessMode, humanizePlanKey } from "../../../lib/workspace-labels";
import { AiPlaybookEditor } from "./AiPlaybookEditor";

type Agent = { id: string; name: string; status: string; defaultLanguage: "th" | "en"; currentPublishedPlaybookVersionId: string | null; draftRevision: number; deploymentCount: number };
type Capabilities = { planKey: "ai_chat_basic" | "ai_chat_premium"; accessMode: string; web: boolean; social: Record<string, boolean>; limits: { deployments: number | null; knowledgeDocuments: number | null } };
type Draft = { revision: number; definition: Record<string, unknown>; knowledgeRevisionIds: string[]; updatedAt: string };
type Knowledge = { id: string; revisionId: string; name: string; sourceKind: string; status: string; version: number };
type Deployment = { id: string; name: string; channel: string; keyPrefix: string | null; allowedOrigins: string[]; status: string; createdAt: string };
type Notification = { id: string; name: string; allowedTemplateKeys: string[]; status: string };
type Preview = { stage: string; text: string; proposedActionTypes: string[]; citationCount: number; handover: boolean };
type ChannelAnalytics = { channel: "web" | "line" | "whatsapp" | "messenger"; sessions: number; completedTurns: number; failedTurns: number; leads: number; appointmentRequests: number; delivered: number; pendingDeliveries: number; failedDeliveries: number; attemptedQuantity: number };
type Analytics = { periodDays: number; level: string; sessions: number; completedTurns: number; failedTurns: number; handovers: number; leads: number; appointmentRequests: number; settledResponses: number; unanswered: number; channels?: ChannelAnalytics[]; questions?: { question: string; occurrences: number }[]; intents?: { intent: string; occurrences: number }[]; segments?: { segment: string; customers: number }[] };
type SocialConnection = { id: string; agentId: string; channel: "line" | "whatsapp" | "messenger"; name: string; externalAccountRef: string; status: string; healthStatus: string; safeErrorCode: string | null; lastHealthAt: string | null; pendingDeliveries: number; failedDeliveries: number; deadLetterDeliveries: number; succeededDeliveries: number; attemptedQuantity: number };

function playbookValidationMessage(path: string, issue: string): string {
  const labels: Record<string, string> = {
    agentName: "Assistant name", businessName: "Business name", languages: "Conversation languages",
    tone: "Tone", salesGoal: "Sales goal", approvedClaims: "Approved claims",
    prohibitedClaims: "Prohibited claims", discoveryQuestions: "Discovery questions",
    ctaPolicy: "Calls to action", requiredContactFields: "Required contact details",
    greeting: "Greeting", offlineMessage: "Offline message", timezone: "Timezone",
    weeklyWindows: "Business hours",
  };
  const label = labels[path.split(".")[0] || ""] || "Playbook";
  return `${label}: ${issue}`;
}

export default function AiChatPage() {
  const session = useWorkspaceSession();
  const [agents, setAgents] = useState<Agent[]>([]); const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState(""); const [draft, setDraft] = useState<Draft | null>(null);
  const [definition, setDefinition] = useState<AiPlaybook | null>(null); const [definitionText, setDefinitionText] = useState("");
  const [advancedPending, setAdvancedPending] = useState(false); const [draftDirty, setDraftDirty] = useState(false);
  const [validationPath, setValidationPath] = useState(""); const [validationMessage, setValidationMessage] = useState("");
  const [knowledge, setKnowledge] = useState<Knowledge[]>([]);
  const [selectedKnowledge, setSelectedKnowledge] = useState<string[]>([]); const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]); const [newDeploymentKey, setNewDeploymentKey] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null); const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [socialConnections, setSocialConnections] = useState<SocialConnection[]>([]); const [newSocialWebhookKey, setNewSocialWebhookKey] = useState("");
  const [newSocialChannel, setNewSocialChannel] = useState<"line" | "whatsapp" | "messenger" | "">("");
  const [message, setMessage] = useState(""); const [working, setWorking] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [knowledgeLoadError, setKnowledgeLoadError] = useState(false); const [notificationsLoadError, setNotificationsLoadError] = useState(false);
  const [analyticsLoadError, setAnalyticsLoadError] = useState(false); const [socialLoadError, setSocialLoadError] = useState(false);
  const canAuthor = session.allows("ai_chat.author");
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId);
  const installSnippet = newDeploymentKey
    ? createWidgetInstallSnippet("ai-chat", newDeploymentKey, tenantWidgetInstallEnvironment)
    : "";
  const socialCallbackUrl = newSocialWebhookKey && newSocialChannel
    ? createSocialCallbackUrl(newSocialChannel, newSocialWebhookKey, tenantWidgetInstallEnvironment)
    : "";

  async function loadAgents() {
    try {
      const response = await fetch("/tenant/ai-chat/agents", { cache: "no-store" }); if (!response.ok) throw new Error("ai_chat_unavailable");
      const result = await response.json(); const next = result.agents || []; setAgents(next); setCapabilities(result.capabilities || null);
      setSelectedAgentId((current) => current && next.some((agent: Agent) => agent.id === current) ? current : next[0]?.id || ""); setLoadError(false);
    } catch { setLoadError(true); }
  }
  async function loadShared() {
    const [knowledgeResponse, notificationResponse, analyticsResponse, socialResponse] = await Promise.all([
      fetch("/tenant/knowledge", { cache: "no-store" }).catch(() => null), fetch("/tenant/ai-chat/notifications", { cache: "no-store" }).catch(() => null),
      fetch("/tenant/ai-chat/analytics", { cache: "no-store" }).catch(() => null),
      fetch("/tenant/ai-chat/social-connections", { cache: "no-store" }).catch(() => null),
    ]);
    try {
      if (knowledgeResponse?.ok) { setKnowledge((await knowledgeResponse.json()).sources || []); setKnowledgeLoadError(false); }
      else { setKnowledge([]); setKnowledgeLoadError(true); }
    } catch { setKnowledge([]); setKnowledgeLoadError(true); }
    try {
      if (notificationResponse?.ok) { setNotifications((await notificationResponse.json()).notifications || []); setNotificationsLoadError(false); }
      else { setNotifications([]); setNotificationsLoadError(true); }
    } catch { setNotifications([]); setNotificationsLoadError(true); }
    try {
      if (analyticsResponse?.ok) { setAnalytics((await analyticsResponse.json()).analytics || null); setAnalyticsLoadError(false); }
      else { setAnalytics(null); setAnalyticsLoadError(analyticsResponse?.status !== 404); }
    } catch { setAnalytics(null); setAnalyticsLoadError(true); }
    try {
      if (socialResponse?.ok) { setSocialConnections((await socialResponse.json()).connections || []); setSocialLoadError(false); }
      else { setSocialConnections([]); setSocialLoadError(true); }
    } catch { setSocialConnections([]); setSocialLoadError(true); }
  }
  async function loadAgent(agentId: string) {
    if (!agentId) { setDraft(null); setDefinition(null); setDeployments([]); return; }
    try {
      const [draftResponse, deploymentResponse] = await Promise.all([
        fetch(`/tenant/ai-chat/agents/${agentId}/draft`, { cache: "no-store" }),
        fetch(`/tenant/ai-chat/agents/${agentId}/deployments`, { cache: "no-store" }),
      ]);
      if (!draftResponse.ok || !deploymentResponse.ok) throw new Error("ai_chat_detail_unavailable");
      const value = (await draftResponse.json()).draft as Draft; const parsed = aiPlaybookSchema.safeParse(value.definition); if (!parsed.success) throw new Error("invalid_ai_playbook");
      setDraft(value); setDefinition(parsed.data); setDefinitionText(JSON.stringify(parsed.data, null, 2)); setSelectedKnowledge(value.knowledgeRevisionIds);
      setAdvancedPending(false); setDraftDirty(false); setValidationPath(""); setValidationMessage("");
      setDeployments((await deploymentResponse.json()).deployments || []); setLoadError(false);
    } catch { setLoadError(true); }
  }
  useEffect(() => { if (session.selectedTenantId) { void loadAgents(); void loadShared(); } }, [session.selectedTenantId]);
  useEffect(() => { void loadAgent(selectedAgentId); setPreview(null); }, [selectedAgentId]);
  useEffect(() => {
    if (!draftDirty) return;
    const protectDraft = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protectDraft);
    return () => window.removeEventListener("beforeunload", protectDraft);
  }, [draftDirty]);

  async function createAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setWorking(true); setMessage("");
    const response = await safeMutationFetch("/tenant/ai-chat/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: data.get("name"), businessName: data.get("businessName"), defaultLanguage: data.get("defaultLanguage") }) });
    const result = await response.json(); setWorking(false); if (!response.ok) { setMessage("AI agent could not be created."); return; }
    form.reset(); await loadAgents(); setSelectedAgentId(result.agentId); setMessage("AI agent created.");
  }
  async function saveDraft() {
    if (!draft || !selectedAgentId) return; setWorking(true); setMessage("");
    try {
      const candidate = JSON.parse(definitionText) as unknown; const parsed = aiPlaybookSchema.safeParse(candidate);
      if (!parsed.success) {
        const issue = parsed.error.issues[0]!; const path = issue.path.map(String).join(".") || "advanced";
        setWorking(false); setValidationPath(path); setValidationMessage(playbookValidationMessage(path, issue.message));
        requestAnimationFrame(() => {
          const exact = document.querySelector<HTMLElement>(`[data-ai-playbook-path="${CSS.escape(path)}"]`);
          const root = path.split(".")[0] || "";
          (exact || document.querySelector<HTMLElement>(`[data-ai-playbook-path="${CSS.escape(root)}"]`) || document.querySelector<HTMLElement>("[data-ai-playbook-json]"))?.focus();
        });
        return;
      }
      setDefinition(parsed.data); setAdvancedPending(false); setValidationPath(""); setValidationMessage("");
      const response = await safeMutationFetch(`/tenant/ai-chat/agents/${selectedAgentId}/draft`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: draft.revision, definition: parsed.data, knowledgeRevisionIds: selectedKnowledge }) });
      setWorking(false); if (!response.ok) { setMessage(response.status === 409 ? "Draft changed elsewhere. Reload before saving." : "Draft validation failed."); return; }
      setMessage("Draft and knowledge pins saved."); await loadAgent(selectedAgentId);
    } catch { setWorking(false); setAdvancedPending(true); setValidationPath("advanced"); setValidationMessage("Advanced JSON must be valid before this draft can be saved."); requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-ai-playbook-json]")?.focus()); }
  }
  async function publish() {
    if (!selectedAgentId) return; setWorking(true);
    const response = await safeMutationFetch(`/tenant/ai-chat/agents/${selectedAgentId}/publish`, { method: "POST" }); const result = await response.json(); setWorking(false);
    setMessage(response.ok ? `Playbook version ${result.version} published.` : "Publish failed."); if (response.ok) { await loadAgents(); await loadAgent(selectedAgentId); }
  }
  async function createDeployment(input: Readonly<{ name: string; allowedOrigins: readonly [string] }>, form: HTMLFormElement) {
    if (!selectedAgentId) return; setWorking(true); setNewDeploymentKey("");
    const response = await safeMutationFetch(`/tenant/ai-chat/agents/${selectedAgentId}/deployments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }); const result = await response.json(); setWorking(false);
    if (!response.ok) { setMessage("Website deployment could not be created."); return; } setNewDeploymentKey(result.deploymentKey); setMessage("Deployment key created. It is shown once."); form.reset(); await loadAgent(selectedAgentId);
  }
  async function createNotification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setWorking(true);
    const response = await safeMutationFetch("/tenant/ai-chat/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: data.get("name"), recipientEmail: data.get("recipientEmail") }) }); setWorking(false);
    setMessage(response.ok ? "Qualified-lead recipient added." : "Notification recipient could not be added."); if (response.ok) { form.reset(); await loadShared(); }
  }
  async function runTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedAgentId) return; const data = new FormData(event.currentTarget); setWorking(true); setPreview(null);
    const response = await safeMutationFetch(`/tenant/ai-chat/agents/${selectedAgentId}/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inputId: crypto.randomUUID(), language: data.get("language"), message: data.get("testMessage") }) }); const result = await response.json(); setWorking(false);
    if (!response.ok) { setMessage("Test mode is temporarily unavailable."); return; } setPreview(result.preview); setMessage("Preview generated. No action was executed and no customer usage was charged.");
  }
  async function createLineConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedAgentId) return; const form = event.currentTarget; const data = new FormData(form);
    setWorking(true); setMessage(""); setNewSocialWebhookKey(""); setNewSocialChannel("");
    const response = await safeMutationFetch("/tenant/ai-chat/social-connections", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        channel: "line", agentId: selectedAgentId, name: data.get("name"),
        externalAccountRef: data.get("externalAccountRef"), channelAccessToken: data.get("channelAccessToken"),
        channelSecret: data.get("channelSecret"),
      }),
    });
    const result = await response.json(); setWorking(false);
    if (!response.ok) { setMessage(response.status === 403 ? "LINE requires AI Chat Premium." : "LINE connection could not be created."); return; }
    setNewSocialWebhookKey(result.webhookKey); setNewSocialChannel("line"); form.reset(); setMessage("LINE connected. Copy the webhook URL now; its key is shown once."); await loadShared(); await loadAgent(selectedAgentId);
  }
  async function createWhatsAppConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedAgentId) return; const form = event.currentTarget; const data = new FormData(form);
    setWorking(true); setMessage(""); setNewSocialWebhookKey(""); setNewSocialChannel("");
    const response = await safeMutationFetch("/tenant/ai-chat/social-connections", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        channel: "whatsapp", agentId: selectedAgentId, name: data.get("name"),
        externalAccountRef: data.get("externalAccountRef"), accessToken: data.get("accessToken"),
        appSecret: data.get("appSecret"), verifyToken: data.get("verifyToken"),
        phoneNumberId: data.get("phoneNumberId"), businessAccountId: data.get("businessAccountId"),
      }),
    });
    const result = await response.json(); setWorking(false);
    if (!response.ok) { setMessage(response.status === 403 ? "WhatsApp requires AI Chat Premium." : "WhatsApp connection could not be created."); return; }
    setNewSocialWebhookKey(result.webhookKey); setNewSocialChannel("whatsapp"); form.reset();
    setMessage("WhatsApp connected. Copy the callback URL now; its key is shown once."); await loadShared(); await loadAgent(selectedAgentId);
  }
  async function createMessengerConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedAgentId) return; const form = event.currentTarget; const data = new FormData(form);
    setWorking(true); setMessage(""); setNewSocialWebhookKey(""); setNewSocialChannel("");
    const response = await safeMutationFetch("/tenant/ai-chat/social-connections", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        channel: "messenger", agentId: selectedAgentId, name: data.get("name"),
        externalAccountRef: data.get("externalAccountRef"), pageAccessToken: data.get("pageAccessToken"),
        appSecret: data.get("appSecret"), verifyToken: data.get("verifyToken"), pageId: data.get("pageId"),
      }),
    });
    const result = await response.json(); setWorking(false);
    if (!response.ok) { setMessage(response.status === 403 ? "Messenger requires AI Chat Premium." : "Messenger connection could not be created."); return; }
    setNewSocialWebhookKey(result.webhookKey); setNewSocialChannel("messenger"); form.reset();
    setMessage("Messenger connected. Copy the callback URL now; its key is shown once."); await loadShared(); await loadAgent(selectedAgentId);
  }
  async function checkSocialHealth(connectionId: string) {
    setWorking(true); setMessage(""); const response = await safeMutationFetch(`/tenant/ai-chat/social-connections/${connectionId}/health`, { method: "POST" });
    setWorking(false); setMessage(response.ok ? "Connection health check completed." : "Connection health check could not run."); await loadShared();
  }
  async function rotateLineCredentials(event: FormEvent<HTMLFormElement>, connectionId: string) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setWorking(true); setMessage("");
    const response = await safeMutationFetch(`/tenant/ai-chat/social-connections/${connectionId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        channel: "line", channelAccessToken: data.get("channelAccessToken"), channelSecret: data.get("channelSecret"),
      }),
    });
    setWorking(false); setMessage(response.ok ? "LINE credentials rotated. Run a health check next." : "Credentials could not be rotated.");
    if (response.ok) { form.reset(); await loadShared(); }
  }
  async function rotateWhatsAppCredentials(event: FormEvent<HTMLFormElement>, connectionId: string) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setWorking(true); setMessage("");
    const response = await safeMutationFetch(`/tenant/ai-chat/social-connections/${connectionId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        channel: "whatsapp", accessToken: data.get("accessToken"), appSecret: data.get("appSecret"),
        verifyToken: data.get("verifyToken"), phoneNumberId: data.get("phoneNumberId"),
        businessAccountId: data.get("businessAccountId"),
      }),
    });
    setWorking(false); setMessage(response.ok ? "WhatsApp credentials rotated. Run a health check next." : "Credentials could not be rotated.");
    if (response.ok) { form.reset(); await loadShared(); }
  }
  async function rotateMessengerCredentials(event: FormEvent<HTMLFormElement>, connectionId: string) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setWorking(true); setMessage("");
    const response = await safeMutationFetch(`/tenant/ai-chat/social-connections/${connectionId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        channel: "messenger", pageAccessToken: data.get("pageAccessToken"), appSecret: data.get("appSecret"),
        verifyToken: data.get("verifyToken"), pageId: data.get("pageId"),
      }),
    });
    setWorking(false); setMessage(response.ok ? "Messenger credentials rotated. Run a health check next." : "Credentials could not be rotated.");
    if (response.ok) { form.reset(); await loadShared(); }
  }
  async function revokeSocial(connectionId: string) {
    if (!window.confirm("Revoke this channel connection? Its webhook and credentials will stop working immediately.")) return;
    setWorking(true); const response = await safeMutationFetch(`/tenant/ai-chat/social-connections/${connectionId}`, { method: "DELETE" }); setWorking(false);
    setMessage(response.ok ? "Channel connection revoked." : "Connection could not be revoked."); await loadShared(); await loadAgent(selectedAgentId);
  }
  function setNotificationProfile(profileId: string) {
    if (!definition || advancedPending) { setMessage("Fix the Advanced JSON before selecting a recipient."); return; }
    const next = { ...definition }; if (profileId) next.notificationProfileId = profileId; else delete next.notificationProfileId;
    updateDefinition(next);
  }
  function updateDefinition(next: AiPlaybook) {
    setDefinition(next); setDefinitionText(JSON.stringify(next, null, 2)); setAdvancedPending(false); setDraftDirty(true); setValidationPath(""); setValidationMessage("");
  }
  function changeAdvancedDefinition(value: string) {
    setDefinitionText(value); setAdvancedPending(true); setDraftDirty(true); setValidationPath(""); setValidationMessage("");
  }
  function validateAdvancedDefinition() {
    try {
      const parsed = aiPlaybookSchema.safeParse(JSON.parse(definitionText) as unknown);
      if (!parsed.success) {
        const issue = parsed.error.issues[0]!; const path = issue.path.map(String).join(".") || "advanced";
        setValidationPath("advanced"); setValidationMessage(playbookValidationMessage(path, issue.message)); return;
      }
      setDefinition(parsed.data); setDefinitionText(JSON.stringify(parsed.data, null, 2)); setAdvancedPending(false); setValidationPath(""); setValidationMessage("");
    } catch { setValidationPath("advanced"); setValidationMessage("Advanced JSON must be valid. Your text is preserved so you can repair it."); }
  }
  function selectAgent(agentId: string) {
    if (agentId === selectedAgentId) return;
    if (draftDirty && !window.confirm("Discard the unsaved playbook and knowledge changes?")) return;
    setSelectedAgentId(agentId);
  }

  if (session.error) return <WorkspaceSessionLoadError onRetry={() => window.location.reload()} />;
  if (session.loading || !session.selectedTenantId) return <main className="workspace-loading">Loading AI Chat…</main>;
  if (loadError) return <WorkspacePageLoadError active="ai_chat" title="AI Chat" resource="AI Chat Studio" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} onRetry={() => window.location.reload()} />;
  return <main className="workspace-shell"><WorkspaceSidebar active="ai_chat" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} />
    <section className="workspace-main"><WorkspaceSupportBanner tenantId={session.selectedTenantId} />
      <header className="workspace-header"><div><p>Grounded sales conversations</p><h1>AI Chat</h1></div><span className="role-label">{humanizePlanKey(capabilities?.planKey)} · {humanizeAccessMode(capabilities?.accessMode)}</span></header>
      <section className="tool-band flowbot-control-band"><div className="band-heading"><div><p>Agents</p><h2>Sales assistants</h2></div><span>{agents.length}</span></div>
        {canAuthor ? <form className="ai-agent-create" onSubmit={createAgent}><label>Agent name<input name="name" minLength={2} maxLength={100} required /></label><label>Business name<input name="businessName" minLength={2} maxLength={200} required /></label><label>Language<select name="defaultLanguage" defaultValue="en"><option value="en">English</option><option value="th">Thai</option></select></label><button disabled={working}>Create agent</button></form> : null}
        <div className="flowbot-tabs">{agents.map((agent) => <button type="button" className={agent.id === selectedAgentId ? "selected" : ""} key={agent.id} onClick={() => selectAgent(agent.id)}><strong>{agent.name}</strong><span>{agent.status} / {agent.deploymentCount} deployments</span></button>)}</div>
        {!agents.length ? <div className="pending-line"><strong>No AI agents</strong><span>Create the first grounded sales assistant.</span></div> : null}
      </section>
      {selectedAgent && draft && definition ? <>
        <section className="tool-band"><div className="band-heading"><div><p>Draft revision {draft.revision}</p><h2>{selectedAgent.name} playbook</h2></div><span>{selectedKnowledge.length} knowledge pins</span></div>
          <div className="ai-authoring-grid"><div><label>Approved knowledge</label><div className="knowledge-picker">{knowledgeLoadError ? <div className="pending-line inline-retry" role="alert"><strong>Knowledge options could not be loaded</strong><button className="secondary-command" type="button" onClick={() => void loadShared()}>Try again</button></div> : knowledge.map((source) => <label key={source.revisionId}><input type="checkbox" checked={selectedKnowledge.includes(source.revisionId)} disabled={!canAuthor} onChange={(event) => { setSelectedKnowledge((current) => event.target.checked ? [...current, source.revisionId] : current.filter((id) => id !== source.revisionId)); setDraftDirty(true); }} /> {source.name} <small>v{source.version}</small></label>)}</div></div>
            <label>Qualified-lead recipient<select disabled={!canAuthor || notificationsLoadError || advancedPending} value={definition.notificationProfileId || ""} onChange={(event) => setNotificationProfile(event.target.value)}><option value="">{notificationsLoadError ? "Recipients unavailable" : "No email action"}</option>{notifications.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select>{notificationsLoadError ? <span className="field-help" role="alert">Recipient options could not be loaded.</span> : null}</label></div>
          <AiPlaybookEditor definition={definition} definitionText={definitionText} readOnly={!canAuthor} advancedPending={advancedPending} validationPath={validationPath} validationMessage={validationMessage} onDefinitionChange={updateDefinition} onAdvancedChange={changeAdvancedDefinition} onAdvancedBlur={validateAdvancedDefinition} />
          {canAuthor ? <div className="flowbot-actions"><button type="button" className="secondary-command" disabled={working} onClick={() => void saveDraft()}>Save draft</button><button type="button" disabled={working || draftDirty} onClick={() => void publish()}>Publish immutable version</button>{draftDirty ? <span className="field-help">Save the current draft before publishing.</span> : null}</div> : null}
          {message ? <p className="inline-message" role="status">{message}</p> : null}
        </section>
        {canAuthor ? <section className="tool-band muted-band"><div className="band-heading"><div><p>Merchant-authorized test mode</p><h2>Preview without side effects</h2></div><span>20 / minute</span></div>
          <form className="ai-test-form" onSubmit={runTest}><label>Language<select name="language" defaultValue={selectedAgent.defaultLanguage}><option value="en">English</option><option value="th">Thai</option></select></label><label>Customer message<textarea name="testMessage" rows={3} maxLength={2000} required defaultValue="What can your consultation help me improve?" /></label><button disabled={working}>Run safe preview</button></form>
          {preview ? <div className="ai-preview"><strong>{preview.stage}</strong><p>{preview.text}</p><span>{preview.citationCount} citations / {preview.proposedActionTypes.join(", ") || "no actions"}</span></div> : null}
        </section> : null}
        <section className="tool-band"><div className="band-heading"><div><p>Qualified lead delivery</p><h2>Merchant email notifications</h2></div><span>{notificationsLoadError ? "Unavailable" : `${notifications.length} active`}</span></div>
          {canAuthor ? <form className="flowbot-deploy" onSubmit={createNotification}><label>Name<input name="name" minLength={2} maxLength={160} required /></label><label>Recipient email<input name="recipientEmail" type="email" maxLength={320} required /></label><button disabled={working || notificationsLoadError}>Add recipient</button></form> : null}
          <p className="field-help">Addresses are encrypted. Only the fixed qualified-lead template is allowed.</p><div className="data-table">{notificationsLoadError ? <div className="pending-line inline-retry" role="alert"><strong>Notification recipients could not be loaded</strong><span>Existing delivery settings have not changed.</span><button className="secondary-command" type="button" onClick={() => void loadShared()}>Try again</button></div> : notifications.map((item) => <div className="data-row" key={item.id}><strong>{item.name}</strong><span>{item.allowedTemplateKeys.join(", ")}</span><span>{item.status}</span></div>)}</div>
        </section>
        <section className="tool-band muted-band"><div className="band-heading"><div><p>Basic channel</p><h2>Website deployments</h2></div><span>{deployments.length}{capabilities?.limits.deployments ? ` / ${capabilities.limits.deployments}` : ""}</span></div>
          {canAuthor && selectedAgent.currentPublishedPlaybookVersionId ? <WebsiteDeploymentForm className="flowbot-deploy" onCreate={createDeployment} submitLabel="Create web deployment" working={working} /> : null}
          {newDeploymentKey ? <div className="deployment-secret"><strong>One-time deployment key</strong><code>{newDeploymentKey}</code><pre>{installSnippet}</pre></div> : null}
          <div className="data-table">{deployments.map((item) => <div className="data-row" key={item.id}><div><strong>{item.name}</strong><span>{item.allowedOrigins.join(", ")}</span></div><span>{item.channel}</span><span>{item.status}</span></div>)}{!deployments.length ? <div className="pending-line"><strong>No deployments</strong><span>Publish before creating a web deployment.</span></div> : null}</div>
        </section>
        <section className="tool-band"><div className="band-heading"><div><p>Premium social channels</p><h2>LINE connections</h2></div><span>{socialLoadError ? "Unavailable" : `${socialConnections.filter((item) => item.agentId === selectedAgentId && item.channel === "line" && item.status !== "revoked").length} active`}</span></div>
          {!capabilities?.social.line ? <div className="pending-line"><strong>Premium feature</strong><span>Upgrade to AI Chat Premium to connect LINE.</span></div> : null}
          {canAuthor && capabilities?.social.line && selectedAgent.currentPublishedPlaybookVersionId && !socialLoadError ? <details className="advanced-definition social-connection-setup"><summary>Connect a LINE Official Account</summary>
            <form className="flowbot-deploy" onSubmit={createLineConnection}><label>Connection name<input name="name" minLength={2} maxLength={160} required /></label><label>LINE account reference<input name="externalAccountRef" minLength={3} maxLength={200} required /></label><label>Channel access token<input name="channelAccessToken" type="password" minLength={16} maxLength={4096} autoComplete="off" required /></label><label>Channel secret<input name="channelSecret" type="password" minLength={16} maxLength={4096} autoComplete="off" required /></label><button disabled={working}>Connect LINE</button></form>
            <p className="field-help">Credentials are encrypted and never shown again. Use a stable internal account reference, not a secret.</p>
          </details> : null}
          {newSocialWebhookKey && newSocialChannel === "line" ? <div className="deployment-secret"><strong>One-time LINE webhook URL</strong><code>{socialCallbackUrl}</code><p className="field-help">Paste this into LINE Developers, enable webhooks, then run a health check below.</p></div> : null}
          <div className="data-table social-connection-list">{socialConnections.filter((item) => item.agentId === selectedAgentId && item.channel === "line").map((item) => <div className="social-connection-row" key={item.id}><div className="social-connection-summary"><div><strong>{item.name}</strong><span>{item.externalAccountRef}</span></div><div><span className={`health-pill health-${item.healthStatus}`}>{item.healthStatus}</span><span>{item.status}</span></div></div>
            {item.safeErrorCode ? <p className="field-help">Action needed: {item.safeErrorCode.replaceAll("_", " ")}</p> : null}
            {item.lastHealthAt ? <p className="field-help">Last checked {new Date(item.lastHealthAt).toLocaleString()}</p> : null}
            <div className="social-delivery-metrics"><span><strong>{item.succeededDeliveries}</strong> delivered</span><span><strong>{item.pendingDeliveries}</strong> pending</span><span><strong>{item.failedDeliveries + item.deadLetterDeliveries}</strong> failed</span><span><strong>{item.attemptedQuantity}</strong> channel units attempted</span></div>
            {canAuthor && item.status !== "revoked" ? <div className="flowbot-actions"><button type="button" className="secondary-command" disabled={working} onClick={() => void checkSocialHealth(item.id)}>Check health</button><button type="button" className="secondary-command" disabled={working} onClick={() => void revokeSocial(item.id)}>Revoke</button></div> : null}
            {canAuthor && item.status !== "revoked" ? <details className="credential-rotation"><summary>Rotate credentials</summary><form className="flowbot-deploy" onSubmit={(event) => void rotateLineCredentials(event, item.id)}><label>New access token<input name="channelAccessToken" type="password" minLength={16} maxLength={4096} autoComplete="off" required /></label><label>New channel secret<input name="channelSecret" type="password" minLength={16} maxLength={4096} autoComplete="off" required /></label><button disabled={working}>Rotate</button></form></details> : null}
          </div>)}{socialLoadError ? <div className="pending-line inline-retry" role="alert"><strong>Social connections could not be loaded</strong><span>Existing LINE settings have not changed.</span><button className="secondary-command" type="button" onClick={() => void loadShared()}>Try again</button></div> : !socialConnections.some((item) => item.agentId === selectedAgentId && item.channel === "line") ? <div className="pending-line"><strong>No LINE connection</strong><span>Publish the agent, then connect its LINE Official Account.</span></div> : null}</div>
        </section>
        <section className="tool-band muted-band"><div className="band-heading"><div><p>Premium social channels</p><h2>WhatsApp connections</h2></div><span>{socialLoadError ? "Unavailable" : `${socialConnections.filter((item) => item.agentId === selectedAgentId && item.channel === "whatsapp" && item.status !== "revoked").length} active`}</span></div>
          {!capabilities?.social.whatsapp ? <div className="pending-line"><strong>Premium feature</strong><span>Upgrade to AI Chat Premium to connect WhatsApp.</span></div> : null}
          {canAuthor && capabilities?.social.whatsapp && selectedAgent.currentPublishedPlaybookVersionId && !socialLoadError ? <details className="advanced-definition whatsapp-connection-setup"><summary>Connect a WhatsApp Business number</summary>
            <form className="flowbot-deploy" onSubmit={createWhatsAppConnection}><label>Connection name<input name="name" minLength={2} maxLength={160} required /></label><label>Business account reference<input name="externalAccountRef" minLength={3} maxLength={200} required /></label><label>Access token<input name="accessToken" type="password" minLength={16} maxLength={4096} autoComplete="off" required /></label><label>App secret<input name="appSecret" type="password" minLength={16} maxLength={4096} autoComplete="off" required /></label><label>Verify token<input name="verifyToken" type="password" minLength={16} maxLength={4096} autoComplete="off" required /></label><label>Phone number ID<input name="phoneNumberId" minLength={3} maxLength={200} required /></label><label>Business account ID<input name="businessAccountId" minLength={3} maxLength={200} required /></label><button disabled={working}>Connect WhatsApp</button></form>
            <p className="field-help">Credentials and the verify token are encrypted and never shown again. Replies are allowed only inside the customer-service window.</p>
          </details> : null}
          {newSocialWebhookKey && newSocialChannel === "whatsapp" ? <div className="deployment-secret"><strong>One-time WhatsApp callback URL</strong><code>{socialCallbackUrl}</code><p className="field-help">Use this callback URL and the verify token entered above, subscribe to messages, then run a health check.</p></div> : null}
          <div className="data-table social-connection-list">{socialConnections.filter((item) => item.agentId === selectedAgentId && item.channel === "whatsapp").map((item) => <div className="social-connection-row" key={item.id}><div className="social-connection-summary"><div><strong>{item.name}</strong><span>{item.externalAccountRef}</span></div><div><span className={`health-pill health-${item.healthStatus}`}>{item.healthStatus}</span><span>{item.status}</span></div></div>
            {item.safeErrorCode ? <p className="field-help">Action needed: {item.safeErrorCode.replaceAll("_", " ")}</p> : null}
            {item.lastHealthAt ? <p className="field-help">Last checked {new Date(item.lastHealthAt).toLocaleString()}</p> : null}
            <div className="social-delivery-metrics"><span><strong>{item.succeededDeliveries}</strong> delivered</span><span><strong>{item.pendingDeliveries}</strong> pending</span><span><strong>{item.failedDeliveries + item.deadLetterDeliveries}</strong> failed</span><span><strong>{item.attemptedQuantity}</strong> channel units attempted</span></div>
            {canAuthor && item.status !== "revoked" ? <div className="flowbot-actions"><button type="button" className="secondary-command" disabled={working} onClick={() => void checkSocialHealth(item.id)}>Check health</button><button type="button" className="secondary-command" disabled={working} onClick={() => void revokeSocial(item.id)}>Revoke</button></div> : null}
            {canAuthor && item.status !== "revoked" ? <details className="credential-rotation whatsapp-credential-rotation"><summary>Rotate credentials</summary><form className="flowbot-deploy" onSubmit={(event) => void rotateWhatsAppCredentials(event, item.id)}><label>New access token<input name="accessToken" type="password" minLength={16} maxLength={4096} autoComplete="off" required /></label><label>New app secret<input name="appSecret" type="password" minLength={16} maxLength={4096} autoComplete="off" required /></label><label>New verify token<input name="verifyToken" type="password" minLength={16} maxLength={4096} autoComplete="off" required /></label><label>Phone number ID<input name="phoneNumberId" minLength={3} maxLength={200} required /></label><label>Business account ID<input name="businessAccountId" minLength={3} maxLength={200} required /></label><button disabled={working}>Rotate</button></form></details> : null}
          </div>)}{socialLoadError ? <div className="pending-line inline-retry" role="alert"><strong>Social connections could not be loaded</strong><span>Existing WhatsApp settings have not changed.</span><button className="secondary-command" type="button" onClick={() => void loadShared()}>Try again</button></div> : !socialConnections.some((item) => item.agentId === selectedAgentId && item.channel === "whatsapp") ? <div className="pending-line"><strong>No WhatsApp connection</strong><span>Publish the agent, then connect its WhatsApp Business number.</span></div> : null}</div>
        </section>
        <section className="tool-band"><div className="band-heading"><div><p>Premium social channels</p><h2>Messenger connections</h2></div><span>{socialLoadError ? "Unavailable" : `${socialConnections.filter((item) => item.agentId === selectedAgentId && item.channel === "messenger" && item.status !== "revoked").length} active`}</span></div>
          {!capabilities?.social.messenger ? <div className="pending-line"><strong>Premium feature</strong><span>Upgrade to AI Chat Premium to connect Messenger.</span></div> : null}
          {canAuthor && capabilities?.social.messenger && selectedAgent.currentPublishedPlaybookVersionId && !socialLoadError ? <details className="advanced-definition messenger-connection-setup"><summary>Connect a Messenger Page</summary>
            <form className="flowbot-deploy" onSubmit={createMessengerConnection}><label>Connection name<input name="name" minLength={2} maxLength={160} required /></label><label>Page account reference<input name="externalAccountRef" minLength={3} maxLength={200} required /></label><label>Page access token<input name="pageAccessToken" type="password" minLength={16} maxLength={4096} autoComplete="off" required /></label><label>App secret<input name="appSecret" type="password" minLength={16} maxLength={4096} autoComplete="off" required /></label><label>Verify token<input name="verifyToken" type="password" minLength={16} maxLength={4096} autoComplete="off" required /></label><label>Page ID<input name="pageId" minLength={3} maxLength={200} required /></label><button disabled={working}>Connect Messenger</button></form>
            <p className="field-help">Credentials and the verify token are encrypted and never shown again. Replies are allowed only inside the customer-service window.</p>
          </details> : null}
          {newSocialWebhookKey && newSocialChannel === "messenger" ? <div className="deployment-secret"><strong>One-time Messenger callback URL</strong><code>{socialCallbackUrl}</code><p className="field-help">Use this callback URL and the verify token entered above, subscribe to messages and messaging events, then run a health check.</p></div> : null}
          <div className="data-table social-connection-list">{socialConnections.filter((item) => item.agentId === selectedAgentId && item.channel === "messenger").map((item) => <div className="social-connection-row" key={item.id}><div className="social-connection-summary"><div><strong>{item.name}</strong><span>{item.externalAccountRef}</span></div><div><span className={`health-pill health-${item.healthStatus}`}>{item.healthStatus}</span><span>{item.status}</span></div></div>
            {item.safeErrorCode ? <p className="field-help">Action needed: {item.safeErrorCode.replaceAll("_", " ")}</p> : null}
            {item.lastHealthAt ? <p className="field-help">Last checked {new Date(item.lastHealthAt).toLocaleString()}</p> : null}
            <div className="social-delivery-metrics"><span><strong>{item.succeededDeliveries}</strong> delivered</span><span><strong>{item.pendingDeliveries}</strong> pending</span><span><strong>{item.failedDeliveries + item.deadLetterDeliveries}</strong> failed</span><span><strong>{item.attemptedQuantity}</strong> channel units attempted</span></div>
            {canAuthor && item.status !== "revoked" ? <div className="flowbot-actions"><button type="button" className="secondary-command" disabled={working} onClick={() => void checkSocialHealth(item.id)}>Check health</button><button type="button" className="secondary-command" disabled={working} onClick={() => void revokeSocial(item.id)}>Revoke</button></div> : null}
            {canAuthor && item.status !== "revoked" ? <details className="credential-rotation messenger-credential-rotation"><summary>Rotate credentials</summary><form className="flowbot-deploy" onSubmit={(event) => void rotateMessengerCredentials(event, item.id)}><label>New page access token<input name="pageAccessToken" type="password" minLength={16} maxLength={4096} autoComplete="off" required /></label><label>New app secret<input name="appSecret" type="password" minLength={16} maxLength={4096} autoComplete="off" required /></label><label>New verify token<input name="verifyToken" type="password" minLength={16} maxLength={4096} autoComplete="off" required /></label><label>Page ID<input name="pageId" minLength={3} maxLength={200} required /></label><button disabled={working}>Rotate</button></form></details> : null}
          </div>)}{socialLoadError ? <div className="pending-line inline-retry" role="alert"><strong>Social connections could not be loaded</strong><span>Existing Messenger settings have not changed.</span><button className="secondary-command" type="button" onClick={() => void loadShared()}>Try again</button></div> : !socialConnections.some((item) => item.agentId === selectedAgentId && item.channel === "messenger") ? <div className="pending-line"><strong>No Messenger connection</strong><span>Publish the agent, then connect its Messenger Page.</span></div> : null}</div>
        </section>
        {analyticsLoadError ? <section className="tool-band"><div className="pending-line inline-retry" role="alert"><strong>AI Chat analytics could not be loaded</strong><span>Agent and deployment records remain available.</span><button className="secondary-command" type="button" onClick={() => void loadShared()}>Try again</button></div></section> : null}
        {analytics ? <section className="tool-band"><div className="band-heading"><div><p>{analytics.periodDays}-day {analytics.level}</p><h2>AI Chat analytics</h2></div><span>{analytics.settledResponses} metered responses</span></div><div className="metric-grid"><div><strong>{analytics.sessions}</strong><span>Sessions</span></div><div><strong>{analytics.completedTurns}</strong><span>Completed turns</span></div><div><strong>{analytics.leads}</strong><span>Leads</span></div><div><strong>{analytics.appointmentRequests}</strong><span>Appointment requests</span></div><div><strong>{analytics.handovers}</strong><span>Handovers</span></div><div><strong>{analytics.unanswered}</strong><span>Low-confidence questions</span></div></div>
          {analytics.channels?.length ? <div className="data-table channel-analytics"><div className="data-row channel-analytics-heading"><strong>Channel</strong><span>Sessions / turns</span><span>Leads / appointments</span><span>Delivery</span></div>{analytics.channels.map((channel) => <div className="data-row" key={channel.channel}><strong>{channel.channel === "web" ? "Website" : channel.channel === "line" ? "LINE" : channel.channel === "whatsapp" ? "WhatsApp" : "Messenger"}</strong><span>{channel.sessions} sessions / {channel.completedTurns} completed / {channel.failedTurns} failed</span><span>{channel.leads} leads / {channel.appointmentRequests} appointments</span><span>{channel.channel === "web" ? "Web runtime" : `${channel.delivered} delivered / ${channel.pendingDeliveries} pending / ${channel.failedDeliveries} failed / ${channel.attemptedQuantity} units`}</span></div>)}</div> : null}
          {analytics.level === "advanced" ? <div className="ai-analytics-breakdown">
            <div><h3>Top customer questions</h3>{analytics.questions?.length ? <ol>{analytics.questions.map((item) => <li key={item.question}><span>{item.question}</span><strong>{item.occurrences}</strong></li>)}</ol> : <p>No questions in this period.</p>}</div>
            <div><h3>Customer intents</h3>{analytics.intents?.length ? <ol>{analytics.intents.map((item) => <li key={item.intent}><span>{item.intent.replaceAll("_", " ")}</span><strong>{item.occurrences}</strong></li>)}</ol> : <p>No classified intents in this period.</p>}</div>
            <div><h3>Lead segments</h3>{analytics.segments?.length ? <ol>{analytics.segments.map((item) => <li key={item.segment}><span>{item.segment}</span><strong>{item.customers}</strong></li>)}</ol> : <p>No scored customers yet.</p>}</div>
          </div> : null}
        </section> : null}
      </> : null}
    </section>
  </main>;
}
