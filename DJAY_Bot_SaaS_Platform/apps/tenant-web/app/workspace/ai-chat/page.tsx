"use client";

import { useEffect, useState, type FormEvent } from "react";
import { aiPlaybookSchema, type AiPlaybook } from "@djay/sales-core";
import { currentIntlLocale, safeMutationFetch, uiCopy } from "@djay/shared";
import { createWidgetInstallSnippet } from "@djay/shared/widget-install";
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
type Deployment = { id: string; name: string; channel: string; keyPrefix: string | null; allowedOrigins: string[]; status: string; trafficStatus: "inactive" | "live"; liveAt: string | null; createdAt: string };
type InstallCheck = { id: string; deploymentId: string; targetOrigin: string; status: string; safeResultCode: string | null; createdAt: string };
type PlaybookVersion = { id: string; version: number; sourceVersionId: string | null; publishedAt: string; knowledgeCount: number };
type Notification = { id: string; name: string; allowedTemplateKeys: string[]; status: string };
type Preview = { stage: string; text: string; proposedActionTypes: string[]; citationCount: number; handover: boolean };
type ChannelAnalytics = { channel: "web" | "line" | "whatsapp" | "messenger"; sessions: number; completedTurns: number; failedTurns: number; leads: number; appointmentRequests: number; delivered: number; pendingDeliveries: number; failedDeliveries: number; attemptedQuantity: number };
type Analytics = { periodDays: number; level: string; sessions: number; completedTurns: number; failedTurns: number; handovers: number; leads: number; appointmentRequests: number; settledResponses: number; unanswered: number; channels?: ChannelAnalytics[]; questions?: { question: string; occurrences: number }[]; intents?: { intent: string; occurrences: number }[]; segments?: { segment: string; customers: number }[] };

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
  const [installChecks, setInstallChecks] = useState<InstallCheck[]>([]);
  const [versions, setVersions] = useState<PlaybookVersion[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]); const [newDeploymentKey, setNewDeploymentKey] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null); const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [message, setMessage] = useState(""); const [working, setWorking] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [knowledgeLoadError, setKnowledgeLoadError] = useState(false); const [notificationsLoadError, setNotificationsLoadError] = useState(false);
  const [analyticsLoadError, setAnalyticsLoadError] = useState(false);
  const canAuthor = session.allows("ai_chat.author");
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId);
  const installSnippet = newDeploymentKey
    ? createWidgetInstallSnippet("ai-chat", newDeploymentKey, tenantWidgetInstallEnvironment)
    : "";

  async function loadAgents() {
    try {
      const response = await fetch("/tenant/ai-chat/agents", { cache: "no-store" }); if (!response.ok) throw new Error("ai_chat_unavailable");
      const result = await response.json(); const next = result.agents || []; setAgents(next); setCapabilities(result.capabilities || null);
      setSelectedAgentId((current) => current && next.some((agent: Agent) => agent.id === current) ? current : next[0]?.id || ""); setLoadError(false);
    } catch { setLoadError(true); }
  }
  async function loadShared() {
    const [knowledgeResponse, notificationResponse, analyticsResponse] = await Promise.all([
      fetch("/tenant/knowledge", { cache: "no-store" }).catch(() => null), fetch("/tenant/ai-chat/notifications", { cache: "no-store" }).catch(() => null),
      fetch("/tenant/ai-chat/analytics", { cache: "no-store" }).catch(() => null),
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
  }
  async function loadAgent(agentId: string) {
    if (!agentId) { setDraft(null); setDefinition(null); setDeployments([]); setInstallChecks([]); setVersions([]); return; }
    try {
      const [draftResponse, deploymentResponse, versionResponse, installResponse] = await Promise.all([
        fetch(`/tenant/ai-chat/agents/${agentId}/draft`, { cache: "no-store" }),
        fetch(`/tenant/ai-chat/agents/${agentId}/deployments`, { cache: "no-store" }),
        fetch(`/tenant/ai-chat/agents/${agentId}/versions`, { cache: "no-store" }),
        fetch("/tenant/ai-chat/install-checks", { cache: "no-store" }),
      ]);
      if (!draftResponse.ok || !deploymentResponse.ok || !versionResponse.ok || !installResponse.ok) throw new Error("ai_chat_detail_unavailable");
      const value = (await draftResponse.json()).draft as Draft; const parsed = aiPlaybookSchema.safeParse(value.definition); if (!parsed.success) throw new Error("invalid_ai_playbook");
      setDraft(value); setDefinition(parsed.data); setDefinitionText(JSON.stringify(parsed.data, null, 2)); setSelectedKnowledge(value.knowledgeRevisionIds);
      setAdvancedPending(false); setDraftDirty(false); setValidationPath(""); setValidationMessage("");
      setDeployments((await deploymentResponse.json()).deployments || []); setLoadError(false);
      setVersions((await versionResponse.json()).versions || []);
      setInstallChecks((await installResponse.json()).checks || []);
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
  async function rollback(sourceVersionId: string) {
    if (!selectedAgentId || !window.confirm(uiCopy("เผยแพร่คู่มือเวอร์ชันนี้เป็นเวอร์ชันใหม่หรือไม่?", "Publish this historical playbook as a new version?"))) return;
    setWorking(true); setMessage("");
    const response = await safeMutationFetch(`/tenant/ai-chat/agents/${selectedAgentId}/rollback`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceVersionId }),
    });
    const result = await response.json(); setWorking(false);
    setMessage(response.ok ? uiCopy(`เผยแพร่เวอร์ชัน ${result.version} จากประวัติแล้ว`, `Version ${result.version} published from history.`) : uiCopy("เผยแพร่เวอร์ชันย้อนหลังไม่สำเร็จ", "Historical version could not be published."));
    if (response.ok) { await loadAgents(); await loadAgent(selectedAgentId); }
  }
  async function createDeployment(input: Readonly<{ name: string; allowedOrigins: readonly [string] }>, form: HTMLFormElement) {
    if (!selectedAgentId) return; setWorking(true); setNewDeploymentKey("");
    const response = await safeMutationFetch(`/tenant/ai-chat/agents/${selectedAgentId}/deployments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }); const result = await response.json(); setWorking(false);
    if (!response.ok) { setMessage("Website deployment could not be created."); return; } setNewDeploymentKey(result.deploymentKey); setMessage("Deployment key created. It is shown once."); form.reset(); await loadAgent(selectedAgentId);
  }
  async function requestInstallCheck(deployment: Deployment) {
    const targetOrigin = deployment.allowedOrigins[0]; if (!targetOrigin) return;
    setWorking(true); setMessage("");
    const response = await safeMutationFetch("/tenant/ai-chat/install-checks", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deploymentId: deployment.id, targetOrigin }),
    });
    setWorking(false);
    setMessage(response.ok
      ? uiCopy("เริ่มตรวจสอบแล้ว เปิดเว็บไซต์จริงที่ติดตั้งวิดเจ็ต จากนั้นกลับมาโหลดหน้านี้ใหม่", "Install check started. Open the real website containing the widget, then reload this page.")
      : uiCopy("เริ่มตรวจสอบการติดตั้งไม่สำเร็จ", "Install check could not be started."));
    if (response.ok) await loadAgent(selectedAgentId);
  }
  async function changeTraffic(deployment: Deployment, action: "go_live" | "stop") {
    const confirmed = window.confirm(action === "go_live"
      ? uiCopy("เปิดรับการสนทนาจริงหรือไม่? ระบบจะตรวจสอบสิทธิ์ เวอร์ชัน โควตา และการติดตั้งอีกครั้ง", "Go live? Access, version, quota, and installation will be revalidated.")
      : uiCopy("หยุดรับการสนทนาใหม่หรือไม่?", "Stop new conversations?"));
    if (!confirmed) return;
    setWorking(true); setMessage("");
    const response = await safeMutationFetch(`/tenant/ai-chat/deployments/${deployment.id}/traffic`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
    });
    const result = await response.json(); setWorking(false);
    const failure = result.status === "verification_required" ? uiCopy("ต้องยืนยันการติดตั้งจากเว็บไซต์ที่อนุญาตก่อน", "Verify installation from an allowed website first.")
      : result.status === "quota_unavailable" ? uiCopy("โควตาปัจจุบันไม่พร้อมใช้งาน", "Current quota is unavailable.")
        : uiCopy("เปลี่ยนสถานะไม่สำเร็จ", "Traffic state could not be changed.");
    setMessage(response.ok
      ? action === "go_live" ? uiCopy("เปิดใช้งานจริงแล้ว", "Deployment is live.") : uiCopy("หยุดรับการสนทนาใหม่แล้ว", "New conversations are stopped.")
      : failure);
    if (response.ok) await loadAgent(selectedAgentId);
  }
  async function createNotification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setWorking(true);
    const response = await safeMutationFetch("/tenant/ai-chat/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: data.get("name"), recipientEmail: data.get("recipientEmail") }) }); setWorking(false);
    setMessage(response.ok ? "Qualified-lead recipient added." : "Notification recipient could not be added."); if (response.ok) { form.reset(); await loadShared(); }
  }
  async function runTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedAgentId) return; const data = new FormData(event.currentTarget); setWorking(true); setPreview(null);
    const response = await safeMutationFetch(`/tenant/ai-chat/agents/${selectedAgentId}/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inputId: crypto.randomUUID(), language: data.get("language"), message: data.get("testMessage") }) }); const result = await response.json(); setWorking(false);
    if (!response.ok) { setMessage("Test mode is temporarily unavailable."); return; } setPreview(result.preview);
    setMessage(result.evidence === "recorded"
      ? "Preview generated and recorded against the matching published version. No action was executed and no customer usage was charged."
      : "Preview generated for the draft. Publish the unchanged draft before testing again to create version-bound evidence.");
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
    if (draftDirty && !window.confirm(uiCopy("ทิ้งการเปลี่ยนแปลง playbook และคลังความรู้ที่ยังไม่ได้บันทึกหรือไม่?", "Discard the unsaved playbook and knowledge changes?"))) return;
    setSelectedAgentId(agentId);
  }

  if (session.error) return <WorkspaceSessionLoadError onRetry={() => window.location.reload()} />;
  if (session.loading || !session.selectedTenantId) return <main className="workspace-loading">กำลังโหลดแชต AI…</main>;
  if (loadError) return <WorkspacePageLoadError active="ai_chat" title="แชต AI" resource="AI Chat Studio" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} onRetry={() => window.location.reload()} />;
  return <main className="workspace-shell"><WorkspaceSidebar active="ai_chat" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} />
    <section id="workspace-main" className="workspace-main" tabIndex={-1}><WorkspaceSupportBanner tenantId={session.selectedTenantId} />
      <header className="workspace-header"><div><p>การสนทนาการขายที่อ้างอิงข้อมูลจริง</p><h1>แชต AI</h1></div><span className="role-label">{humanizePlanKey(capabilities?.planKey)} · {humanizeAccessMode(capabilities?.accessMode)}</span></header>
      <section className="tool-band flowbot-control-band"><div className="band-heading"><div><p>เอเจนต์</p><h2>ผู้ช่วยฝ่ายขาย</h2></div><span>{agents.length}</span></div>
        {canAuthor ? <form className="ai-agent-create" onSubmit={createAgent}><label>ชื่อเอเจนต์<input name="name" minLength={2} maxLength={100} required /></label><label>ชื่อธุรกิจ<input name="businessName" minLength={2} maxLength={200} required /></label><label>ภาษา<select name="defaultLanguage" defaultValue="th"><option value="th">ไทย</option><option value="en">English</option></select></label><button disabled={working}>สร้างเอเจนต์</button></form> : null}
        <div className="flowbot-tabs">{agents.map((agent) => <button type="button" className={agent.id === selectedAgentId ? "selected" : ""} key={agent.id} onClick={() => selectAgent(agent.id)}><strong data-no-localize>{agent.name}</strong><span>{agent.status} / {agent.deploymentCount} deployments</span></button>)}</div>
        {!agents.length ? <div className="pending-line"><strong>ยังไม่มีเอเจนต์ AI</strong><span>สร้างผู้ช่วยฝ่ายขายที่อ้างอิงข้อมูลจริงรายการแรก</span></div> : null}
      </section>
      {selectedAgent && draft && definition ? <>
        <section className="tool-band"><div className="band-heading"><div><p>Draft revision {draft.revision}</p><h2><span data-no-localize>{selectedAgent.name}</span> playbook</h2></div><span>{selectedKnowledge.length} knowledge pins</span></div>
          <div className="ai-authoring-grid"><div><label>ความรู้ที่อนุมัติ</label><div className="knowledge-picker">{knowledgeLoadError ? <div className="pending-line inline-retry" role="alert"><strong>โหลดตัวเลือกคลังความรู้ไม่สำเร็จ</strong><button className="secondary-command" type="button" onClick={() => void loadShared()}>ลองใหม่</button></div> : knowledge.map((source) => <label key={source.revisionId}><input type="checkbox" checked={selectedKnowledge.includes(source.revisionId)} disabled={!canAuthor} onChange={(event) => { setSelectedKnowledge((current) => event.target.checked ? [...current, source.revisionId] : current.filter((id) => id !== source.revisionId)); setDraftDirty(true); }} /> <span data-no-localize>{source.name}</span> <small>v{source.version}</small></label>)}</div></div>
            <label>ผู้รับข้อมูลผู้สนใจที่ผ่านการคัดกรอง<select disabled={!canAuthor || notificationsLoadError || advancedPending} value={definition.notificationProfileId || ""} onChange={(event) => setNotificationProfile(event.target.value)}><option value="">{notificationsLoadError ? "Recipients unavailable" : "No email action"}</option>{notifications.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select>{notificationsLoadError ? <span className="field-help" role="alert">โหลดตัวเลือกผู้รับไม่สำเร็จ</span> : null}</label></div>
          <AiPlaybookEditor definition={definition} definitionText={definitionText} readOnly={!canAuthor} advancedPending={advancedPending} validationPath={validationPath} validationMessage={validationMessage} onDefinitionChange={updateDefinition} onAdvancedChange={changeAdvancedDefinition} onAdvancedBlur={validateAdvancedDefinition} />
          {canAuthor ? <div className="flowbot-actions"><button type="button" className="secondary-command" disabled={working} onClick={() => void saveDraft()}>บันทึกฉบับร่าง</button><button type="button" disabled={working || draftDirty} onClick={() => void publish()}>เผยแพร่เวอร์ชันถาวร</button>{draftDirty ? <span className="field-help">บันทึกฉบับร่างปัจจุบันก่อนเผยแพร่</span> : null}</div> : null}
          {message ? <p className="inline-message" role="status">{message}</p> : null}
        </section>
        {canAuthor ? <section className="tool-band muted-band"><div className="band-heading"><div><p>โหมดทดสอบที่ธุรกิจอนุญาต</p><h2>ดูตัวอย่างโดยไม่เปลี่ยนข้อมูล</h2></div><span>20 ครั้ง / นาที</span></div>
          <form className="ai-test-form" onSubmit={runTest}><label>ภาษา<select name="language" defaultValue={selectedAgent.defaultLanguage}><option value="en">English</option><option value="th">ไทย</option></select></label><label>ข้อความจากลูกค้า<textarea name="testMessage" rows={3} maxLength={2000} required defaultValue="What can your consultation help me improve?" /></label><button disabled={working}>เรียกดูตัวอย่างอย่างปลอดภัย</button></form>
          {preview ? <div className="ai-preview"><strong>{preview.stage}</strong><p data-no-localize>{preview.text}</p><span>{preview.citationCount} citations / {preview.proposedActionTypes.join(", ") || "no actions"}</span></div> : null}
        </section> : null}
        <section className="tool-band"><div className="band-heading"><div><p>การส่งข้อมูลผู้สนใจที่ผ่านการคัดกรอง</p><h2>การแจ้งเตือนทางอีเมลธุรกิจ</h2></div><span>{notificationsLoadError ? "Unavailable" : `${notifications.length} active`}</span></div>
          {canAuthor ? <form className="flowbot-deploy" onSubmit={createNotification}><label>ชื่อ<input name="name" minLength={2} maxLength={160} required /></label><label>อีเมลผู้รับ<input name="recipientEmail" type="email" maxLength={320} required /></label><button disabled={working || notificationsLoadError}>เพิ่มผู้รับ</button></form> : null}
          <p className="field-help">ที่อยู่อีเมลถูกเข้ารหัส และส่งได้เฉพาะเทมเพลตผู้สนใจที่ผ่านการคัดกรองแล้ว</p><div className="data-table">{notificationsLoadError ? <div className="pending-line inline-retry" role="alert"><strong>โหลดรายชื่อผู้รับการแจ้งเตือนไม่สำเร็จ</strong><span>การตั้งค่าการส่งข้อมูลเดิมไม่ถูกเปลี่ยน</span><button className="secondary-command" type="button" onClick={() => void loadShared()}>ลองใหม่</button></div> : notifications.map((item) => <div className="data-row" key={item.id}><strong data-no-localize>{item.name}</strong><span>{item.allowedTemplateKeys.join(", ")}</span><span>{item.status}</span></div>)}</div>
        </section>
        <section className="tool-band muted-band"><div className="band-heading"><div><p>ช่องทางพื้นฐาน</p><h2>การติดตั้งบนเว็บไซต์</h2></div><span>{deployments.length}{capabilities?.limits.deployments ? ` / ${capabilities.limits.deployments}` : ""}</span></div>
          {canAuthor && selectedAgent.currentPublishedPlaybookVersionId ? <WebsiteDeploymentForm className="flowbot-deploy" onCreate={createDeployment} submitLabel="Create web deployment" working={working} /> : null}
          {newDeploymentKey ? <div className="deployment-secret"><strong>กุญแจติดตั้งที่แสดงครั้งเดียว</strong><code>{newDeploymentKey}</code><pre>{installSnippet}</pre></div> : null}
          <div className="data-table">{deployments.map((item) => { const check = installChecks.find((candidate) => candidate.deploymentId === item.id); return <div className="data-row" key={item.id}><div><strong data-no-localize>{item.name}</strong><span data-no-localize>{item.allowedOrigins.join(", ")}</span></div><div><span>{uiCopy("ติดตั้ง", "Install")}: {check?.status || "not checked"}</span><span>{uiCopy("การใช้งานจริง", "Traffic")}: {item.trafficStatus}</span></div>{canAuthor ? <div className="setup-action-row"><button type="button" className="secondary-command" disabled={working} onClick={() => void requestInstallCheck(item)}>{uiCopy("ตรวจสอบการติดตั้ง", "Check install")}</button><button type="button" disabled={working || (item.trafficStatus !== "live" && check?.status !== "verified")} onClick={() => void changeTraffic(item, item.trafficStatus === "live" ? "stop" : "go_live")}>{item.trafficStatus === "live" ? uiCopy("หยุดรับข้อความ", "Stop traffic") : uiCopy("เปิดใช้งานจริง", "Go live")}</button></div> : <code>{item.keyPrefix}...</code>}</div>; })}{!deployments.length ? <div className="pending-line"><strong>ยังไม่มีการติดตั้ง</strong><span>เผยแพร่ก่อนสร้างการติดตั้งบนเว็บ</span></div> : null}</div>
        </section>
        <section className="tool-band"><div className="band-heading"><div><p>ประวัติที่แก้ไขไม่ได้</p><h2>เวอร์ชันคู่มือที่เผยแพร่แล้ว</h2></div><span>{versions.length}</span></div>
          <div className="data-table">{versions.map((version) => <div className="data-row" key={version.id}><div><strong>Version {version.version}</strong><span>{new Date(version.publishedAt).toLocaleString(currentIntlLocale())} · {version.knowledgeCount} knowledge pins</span></div><span>{version.sourceVersionId ? "Published from history" : "Published"}</span>{canAuthor ? <button type="button" className="secondary-command" disabled={working || version.id === selectedAgent.currentPublishedPlaybookVersionId} onClick={() => void rollback(version.id)}>{version.id === selectedAgent.currentPublishedPlaybookVersionId ? "Current" : "Publish again"}</button> : <span />}</div>)}
            {!versions.length ? <div className="pending-line"><strong>ยังไม่มีเวอร์ชันที่เผยแพร่</strong><span>บันทึกและเผยแพร่คู่มือฉบับแรกเพื่อสร้างประวัติที่ย้อนกลับได้</span></div> : null}</div>
        </section>
        {analyticsLoadError ? <section className="tool-band"><div className="pending-line inline-retry" role="alert"><strong>โหลดข้อมูลวิเคราะห์แชต AI ไม่สำเร็จ</strong><span>ข้อมูลเอเจนต์และการติดตั้งจะยังคงอยู่</span><button className="secondary-command" type="button" onClick={() => void loadShared()}>ลองใหม่</button></div></section> : null}
        {analytics ? <section className="tool-band"><div className="band-heading"><div><p>{analytics.periodDays}-day {analytics.level}</p><h2>ข้อมูลวิเคราะห์แชต AI</h2></div><span>{analytics.settledResponses} metered responses</span></div><div className="metric-grid"><div><strong>{analytics.sessions}</strong><span>เซสชัน</span></div><div><strong>{analytics.completedTurns}</strong><span>ช่วงสนทนาที่เสร็จสิ้น</span></div><div><strong>{analytics.leads}</strong><span>ผู้สนใจ</span></div><div><strong>{analytics.appointmentRequests}</strong><span>คำขอนัดหมาย</span></div><div><strong>{analytics.handovers}</strong><span>การส่งต่อให้ทีม</span></div><div><strong>{analytics.unanswered}</strong><span>คำถามที่มีความมั่นใจต่ำ</span></div></div>
          {analytics.channels?.some((channel) => channel.channel === "web") ? <div className="data-table channel-analytics"><div className="data-row channel-analytics-heading"><strong>ช่องทาง</strong><span>เซสชัน / ช่วงสนทนา</span><span>ผู้สนใจ / นัดหมาย</span><span>การทำงาน</span></div>{analytics.channels.filter((channel) => channel.channel === "web").map((channel) => <div className="data-row" key={channel.channel}><strong>Website</strong><span>{uiCopy(`${channel.sessions} เซสชัน / เสร็จสิ้น ${channel.completedTurns} / ล้มเหลว ${channel.failedTurns}`, `${channel.sessions} sessions / ${channel.completedTurns} completed / ${channel.failedTurns} failed`)}</span><span>{uiCopy(`ผู้สนใจ ${channel.leads} / นัดหมาย ${channel.appointmentRequests}`, `${channel.leads} leads / ${channel.appointmentRequests} appointments`)}</span><span>Web runtime</span></div>)}</div> : null}
          {analytics.level === "advanced" ? <div className="ai-analytics-breakdown">
            <div><h3>คำถามยอดนิยมของลูกค้า</h3>{analytics.questions?.length ? <ol>{analytics.questions.map((item) => <li key={item.question}><span>{item.question}</span><strong>{item.occurrences}</strong></li>)}</ol> : <p>รอบนี้ยังไม่มีคำถาม</p>}</div>
            <div><h3>ความต้องการของลูกค้า</h3>{analytics.intents?.length ? <ol>{analytics.intents.map((item) => <li key={item.intent}><span>{item.intent.replaceAll("_", " ")}</span><strong>{item.occurrences}</strong></li>)}</ol> : <p>รอบนี้ยังไม่มีการจำแนกความต้องการ</p>}</div>
            <div><h3>กลุ่มผู้สนใจ</h3>{analytics.segments?.length ? <ol>{analytics.segments.map((item) => <li key={item.segment}><span>{item.segment}</span><strong>{item.customers}</strong></li>)}</ol> : <p>ยังไม่มีลูกค้าที่ประเมินคะแนนแล้ว</p>}</div>
          </div> : null}
        </section> : null}
      </> : null}
    </section>
  </main>;
}
