"use client";

import { useEffect, useState, type FormEvent } from "react";
import { aiPlaybookSchema, type AiPlaybook } from "@djay/sales-core";
import { normalizeExactWebsiteOrigin, safeMutationFetch, uiCopy } from "@djay/shared";
import { createWidgetInstallSnippet } from "@djay/shared/widget-install";
import { tenantWidgetInstallEnvironment } from "../../../../lib/widget-install-environment";
import { WorkspacePageLoadError, WorkspaceSessionLoadError } from "../../WorkspaceAccess";
import { WorkspaceSidebar } from "../../WorkspaceSidebar";
import { WorkspaceSupportBanner } from "../../WorkspaceSupportBanner";
import { useWorkspaceSession } from "../../useWorkspaceSession";
import { AiPlaybookEditor } from "../../ai-chat/AiPlaybookEditor";
import { VoiceDeploymentForm } from "../VoiceDeploymentForm";

type ConfigurationSummary = {
  id: string; name: string; status: string; defaultLanguage: "th" | "en";
  currentPublishedPlaybookVersionId: string | null; currentPublishedVersion: number | null;
  draftRevision: number; deploymentCount: number; updatedAt: string;
};
type Configuration = ConfigurationSummary & {
  revision: number; basedOnVersionId: string | null; definition: AiPlaybook;
  knowledgeRevisionIds: string[]; editable: boolean;
};
type ConfigurationResult = {
  capability: { enabled: true; publicLabel: string } | null;
  configurations: ConfigurationSummary[];
};

function validationLabel(path: string, issue: string) {
  return `${path || "Playbook"}: ${issue}`;
}

export default function VoiceConfigurationPage() {
  const session = useWorkspaceSession();
  const [result, setResult] = useState<ConfigurationResult>({ capability: null, configurations: [] });
  const [selectedId, setSelectedId] = useState("");
  const [configuration, setConfiguration] = useState<Configuration | null>(null);
  const [definition, setDefinition] = useState<AiPlaybook | null>(null);
  const [definitionText, setDefinitionText] = useState("");
  const [advancedPending, setAdvancedPending] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [validationPath, setValidationPath] = useState("");
  const [validationMessage, setValidationMessage] = useState("");
  const [message, setMessage] = useState("");
  const [deploymentKey, setDeploymentKey] = useState("");
  const [working, setWorking] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const canEdit = Boolean(session.allows("voice.deploy") && configuration?.editable);

  async function loadConfiguration(id: string) {
    if (!id) { setConfiguration(null); setDefinition(null); return; }
    const response = await fetch(`/tenant/voice/configurations/${id}/draft`, { cache: "no-store" });
    if (!response.ok) throw new Error("voice_configuration_unavailable");
    const next = (await response.json()).configuration as Configuration;
    const parsed = aiPlaybookSchema.parse(next.definition);
    setConfiguration({ ...next, definition: parsed });
    setDefinition(parsed); setDefinitionText(JSON.stringify(parsed, null, 2));
    setAdvancedPending(false); setDirty(false); setValidationPath(""); setValidationMessage("");
  }

  async function load(preferredId?: string) {
    try {
      const response = await fetch("/tenant/voice/configurations", { cache: "no-store" });
      if (!response.ok) throw new Error("voice_configurations_unavailable");
      const next = await response.json() as ConfigurationResult;
      setResult(next);
      const id = preferredId && next.configurations.some((item) => item.id === preferredId)
        ? preferredId : selectedId && next.configurations.some((item) => item.id === selectedId)
          ? selectedId : next.configurations[0]?.id || "";
      setSelectedId(id); await loadConfiguration(id); setLoadError(false);
    } catch { setLoadError(true); }
  }

  useEffect(() => { if (session.selectedTenantId) void load(); }, [session.selectedTenantId]);
  useEffect(() => {
    if (!dirty) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);

  function updateDefinition(next: AiPlaybook) {
    setDefinition(next); setDefinitionText(JSON.stringify(next, null, 2));
    setAdvancedPending(false); setDirty(true); setValidationPath(""); setValidationMessage("");
  }

  function validateAdvanced() {
    try {
      const parsed = aiPlaybookSchema.safeParse(JSON.parse(definitionText) as unknown);
      if (!parsed.success) {
        const issue = parsed.error.issues[0]!;
        setValidationPath("advanced");
        setValidationMessage(validationLabel(issue.path.map(String).join("."), issue.message));
        return;
      }
      setDefinition(parsed.data); setDefinitionText(JSON.stringify(parsed.data, null, 2));
      setAdvancedPending(false); setValidationPath(""); setValidationMessage("");
    } catch {
      setValidationPath("advanced");
      setValidationMessage(uiCopy("JSON ขั้นสูงไม่ถูกต้อง ข้อความของคุณยังคงอยู่", "Advanced JSON is invalid. Your text is preserved."));
    }
  }

  async function save() {
    if (!configuration) return;
    let parsed;
    try { parsed = aiPlaybookSchema.safeParse(JSON.parse(definitionText) as unknown); }
    catch { parsed = { success: false as const }; }
    if (!parsed.success) {
      setValidationPath("advanced"); setValidationMessage(uiCopy("แก้ไขค่าที่ไม่ถูกต้องก่อนบันทึก", "Fix the invalid configuration before saving."));
      return;
    }
    setWorking(true); setMessage("");
    const response = await safeMutationFetch(`/tenant/voice/configurations/${configuration.id}/draft`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revision: configuration.revision, definition: parsed.data,
        knowledgeRevisionIds: configuration.knowledgeRevisionIds }),
    });
    setWorking(false);
    if (!response.ok) {
      setMessage(response.status === 409
        ? uiCopy("ฉบับร่างถูกแก้ไขจากที่อื่น โปรดโหลดใหม่", "The draft changed elsewhere. Reload before saving.")
        : response.status === 403
          ? uiCopy("ต้องเปิดใช้งานแพ็กเกจ Voice ก่อนแก้ไข", "Activate a Voice package before editing.")
          : uiCopy("บันทึกการตั้งค่าไม่สำเร็จ", "Configuration could not be saved."));
      return;
    }
    setMessage(uiCopy("บันทึกฉบับร่างแล้ว", "Draft saved.")); await load(configuration.id);
  }

  async function publish() {
    if (!configuration || dirty) return;
    setWorking(true); setMessage("");
    const response = await safeMutationFetch(`/tenant/voice/configurations/${configuration.id}/publish`, { method: "POST" });
    const body = await response.json(); setWorking(false);
    if (!response.ok) {
      setMessage(response.status === 403
        ? uiCopy("ต้องเปิดใช้งานแพ็กเกจ Voice ก่อนเผยแพร่", "Activate a Voice package before publishing.")
        : uiCopy("เผยแพร่ไม่สำเร็จ", "Configuration could not be published."));
      return;
    }
    setMessage(uiCopy(`เผยแพร่เวอร์ชัน ${body.version} แล้ว โดยยังไม่สร้างการติดตั้ง`, `Version ${body.version} published. No deployment was created.`));
    await load(configuration.id);
  }

  async function createDeployment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget; const data = new FormData(form);
    const origin = normalizeExactWebsiteOrigin(String(data.get("origin") || ""));
    if (!origin) { setMessage(uiCopy("กรอกต้นทาง HTTPS ที่ไม่มี path, query หรือ fragment", "Enter an exact HTTPS origin without a path, query, or fragment.")); return; }
    setWorking(true); setMessage(""); setDeploymentKey("");
    const response = await safeMutationFetch("/tenant/voice/deployments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: data.get("agentId"), name: String(data.get("name") || "").trim(),
        allowedOrigins: [origin],
        maxCallSeconds: Number(data.get("maxCallSeconds")), reconnectWindowSeconds: Number(data.get("reconnectWindowSeconds")),
      }),
    });
    const body = await response.json(); setWorking(false);
    if (!response.ok) {
      setMessage(response.status === 409
        ? uiCopy("ต้องเผยแพร่การตั้งค่าปัจจุบันก่อนติดตั้ง", "Publish the current configuration before installing.")
        : uiCopy("สร้างการติดตั้งไม่สำเร็จ", "Deployment could not be created."));
      return;
    }
    setDeploymentKey(body.deploymentKey);
    setMessage(uiCopy("สร้างการติดตั้งแบบยังไม่เปิดรับสายแล้ว คัดลอกกุญแจนี้ทันที", "Inactive deployment created. Copy this key now."));
    await load(configuration?.id);
  }

  if (session.error) return <WorkspaceSessionLoadError onRetry={() => window.location.reload()} />;
  if (session.loading || !session.selectedTenantId) return <main className="workspace-loading">{uiCopy("กำลังโหลดการตั้งค่า Voice…", "Loading Voice configuration…")}</main>;
  if (loadError) return <WorkspacePageLoadError active="voice" title="Voice Configuration" resource="Voice Configuration" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} onRetry={() => window.location.reload()} />;

  return <main className="workspace-shell"><WorkspaceSidebar active="voice" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} />
    <section id="workspace-main" className="workspace-main" tabIndex={-1}><WorkspaceSupportBanner tenantId={session.selectedTenantId} />
      <header className="workspace-header"><div><p>{uiCopy("ฉบับร่างก่อนการติดตั้ง", "Pre-deployment draft")}</p><h1>{uiCopy("การตั้งค่า Voice Agent", "Voice Agent Configuration")}</h1></div><div className="deploy-command-row"><a className="secondary-link" href="/workspace">{uiCopy("กลับแดชบอร์ด", "Return to Dashboard")}</a><a className="secondary-link" href="/workspace/voice">{uiCopy("การติดตั้ง Voice", "Voice deployments")}</a></div></header>
      {!result.configurations.length ? <section className="tool-band"><h2>{uiCopy("ยังไม่มีการตั้งค่า Voice", "No Voice configuration yet")}</h2><p>{uiCopy("เริ่มจาก Voice Builder เพื่อสร้างฉบับร่างที่ผูกกับบัญชี", "Start in the Voice Builder to create an account-bound draft.")}</p></section> : <>
        <section className="tool-band"><div className="band-heading"><div><p>{uiCopy("การตั้งค่าที่บันทึกไว้", "Saved configurations")}</p><h2>{uiCopy("เลือก Voice Agent", "Choose a Voice Agent")}</h2></div><span>{result.configurations.length}</span></div><select value={selectedId} onChange={(event) => { if (dirty && !window.confirm(uiCopy("ทิ้งการเปลี่ยนแปลงที่ยังไม่ได้บันทึกหรือไม่?", "Discard unsaved changes?"))) return; const id = event.target.value; setSelectedId(id); void loadConfiguration(id); }}>{result.configurations.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.currentPublishedVersion ? `v${item.currentPublishedVersion}` : uiCopy("ฉบับร่าง", "Draft")}</option>)}</select></section>
        {!result.capability ? <section className="tool-band muted-band"><div className="band-heading"><div><p>{uiCopy("ยังไม่เปิดสิทธิ์ใช้งาน", "Access not active")}</p><h2>{uiCopy("ฉบับร่างของคุณถูกเก็บไว้อย่างปลอดภัย", "Your draft is preserved")}</h2></div><span>{uiCopy("อ่านอย่างเดียว", "Read only")}</span></div><p>{uiCopy("คุณเข้าดูการตั้งค่าได้ แต่ต้องเปิดใช้งานแพ็กเกจ Voice ก่อนแก้ไข เผยแพร่ หรือติดตั้ง", "You can review this configuration. Activate a Voice package before editing, publishing, or installing.")}</p><a className="secondary-link" href="/workspace/usage">{uiCopy("ดูแพ็กเกจและการใช้งาน", "View packages and usage")}</a></section> : null}
        {configuration && definition ? <section className="tool-band"><div className="band-heading"><div><p>{definition.agentRole === "support" ? "Customer Support" : definition.agentRole === "booking" ? "Appointment Booking" : "Sales Associate"}</p><h2>{definition.agentName}</h2></div><span>{configuration.currentPublishedVersion ? `Published v${configuration.currentPublishedVersion}` : "Draft only"}</span></div>
          <AiPlaybookEditor definition={definition} definitionText={definitionText} readOnly={!canEdit} advancedPending={advancedPending} validationPath={validationPath} validationMessage={validationMessage} onDefinitionChange={updateDefinition} onAdvancedChange={(value) => { setDefinitionText(value); setAdvancedPending(true); setDirty(true); setValidationPath(""); setValidationMessage(""); }} onAdvancedBlur={validateAdvanced} />
          {message ? <p className="dashboard-inline-message" role="status">{message}</p> : null}
          <div className="deploy-command-row"><button type="button" disabled={!canEdit || working || !dirty} onClick={() => void save()}>{working ? uiCopy("กำลังบันทึก…", "Saving…") : uiCopy("บันทึกฉบับร่าง", "Save draft")}</button><button type="button" className="secondary-command" disabled={!canEdit || working || dirty} onClick={() => void publish()}>{uiCopy("เผยแพร่เวอร์ชัน", "Publish version")}</button></div>
          <p className="field-help">{uiCopy("การเผยแพร่สร้างเวอร์ชันถาวรเท่านั้น การติดตั้ง การยืนยัน และการเปิดรับสายเป็นขั้นตอนแยกกัน", "Publishing creates an immutable version only. Installation, verification, and live traffic remain separate steps.")}</p>
          {canEdit && configuration.currentPublishedPlaybookVersionId && configuration.deploymentCount === 0 ? <details className="advanced-definition"><summary>{uiCopy("สร้างการติดตั้งเว็บไซต์", "Create website deployment")}</summary><p className="field-help">{uiCopy("ขั้นตอนนี้สร้างกุญแจและต้นทางเว็บไซต์ แต่ยังไม่เปิดรับสาย", "This creates a key and website origin, but keeps traffic inactive.")}</p><VoiceDeploymentForm className="voice-deploy" agentId={configuration.id} working={working} onSubmit={createDeployment} defaults={{ agentName: definition.agentName, businessName: definition.businessName, defaultLocale: configuration.defaultLanguage }} /></details> : null}
          {deploymentKey ? <div className="deployment-secret"><strong>{uiCopy("กุญแจติดตั้งที่แสดงครั้งเดียว", "One-time installation key")}</strong><code>{deploymentKey}</code><pre>{createWidgetInstallSnippet("voice", deploymentKey, tenantWidgetInstallEnvironment)}</pre><a className="secondary-link" href="/workspace/voice">{uiCopy("ไปที่การยืนยันและเปิดใช้งาน", "Continue to verification and activation")}</a></div> : null}
        </section> : null}
      </>}
    </section>
  </main>;
}
