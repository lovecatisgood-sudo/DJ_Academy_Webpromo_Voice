"use client";

import { useEffect, useState, type FormEvent } from "react";
import { currentIntlLocale, currentUiLocale, normalizeExactWebsiteOrigin, safeMutationFetch, uiCopy, voiceDeploymentFieldConstraints, voiceDeploymentValidationError } from "@djay/shared";
import { createWidgetInstallSnippet } from "@djay/shared/widget-install";
import { tenantWidgetInstallEnvironment } from "../../../lib/widget-install-environment";
import { WorkspaceSidebar } from "../WorkspaceSidebar";
import { WorkspacePageLoadError, WorkspaceSessionLoadError } from "../WorkspaceAccess";
import { WorkspaceSupportBanner } from "../WorkspaceSupportBanner";
import { useWorkspaceSession } from "../useWorkspaceSession";
import { VoiceDeploymentForm } from "./VoiceDeploymentForm";

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
  trafficStatus: "inactive" | "live"; livePlaybookVersionId: string | null; liveAt: string | null;
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
type InstallCheck = { id: string; deploymentId: string; targetOrigin: string; status: string; safeResultCode: string | null; createdAt: string };
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
function formatLimit(value: number | null, suffix = "") { return value === null ? uiCopy("ยังไม่ได้ตั้งค่า", "Not configured") : `${value}${suffix}`; }
function formatDuration(seconds: number | null) {
  if (seconds === null) return "—";
  if (seconds < 60) return currentUiLocale() === "th" ? `${Math.round(seconds)} วินาที` : `${Math.round(seconds)} sec`;
  const minutes = Math.floor(seconds / 60); const remainder = Math.round(seconds % 60);
  return currentUiLocale() === "th" ? `${minutes} นาที ${remainder} วินาที` : `${minutes}m ${remainder}s`;
}
function formatLatency(milliseconds: number | null) {
  if (milliseconds === null) return "—";
  return milliseconds < 1000 ? `${Math.round(milliseconds)} ms` : currentUiLocale() === "th" ? `${(milliseconds / 1000).toFixed(1)} วินาที` : `${(milliseconds / 1000).toFixed(1)} sec`;
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
  const [installChecks, setInstallChecks] = useState<InstallCheck[]>([]);
  const [message, setMessage] = useState(""); const [working, setWorking] = useState(false);
  const [draftDirty, setDraftDirty] = useState(false);
  const [studioValidationMessage, setStudioValidationMessage] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [knowledgeLoadError, setKnowledgeLoadError] = useState(false);
  const [notificationLoadError, setNotificationLoadError] = useState(false);
  const [analyticsLoadError, setAnalyticsLoadError] = useState(false);
  const canDeploy = session.allows("voice.deploy");
  const canEdit = Boolean(canDeploy && studio?.editable && studio.deployment.status !== "revoked");
  const installSnippet = deploymentKey
    ? createWidgetInstallSnippet("voice", deploymentKey, tenantWidgetInstallEnvironment)
    : "";

  async function loadStudio(id: string) {
    if (!id) { setStudio(null); setAnalytics(null); setInstallChecks([]); setKnowledgeLoadError(false); setNotificationLoadError(false); setAnalyticsLoadError(false); return; }
    const studioResponse = await fetch(`/tenant/voice/deployments/${id}/studio`, { cache: "no-store" });
    if (!studioResponse.ok) throw new Error("voice_studio_unavailable");
    setStudio((await studioResponse.json()).studio); setDraftDirty(false);
    const [knowledgeResponse, notificationResponse, analyticsResponse, installResponse] = await Promise.all([
      fetch("/tenant/knowledge", { cache: "no-store" }).catch(() => null),
      fetch("/tenant/ai-chat/notifications", { cache: "no-store" }).catch(() => null),
      fetch(`/tenant/voice/analytics?deploymentId=${encodeURIComponent(id)}&days=30`, { cache: "no-store" }).catch(() => null),
      fetch(`/tenant/voice/install-checks?deploymentId=${encodeURIComponent(id)}`, { cache: "no-store" }).catch(() => null),
    ]);
    if (knowledgeResponse?.ok) { setKnowledge((await knowledgeResponse.json()).sources || []); setKnowledgeLoadError(false); }
    else { setKnowledge([]); setKnowledgeLoadError(true); }
    if (notificationResponse?.ok) { setNotifications((await notificationResponse.json()).notifications || []); setNotificationLoadError(false); }
    else { setNotifications([]); setNotificationLoadError(true); }
    if (analyticsResponse?.ok) { setAnalytics((await analyticsResponse.json()).analytics || null); setAnalyticsLoadError(false); }
    else { setAnalytics(null); setAnalyticsLoadError(true); }
    setInstallChecks(installResponse?.ok ? (await installResponse.json()).checks || [] : []);
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
  useEffect(() => {
    if (!draftDirty) return;
    const protectDraft = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", protectDraft);
    return () => window.removeEventListener("beforeunload", protectDraft);
  }, [draftDirty]);

  function patchDeployment(patch: Partial<Studio["deployment"]>) {
    setStudioValidationMessage("");
    setDraftDirty(true);
    setStudio((current) => current ? { ...current, deployment: { ...current.deployment, ...patch } } : current);
  }
  function patchDefinition(patch: Partial<Playbook>) {
    setStudioValidationMessage("");
    setDraftDirty(true);
    setStudio((current) => current ? {
      ...current, deployment: { ...current.deployment, definition: { ...current.deployment.definition, ...patch } },
    } : current);
  }
  function setNotificationProfile(value: string) {
    setDraftDirty(true);
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
    const validationError = voiceDeploymentValidationError({
      name: studio.deployment.name,
      agentName: studio.deployment.agentName,
      businessName: studio.deployment.definition.businessName,
      allowedOrigins: studio.deployment.allowedOrigins,
      greetingTh: studio.deployment.greetingTh,
      greetingEn: studio.deployment.greetingEn,
      automatedDisclosureTh: studio.deployment.automatedDisclosureTh,
      automatedDisclosureEn: studio.deployment.automatedDisclosureEn,
      maxCallSeconds: studio.deployment.maxCallSeconds,
      reconnectWindowSeconds: studio.deployment.reconnectWindowSeconds,
    });
    if (validationError) {
      setActiveTab(validationError.tab);
      setMessage("");
      setStudioValidationMessage(validationError.message);
      return;
    }
    setWorking(true); setMessage(""); setStudioValidationMessage("");
    const response = await safeMutationFetch(`/tenant/voice/deployments/${studio.deployment.id}/studio`, {
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
    const response = await safeMutationFetch(`/tenant/voice/deployments/${studio.deployment.id}/studio`, { method: "POST" });
    const body = await response.json(); setWorking(false);
    setMessage(response.ok ? uiCopy(`เผยแพร่คู่มือ Voice เวอร์ชันถาวร ${body.version} แล้ว เซสชันใหม่จะใช้เวอร์ชันนี้`, `Published immutable Voice playbook version ${body.version}. New sessions will use it.`)
      : "The Voice playbook could not be published. Save and validate the draft first.");
    await load(studio.deployment.id);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    setWorking(true); setMessage(""); setDeploymentKey("");
    const origin = normalizeExactWebsiteOrigin(String(data.get("origin") || ""));
    if (!origin) { setWorking(false); setMessage("Enter an exact HTTPS origin without a path, query, or fragment."); return; }
    const response = await safeMutationFetch("/tenant/voice/deployments", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: String(data.get("name") || "").trim(), agentName: String(data.get("agentName") || "").trim(), businessName: String(data.get("businessName") || "").trim(),
        allowedOrigins: [origin], defaultLocale: data.get("defaultLocale"),
        greetingTh: String(data.get("greetingTh") || "").trim(), greetingEn: String(data.get("greetingEn") || "").trim(),
        automatedDisclosureTh: String(data.get("automatedDisclosureTh") || "").trim(), automatedDisclosureEn: String(data.get("automatedDisclosureEn") || "").trim(),
        maxCallSeconds: Number(data.get("maxCallSeconds")), reconnectWindowSeconds: Number(data.get("reconnectWindowSeconds")),
      }),
    });
    const body = await response.json(); setWorking(false);
    if (!response.ok) { setMessage(response.status === 403 ? "An active Voice Agent subscription is required for this workspace." : "Deployment could not be created."); return; }
    setDeploymentKey(body.deploymentKey); setMessage("Deployment created. Copy its key now; it will not be shown again.");
    form.reset(); setActiveTab("deploy"); await load(body.deploymentId);
  }

  async function changeStatus(deploymentId: string, action: "enable" | "disable" | "revoke") {
    if (action === "revoke" && !window.confirm(uiCopy("เพิกถอนการติดตั้งนี้ถาวรหรือไม่? การกระทำนี้ย้อนกลับไม่ได้และคีย์จะหยุดทำงานทันที", "Revoke this deployment permanently? This cannot be undone and the key will stop working immediately."))) return;
    setWorking(true); setMessage("");
    const response = await safeMutationFetch(`/tenant/voice/deployments/${deploymentId}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }),
    });
    setWorking(false); setMessage(response.ok ? uiCopy(`ดำเนินการ ${action === "enable" ? "เปิด" : action === "disable" ? "ปิด" : "เพิกถอน"}การติดตั้งแล้ว`, `Deployment ${action} request completed.`) : uiCopy("เปลี่ยนสถานะการติดตั้งไม่สำเร็จ", "Deployment state could not be changed."));
    await load(deploymentId);
  }

  async function requestInstallCheck() {
    if (!studio?.deployment.allowedOrigins[0]) return;
    setWorking(true); setMessage("");
    const response = await safeMutationFetch("/tenant/voice/install-checks", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ deploymentId: studio.deployment.id, targetOrigin: studio.deployment.allowedOrigins[0] }),
    });
    setWorking(false);
    setMessage(response.ok
      ? uiCopy("เริ่มตรวจสอบแล้ว เปิดเว็บไซต์จริงที่ติดตั้งวิดเจ็ต จากนั้นกลับมาโหลดหน้านี้ใหม่", "Install check started. Open the real website containing the widget, then reload this page.")
      : uiCopy("เริ่มตรวจสอบการติดตั้งไม่สำเร็จ", "Install check could not be started."));
    if (response.ok) await load(studio.deployment.id);
  }

  async function changeTraffic(action: "go_live" | "stop") {
    if (!studio) return;
    if (!window.confirm(action === "go_live"
      ? uiCopy("เปิดรับสายจริงหรือไม่? ระบบจะตรวจสอบสิทธิ์ เวอร์ชัน โควตา และการติดตั้งอีกครั้ง", "Go live? Access, version, quota, and installation will be revalidated.")
      : uiCopy("หยุดรับสายใหม่หรือไม่? สายที่เริ่มแล้วจะดำเนินต่อได้", "Stop new calls? Existing calls may continue."))) return;
    setWorking(true); setMessage("");
    const response = await safeMutationFetch(`/tenant/voice/deployments/${studio.deployment.id}/traffic`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }),
    });
    const result = await response.json(); setWorking(false);
    const failure = result.status === "verification_required" ? uiCopy("ต้องยืนยันการติดตั้งจากเว็บไซต์ที่อนุญาตก่อน", "Verify installation from an allowed website first.")
      : result.status === "quota_unavailable" ? uiCopy("โควตาปัจจุบันไม่พร้อมใช้งาน", "Current quota is unavailable.")
        : uiCopy("เปลี่ยนสถานะไม่สำเร็จ", "Traffic state could not be changed.");
    setMessage(response.ok ? action === "go_live" ? uiCopy("เปิดรับสายจริงแล้ว", "Voice deployment is live.") : uiCopy("หยุดรับสายใหม่แล้ว", "New calls are stopped.") : failure);
    if (response.ok) await load(studio.deployment.id);
  }

  async function recordLatestVoiceTest() {
    if (!studio || !canDeploy) return;
    setWorking(true); setMessage("");
    const response = await safeMutationFetch("/tenant/test-center", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "record_voice_test", deploymentId: studio.deployment.id }),
    });
    setWorking(false);
    setMessage(response.ok
      ? uiCopy("บันทึกสายทดสอบล่าสุดกับเวอร์ชันที่เผยแพร่แล้ว", "Latest completed call recorded against the published version.")
      : uiCopy("ยังไม่พบสายที่จบสมบูรณ์และมีอย่างน้อยหนึ่งช่วงสนทนาบนเวอร์ชันปัจจุบัน", "No completed call with a successful turn exists on the current version yet."));
  }

  const saveBar = canEdit ? <div className="studio-save-bar"><span>{draftDirty ? uiCopy("มีการแก้ไขที่ยังไม่ได้บันทึก", "Unsaved changes") : `Draft revision ${studio?.deployment.draftRevision}`}</span><button type="button" disabled={working || !draftDirty} onClick={() => void saveStudio()}>{working ? uiCopy("กำลังบันทึก...", "Saving...") : uiCopy("บันทึกฉบับร่าง", "Save draft")}</button></div> : null;
  if (session.error) return <WorkspaceSessionLoadError onRetry={() => window.location.reload()} />;
  if (session.loading || !session.selectedTenantId) return <main className="workspace-loading">กำลังโหลดสตูดิโอเสียง...</main>;
  if (loadError) return <WorkspacePageLoadError active="voice" title="สตูดิโอ Voice Agent" resource="Voice Agent Studio" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} onRetry={() => void load()} />;
  return <main className="workspace-shell">
    <WorkspaceSidebar active="voice" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} />
    <section id="workspace-main" className="workspace-main" tabIndex={-1}><WorkspaceSupportBanner tenantId={session.selectedTenantId} />
      <header className="workspace-header voice-studio-header"><div><p>สตูดิโอ Voice Agent</p><h1>{studio?.deployment.agentName || (result.capability?.publicLabel === "Second-Generation Voice Engine" ? "Voice Agent Advanced" : "Voice Agent Basic")}</h1></div><div className="voice-header-state"><span className="generation-pill">{studio?.publicLabel || result.capability?.publicLabel || "Unavailable"}</span>{studio ? <span className={`health-pill health-${studio.health}`}>{studio.health.replaceAll("_", " ")}</span> : null}</div></header>
      {studio ? <>
        {studio.publicLabel === "Second-Generation Voice Engine" && studio.runtimeAvailability === "unavailable" ? <div className="voice-availability-notice" role="status"><strong>การเปิดใช้ระบบรุ่นที่สองกำลังรอการรับรองเส้นทางภายใน</strong><span>เตรียมการติดตั้งได้แล้ว แต่ระบบจะแจ้งว่าไม่พร้อมใช้งานอย่างเป็นกลางจนกว่าเส้นทาง Gen2 ที่ผ่านการตรวจจะเปิดใช้ และจะไม่ย้อนกลับไปใช้ระบบรุ่นแรก</span></div> : null}
        <section className="voice-summary-band" aria-label="สรุป Voice Agent">
          <label>เอเจนต์<select value={selectedId} onChange={(event) => { const nextId = event.target.value; if (draftDirty && !window.confirm(uiCopy("ทิ้งการแก้ไข Voice ที่ยังไม่ได้บันทึกหรือไม่?", "Discard unsaved Voice changes?"))) return; setSelectedId(nextId); setMessage(""); void loadStudio(nextId); }}>{result.deployments.map((item) => <option key={item.id} value={item.id}>{item.agentName} · {item.name}</option>)}</select></label>
          <div><strong>{studio.usage.usedMinutes}</strong><span>นาทีที่ใช้</span><small>{formatLimit(studio.usage.includedMinutes, " included")}</small></div>
          <div><strong>{studio.usage.activeCalls}</strong><span>สายที่กำลังใช้งาน</span><small>{formatLimit(studio.usage.concurrencyLimit, " concurrent")}</small></div>
          <div><strong>v{studio.deployment.currentPublishedVersion || "—"}</strong><span>คู่มือที่เผยแพร่แล้ว</span><small>{studio.deployment.status}</small></div>
        </section>
        <nav className="voice-studio-tabs" aria-label="ส่วนต่าง ๆ ในสตูดิโอ Voice Agent">{tabs.map((tab) => <button type="button" role="tab" aria-selected={activeTab === tab.id} className={activeTab === tab.id ? "selected" : ""} key={tab.id} onClick={() => { setActiveTab(tab.id); setMessage(""); }}><strong>{tab.label}</strong><span>{tab.hint}</span></button>)}</nav>
        {studioValidationMessage ? <p className="studio-message error" role="alert">{studioValidationMessage}</p> : message ? <p className="studio-message" role="status">{message}</p> : null}

        {activeTab === "voice" ? <section className="tool-band studio-panel"><div className="band-heading"><div><p>ตัวตนและการเริ่มสนทนา</p><h2>เสียงและภาษา</h2></div><span>English + ไทย</span></div><div className="studio-form-grid">
          <label>ชื่อเอเจนต์ที่แสดงต่อสาธารณะ<input disabled={!canEdit} value={studio.deployment.agentName} {...voiceDeploymentFieldConstraints.agentName} onChange={(event) => patchDeployment({ agentName: event.target.value })} /></label>
          <label>ภาษาเริ่มต้น<select disabled={!canEdit} value={studio.deployment.defaultLocale} onChange={(event) => patchDeployment({ defaultLocale: event.target.value as "th" | "en" })}><option value="en">English</option><option value="th">ไทย</option></select></label>
          <label className="wide-field">คำทักทายภาษาอังกฤษ<textarea disabled={!canEdit} rows={3} value={studio.deployment.greetingEn} {...voiceDeploymentFieldConstraints.greeting} onChange={(event) => { patchDeployment({ greetingEn: event.target.value }); patchDefinition({ greeting: { ...studio.deployment.definition.greeting, en: event.target.value } }); }} /></label>
          <label className="wide-field">คำทักทายภาษาไทย<textarea disabled={!canEdit} rows={3} value={studio.deployment.greetingTh} {...voiceDeploymentFieldConstraints.greeting} onChange={(event) => { patchDeployment({ greetingTh: event.target.value }); patchDefinition({ greeting: { ...studio.deployment.definition.greeting, th: event.target.value } }); }} /></label>
        </div>{saveBar}</section> : null}

        {activeTab === "playbook" ? <section className="tool-band studio-panel"><div className="band-heading"><div><p>แนวทางการขายที่เผยแพร่แล้ว</p><h2>คู่มือการขาย</h2></div><span>แก้ไขไม่ได้หลังเผยแพร่</span></div><div className="studio-form-grid">
          <label>ชื่อธุรกิจ<input disabled={!canEdit} value={studio.deployment.definition.businessName} {...voiceDeploymentFieldConstraints.businessName} onChange={(event) => patchDefinition({ businessName: event.target.value })} /></label>
          <label>เขตเวลา<input disabled={!canEdit} value={studio.deployment.definition.timezone} onChange={(event) => patchDefinition({ timezone: event.target.value })} /></label>
          <label className="wide-field">โทนการสนทนา<input disabled={!canEdit} value={studio.deployment.definition.tone} onChange={(event) => patchDefinition({ tone: event.target.value })} /></label>
          <label className="wide-field">เป้าหมายการขาย<textarea disabled={!canEdit} rows={3} value={studio.deployment.definition.salesGoal} onChange={(event) => patchDefinition({ salesGoal: event.target.value })} /></label>
          <label>คำถามค้นหาความต้องการ <small>หนึ่งรายการต่อบรรทัด</small><textarea disabled={!canEdit} rows={7} value={listText(studio.deployment.definition.discoveryQuestions)} onChange={(event) => patchDefinition({ discoveryQuestions: lineList(event.target.value) })} /></label>
          <label>แนวทางคำกระตุ้นให้ดำเนินการ <small>คำสั่งที่อนุมัติแล้วบรรทัดละหนึ่งรายการ</small><textarea disabled={!canEdit} rows={7} value={listText(studio.deployment.definition.ctaPolicy)} onChange={(event) => patchDefinition({ ctaPolicy: lineList(event.target.value) })} /></label>
          <label>ข้อความอ้างอิงที่อนุมัติ <small>เว้นว่างไว้จนกว่าจะตรวจสอบแล้ว</small><textarea disabled={!canEdit} rows={6} value={listText(studio.deployment.definition.approvedClaims)} onChange={(event) => patchDefinition({ approvedClaims: lineList(event.target.value) })} /></label>
          <label>ข้อความต้องห้าม <small>ข้อจำกัดบรรทัดละหนึ่งรายการ</small><textarea disabled={!canEdit} rows={6} value={listText(studio.deployment.definition.prohibitedClaims)} onChange={(event) => patchDefinition({ prohibitedClaims: lineList(event.target.value) })} /></label>
          <label className="wide-field">ช่องข้อมูลติดต่อที่จำเป็น <small>หนึ่งช่องข้อมูลต่อบรรทัด</small><textarea disabled={!canEdit} rows={3} value={listText(studio.deployment.definition.requiredContactFields)} onChange={(event) => patchDefinition({ requiredContactFields: lineList(event.target.value) })} /></label>
        </div>{saveBar}</section> : null}

        {activeTab === "knowledge" ? <section className="tool-band studio-panel"><div className="band-heading"><div><p>ข้อเท็จจริงทางธุรกิจที่ตรวจสอบได้</p><h2>คลังความรู้</h2></div><span>{studio.deployment.knowledgeRevisionIds.length} pinned</span></div><p className="control-copy">ระบบจะคัดลอกเฉพาะฉบับที่พร้อมและเลือกไว้ไปยังคู่มือเวอร์ชันถาวรถัดไป สายเดิมยังคงใช้คลังความรู้เวอร์ชันเดิม</p><div className="knowledge-picker studio-knowledge">{knowledge.map((source) => <label key={source.revisionId}><input type="checkbox" disabled={!canEdit || source.status !== "ready"} checked={studio.deployment.knowledgeRevisionIds.includes(source.revisionId)} onChange={(event) => patchDeployment({ knowledgeRevisionIds: event.target.checked ? [...studio.deployment.knowledgeRevisionIds, source.revisionId] : studio.deployment.knowledgeRevisionIds.filter((id) => id !== source.revisionId) })} /><span data-no-localize>{source.name}</span><small>{source.sourceKind} · v{source.version} · {source.status}</small></label>)}{knowledgeLoadError ? <div className="pending-line inline-retry" role="alert"><span>โหลดตัวเลือกคลังความรู้ไม่สำเร็จ</span><button className="secondary-command" type="button" onClick={() => void load(selectedId)}>ลองใหม่</button></div> : !knowledge.length ? <div className="pending-line"><strong>ยังไม่มีความรู้ที่อนุมัติ</strong><span>เพิ่มแหล่งข้อมูลในหน้าคลังความรู้และการตั้งค่าการขาย</span></div> : null}</div><a className="secondary-link studio-link" href="/workspace/knowledge">เปิดคลังความรู้และการตั้งค่าการขาย</a>{saveBar}</section> : null}

        {activeTab === "entry" ? <section className="tool-band studio-panel"><div className="band-heading"><div><p>ขอบเขตการอนุญาตจากเบราว์เซอร์</p><h2>การเริ่มสาย / เซสชัน</h2></div><span>{studio.deployment.allowedOrigins.length} origins</span></div><div className="studio-form-grid">
          <label>ชื่อการติดตั้ง<input disabled={!canEdit} value={studio.deployment.name} {...voiceDeploymentFieldConstraints.name} onChange={(event) => patchDeployment({ name: event.target.value })} /></label>
          <label>ระยะเวลาสายสูงสุด (วินาที)<input disabled={!canEdit} type="number" value={studio.deployment.maxCallSeconds} {...voiceDeploymentFieldConstraints.maxCallSeconds} onChange={(event) => patchDeployment({ maxCallSeconds: Number(event.target.value) })} /></label>
          <label>ช่วงเวลาเชื่อมต่อใหม่ (วินาที)<input disabled={!canEdit} type="number" value={studio.deployment.reconnectWindowSeconds} {...voiceDeploymentFieldConstraints.reconnectWindowSeconds} onChange={(event) => patchDeployment({ reconnectWindowSeconds: Number(event.target.value) })} /></label>
          <label className="wide-field">ต้นทางเว็บไซต์ที่อนุญาต <small>ต้นทาง HTTPS ที่ตรงกันทุกตัวอักษร บรรทัดละหนึ่งรายการ</small><textarea disabled={!canEdit} rows={5} value={listText(studio.deployment.allowedOrigins)} onChange={(event) => patchDeployment({ allowedOrigins: lineList(event.target.value) })} /></label>
        </div>{saveBar}</section> : null}

        {activeTab === "disclosure" ? <section className="tool-band studio-panel"><div className="band-heading"><div><p>ข้อกำหนดการเปิดบทสนทนา</p><h2>การแจ้งผู้ใช้และการบันทึก</h2></div><span>ปิดการบันทึก</span></div><div className="policy-callout"><strong>ต้องแจ้งว่ากำลังสนทนากับระบบอัตโนมัติก่อนเริ่มข้อความทั่วไปของผู้ช่วย</strong><span>ระบบจะปิดการบันทึกไว้จนกว่าจะตั้งค่าและอนุมัติเรื่องความยินยอม เขตอำนาจกฎหมาย การเก็บรักษา การลบข้อมูล และการตรวจสอบทางกฎหมาย</span></div><div className="studio-form-grid">
          <label className="wide-field">ข้อความภาษาอังกฤษที่แจ้งว่าเป็นระบบอัตโนมัติ<textarea disabled={!canEdit} rows={3} value={studio.deployment.automatedDisclosureEn} {...voiceDeploymentFieldConstraints.disclosure} onChange={(event) => patchDeployment({ automatedDisclosureEn: event.target.value })} /></label>
          <label className="wide-field">ข้อความภาษาไทยที่แจ้งว่าเป็นระบบอัตโนมัติ<textarea disabled={!canEdit} rows={3} value={studio.deployment.automatedDisclosureTh} {...voiceDeploymentFieldConstraints.disclosure} onChange={(event) => patchDeployment({ automatedDisclosureTh: event.target.value })} /></label>
        </div>{saveBar}</section> : null}

        {activeTab === "transfer" ? <section className="tool-band studio-panel"><div className="band-heading"><div><p>การส่งต่ออย่างเหมาะสม</p><h2>ส่งต่อและติดต่อกลับ</h2></div><span>{studio.actions.humanHandover ? "Enabled" : "Unavailable"}</span></div><div className="policy-callout"><strong>เมื่อส่งต่อให้ทีม การสนทนาร่วมจะเปลี่ยนเป็นโหมดเจ้าหน้าที่</strong><span>ระบบบันทึกความต้องการให้ติดต่อกลับเป็นงานติดตามที่ได้รับอนุญาต พร้อมช่องทางติดต่อและเวลาที่ลูกค้าแจ้ง เอเจนต์จะไม่รับปากนัดหมายที่ยังไม่ได้ยืนยัน</span></div><div className="studio-form-grid">
          <label>ข้อความติดตามภาษาอังกฤษ<textarea disabled={!canEdit} rows={4} value={studio.deployment.definition.offlineMessage.en} onChange={(event) => patchDefinition({ offlineMessage: { ...studio.deployment.definition.offlineMessage, en: event.target.value } })} /></label>
          <label>ข้อความติดตามภาษาไทย<textarea disabled={!canEdit} rows={4} value={studio.deployment.definition.offlineMessage.th} onChange={(event) => patchDefinition({ offlineMessage: { ...studio.deployment.definition.offlineMessage, th: event.target.value } })} /></label>
        </div>{saveBar}</section> : null}

        {activeTab === "actions" ? <section className="tool-band studio-panel"><div className="band-heading"><div><p>สิทธิ์ผลิตภัณฑ์ปัจจุบัน</p><h2>การดำเนินการ</h2></div><span>ตรวจสอบความถูกต้องขณะบันทึก</span></div><div className="action-authority-grid">
          <div><strong>ข้อมูลผู้สนใจและการขาย</strong><span>{studio.actions.leadCapture ? "Available" : "Not included"}</span></div>
          <div><strong>คำขอนัดหมาย</strong><span>{studio.actions.appointmentRequest ? "Available" : "Not included"}</span></div>
          <div><strong>ส่งต่อให้ทีมงาน</strong><span>{studio.actions.humanHandover ? "Available" : "Not included"}</span></div>
          <div><strong>อีเมลธุรกิจ</strong><span>{studio.actions.merchantEmail ? "Available" : "Not included"}</span></div>
        </div>{notificationLoadError ? <div className="inline-message inline-retry" role="alert"><span>โหลดโปรไฟล์การส่งอีเมลไม่สำเร็จ</span><button className="secondary-command" type="button" onClick={() => void load(selectedId)}>ลองใหม่</button></div> : null}<label className="studio-select-field">โปรไฟล์อีเมลแจ้งผู้สนใจที่ผ่านการคัดกรอง<select disabled={!canEdit || !studio.actions.merchantEmail || notificationLoadError} value={studio.deployment.definition.notificationProfileId || ""} onChange={(event) => setNotificationProfile(event.target.value)}><option value="">ยังไม่มีการส่งอีเมล</option>{notifications.filter((item) => item.status === "active").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><p className="control-copy">ทุกการดำเนินการจะตรวจสอบซ้ำกับสิทธิ์สมัครใช้บริการและรายการที่อนุญาต ภายในธุรกรรมฐานข้อมูลเดียวกับคำตอบการสนทนา</p>{saveBar}</section> : null}

        {activeTab === "test" ? <section className="tool-band studio-panel"><div className="band-heading"><div><p>ตรวจสอบล่วงหน้าอย่างปลอดภัย</p><h2>ทดสอบการโทร</h2></div><span>{studio.health === "ready" ? "Ready on approved origin" : "Action required"}</span></div><div className="readiness-list">
          <div><strong>คู่มือที่เผยแพร่แล้ว</strong><span>{studio.deployment.currentPublishedVersion ? `Version ${studio.deployment.currentPublishedVersion}` : "Publish required"}</span></div>
          <div><strong>ต้นทางเบราว์เซอร์</strong><span>{studio.deployment.allowedOrigins.join(", ")}</span></div>
          <div><strong>สถานะพร้อมใช้ของระบบเสียง</strong><span>{studio.runtimeAvailability === "available" ? "Available" : "Pending internal activation"}</span></div>
          <div><strong>ข้อกำหนดระบบเสียง</strong><span>สิทธิ์ไมโครโฟน · PCM16 · รองรับการพูดแทรก</span></div>
          <div><strong>นโยบายขณะทำงาน</strong><span>แจ้งผู้ใช้ก่อน · ปิดการบันทึก · จำกัดการเชื่อมต่อใหม่</span></div>
        </div><p className="control-copy">เรียกใช้วิดเจ็ตที่ติดตั้งบนต้นทางที่อนุมัติ เซสชันทดสอบจะใช้โควตานาทีและสร้างหลักฐานข้อความกับการดำเนินการจริง จึงควรใช้ข้อมูลติดต่อสำหรับทดสอบเท่านั้น</p><div className="deploy-command-row"><button type="button" className="secondary-command" disabled={!canDeploy || working} onClick={() => void recordLatestVoiceTest()}>{working ? "กำลังตรวจ…" : "บันทึกสายทดสอบล่าสุด"}</button><a className="secondary-link" href="/workspace/test-center">ดูหลักฐานการทดสอบ</a></div></section> : null}

        {activeTab === "quality" ? <section className="tool-band studio-panel"><div className="band-heading"><div><p>Last {analytics?.periodDays || 30} days</p><h2>การประเมินคุณภาพ</h2></div><div className="analytics-heading-actions"><span>{analytics?.level === "advanced" ? "Advanced analytics" : "Core analytics"}</span>{analytics ? <a className="secondary-link" href={`/tenant/voice/analytics?deploymentId=${encodeURIComponent(studio.deployment.id)}&days=${analytics.periodDays}&format=csv`}>ส่งออก CSV</a> : null}</div></div>
          {analytics ? <><div className="quality-grid quality-grid-primary">
            <div><strong>{analytics.summary.sessions}</strong><span>เซสชัน</span></div><div><strong>{analytics.summary.completedCalls}</strong><span>เสร็จสิ้น</span></div><div><strong>{analytics.summary.failedCalls}</strong><span>ล้มเหลว / หมดอายุ</span></div><div><strong>{analytics.summary.completedTurns}</strong><span>ช่วงสนทนาที่อ้างอิงข้อมูลจริง</span></div><div><strong>{analytics.summary.leads}</strong><span>ผู้สนใจที่เก็บข้อมูลได้</span></div><div><strong>{analytics.summary.appointmentRequests}</strong><span>คำขอนัดหมาย</span></div>
          </div><div className="quality-grid quality-grid-secondary">
            <div><strong>{percent(analytics.summary.completedCalls, analytics.summary.connectedCalls)}</strong><span>อัตราสำเร็จ</span></div><div><strong>{formatDuration(analytics.summary.averageConnectedSeconds)}</strong><span>เวลาเชื่อมต่อเฉลี่ย</span></div><div><strong>{formatLatency(analytics.summary.averageTurnMilliseconds)}</strong><span>เวลาตอบแต่ละช่วงเฉลี่ย</span></div><div><strong>{analytics.level === "advanced" ? formatLatency(analytics.summary.p95TurnMilliseconds) : "Advanced"}</strong><span>เวลาตอบสนองเปอร์เซ็นไทล์ที่ 95</span></div><div><strong>{analytics.summary.reconnectingCalls}</strong><span>สายที่เชื่อมต่อใหม่</span></div><div><strong>{analytics.summary.settledMinutes}</strong><span>นาทีที่หักโควตาแล้ว</span></div>
          </div></> : <div className="pending-line inline-retry" role={analyticsLoadError ? "alert" : "status"}><strong>{analyticsLoadError ? "Analytics could not be loaded" : "No analytics are available yet"}</strong><span>{analyticsLoadError ? "Call records remain intact." : "Completed calls will appear here."}</span><button className="secondary-command" type="button" onClick={() => void load(selectedId)}>ลองใหม่</button></div>}
          {analytics?.level === "advanced" ? <div className="voice-analytics-breakdowns">
            <section><h3>ผลลัพธ์การขาย</h3>{analytics.outcomes.length ? analytics.outcomes.map((item) => <div key={item.outcome}><span>{friendlyMetric(item.outcome)}</span><strong>{item.calls}</strong></div>) : <p>ยังไม่มีการจำแนกผลลัพธ์</p>}</section>
            <section><h3>สัดส่วนภาษา</h3>{analytics.languages.length ? analytics.languages.map((item) => <div key={item.locale}><span>{item.locale === "th" ? "Thai" : "English"}</span><strong>{item.calls}</strong></div>) : <p>ยังไม่มีเซสชัน</p>}</section>
            <section><h3>เหตุผลที่สิ้นสุด</h3>{analytics.terminalReasons.length ? analytics.terminalReasons.map((item) => <div key={item.reason}><span>{friendlyMetric(item.reason)}</span><strong>{item.calls}</strong></div>) : <p>ยังไม่มีสายที่สิ้นสุด</p>}</section>
            <section><h3>ช่วงสนทนาที่ล้มเหลว</h3>{analytics.turnFailures.length ? analytics.turnFailures.map((item) => <div key={item.errorCode}><span>{friendlyMetric(item.errorCode)}</span><strong>{item.turns}</strong></div>) : <p>ไม่มีช่วงสนทนาที่ล้มเหลว</p>}</section>
          </div> : null}
          {analytics?.level === "advanced" ? <div className="voice-analytics-trend"><div className="analytics-subheading"><div><p>วันตามปฏิทิน UTC</p><h3>แนวโน้มสายล่าสุด</h3></div><span>แสดง 14 วันล่าสุด · ดูทั้งรอบในไฟล์ CSV</span></div><div className="data-table"><div className="data-row voice-trend-heading"><strong>วันที่</strong><span>เซสชัน</span><span>เสร็จสิ้น / ล้มเหลว</span><span>ผู้สนใจ</span></div>{analytics.daily.slice(-14).map((item) => <div className="data-row voice-trend-row" key={item.date}><strong>{new Date(`${item.date}T00:00:00Z`).toLocaleDateString(currentIntlLocale(), { month: "short", day: "numeric", timeZone: "UTC" })}</strong><span>{item.sessions}</span><span>{item.completedCalls} / {item.failedCalls}</span><span>{item.leads}</span></div>)}</div></div> : null}
          <div className="policy-callout"><strong>ข้อมูลวิเคราะห์การทำงานไม่ทดแทนเกณฑ์คุณภาพก่อนเปิดใช้งานจริง</strong><span>การรู้จำภาษาอังกฤษและไทย เวลาแฝง การพูดแทรก ความเงียบ เสียงรบกวน การเชื่อมต่อใหม่ การติดต่อกลับ และการส่งต่อ ยังต้องผ่านการประเมินในระบบทดสอบแบบจำกัดตามเกณฑ์ที่อนุมัติ</span></div>{studio.quality.lastCallAt ? <p className="control-copy">Last session: {new Date(studio.quality.lastCallAt).toLocaleString(currentIntlLocale())}</p> : null}</section> : null}

        {activeTab === "deploy" ? <section className="tool-band studio-panel"><div className="band-heading"><div><p>เวอร์ชันถาวร การติดตั้ง การยืนยัน และการเปิดใช้งานจริง</p><h2>ติดตั้งและเปิดรับสาย</h2></div><span>{studio.deployment.status} · {studio.deployment.trafficStatus}</span></div><div className="deploy-command-row"><button type="button" disabled={!canEdit || working || draftDirty} onClick={() => void publish()}>เผยแพร่เวอร์ชันถาวร</button>{canDeploy && studio.deployment.status !== "revoked" ? <><button type="button" className="secondary-command" disabled={working} onClick={() => void requestInstallCheck()}>{uiCopy("ตรวจสอบการติดตั้ง", "Check install")}</button>{studio.deployment.trafficStatus === "live" ? <>{studio.deployment.livePlaybookVersionId !== studio.deployment.currentPublishedPlaybookVersionId ? <button type="button" disabled={working} onClick={() => void changeTraffic("go_live")}>{uiCopy("อัปเดตเวอร์ชันที่ใช้งานจริง", "Update live version")}</button> : null}<button type="button" className="secondary-command" disabled={working} onClick={() => void changeTraffic("stop")}>{uiCopy("หยุดรับสาย", "Stop traffic")}</button></> : <button type="button" disabled={working || installChecks[0]?.status !== "verified"} onClick={() => void changeTraffic("go_live")}>{uiCopy("เปิดใช้งานจริง", "Go live")}</button>}<button type="button" className="secondary-command" disabled={working} onClick={() => void changeStatus(studio.deployment.id, studio.deployment.status === "active" ? "disable" : "enable")}>{studio.deployment.status === "active" ? "Disable resource" : "Enable resource"}</button><button type="button" className="secondary-command danger-command" disabled={working} onClick={() => void changeStatus(studio.deployment.id, "revoke")}>เพิกถอนถาวร</button></> : null}</div>{draftDirty ? <p className="field-help">บันทึกฉบับร่างก่อนเผยแพร่ เพื่อให้เวอร์ชันใหม่ตรงกับค่าที่ตรวจสอบแล้ว</p> : null}<div className="deployment-identity"><strong>{uiCopy("สถานะการติดตั้ง", "Install status")}</strong><span>{installChecks[0]?.status || uiCopy("ยังไม่ได้ตรวจสอบ", "Not checked")}</span><strong>{uiCopy("สถานะรับสาย", "Traffic status")}</strong><span>{studio.deployment.trafficStatus}</span></div><div className="deployment-identity"><strong>คำนำหน้ากุญแจติดตั้งที่เปิดเผยได้</strong><code>{studio.deployment.keyPrefix}…</code><span>ระบบจะไม่เก็บหรือแสดงกุญแจฉบับเต็มอีกครั้ง</span></div>
          {deploymentKey ? <div className="deployment-secret"><strong>กุญแจติดตั้งระบบเสียงและโค้ดติดตั้งที่แสดงครั้งเดียว</strong><code>{deploymentKey}</code><p className="field-help">ติดตั้งโค้ดนี้เฉพาะบนต้นทางเว็บไซต์ที่อนุมัติแล้ว</p><pre>{installSnippet}</pre><button type="button" className="secondary-command" onClick={() => { if (!navigator.clipboard) { setMessage("Select the snippet and copy it manually."); return; } void navigator.clipboard.writeText(installSnippet).then(() => setMessage("Install snippet copied."), () => setMessage("Copy was blocked. Select the snippet and copy it manually.")); }}>คัดลอกโค้ดติดตั้ง</button></div> : null}
          {canDeploy && result.capability ? <details className="advanced-definition create-voice-deployment"><summary>สร้างการติดตั้ง Voice Agent เพิ่ม</summary><VoiceDeploymentForm className="voice-deploy" onSubmit={create} working={working} /></details> : null}
        </section> : null}
      </> : <section className="tool-band"><div className="band-heading"><div><p>สตูดิโอ Voice Agent</p><h2>ยังไม่มีการติดตั้งระบบเสียง</h2></div></div><p className="control-copy">{result.capability ? `Create the first exact-origin ${result.capability.publicLabel} deployment to open the Studio.` : "Voice Agent is not active for this workspace."}</p>{canDeploy && result.capability ? <VoiceDeploymentForm className="voice-deploy first-voice-deploy" onSubmit={create} working={working} /> : null}</section>}
    </section>
  </main>;
}
