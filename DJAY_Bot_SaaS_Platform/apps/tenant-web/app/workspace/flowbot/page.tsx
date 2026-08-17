"use client";

import { useEffect, useState, type FormEvent } from "react";
import { flowSnapshotSchema } from "@djay/flowbot-domain";
import {
  flowbotOperationsFieldConstraints,
  currentIntlLocale,
  flowbotRoutingTeamFormError,
  flowbotScheduleFormError,
  safeMutationFetch,
  uiCopy,
} from "@djay/shared";
import { createWidgetInstallSnippet } from "@djay/shared/widget-install";
import { tenantWidgetInstallEnvironment } from "../../../lib/widget-install-environment";
import { WorkspaceSidebar } from "../WorkspaceSidebar";
import { WorkspacePageLoadError, WorkspaceSessionLoadError } from "../WorkspaceAccess";
import { WorkspaceSupportBanner } from "../WorkspaceSupportBanner";
import { WebsiteDeploymentForm } from "../WebsiteDeploymentForm";
import { useWorkspaceSession } from "../useWorkspaceSession";
import { humanizeAccessMode, humanizePlanKey } from "../../../lib/workspace-labels";
import { FlowVisualEditor } from "./FlowVisualEditor";

type Bot = { id: string; name: string; status: string; defaultLanguage: "th" | "en"; currentPublishedVersionId: string | null; draftRevision: number; deploymentCount: number };
type Capabilities = { planKey: "flowbot_basic" | "flowbot_premium"; accessMode: string; advancedNodes: boolean; approvedWebhooks: boolean; teamRouting: boolean; brandingRemoval: boolean; limits: { activeBots: number | null; nodesPerBot: number | null; deployments: number | null } };
type Draft = { revision: number; definition: Record<string, unknown>; updatedAt: string };
type Version = { id: string; version: number; sourceVersionId: string | null; publishedAt: string };
type Deployment = { id: string; name: string; keyPrefix: string; status: string; trafficStatus: "inactive" | "live"; liveVersionId: string | null; liveAt: string | null; allowedOrigins: string[]; createdAt: string };
type Analytics = { periodDays: number; level: "core" | "advanced"; executions: number; completed: number; handovers: number; leads: number; messages: number; unansweredInputs: { executionId: string; conversationId: string; contactName: string; reason: string; inputText: string | null; occurredAt: string }[]; journeys: { path: string; executions: number; completed: number; handovers: number }[] };
type InstallCheck = { id: string; deploymentId: string; targetOrigin: string; status: string; safeResultCode: string | null; createdAt: string };
type TeamMember = { membership_id: string; display_name: string; membership_status: string };
type DowngradePreflight = { allowed: boolean; blockers: { code: string; detail?: string }[]; remediation: { action: string }[] };
type NotificationProfile = { id: string; name: string; allowedTemplateKeys: string[]; status: "active" | "disabled"; createdAt: string };
type FlowIntegration = { id: string; name: string; integrationKind: "external_api" | "google_sheets"; endpoint: string; allowedTemplateKeys: string[]; status: string; createdAt: string };
type OperationsValidation = { form: "schedule" | "team"; field: string; message: string };
type DraftValidation = { message: string; path: readonly PropertyKey[] };

function focusFormControl(form: HTMLFormElement, fieldName: string) {
  requestAnimationFrame(() => {
    const named = form.elements.namedItem(fieldName);
    const field = named instanceof HTMLElement ? named : form.querySelector(`[name="${fieldName}"]`);
    if (field instanceof HTMLElement) field.focus();
  });
}

function focusFlowDefinitionIssue(path: readonly PropertyKey[]) {
  requestAnimationFrame(() => {
    const values = path.map(String);
    if (values[0] === "nodes" && values[1]) {
      const article = Array.from(document.querySelectorAll<HTMLElement>("[data-flow-node-id]"))
        .find((element) => element.dataset.flowNodeId === values[1]);
      const fieldName = values.slice(2).join(".");
      const field = Array.from(article?.querySelectorAll<HTMLElement>("[data-flow-node-field]") || [])
        .find((element) => element.dataset.flowNodeField === fieldName);
      if (field) { field.focus(); return; }
    }
    document.querySelector<HTMLElement>("[data-flow-advanced-json]")?.focus();
  });
}

function draftIssueMessage(issue: Readonly<{ path: readonly PropertyKey[]; message: string }>) {
  const path = issue.path.map(String);
  if (path.at(-1) === "title") return "Each node title must contain 1–160 visible characters.";
  if ((path.at(-1) === "en" || path.at(-1) === "th") && issue.message.toLowerCase().includes("too big")) {
    return "English and Thai node copy must each be no longer than 10,000 characters.";
  }
  return `Flow definition is invalid at ${path.length ? path.join(" › ") : "the document root"}: ${issue.message}`;
}

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

function appointmentTemplate() {
  const root = crypto.randomUUID(); const form = crypto.randomUUID(); const end = crypto.randomUUID(); const flowVersionId = crypto.randomUUID();
  return { schemaVersion: 1, flowVersionId, rootNodeId: root, keywords: [], nodes: {
    [root]: { id: root, type: "message", title: "Appointment welcome", content: { th: "แจ้งวันและเวลาที่สะดวก ทีมงานจะยืนยันนัดหมายกลับไป", en: "Tell us your preferred date and time. Our team will confirm the appointment." }, nextNodeId: form },
    [form]: { id: form, type: "form", title: "Appointment request", prompt: { th: "ข้อมูลสำหรับนัดหมาย", en: "Appointment details" }, fields: [
      { key: "name", label: { th: "ชื่อ", en: "Name" }, type: "text", required: true },
      { key: "phone", label: { th: "เบอร์โทร", en: "Phone" }, type: "phone", required: true },
      { key: "preferred_time", label: { th: "วันและเวลาที่สะดวก", en: "Preferred date and time" }, type: "text", required: true },
      { key: "note", label: { th: "รายละเอียดเพิ่มเติม", en: "Additional details" }, type: "textarea", required: false },
    ], nextNodeId: end },
    [end]: { id: end, type: "end", title: "Request received", message: { th: "รับคำขอแล้ว ทีมงานจะติดต่อเพื่อยืนยันนัดหมาย", en: "Request received. Our team will contact you to confirm." } },
  } };
}

function faqTemplate() {
  const root = crypto.randomUUID(); const hours = crypto.randomUUID(); const price = crypto.randomUUID();
  const contact = crypto.randomUUID(); const end = crypto.randomUUID(); const flowVersionId = crypto.randomUUID();
  return { schemaVersion: 1, flowVersionId, rootNodeId: root, keywords: [], nodes: {
    [root]: { id: root, type: "options", title: "Frequently asked questions", prompt: { th: "ต้องการทราบเรื่องใด?", en: "What would you like to know?" }, options: [
      { id: crypto.randomUUID(), label: { th: "เวลาทำการ", en: "Opening hours" }, targetNodeId: hours },
      { id: crypto.randomUUID(), label: { th: "ราคาและบริการ", en: "Prices and services" }, targetNodeId: price },
      { id: crypto.randomUUID(), label: { th: "ให้ทีมงานติดต่อกลับ", en: "Ask the team to contact me" }, targetNodeId: contact },
    ] },
    [hours]: { id: hours, type: "message", title: "Opening hours", content: { th: "เปิดวันจันทร์–ศุกร์ เวลา 09:00–17:00 น. แก้ข้อความนี้ให้ตรงกับธุรกิจของคุณ", en: "Open Monday–Friday, 09:00–17:00. Edit this to match your business." }, nextNodeId: contact },
    [price]: { id: price, type: "message", title: "Prices and services", content: { th: "เพิ่มข้อมูลราคาและบริการของคุณที่นี่", en: "Add your prices and services here." }, nextNodeId: contact },
    [contact]: { id: contact, type: "form", title: "Contact request", prompt: { th: "ให้ทีมงานติดต่อกลับ", en: "Ask our team to contact you" }, fields: [
      { key: "name", label: { th: "ชื่อ", en: "Name" }, type: "text", required: true },
      { key: "phone", label: { th: "เบอร์โทร", en: "Phone" }, type: "phone", required: false },
      { key: "question", label: { th: "คำถาม", en: "Question" }, type: "textarea", required: true },
    ], nextNodeId: end },
    [end]: { id: end, type: "end", title: "Complete", message: { th: "รับข้อมูลแล้ว ทีมงานจะติดต่อกลับ", en: "Thank you. Our team will contact you." } },
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
  const [integrations, setIntegrations] = useState<FlowIntegration[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [analyticsLoadError, setAnalyticsLoadError] = useState(false); const [installChecksLoadError, setInstallChecksLoadError] = useState(false);
  const [teamLoadError, setTeamLoadError] = useState(false); const [preflightLoadError, setPreflightLoadError] = useState(false);
  const [notificationsLoadError, setNotificationsLoadError] = useState(false);
  const [operationsValidation, setOperationsValidation] = useState<OperationsValidation | null>(null);
  const [draftValidation, setDraftValidation] = useState<DraftValidation | null>(null);
  const [editorErrorMessage, setEditorErrorMessage] = useState("");
  const [studioTab, setStudioTab] = useState<"setup" | "flow" | "deploy" | "operations" | "advanced">("flow");
  const canAuthor = session.allows("flowbot.author");
  const selectedBot = bots.find((bot) => bot.id === selectedBotId);
  const activeTeamMembers = teamMembers.filter((member) => member.membership_status === "active");
  const installSnippet = newDeploymentKey
    ? createWidgetInstallSnippet("flowbot", newDeploymentKey, tenantWidgetInstallEnvironment)
    : "";

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
      const value = (await draftResponse.json()).draft as Draft; setDraft(value); setDefinitionText(JSON.stringify(value.definition, null, 2)); setDraftValidation(null); setEditorErrorMessage("");
      setVersions((await versionResponse.json()).versions || []);
      setDeployments((await deploymentResponse.json()).deployments || []); setLoadError(false);
    } catch { setLoadError(true); }
  }
  async function loadOperations() {
    const canReadTeam = session.allows("team.read"); const canManageSubscriptions = session.allows("subscriptions.manage");
    const [analyticsResponse, checksResponse, teamResponse, preflightResponse, notificationResponse, integrationResponse] = await Promise.all([
      fetch("/tenant/flowbot/analytics", { cache: "no-store" }).catch(() => null),
      fetch("/tenant/flowbot/install-checks", { cache: "no-store" }).catch(() => null),
      canReadTeam ? fetch("/tenant/team", { cache: "no-store" }).catch(() => null) : null,
      canManageSubscriptions ? fetch("/tenant/flowbot/downgrade-preflight", { cache: "no-store" }).catch(() => null) : null,
      fetch("/tenant/flowbot/notifications", { cache: "no-store" }).catch(() => null),
      fetch("/tenant/flowbot/integrations", { cache: "no-store" }).catch(() => null),
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
    try { setIntegrations(integrationResponse?.ok ? (await integrationResponse.json()).integrations || [] : []); }
    catch { setIntegrations([]); }
  }
  useEffect(() => { if (session.selectedTenantId) { void loadBots(); void loadOperations(); } }, [session.selectedTenantId]);
  useEffect(() => { void loadBot(selectedBotId); }, [selectedBotId]);

  async function createBot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setWorking(true); setMessage(""); const form = event.currentTarget; const data = new FormData(form);
    const response = await safeMutationFetch("/tenant/flowbot/bots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: data.get("name"), defaultLanguage: "th" }) });
    const result = await response.json(); setWorking(false);
    if (!response.ok) { setMessage(result.status === "limit_reached" ? "Active bot limit reached." : "Bot could not be created."); return; }
    form.reset(); await loadBots(); setSelectedBotId(result.botId); setMessage("Bot created.");
  }
  async function saveDraft() {
    if (!draft || !selectedBotId) return;
    if (editorErrorMessage) { setMessage(""); setDraftValidation({ message: editorErrorMessage, path: [] }); return; }
    try {
      const definition = JSON.parse(definitionText);
      const parsedDefinition = flowSnapshotSchema.safeParse(definition);
      if (!parsedDefinition.success) {
        const issue = parsedDefinition.error.issues[0]!;
        setMessage(""); setDraftValidation({ message: draftIssueMessage(issue), path: issue.path }); focusFlowDefinitionIssue(issue.path); return;
      }
      setWorking(true); setMessage(""); setDraftValidation(null);
      const response = await safeMutationFetch(`/tenant/flowbot/bots/${selectedBotId}/draft`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: draft.revision, definition: parsedDefinition.data }) });
      setWorking(false); if (!response.ok) { setMessage(response.status === 409 ? "Draft changed in another session. Reload before saving." : "Draft validation failed."); return; }
      setMessage("Draft saved."); await loadBot(selectedBotId);
    } catch { setMessage(""); setDraftValidation({ message: "Definition must be valid JSON. Repair it in the open Advanced JSON editor.", path: [] }); focusFlowDefinitionIssue([]); }
  }
  async function publish() {
    if (!selectedBotId) return; setWorking(true); setMessage("");
    const response = await safeMutationFetch(`/tenant/flowbot/bots/${selectedBotId}/publish`, { method: "POST" }); const result = await response.json(); setWorking(false);
    if (!response.ok) { setMessage(result.issues?.map((issue: { code: string }) => issue.code).join(", ") || "Publish failed."); return; }
    setMessage(uiCopy(`เผยแพร่เวอร์ชัน ${result.version} แล้ว`, `Version ${result.version} published.`)); await loadBots(); await loadBot(selectedBotId);
  }
  async function rollback(versionId: string) {
    if (!selectedBotId || !window.confirm(uiCopy("เผยแพร่คำจำกัดความย้อนหลังนี้เป็นเวอร์ชันใหม่หรือไม่?", "Publish this historical definition as a new version?"))) return; setWorking(true);
    const response = await safeMutationFetch(`/tenant/flowbot/bots/${selectedBotId}/rollback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceVersionId: versionId }) }); const result = await response.json(); setWorking(false);
    setMessage(response.ok ? uiCopy(`เผยแพร่เวอร์ชัน ${result.version} จากประวัติแล้ว`, `Version ${result.version} published from history.`) : uiCopy("เผยแพร่เวอร์ชันย้อนหลังไม่สำเร็จ", "Rollback publish failed.")); if (response.ok) await loadBot(selectedBotId);
  }
  async function createDeployment(input: Readonly<{ name: string; allowedOrigins: readonly [string] }>, form: HTMLFormElement) {
    if (!selectedBotId) return; setWorking(true); setNewDeploymentKey("");
    const response = await safeMutationFetch(`/tenant/flowbot/bots/${selectedBotId}/deployments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }); const result = await response.json(); setWorking(false);
    if (!response.ok) { setMessage("Deployment could not be created."); return; } setNewDeploymentKey(result.deploymentKey); setMessage("Deployment key created. It is shown once."); form.reset(); await loadBot(selectedBotId);
  }
  async function requestInstallCheck(deployment: Deployment) {
    const targetOrigin = deployment.allowedOrigins[0]; if (!targetOrigin) return;
    setWorking(true);
    const response = await safeMutationFetch("/tenant/flowbot/install-checks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deploymentId: deployment.id, targetOrigin }) });
    setWorking(false); setMessage(response.ok ? "Install check requested. Reload the website containing the widget to verify it." : "Install check could not be requested.");
    if (response.ok) await loadOperations();
  }
  async function changeTraffic(deployment: Deployment, action: "go_live" | "stop") {
    const confirmed = window.confirm(action === "go_live"
      ? uiCopy("เปิดรับการสนทนาจริงสำหรับการติดตั้งนี้หรือไม่? ระบบจะตรวจสอบสิทธิ์ เวอร์ชัน โควตา และการติดตั้งอีกครั้ง", "Go live with this deployment? Access, version, quota, and installation will be revalidated.")
      : uiCopy("หยุดรับการสนทนาใหม่สำหรับการติดตั้งนี้หรือไม่?", "Stop new conversations for this deployment?"));
    if (!confirmed) return;
    setWorking(true); setMessage("");
    const response = await safeMutationFetch(`/tenant/flowbot/deployments/${deployment.id}/traffic`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
    });
    const result = await response.json(); setWorking(false);
    const failure = result.status === "verification_required" ? uiCopy("ต้องยืนยันการติดตั้งจากเว็บไซต์ที่อนุญาตก่อนเปิดใช้งาน", "Verify installation from an allowed website before going live.")
      : result.status === "quota_unavailable" ? uiCopy("โควตาปัจจุบันไม่พร้อมใช้งาน", "Current quota is unavailable.")
        : uiCopy("เปลี่ยนสถานะการใช้งานไม่สำเร็จ", "Traffic state could not be changed.");
    setMessage(response.ok
      ? action === "go_live" ? uiCopy("เปิดใช้งานจริงแล้ว", "Deployment is live.") : uiCopy("หยุดรับการสนทนาใหม่แล้ว", "New conversations are stopped.")
      : failure);
    if (response.ok) await loadBot(selectedBotId);
  }
  async function saveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const input = {
      scheduleKey: String(data.get("scheduleKey") || ""),
      name: String(data.get("name") || ""),
      timezone: String(data.get("timezone") || ""),
    };
    const validationError = flowbotScheduleFormError(input);
    if (validationError) {
      setMessage(""); setOperationsValidation({ form: "schedule", ...validationError });
      focusFormControl(form, validationError.field);
      return;
    }
    setWorking(true); setMessage(""); setOperationsValidation(null);
    const weeklyWindows = [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, startMinute: 540, endMinute: 1020 }));
    const response = await safeMutationFetch("/tenant/flowbot/schedules", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scheduleKey: input.scheduleKey.trim(), name: input.name.trim(), timezone: input.timezone.trim(), weeklyWindows, closedDates: [] }) });
    setWorking(false); setMessage(response.ok ? "Business schedule saved (Monday-Friday, 09:00-17:00)." : "Business schedule could not be saved.");
  }
  async function saveRoutingTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const input = {
      teamKey: String(data.get("teamKey") || ""),
      name: String(data.get("name") || ""),
      membershipIds: data.getAll("membershipIds").map(String),
    };
    const validationError = flowbotRoutingTeamFormError(input);
    if (validationError) {
      setMessage(""); setOperationsValidation({ form: "team", ...validationError });
      focusFormControl(form, validationError.field);
      return;
    }
    setWorking(true); setMessage(""); setOperationsValidation(null);
    const response = await safeMutationFetch("/tenant/flowbot/routing-teams", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teamKey: input.teamKey.trim(), name: input.name.trim(), membershipIds: input.membershipIds }) });
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
  async function createIntegration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setWorking(true); setMessage("");
    const integrationKind = String(data.get("integrationKind"));
    const response = await safeMutationFetch("/tenant/flowbot/integrations", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        integrationKind, name: data.get("name"), endpoint: data.get("endpoint"),
        allowedTemplateKeys: String(data.get("templateKeys") || "").split(",").map((value) => value.trim()).filter(Boolean),
      }),
    });
    const result = await response.json(); setWorking(false);
    setMessage(response.ok ? "Connector submitted for security approval."
      : result.status === "reauthentication_required" ? "Sign in again before adding a connector."
        : "Connector could not be submitted.");
    if (response.ok) { form.reset(); await loadOperations(); }
  }
  function applyTemplate(template: "greeting" | "lead" | "appointment" | "faq" | "premium") {
    const value = template === "greeting" ? greetingTemplate()
      : template === "lead" ? leadTemplate()
        : template === "appointment" ? appointmentTemplate()
          : template === "faq" ? faqTemplate() : premiumTemplate();
    setDefinitionText(JSON.stringify(value, null, 2)); setMessage(""); setDraftValidation(null); setEditorErrorMessage("");
  }
  if (session.error) return <WorkspaceSessionLoadError onRetry={() => window.location.reload()} />;
  if (session.loading || !session.selectedTenantId) return <main className="workspace-loading">กำลังโหลด FlowBot...</main>;
  if (loadError) return <WorkspacePageLoadError active="flowbot" title="FlowBot" resource="FlowBot Studio" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} onRetry={() => window.location.reload()} />;
  const studioTabs = [
    ["setup", "Setup", "Bot & publish"],
    ["flow", "Flow", "Draft editor"],
    ["deploy", "Deploy", "Origins & keys"],
    ["operations", "Operations", "Routing & notify"],
    ["advanced", "Advanced", "Analytics & history"],
  ] as const;
  return <main className="workspace-shell"><WorkspaceSidebar active="flowbot" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} />
    <section id="workspace-main" className="workspace-main" tabIndex={-1}><WorkspaceSupportBanner tenantId={session.selectedTenantId} />
      <header className="workspace-header"><div><p>ระบบอัตโนมัติบนเว็บไซต์</p><h1>FlowBot</h1></div><span className="role-label">{humanizePlanKey(capabilities?.planKey)} · {humanizeAccessMode(capabilities?.accessMode)}</span></header>
      <section className="tool-band flowbot-control-band"><div className="band-heading"><div><p>บอต</p><h2>ผู้ช่วยที่เผยแพร่แล้ว</h2></div><span>{bots.length}{capabilities?.limits.activeBots ? ` / ${capabilities.limits.activeBots}` : ""}</span></div>
        {canAuthor ? <form className="flowbot-create" onSubmit={createBot}><label>ชื่อ<input name="name" minLength={2} maxLength={160} required /></label><div><strong>ภาษาของลูกค้า</strong><span>ลูกค้าเลือก English หรือ ไทย ก่อนเริ่มสนทนา</span></div><button type="submit" disabled={working}>สร้างบอต</button></form> : null}
        <div className="flowbot-bot-tabs" role="tablist" aria-label="FlowBot">{bots.map((bot) => <button type="button" role="tab" id={`flowbot-bot-${bot.id}`} aria-controls="flowbot-studio-panels" aria-selected={bot.id === selectedBotId} className={bot.id === selectedBotId ? "selected" : ""} key={bot.id} onClick={() => setSelectedBotId(bot.id)}><strong data-no-localize>{bot.name}</strong><span>{bot.status} / {bot.deploymentCount} deployments</span></button>)}</div>
        {!bots.length ? <div className="pending-line"><strong>ยังไม่มี FlowBot</strong><span>{canAuthor ? "Create the first bot." : "An administrator can create one."}</span></div> : null}
        <p className="field-help"><a href="/workspace/setup">เปิดตัวช่วยตั้งค่าทีละขั้น</a> สำหรับการเปิดใช้ครั้งแรก ส่วนแท็บสตูดิโอด้านล่างใช้ปรับแต่งหลังเปิดใช้</p>
      </section>
      {selectedBot && draft ? <>
        <div className="flowbot-studio-tabs" role="tablist" aria-label="ส่วนต่าง ๆ ในสตูดิโอ FlowBot">
          {studioTabs.map(([id, title, detail]) => (
            <button key={id} type="button" role="tab" id={`flowbot-tab-${id}`} aria-controls={`flowbot-panel-${id}`} aria-selected={studioTab === id} className={studioTab === id ? "selected" : ""} onClick={() => setStudioTab(id)}>
              <strong>{title}</strong><span>{detail}</span>
            </button>
          ))}
        </div>
        <div id="flowbot-studio-panels">
        <section className="tool-band" role="tabpanel" id="flowbot-panel-setup" aria-labelledby="flowbot-tab-setup" hidden={studioTab !== "setup"}>
          <div className="band-heading"><div><p>เริ่มใช้งาน</p><h2 data-no-localize>{selectedBot.name}</h2></div><span>{selectedBot.currentPublishedVersionId ? "เผยแพร่แล้ว" : "มีเฉพาะฉบับร่าง"}</span></div>
          <p className="control-copy">สร้างหรือเลือกบอตด้านบน แล้วเผยแพร่จากแท็บ Flow หากใช้งานครั้งแรก แนะนำให้ใช้ตัวช่วยตั้งค่าทีละขั้น</p>
          <div className="setup-action-row"><a className="primary-link" href="/workspace/setup">ดำเนินการต่อในตัวช่วยตั้งค่า</a><button type="button" className="secondary-command" onClick={() => setStudioTab("flow")}>เปิดตัวแก้ไข Flow</button></div>
        </section>
        <section className="tool-band" role="tabpanel" id="flowbot-panel-flow" aria-labelledby="flowbot-tab-flow" hidden={studioTab !== "flow"}><div className="band-heading"><div><p>Draft revision {draft.revision}</p><h2 data-no-localize>{selectedBot.name}</h2></div><span>{Object.keys((draft.definition.nodes as object) || {}).length} nodes</span></div>
          {canAuthor ? <div className="template-control" aria-label="เทมเพลต Flow"><button type="button" onClick={() => applyTemplate("greeting")}>คำทักทาย</button><button type="button" onClick={() => applyTemplate("lead")}>เก็บข้อมูลผู้สนใจ</button><button type="button" onClick={() => applyTemplate("appointment")}>ขอนัดหมาย</button><button type="button" onClick={() => applyTemplate("faq")}>คำถามที่พบบ่อย</button>{capabilities?.advancedNodes ? <button type="button" onClick={() => applyTemplate("premium")}>ติดตามตามเวลาที่กำหนด</button> : null}</div> : null}
          <p className="field-help"><a href="/workspace/flowbot/canvas">เปิดผังการสนทนาแบบดูอย่างเดียว</a> เพื่อดูป้ายกำกับทุกทางแยก จุดสิ้นสุดที่มีคำกระตุ้นให้ดำเนินการ และคำเตือนเส้นทางที่เข้าไม่ถึงหรือวนซ้ำ การแก้ไขยังทำผ่านตัวแก้ไขแบบรายการด้านล่าง</p>
          <FlowVisualEditor value={definitionText} onChange={(value) => { setDefinitionText(value); setDraftValidation(null); }} onEditorErrorChange={setEditorErrorMessage} validationPath={draftValidation?.path} readOnly={!canAuthor} premium={Boolean(capabilities?.advancedNodes)} />
          {canAuthor ? <div className="flowbot-actions"><button type="button" className="secondary-command" onClick={() => void saveDraft()} disabled={working}>บันทึกฉบับร่าง</button><button type="button" onClick={() => void publish()} disabled={working}>เผยแพร่</button></div> : null}
          {draftValidation ? <p className="inline-message error" id="flowbot-draft-error" role="alert">{draftValidation.message}</p> : message ? <p className="inline-message" role="status">{message}</p> : null}
        </section>
        <section className="tool-band muted-band" role="tabpanel" id="flowbot-panel-deploy" aria-labelledby="flowbot-tab-deploy" hidden={studioTab !== "deploy"}><div className="band-heading"><div><p>การติดตั้ง</p><h2>ต้นทางเว็บไซต์</h2></div><span>{deployments.length}{capabilities?.limits.deployments ? ` / ${capabilities.limits.deployments}` : ""}</span></div>
          {installChecksLoadError ? <div className="inline-message inline-retry" role="alert"><span>โหลดสถานะตรวจสอบการติดตั้งไม่สำเร็จ แต่ข้อมูลการติดตั้งยังคงอยู่</span><button className="secondary-command" type="button" onClick={() => void loadOperations()}>ลองใหม่</button></div> : null}
          {canAuthor && selectedBot.currentPublishedVersionId ? <WebsiteDeploymentForm className="flowbot-deploy" onCreate={createDeployment} submitLabel="สร้างการติดตั้ง" working={working} /> : null}
          {newDeploymentKey ? <div className="deployment-secret"><strong>กุญแจติดตั้งที่แสดงครั้งเดียว</strong><code>{newDeploymentKey}</code><pre>{installSnippet}</pre></div> : null}
          <div className="data-table">{deployments.map((item) => { const check = installChecks.find((candidate) => candidate.deploymentId === item.id); const updateAvailable = item.trafficStatus === "live" && item.liveVersionId !== selectedBot.currentPublishedVersionId; return <div className="data-row" key={item.id}><div><strong data-no-localize>{item.name}</strong><span data-no-localize>{item.allowedOrigins.join(", ")}</span></div><div><span>{uiCopy("ติดตั้ง", "Install")}: {check?.status || "not checked"}</span><span>{uiCopy("การใช้งานจริง", "Traffic")}: {item.trafficStatus}</span></div>{canAuthor ? <div className="setup-action-row"><button type="button" className="secondary-command" disabled={working} onClick={() => void requestInstallCheck(item)}>ตรวจสอบการติดตั้ง</button>{item.trafficStatus === "live" ? <>{updateAvailable ? <button type="button" disabled={working} onClick={() => void changeTraffic(item, "go_live")}>{uiCopy("อัปเดตเวอร์ชันที่ใช้งานจริง", "Update live version")}</button> : null}<button type="button" className="secondary-command" disabled={working} onClick={() => void changeTraffic(item, "stop")}>{uiCopy("หยุดรับข้อความ", "Stop traffic")}</button></> : <button type="button" disabled={working || check?.status !== "verified"} onClick={() => void changeTraffic(item, "go_live")}>{uiCopy("เปิดใช้งานจริง", "Go live")}</button>}</div> : <code>{item.keyPrefix}...</code>}</div>; })}{!deployments.length ? <div className="pending-line"><strong>ยังไม่มีการติดตั้ง</strong><span>เผยแพร่ก่อนสร้างการติดตั้งบนเว็บไซต์</span></div> : null}</div>
        </section>
        <div role="tabpanel" id="flowbot-panel-operations" aria-labelledby="flowbot-tab-operations" hidden={studioTab !== "operations"}>
        {capabilities?.advancedNodes && canAuthor ? <section className="tool-band"><div className="band-heading"><div><p>การดำเนินงานพรีเมียม</p><h2>ตารางเวลาและการส่งต่อ</h2></div><span>ทำงานตามกติกา</span></div>
          {/* Empty routing-team state: No active team members. */}
          <div className="flowbot-operations-grid"><form onSubmit={saveSchedule} noValidate onInput={() => setOperationsValidation((current) => current?.form === "schedule" ? null : current)}><h3>เวลาทำการ</h3><label>กุญแจ<input name="scheduleKey" defaultValue="sales" {...flowbotOperationsFieldConstraints.key} required aria-invalid={operationsValidation?.form === "schedule" && operationsValidation.field === "scheduleKey" || undefined} aria-describedby={operationsValidation?.form === "schedule" && operationsValidation.field === "scheduleKey" ? "flowbot-schedule-error" : undefined} /></label><label>ชื่อ<input name="name" defaultValue="Sales hours" {...flowbotOperationsFieldConstraints.name} required aria-invalid={operationsValidation?.form === "schedule" && operationsValidation.field === "name" || undefined} aria-describedby={operationsValidation?.form === "schedule" && operationsValidation.field === "name" ? "flowbot-schedule-error" : undefined} /></label><label>เขตเวลา<input name="timezone" defaultValue="Asia/Bangkok" {...flowbotOperationsFieldConstraints.timezone} required aria-invalid={operationsValidation?.form === "schedule" && operationsValidation.field === "timezone" || undefined} aria-describedby={operationsValidation?.form === "schedule" && operationsValidation.field === "timezone" ? "flowbot-schedule-error" : undefined} /></label>{operationsValidation?.form === "schedule" ? <p id="flowbot-schedule-error" className="inline-message error" role="alert">{operationsValidation.message}</p> : null}<button disabled={working}>บันทึกวันธรรมดา 09:00–17:00</button></form>
            <form onSubmit={saveRoutingTeam} noValidate onInput={() => setOperationsValidation((current) => current?.form === "team" ? null : current)}><h3>ทีมรับช่วงการสนทนา</h3><label>กุญแจ<input name="teamKey" defaultValue="sales" {...flowbotOperationsFieldConstraints.key} required aria-invalid={operationsValidation?.form === "team" && operationsValidation.field === "teamKey" || undefined} aria-describedby={operationsValidation?.form === "team" && operationsValidation.field === "teamKey" ? "flowbot-team-error" : undefined} /></label><label>ชื่อ<input name="name" defaultValue="Sales team" {...flowbotOperationsFieldConstraints.name} required aria-invalid={operationsValidation?.form === "team" && operationsValidation.field === "name" || undefined} aria-describedby={operationsValidation?.form === "team" && operationsValidation.field === "name" ? "flowbot-team-error" : undefined} /></label>{teamLoadError ? <div className="inline-message inline-retry" role="alert"><span>โหลดสมาชิกทีมที่ใช้งานอยู่ไม่สำเร็จ</span><button className="secondary-command" type="button" onClick={() => void loadOperations()}>ลองใหม่</button></div> : activeTeamMembers.length ? <fieldset aria-describedby={operationsValidation?.form === "team" && operationsValidation.field === "membershipIds" ? "flowbot-team-error" : undefined}><legend>สมาชิกที่ใช้งานอยู่</legend>{activeTeamMembers.map((member) => <label key={member.membership_id}><input type="checkbox" name="membershipIds" value={member.membership_id} defaultChecked /> <span data-no-localize>{member.display_name}</span></label>)}</fieldset> : <div className="pending-line"><strong>ไม่มีสมาชิกทีมที่ใช้งานอยู่</strong><span>เพิ่มหรือเปิดใช้งานสมาชิกทีมก่อนสร้างทีมรับช่วงการสนทนา</span></div>}{operationsValidation?.form === "team" ? <p id="flowbot-team-error" className="inline-message error" role="alert">{operationsValidation.message}</p> : null}<button disabled={working || teamLoadError || !activeTeamMembers.length}>บันทึกทีมรับช่วง</button></form></div>
        </section> : null}
        {capabilities?.advancedNodes && canAuthor ? <section className="tool-band"><div className="band-heading"><div><p>ส่งมอบข้อมูล</p><h2>ตัวเชื่อมต่อ</h2></div><span>{integrations.filter((item) => item.status === "approved").length} approved</span></div>
          <form className="flowbot-deploy" onSubmit={createIntegration}>
            <label>ตัวเชื่อมต่อ<select name="integrationKind" defaultValue="google_sheets"><option value="google_sheets">Google Sheets</option><option value="external_api">API ภายนอก</option></select></label>
            <label>ชื่อ<input name="name" minLength={2} maxLength={160} required /></label>
            <label>ปลายทาง HTTPS<input name="endpoint" type="url" placeholder="https://script.google.com/macros/s/.../exec" required /></label>
            <label>คีย์เหตุการณ์<input name="templateKeys" defaultValue="lead.qualified" pattern="[a-z][a-z0-9_.-]*(,\s*[a-z][a-z0-9_.-]*)*" required /></label>
            <button type="submit" disabled={working}>ส่งตัวเชื่อมต่อ</button>
          </form>
          <div className="data-table">{integrations.map((integration) => <div className="data-row" key={integration.id}><div><strong data-no-localize>{integration.name}</strong><span data-no-localize>{integration.integrationKind.replaceAll("_", " ")} · {integration.allowedTemplateKeys.join(", ")}</span></div><span>{integration.status}</span><code>{new URL(integration.endpoint).hostname}</code></div>)}{!integrations.length ? <div className="pending-line"><strong>ยังไม่มีตัวเชื่อมต่อ</strong><span>ตัวเชื่อมต่อที่อนุมัติแล้วจะเลือกใช้ได้ในโนด webhook</span></div> : null}</div>
        </section> : null}
        {canAuthor ? <section className="tool-band"><div className="band-heading"><div><p>การส่งข้อมูลผู้สนใจ</p><h2>การแจ้งเตือนทางอีเมลธุรกิจ</h2></div><span>{notificationsLoadError ? "Unavailable" : `${notifications.filter((item) => item.status === "active").length} active`}</span></div>
          <form className="flowbot-deploy" onSubmit={createNotification}><label>ชื่อผู้รับ<input name="name" minLength={2} maxLength={160} placeholder="กล่องข้อความฝ่ายขาย" required /></label><label>อีเมลผู้รับ<input name="recipientEmail" type="email" maxLength={320} placeholder="sales@example.com" required /></label><button type="submit" disabled={working || notificationsLoadError}>เพิ่มผู้รับ</button></form>
          <p className="field-help">ที่อยู่ผู้รับถูกเข้ารหัส และส่งได้เฉพาะเทมเพลตแจ้งผู้สนใจที่อนุมัติแล้ว</p>
          <div className="data-table">{notificationsLoadError ? <div className="pending-line inline-retry" role="alert"><strong>โหลดรายชื่อผู้รับการแจ้งเตือนไม่สำเร็จ</strong><span>การตั้งค่าการส่งข้อมูลเดิมไม่ถูกเปลี่ยน</span><button className="secondary-command" type="button" onClick={() => void loadOperations()}>ลองใหม่</button></div> : <>{notifications.map((profile) => <div className="data-row" key={profile.id}><div><strong data-no-localize>{profile.name}</strong><span>{profile.allowedTemplateKeys.join(", ")}</span></div><span>{profile.status}</span></div>)}{!notifications.length ? <div className="pending-line"><strong>ยังไม่มีผู้รับ</strong><span>เพิ่มอีเมลธุรกิจเพื่อรับการแจ้งเตือนผู้สนใจที่ส่งซ้ำได้อย่างปลอดภัย</span></div> : null}</>}</div>
        </section> : <section className="tool-band"><p className="control-copy">Channel and notification tools require authoring access{capabilities?.advancedNodes ? "" : " and FlowBot Premium where applicable"}.</p></section>}
        </div>
        <div role="tabpanel" id="flowbot-panel-advanced" aria-labelledby="flowbot-tab-advanced" hidden={studioTab !== "advanced"}>
        {analyticsLoadError ? <section className="tool-band"><div className="pending-line inline-retry" role="alert"><strong>โหลดข้อมูลวิเคราะห์ FlowBot ไม่สำเร็จ</strong><span>ข้อมูลบอตและการติดตั้งจะยังคงอยู่</span><button className="secondary-command" type="button" onClick={() => void loadOperations()}>ลองใหม่</button></div></section> : null}
        {analytics ? <section className="tool-band"><div className="band-heading"><div><p>{analytics.periodDays}-day {analytics.level}</p><h2>ข้อมูลวิเคราะห์ FlowBot</h2></div><a className="secondary-command" href="/tenant/flowbot/analytics?format=csv">ส่งออก CSV</a></div><div className="metric-grid"><div><strong>{analytics.executions}</strong><span>การทำงาน</span></div><div><strong>{analytics.completed}</strong><span>เสร็จสิ้น</span></div><div><strong>{analytics.leads}</strong><span>ผู้สนใจ</span></div><div><strong>{analytics.handovers}</strong><span>การส่งต่อให้ทีม</span></div><div><strong>{analytics.messages}</strong><span>ข้อความ</span></div></div>
          {analytics.level === "advanced" ? <><div className="band-heading"><div><p>ต้องตรวจสอบ</p><h3>ข้อความที่ยังไม่ได้ตอบ</h3></div><span>{analytics.unansweredInputs.length}</span></div><div className="data-table">{analytics.unansweredInputs.map((item) => <div className="data-row" key={`${item.executionId}-${item.occurredAt}`}><div><strong data-no-localize>{item.inputText || "ไม่มีข้อความที่เก็บได้"}</strong><span data-no-localize>{item.contactName}</span></div><span>{item.reason.replaceAll("_", " ")}</span><time>{new Date(item.occurredAt).toLocaleString(currentIntlLocale())}</time></div>)}{!analytics.unansweredInputs.length ? <div className="pending-line"><strong>ไม่มีข้อความที่ยังไม่ได้ตอบ</strong><span>รอบนี้ไม่มีคีย์เวิร์ดที่ตอบไม่ได้</span></div> : null}</div>
          <div className="band-heading"><div><p>ประสิทธิภาพของเส้นทาง</p><h3>เส้นทางลูกค้า</h3></div><span>{analytics.journeys.length}</span></div><div className="data-table">{analytics.journeys.map((item) => <div className="data-row" key={item.path}><div><strong>{item.path}</strong><span>{item.executions} executions</span></div><span>{item.completed} completed</span><span>{item.handovers} handovers</span></div>)}{!analytics.journeys.length ? <div className="pending-line"><strong>ยังไม่มีข้อมูลเส้นทางลูกค้า</strong><span>เส้นทาง Flow ที่เผยแพร่จะแสดงหลังมีลูกค้าใช้งาน</span></div> : null}</div></> : null}
        </section> : null}
        {preflightLoadError ? <section className="tool-band muted-band"><div className="pending-line inline-retry" role="alert"><strong>ตรวจความเข้ากันได้ก่อนลดแผนไม่สำเร็จ</strong><span>ยังไม่มีการเปลี่ยนแปลงการสมัครใช้บริการ</span><button className="secondary-command" type="button" onClick={() => void loadOperations()}>ลองใหม่</button></div></section> : null}
        {preflight ? <section className="tool-band muted-band"><div className="band-heading"><div><p>ความปลอดภัยในการเปลี่ยนแผน</p><h2>ตรวจความพร้อมก่อนลดเป็นแผน Basic</h2></div><span>{preflight.allowed ? "Ready" : `${preflight.blockers.length} blockers`}</span></div>{preflight.allowed ? <p className="inline-message">การตั้งค่าปัจจุบันรองรับ FlowBot Basic</p> : <div className="data-table">{preflight.blockers.map((blocker, index) => <div className="data-row" key={`${blocker.code}-${index}`}><strong>{blocker.code}</strong><span>{blocker.detail || "Configuration dependency"}</span><span>{preflight.remediation[index]?.action}</span></div>)}</div>}</section> : null}
        <section className="tool-band"><div className="band-heading"><div><p>ประวัติที่แก้ไขไม่ได้</p><h2>เวอร์ชันที่เผยแพร่แล้ว</h2></div><span>{versions.length}</span></div><div className="data-table">{versions.map((version) => <div className="data-row" key={version.id}><div><strong>Version {version.version}</strong><span>{new Date(version.publishedAt).toLocaleString(currentIntlLocale())}</span></div><span>{version.sourceVersionId ? "Derived" : "Published"}</span>{canAuthor ? <button type="button" className="secondary-command" onClick={() => void rollback(version.id)} disabled={working}>เผยแพร่ข้อความ</button> : <span />}</div>)}</div></section>
        </div>
        </div>
      </> : null}
    </section>
  </main>;
}
