"use client";

import { use, useEffect, useRef, useState, type FormEvent } from "react";
import {
  emailFieldConstraints,
  currentIntlLocale,
  normalizePlatformVoiceReason,
  safeMutationFetch,
  uiCopy,
  voiceRoutingActionReasonError,
  voiceRoutingActionReasonFieldConstraints,
  voiceRuntimeReasonError,
  voiceRuntimeReasonFieldConstraints,
} from "@djay/shared";
import { PlatformNavigation, platformAreaKeys, platformNavigationForRole, type PlatformAreaKey } from "./PlatformNavigation";
import { PlatformSupportAccessPanel, PlatformSupportTicketPanel, type SupportGrant, type SupportTicketQueue, type Tenant } from "./PlatformSupportPanels";
import { VoiceIncidentResolutionForm } from "./VoiceIncidentResolutionForm";

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
    unreconciledProviderEvents: number; providerAttentionResults: number;
    openReconciliationCases: number;
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
  providerResults: Array<{
    resultId: string; tenantId: string; businessName: string; providerKey: string;
    providerMeterKey: string; nativeQuantity: number; nativeUnit: string;
    estimatedCostMinor: number | null; status: string; reconciledAt: string;
    caseId: string | null; requestedAction: string | null; caseStatus: string | null;
  }>;
};
type FinancialReconciliation = {
  status: "healthy" | "attention";
  summary: { total: number; matched: number; attention: number };
  results: Array<{
    resultId: string; tenantId: string; businessName: string;
    invoiceDocumentId: string; externalInvoiceRef: string;
    status: "matched" | "reference_mismatch" | "currency_mismatch" | "status_mismatch" | "amount_mismatch";
    differences: Record<string, unknown>; reconciledAt: string;
    caseId: string | null; requestedAction: string | null;
    reviewStatus: "approved" | "rejected" | null;
  }>;
};
type FinancialEventReconciliation = {
  status: "healthy" | "attention"; summary: { total: number; matched: number; attention: number };
  results: Array<{ resultId: string; tenantId: string; businessName: string;
    evidenceKind: "payment" | "refund" | "credit_note"; externalRef: string;
    status: "matched" | "reference_mismatch" | "currency_mismatch" | "status_mismatch" | "amount_mismatch";
    differences: Record<string, unknown>; reconciledAt: string; caseId: string | null;
    requestedAction: string | null; reviewStatus: "approved" | "rejected" | null }>;
};
type AccountingReconciliation = {
  status: "healthy" | "attention";
  summary: { total: number; matched: number; attention: number };
  results: Array<{
    resultId: string; tenantId: string; businessName: string;
    documentKind: "invoice" | "credit_note"; externalDocumentRef: string | null;
    status: "matched" | "missing_remote" | "reference_mismatch" | "currency_mismatch" | "amount_mismatch";
    differences: Record<string, unknown>; reconciledAt: string;
    caseId: string | null; requestedAction: string | null;
    reviewStatus: "approved" | "rejected" | null;
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
    kind: "on_call" | "restore" | "support_runbook" | "security_review" | "privacy_review" | "event_replay" | "queue_recovery" | "pool_exhaustion" | "dependency_outage";
    passing: boolean; status: "passed" | "failed" | "missing";
    validUntil: string | null; sourceReference: string | null;
  }>;
  incidents: { passing: boolean; blocking: number; oldestOpenedAt: string | null };
  usage: { passing: boolean; status: "healthy" | "attention"; attentionAccounts?: number; activeWithoutCurrentAccount?: number; orphanUsageEvents?: number; expiredOpenReservations?: number };
  registration: { passing: boolean; status: "available" | "unavailable"; termsVersion: string | null; privacyVersion: string | null };
};
type Subscription = {
  id: string; tenantId: string; businessName: string; productKey: string;
  planKey: string; publicName: string; status: string; createdAt: string;
};
type DunningPolicy = {
  id: string; version: number; status: "draft" | "pending_review" | "active" | "retired" | "rejected";
  gracePeriodHours: number; restrictAfterHours: number; customerNoticeOffsetsHours: number[];
  reason: string; requestedByPlatformUserId: string; reviewedByPlatformUserId: string | null;
  requestedAt: string; reviewedAt: string | null; activatedAt: string | null;
};
type WebhookRecovery = {
  jobId: string; webhookEventId: string; externalEventId: string; eventType: string;
  reasonCode: string; status: string; attemptCount: number; occurredAt: string;
  providerEvidenceCount: number; caseId: string | null; requestedAction: string | null;
  requestedByPlatformUserId: string | null;
  reviewStatus: "approved" | "rejected" | null;
};
type SharedOperationsQueue = {
  addOns: Array<{ id: string; tenantId: string; businessName: string; addOnKey: string; quantity: number; status: string; createdAt: string }>;
  services: Array<{ id: string; tenantId: string; businessName: string; serviceKind: string; productKey: string | null; status: string; createdAt: string }>;
  engagements: Array<{ id: string; tenantId: string; businessName: string; serviceRequestId: string; title: string; scopeText: string; status: string; nextActionOwner: string; targetAt: string | null; updatedAt: string }>;
};
type RecoveryItem = { recordKind: "recoverable"; recordId: string; queueKind: "system_email" | "flowbot_email" | "ai_chat_email" | "appointment_calendar"; itemId: string; attemptCount: number; safeErrorCode: string; occurredAt: string; status: "dead_letter" };
type RecoveryRequest = { recordKind: "request"; recordId: string; queueKind: RecoveryItem["queueKind"]; itemId: string; attemptCount: number; occurredAt: string; status: "requested" | "applied" | "rejected" | "invalidated"; reason: string; requestedByPlatformUserId: string; reviewedByPlatformUserId: string | null };
type RecoveryOverview = { recoverable: RecoveryItem[]; requests: RecoveryRequest[]; policy: { replayableQueueKinds: string[]; excludedQueueKinds: string[] } };
type VoiceControl = { mode: "running" | "paused" | "emergency_stop"; reasonCode: string; version: number; changedAt: string; activeSessions: number; reconnectingSessions: number; expiredGrants: number; staleConnections: number };
type VoiceIncident = { id: string; capabilityProfile: "voice_gen2"; severity: "minor" | "major" | "critical"; status: "open" | "monitoring" | "resolved"; reason: string; resolution: string | null; routingChangeId: string | null; creditReviewStatus: "not_required" | "required" | "approved" | "rejected"; openedByPlatformUserId: string; openedAt: string; resolvedAt: string | null };
type VoiceCandidate = { id: string; capabilityProfile: "voice_gen2"; providerKey: string; modelKey: string; regionKey: string; status: "proposed" | "qualified" | "rejected" | "paused"; proposedByPlatformUserId: string; reviewedByPlatformUserId: string | null; proposedAt: string; reviewedAt: string | null };
type VoiceChange = { id: string; capabilityProfile: "voice_gen2"; candidateId: string; previousCandidateId: string | null; canaryPercent: number; status: "requested" | "approved" | "rejected" | "canary" | "active" | "rolled_back"; reason: string; requestedByPlatformUserId: string; approvedByPlatformUserId: string | null; requestedAt: string; approvedAt: string | null; canaryStartedAt: string | null; activatedAt: string | null; rolledBackAt: string | null; rollbackReason: string | null };
type VoiceAdmissionChange = { id: string; capabilityProfile: "voice_gen2"; targetEnabled: boolean; status: "requested" | "approved" | "rejected" | "applied"; reason: string; requestedByPlatformUserId: string; approvedByPlatformUserId: string | null; requestedAt: string; approvedAt: string | null; appliedAt: string | null };
type VoiceRouting = { admissionEnabled: boolean; admissionChanges: VoiceAdmissionChange[]; profiles: { capabilityProfile: "voice_gen2"; mode: "paused" | "canary" | "running" | "degraded"; reasonCode: string; version: number; changedAt: string; primaryCandidateId: string | null; canaryCandidateId: string | null; canaryPercent: number }[]; candidates: VoiceCandidate[]; changes: VoiceChange[]; incidents: VoiceIncident[] };

const defaultVoiceReason = "scheduled_maintenance";
const defaultRoutingActionReason = "Reviewed Advanced Voice operational change";
const platformAreaTitles: Readonly<Record<PlatformAreaKey, string>> = {
  overview: "สุขภาพระบบแพลตฟอร์ม", release: "ความพร้อมเปิดให้บริการ", usage: "การกระทบยอดการใช้งาน",
  voice: "ปฏิบัติการระบบเสียง", incidents: "เหตุขัดข้องตามลูกค้า", recovery: "การกู้คืนคิว", commerce: "การค้าและการเรียกเก็บเงิน",
  fulfillment: "การส่งมอบบริการ", "support-tickets": "คิวคำขอความช่วยเหลือ", "support-access": "สิทธิ์ช่วยเหลือลูกค้า",
};
const platformStatusLabels: Readonly<Record<string, string>> = {
  active: "ใช้งานอยู่",
  applied: "ใช้งานแล้ว",
  attention: "ต้องตรวจสอบ",
  awaiting_customer: "รอลูกค้า",
  ai_chat: "แชต AI",
  ai_chat_email: "อีเมลแชต AI",
  cancelled: "ยกเลิกแล้ว",
  canary: "Canary",
  completed: "เสร็จสิ้น",
  critical: "วิกฤต",
  customer: "ลูกค้า",
  dead_letter: "dead letter",
  degraded: "ลดระดับบริการ",
  djai: "DJAI",
  failed: "ล้มเหลว",
  flowbot: "FlowBot",
  flowbot_email: "อีเมล FlowBot",
  "Advanced Voice routing": "การกำหนดเส้นทาง Advanced Voice",
  "Commerce overview": "ภาพรวมการค้า",
  "Platform health": "สุขภาพแพลตฟอร์ม",
  "Product subscriptions": "การสมัครใช้ผลิตภัณฑ์",
  "SaaS fulfillment": "การส่งมอบบริการ SaaS",
  "Stripe webhook recovery": "การกู้คืน Stripe webhook",
  "Subscription dunning policies": "นโยบายติดตามการชำระเงิน",
  "Support access grants": "สิทธิ์เข้าถึงเพื่อให้การสนับสนุน",
  "Tenant directory": "รายชื่อลูกค้า",
  "Voice incidents": "เหตุขัดข้องระบบเสียง",
  "Voice runtime controls": "ส่วนควบคุม runtime ระบบเสียง",
  healthy: "ปกติ",
  in_progress: "กำลังดำเนินการ",
  major: "ร้ายแรง",
  minor: "เล็กน้อย",
  monitoring: "เฝ้าติดตาม",
  not_required: "ไม่จำเป็น",
  open: "เปิดอยู่",
  paused: "หยุดชั่วคราว",
  pending: "รอดำเนินการ",
  qualified: "ผ่านการรับรอง",
  rejected: "ปฏิเสธแล้ว",
  requested: "ส่งคำขอแล้ว",
  required: "ต้องดำเนินการ",
  resolved: "แก้ไขแล้ว",
  review: "ตรวจสอบ",
  rolled_back: "ย้อนกลับแล้ว",
  running: "ทำงานอยู่",
  scheduled: "กำหนดเวลาแล้ว",
  shared: "รับผิดชอบร่วมกัน",
  system_email: "อีเมลระบบ",
  voice: "ระบบเสียง",
  platform_ai_operations: "ปฏิบัติการ AI",
  platform_finance: "การเงินแพลตฟอร์ม",
  platform_owner: "เจ้าของแพลตฟอร์ม",
  platform_support: "ทีมสนับสนุน",
};

function formatPlatformLabel(value: string): string {
  return platformStatusLabels[value] || value.replaceAll("_", " ");
}

function formatPlatformRole(role: string): string {
  return platformStatusLabels[role] || role.replaceAll("_", " ");
}

const defaultPlatformSearchParams = Promise.resolve({});

export default function PlatformMasterPage({ searchParams = defaultPlatformSearchParams }: Readonly<{ searchParams?: Promise<{ area?: string }> }>) {
  const requestedArea = use(searchParams).area;
  const area: PlatformAreaKey = platformAreaKeys.includes(requestedArea as PlatformAreaKey) ? requestedArea as PlatformAreaKey : "overview";
  const loadGeneration = useRef(0);
  const [stage, setStage] = useState<"loading" | "error" | "password" | "mfa" | "dashboard">("loading");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"error" | "success">("error");
  const [working, setWorking] = useState(false);
  const [user, setUser] = useState<PlatformUser | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [resourceErrors, setResourceErrors] = useState<string[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [commerce, setCommerce] = useState<Commerce | null>(null);
  const [reconciliation, setReconciliation] = useState<UsageReconciliation | null>(null);
  const [reconciliationStage, setReconciliationStage] = useState<"hidden" | "loading" | "ready" | "error">("hidden");
  const [financialReconciliation, setFinancialReconciliation] = useState<FinancialReconciliation | null>(null);
  const [financialEventReconciliation, setFinancialEventReconciliation] = useState<FinancialEventReconciliation | null>(null);
  const [accountingReconciliation, setAccountingReconciliation] = useState<AccountingReconciliation | null>(null);
  const [readiness, setReadiness] = useState<ReleaseReadiness | null>(null);
  const [readinessStage, setReadinessStage] = useState<"hidden" | "loading" | "ready" | "error">("hidden");
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [dunningPolicies, setDunningPolicies] = useState<DunningPolicy[]>([]);
  const [webhookRecovery, setWebhookRecovery] = useState<WebhookRecovery[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [supportGrants, setSupportGrants] = useState<SupportGrant[]>([]);
  const [supportTickets, setSupportTickets] = useState<SupportTicketQueue | null>(null);
  const [sharedOperations, setSharedOperations] = useState<SharedOperationsQueue | null>(null);
  const engagementIdempotencyKeys = useRef(new Map<string, string>());
  const [recovery, setRecovery] = useState<RecoveryOverview | null>(null);
  const [recoveryStage, setRecoveryStage] = useState<"hidden" | "loading" | "ready" | "error">("hidden");
  const [voiceControl, setVoiceControl] = useState<VoiceControl | null>(null);
  const [voiceRouting, setVoiceRouting] = useState<VoiceRouting | null>(null);
  const [voiceIncidents, setVoiceIncidents] = useState<VoiceIncident[] | null>(null);
  const [resolvingIncidentId, setResolvingIncidentId] = useState<string | null>(null);
  const [voiceReason, setVoiceReason] = useState(defaultVoiceReason);
  const [voiceReasonIssue, setVoiceReasonIssue] = useState("");
  const voiceReasonRef = useRef<HTMLInputElement>(null);
  const [routingActionReason, setRoutingActionReason] = useState(defaultRoutingActionReason);
  const [routingActionReasonIssue, setRoutingActionReasonIssue] = useState("");
  const routingActionReasonRef = useRef<HTMLInputElement>(null);
  const controlsBusy = working || dashboardLoading;

  function clearMessage() {
    setMessage("");
    setMessageTone("error");
  }

  function showMessage(text: string, tone: "error" | "success" = "error") {
    setMessageTone(tone);
    setMessage(text);
  }

  function resetVoiceActionFields() {
    setVoiceReason(defaultVoiceReason);
    setVoiceReasonIssue("");
    voiceReasonRef.current?.setCustomValidity("");
    setRoutingActionReason(defaultRoutingActionReason);
    setRoutingActionReasonIssue("");
    routingActionReasonRef.current?.setCustomValidity("");
  }

  function clearAuthorizedPlatformSnapshot() {
    setHealth(null);
    setCommerce(null);
    setReconciliation(null);
    setReconciliationStage("hidden");
    setFinancialReconciliation(null);
    setFinancialEventReconciliation(null);
    setAccountingReconciliation(null);
    setReadiness(null);
    setReadinessStage("hidden");
    setSubscriptions([]);
    setDunningPolicies([]);
    setWebhookRecovery([]);
    setTenants([]);
    setSupportGrants([]);
    setSupportTickets(null);
    setSharedOperations(null);
    setRecovery(null);
    setRecoveryStage("hidden");
    setVoiceControl(null);
    setVoiceRouting(null);
    setVoiceIncidents(null);
    setResolvingIncidentId(null);
    setResourceErrors([]);
    setDashboardLoading(false);
    resetVoiceActionFields();
  }

  async function loadCurrent() {
    const generation = ++loadGeneration.current;
    if (!user) setStage("loading");
    let result: { user: PlatformUser };
    try {
      const response = await fetch("/platform/me", { cache: "no-store" });
      if (generation !== loadGeneration.current) return;
      if ([401, 403].includes(response.status)) {
        setUser(null);
        clearAuthorizedPlatformSnapshot();
        clearMessage();
        setStage("password");
        return;
      }
      if (!response.ok) throw new Error("platform_session_unavailable");
      result = await response.json();
      if (generation !== loadGeneration.current) return;
      if (!result.user) throw new Error("platform_session_unavailable");
    } catch {
      if (generation !== loadGeneration.current) return;
      setUser(null);
      clearAuthorizedPlatformSnapshot();
      clearMessage();
      setStage("error");
      return;
    }
    const authorityChanged = Boolean(user && (user.id !== result.user.id || user.role !== result.user.role));
    if (authorityChanged) {
      clearAuthorizedPlatformSnapshot();
    }
    setUser(result.user);
    setStage("dashboard");
    setDashboardLoading(true);
    setResourceErrors([]);
    const unavailable: string[] = [];
    async function loadResource<T>(path: string, field: string, label: string): Promise<T | null> {
      try {
        const response = await fetch(path, { cache: "no-store" });
        if (!response.ok) throw new Error("resource_unavailable");
        const body = await response.json() as Record<string, unknown>;
        if (!(field in body) || body[field] === null || body[field] === undefined) throw new Error("resource_unavailable");
        return body[field] as T;
      } catch {
        unavailable.push(label);
        return null;
      }
    }
    async function loadPanel<T>(path: string, field: string): Promise<{ value: T | null; available: boolean }> {
      try {
        const response = await fetch(path, { cache: "no-store" });
        if (!response.ok) throw new Error("panel_unavailable");
        const body = await response.json() as Record<string, unknown>;
        if (!(field in body) || body[field] === null || body[field] === undefined) throw new Error("panel_unavailable");
        return { value: body[field] as T, available: true };
      } catch {
        return { value: null, available: false };
      }
    }
    const canReadUsage = area === "usage" && ["platform_owner", "platform_finance"].includes(result.user.role);
    const canReadCommerce = area === "commerce" && ["platform_owner", "platform_finance"].includes(result.user.role);
    const canReadTenants = area === "support-access" && ["platform_owner", "platform_support", "platform_finance"].includes(result.user.role);
    const canReadVoice = area === "voice" && ["platform_owner", "platform_ai_operations"].includes(result.user.role);
    const canReadRecovery = area === "recovery" && ["platform_owner", "platform_support", "platform_ai_operations"].includes(result.user.role);
    const canReadVoiceIncidents = area === "voice" && ["platform_owner", "platform_ai_operations", "platform_finance"].includes(result.user.role);
    const canReadFulfillment = area === "fulfillment" && ["platform_owner", "platform_support", "platform_finance"].includes(result.user.role);
    const canReadSupportTickets = area === "support-tickets" && ["platform_owner", "platform_support"].includes(result.user.role);
    const canReadSupportAccess = area === "support-access";
    const canReadReadiness = area === "release";
    setReadinessStage(canReadReadiness ? "loading" : "hidden");
    setReconciliationStage(canReadUsage ? "loading" : "hidden");
    setRecoveryStage(canReadRecovery ? "loading" : "hidden");
    const [
      nextHealth, readinessResult, nextCommerce, reconciliationResult, financialResult, financialEventResult, accountingResult,
      nextSubscriptions, nextDunningPolicies, nextWebhookRecovery, nextTenants, nextSupportGrants, recoveryResult,
      nextVoiceControl, nextVoiceRouting, nextVoiceIncidents, nextSharedOperations, nextSupportTickets,
    ] = await Promise.all([
      area === "overview" ? loadResource<Health>("/platform/health-summary", "health", "Platform health") : Promise.resolve(null),
      canReadReadiness ? loadPanel<ReleaseReadiness>("/platform/release-readiness", "readiness") : Promise.resolve({ value: null, available: false }),
      canReadCommerce ? loadResource<Commerce>("/platform/commerce-overview", "commerce", "Commerce overview") : Promise.resolve(null),
      canReadUsage ? loadPanel<UsageReconciliation>("/platform/usage-reconciliation", "reconciliation") : Promise.resolve({ value: null, available: false }),
      canReadUsage ? loadPanel<FinancialReconciliation>("/platform/financial-reconciliation", "financialReconciliation") : Promise.resolve({ value: null, available: false }),
      canReadUsage ? loadPanel<FinancialEventReconciliation>("/platform/financial-event-reconciliation", "financialEventReconciliation") : Promise.resolve({ value: null, available: false }),
      canReadUsage ? loadPanel<AccountingReconciliation>("/platform/accounting-reconciliation", "accountingReconciliation") : Promise.resolve({ value: null, available: false }),
      canReadCommerce ? loadResource<Subscription[]>("/platform/subscriptions", "subscriptions", "Product subscriptions") : Promise.resolve(null),
      canReadCommerce ? loadResource<DunningPolicy[]>("/platform/subscription-dunning", "policies", "Subscription dunning policies") : Promise.resolve(null),
      canReadCommerce ? loadResource<WebhookRecovery[]>("/platform/webhook-recovery", "recovery", "Stripe webhook recovery") : Promise.resolve(null),
      canReadTenants ? loadResource<Tenant[]>("/platform/tenants", "tenants", "Tenant directory") : Promise.resolve(null),
      canReadSupportAccess ? loadResource<SupportGrant[]>("/platform/support-grants", "grants", "Support access grants") : Promise.resolve(null),
      canReadRecovery ? loadPanel<RecoveryOverview>("/platform/dead-letter-recovery", "recovery") : Promise.resolve({ value: null, available: false }),
      canReadVoice ? loadResource<VoiceControl>("/platform/voice/runtime-control", "control", "Voice runtime controls") : Promise.resolve(null),
      canReadVoice ? loadResource<VoiceRouting>("/platform/voice/routing", "routing", "Advanced Voice routing") : Promise.resolve(null),
      canReadVoiceIncidents ? loadResource<VoiceIncident[]>("/platform/voice/incidents", "incidents", "Voice incidents") : Promise.resolve(null),
      canReadFulfillment ? loadResource<SharedOperationsQueue>("/platform/shared-operations", "queue", "SaaS fulfillment") : Promise.resolve(null),
      canReadSupportTickets ? loadResource<SupportTicketQueue>("/platform/support-tickets", "support", "Customer support tickets") : Promise.resolve(null),
    ]);
    if (generation !== loadGeneration.current) return;
    setHealth(nextHealth);
    setReadiness(readinessResult.value);
    setReadinessStage(canReadReadiness ? readinessResult.available ? "ready" : "error" : "hidden");
    setCommerce(nextCommerce);
    setReconciliation(reconciliationResult.value);
    setReconciliationStage(canReadUsage ? reconciliationResult.available ? "ready" : "error" : "hidden");
    setFinancialReconciliation(financialResult.value);
    setFinancialEventReconciliation(financialEventResult.value);
    setAccountingReconciliation(accountingResult.value);
    setSubscriptions(nextSubscriptions || []);
    setDunningPolicies(nextDunningPolicies || []);
    setWebhookRecovery(nextWebhookRecovery || []);
    setTenants(nextTenants || []);
    setSupportGrants(nextSupportGrants || []);
    setRecovery(recoveryResult.value);
    setRecoveryStage(canReadRecovery ? recoveryResult.available ? "ready" : "error" : "hidden");
    setVoiceControl(nextVoiceControl);
    setVoiceRouting(nextVoiceRouting);
    setVoiceIncidents(canReadVoiceIncidents ? nextVoiceIncidents || [] : null);
    setSharedOperations(canReadFulfillment ? nextSharedOperations : null);
    setSupportTickets(canReadSupportTickets ? nextSupportTickets : null);
    setResourceErrors(unavailable.sort());
    setDashboardLoading(false);
  }

  useEffect(() => { void loadCurrent(); }, []);

  async function passwordLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    clearMessage();
    const data = new FormData(event.currentTarget);
    const response = await safeMutationFetch("/platform/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
    });
    setWorking(false);
    if (!response.ok) {
      setMessage(response.status >= 500 ? "Platform sign-in is temporarily unavailable. Try again." : "Platform credentials are invalid.");
      return;
    }
    setStage("mfa");
  }

  async function verifyMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    clearMessage();
    const data = new FormData(event.currentTarget);
    const response = await safeMutationFetch("/platform/auth/mfa/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: data.get("code") }),
    });
    setWorking(false);
    if (!response.ok) {
      setMessage(response.status >= 500 ? "Identity verification is temporarily unavailable. Try again." : "The verification code is invalid or expired.");
      return;
    }
    await loadCurrent();
  }

  async function logout() {
    clearMessage();
    const response = await safeMutationFetch("/platform/auth/logout", { method: "POST" });
    if (!response.ok) { setMessage("Sign out could not be confirmed. Your current session remains open."); return; }
    loadGeneration.current += 1;
    setUser(null);
    clearAuthorizedPlatformSnapshot();
    setDashboardLoading(false);
    setStage("password");
  }

  async function activate(subscriptionId: string) {
    if (!window.confirm(uiCopy("เปิดใช้งานสมาชิกนี้สำหรับพื้นที่ทำงานนำร่องหรือไม่?", "Activate this subscription for the pilot workspace?"))) return;
    setWorking(true);
    clearMessage();
    const response = await safeMutationFetch(`/platform/subscriptions/${subscriptionId}/activate`, { method: "POST" });
    setWorking(false);
    if (!response.ok) {
      setMessage(response.status >= 500 ? "Subscription activation is temporarily unavailable. No subscription state changed." : "Subscription activation requires a recent Platform Owner sign-in.");
      return;
    }
    await loadCurrent();
  }

  async function provisionSharedAddOn(requestId: string) {
    if (!window.confirm(uiCopy("จัดสรรส่วนเสริมนี้และเพิ่มสิทธิ์ของลูกค้าตอนนี้หรือไม่?", "Provision this add-on and increase the customer entitlement now?"))) return;
    setWorking(true); clearMessage();
    const response = await safeMutationFetch("/platform/shared-operations", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "provision_add_on", requestId }),
    });
    setWorking(false);
    if (!response.ok) { showMessage(response.status === 403 ? "Recent Platform Owner authentication is required." : "The add-on was not provisioned."); return; }
    const result = await response.json() as { status: string };
    if (result.status !== "provisioned") { showMessage("This request requires a manual workspace provisioning workflow."); return; }
    showMessage("Add-on provisioned and tenant capacity updated.", "success"); await loadCurrent();
  }

  async function createServiceEngagement(event: FormEvent<HTMLFormElement>, serviceRequestId: string) {
    event.preventDefault(); setWorking(true); clearMessage();
    const form = event.currentTarget; const data = new FormData(form);
    const response = await safeMutationFetch("/platform/shared-operations", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create_engagement", serviceRequestId, title: data.get("title"),
        scope: data.get("scope"), nextActionOwner: data.get("nextActionOwner") }),
    });
    setWorking(false);
    if (!response.ok) { showMessage(response.status === 403 ? "Recent platform authentication is required." : "The service engagement was not created."); return; }
    showMessage("Service request accepted into the fulfillment workflow.", "success"); await loadCurrent();
  }

  async function updateServiceEngagement(event: FormEvent<HTMLFormElement>, engagementId: string) {
    event.preventDefault(); setWorking(true); clearMessage();
    const form = event.currentTarget; const data = new FormData(form);
    const idempotencyKey = engagementIdempotencyKeys.current.get(engagementId) ?? crypto.randomUUID();
    engagementIdempotencyKeys.current.set(engagementId, idempotencyKey);
    const response = await safeMutationFetch("/platform/shared-operations", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_engagement", engagementId, status: data.get("status"),
        nextActionOwner: data.get("nextActionOwner"), body: data.get("body"), idempotencyKey }),
    });
    setWorking(false);
    if (!response.ok) { showMessage(response.status === 403 ? "Recent platform authentication is required." : "The engagement update was not applied."); return; }
    engagementIdempotencyKeys.current.delete(engagementId); form.reset();
    showMessage("Engagement status and delivery update saved.", "success"); await loadCurrent();
  }

  async function requestUsageReconciliation(event: FormEvent<HTMLFormElement>, result: UsageReconciliation["providerResults"][number]) {
    event.preventDefault(); setWorking(true); clearMessage();
    const form = event.currentTarget; const data = new FormData(form);
    const response = await safeMutationFetch("/platform/usage-reconciliation", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "request", tenantId: result.tenantId,
        resultId: result.resultId, action: data.get("action"), reason: data.get("reason") }),
    });
    setWorking(false);
    if (!response.ok) { showMessage(response.status === 403 ? "Recent authentication is required." : "Reconciliation case was not created."); return; }
    showMessage("Reconciliation case requested for independent review.", "success"); await loadCurrent();
  }

  async function reviewUsageReconciliation(caseId: string, approve: boolean) {
    setWorking(true); clearMessage();
    const response = await safeMutationFetch("/platform/usage-reconciliation", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "review", caseId, approve,
        note: approve ? "Independent review approved for documented follow-up" : "Independent review rejected the requested remediation" }),
    });
    setWorking(false);
    if (!response.ok) { showMessage(response.status === 403 ? "Recent authentication is required." : "A different billing reviewer is required."); return; }
    showMessage(`Reconciliation case ${approve ? "approved" : "rejected"}.`, "success"); await loadCurrent();
  }

  async function requestFinancialReconciliation(event: FormEvent<HTMLFormElement>, resultId: string) {
    event.preventDefault(); setWorking(true); clearMessage();
    const data = new FormData(event.currentTarget);
    const response = await safeMutationFetch("/platform/financial-reconciliation", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "request", resultId,
        action: data.get("action"), reason: data.get("reason") }),
    });
    setWorking(false);
    if (!response.ok) { showMessage(response.status === 403 ? "Recent authentication is required." : "Financial reconciliation case was not created."); return; }
    showMessage("Financial reconciliation case requested for independent review.", "success"); await loadCurrent();
  }

  async function reviewFinancialReconciliation(caseId: string, approve: boolean) {
    setWorking(true); clearMessage();
    const response = await safeMutationFetch("/platform/financial-reconciliation", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "review", caseId, approve,
        note: approve ? "Independent finance review approved" : "Independent finance review rejected" }),
    });
    setWorking(false);
    if (!response.ok) { showMessage(response.status === 403 ? "Recent authentication is required." : "A different finance reviewer is required."); return; }
    showMessage(`Financial reconciliation ${approve ? "approved" : "rejected"}.`, "success"); await loadCurrent();
  }

  async function requestFinancialEventReconciliation(event: FormEvent<HTMLFormElement>, resultId: string) {
    event.preventDefault(); setWorking(true); clearMessage(); const data = new FormData(event.currentTarget);
    const response = await safeMutationFetch("/platform/financial-event-reconciliation", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        operation: "request", resultId, action: data.get("action"), reason: data.get("reason"),
      }),
    });
    setWorking(false);
    if (!response.ok) { showMessage(response.status === 403 ? "Recent authentication is required." : "Financial event case was not created."); return; }
    showMessage("Financial event case requested for independent review.", "success"); await loadCurrent();
  }

  async function reviewFinancialEventReconciliation(caseId: string, approve: boolean) {
    setWorking(true); clearMessage();
    const response = await safeMutationFetch("/platform/financial-event-reconciliation", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        operation: "review", caseId, approve,
        note: approve ? "Independent financial-event review approved" : "Independent financial-event review rejected",
      }),
    });
    setWorking(false);
    if (!response.ok) { showMessage(response.status === 403 ? "Recent authentication is required." : "A different finance reviewer is required."); return; }
    showMessage(`Financial event reconciliation ${approve ? "approved" : "rejected"}.`, "success"); await loadCurrent();
  }

  async function requestAccountingReconciliation(event: FormEvent<HTMLFormElement>, resultId: string) {
    event.preventDefault(); setWorking(true); clearMessage();
    const data = new FormData(event.currentTarget);
    const response = await safeMutationFetch("/platform/accounting-reconciliation", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "request", resultId,
        action: data.get("action"), reason: data.get("reason") }),
    });
    setWorking(false);
    if (!response.ok) { showMessage(response.status === 403 ? "Recent authentication is required." : "Accounting reconciliation case was not created."); return; }
    showMessage("Accounting reconciliation case requested for independent review.", "success"); await loadCurrent();
  }

  async function reviewAccountingReconciliation(caseId: string, approve: boolean) {
    setWorking(true); clearMessage();
    const response = await safeMutationFetch("/platform/accounting-reconciliation", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "review", caseId, approve,
        note: approve ? "Independent accounting review approved" : "Independent accounting review rejected" }),
    });
    setWorking(false);
    if (!response.ok) { showMessage(response.status === 403 ? "Recent authentication is required." : "A different finance reviewer is required."); return; }
    showMessage(`Accounting reconciliation ${approve ? "approved" : "rejected"}.`, "success"); await loadCurrent();
  }

  async function requestDunningPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setWorking(true); clearMessage();
    const form = event.currentTarget; const data = new FormData(form);
    const noticeOffsets = String(data.get("noticeOffsets") || "").split(",")
      .map((value) => value.trim()).filter(Boolean).map(Number);
    const response = await safeMutationFetch("/platform/subscription-dunning", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "request",
        gracePeriodHours: Number(data.get("gracePeriodHours")),
        restrictAfterHours: Number(data.get("restrictAfterHours")),
        customerNoticeOffsetsHours: noticeOffsets, reason: data.get("reason") }),
    });
    setWorking(false);
    if (!response.ok) { showMessage(response.status === 403 ? "Recent Platform Owner authentication is required." : "Dunning policy request was rejected."); return; }
    showMessage("Dunning policy submitted for independent approval.", "success");
    form.reset(); await loadCurrent();
  }

  async function reviewDunningPolicy(policyId: string, approve: boolean) {
    if (!window.confirm(approve
      ? uiCopy("เปิดใช้งานนโยบายติดตามชำระเงินของสมาชิกนี้หรือไม่?", "Activate this subscription dunning policy?")
      : uiCopy("ปฏิเสธนโยบายติดตามชำระเงินของสมาชิกนี้หรือไม่?", "Reject this subscription dunning policy?"))) return;
    setWorking(true); clearMessage();
    const response = await safeMutationFetch("/platform/subscription-dunning", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "review", policyId, approve,
        note: approve ? "Independent Platform Owner review approved activation"
          : "Independent Platform Owner review rejected activation" }),
    });
    setWorking(false);
    if (!response.ok) { showMessage(response.status === 403 ? "Recent Platform Owner authentication is required." : "A different Platform Owner must review this policy."); return; }
    showMessage(`Dunning policy ${approve ? "activated" : "rejected"}.`, "success"); await loadCurrent();
  }

  async function requestWebhookRecovery(event: FormEvent<HTMLFormElement>, jobId: string) {
    event.preventDefault(); setWorking(true); clearMessage(); const data = new FormData(event.currentTarget);
    const response = await safeMutationFetch("/platform/webhook-recovery", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "request", jobId,
        action: data.get("action"), reason: data.get("reason") }),
    });
    setWorking(false);
    if (!response.ok) { showMessage(response.status === 403 ? "Recent Platform Owner authentication is required." : "Webhook recovery request was rejected."); return; }
    showMessage("Webhook recovery submitted for independent review.", "success"); await loadCurrent();
  }

  async function reviewWebhookRecovery(caseId: string, approve: boolean) {
    if (!window.confirm(approve
      ? uiCopy("อนุมัติการกู้คืน Stripe webhook นี้หรือไม่?", "Approve this Stripe webhook recovery action?")
      : uiCopy("ปฏิเสธการกู้คืน Stripe webhook นี้หรือไม่?", "Reject this Stripe webhook recovery action?"))) return;
    setWorking(true); clearMessage();
    const response = await safeMutationFetch("/platform/webhook-recovery", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "review", caseId, approve,
        note: approve ? "Independent webhook recovery review approved"
          : "Independent webhook recovery review rejected" }),
    });
    setWorking(false);
    if (!response.ok) { showMessage(response.status === 403 ? "Recent Platform Owner authentication is required." : "A different Platform Owner must review this recovery."); return; }
    showMessage(`Webhook recovery ${approve ? "approved" : "rejected"}.`, "success"); await loadCurrent();
  }

  async function requestSupport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setWorking(true); clearMessage(); const form = event.currentTarget; const data = new FormData(form);
    const response = await safeMutationFetch("/platform/support-grants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId: data.get("tenantId"), reason: data.get("reason"), durationMinutes: Number(data.get("durationMinutes")) }) });
    setWorking(false); if (!response.ok) { setMessage("Support access request could not be created."); return; }
    form.reset(); await loadCurrent();
  }

  async function decideSupport(grantId: string, command: "approve" | "revoke") {
    setWorking(true); clearMessage(); const response = await safeMutationFetch(`/platform/support-grants/${grantId}/${command}`, { method: "POST" }); setWorking(false);
    if (!response.ok) { setMessage(response.status >= 500 ? "Support access controls are temporarily unavailable. No grant state changed." : command === "approve" ? "Approval requires another platform user and recent authentication." : "Grant could not be revoked."); return; }
    await loadCurrent();
  }

  async function respondToSupportTicket(event: FormEvent<HTMLFormElement>, ticketId: string) {
    event.preventDefault(); setWorking(true); clearMessage();
    const form = event.currentTarget; const data = new FormData(form);
    const response = await safeMutationFetch("/platform/support-tickets", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticketId, body: String(data.get("body") || "").trim(), status: data.get("status"),
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    setWorking(false);
    if (!response.ok) {
      showMessage(response.status >= 500 ? "ระบบคำขอช่วยเหลือไม่พร้อมชั่วคราว ไม่มีคำตอบหรือสถานะใดถูกเปลี่ยน" : "ส่งคำตอบไม่ได้ คำขออาจถูกปิดหรือเปลี่ยนโดยเจ้าหน้าที่คนอื่นแล้ว");
      return;
    }
    form.reset(); showMessage("ส่งคำตอบและอัปเดตสถานะแล้ว", "success"); await loadCurrent();
  }

  async function downloadSupportAttachment(attachmentId: string) {
    const response = await fetch(`/platform/support-tickets/attachments/${attachmentId}/download`, { cache: "no-store" }).catch(() => null);
    const result = await response?.json().catch(() => null) as { downloadUrl?: string } | null;
    if (response?.ok && result?.downloadUrl) window.location.assign(result.downloadUrl);
    else showMessage("ดาวน์โหลดไม่ได้ ไฟล์อาจยังตรวจไม่เสร็จหรือถูกบล็อกแล้ว");
  }

  async function requestRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setWorking(true); clearMessage();
    const form = event.currentTarget; const data = new FormData(form);
    const [queueKind, itemId, attemptCount] = String(data.get("recoveryTarget") || "").split("|");
    const response = await safeMutationFetch("/platform/dead-letter-recovery", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        queueKind, itemId, attemptCount: Number(attemptCount), reason: data.get("reason"),
      }),
    });
    setWorking(false);
    if (!response.ok) { setMessage(response.status >= 500 ? "Recovery controls are temporarily unavailable. No replay was requested." : "Recovery request is stale, duplicated, or no longer safe to replay."); return; }
    form.reset(); await loadCurrent();
  }

  async function reviewRecovery(requestId: string, decision: "approve" | "reject") {
    if (decision === "approve" && !window.confirm(uiCopy("อนุมัติการส่งอีเมลซ้ำหนึ่งครั้งหรือไม่? การกระทำนี้ถูกบันทึกตรวจสอบและย้อนกลับไม่ได้", "Approve one idempotent email delivery attempt? This action is audited and cannot be undone."))) return;
    setWorking(true); clearMessage();
    const response = await safeMutationFetch(`/platform/dead-letter-recovery/${requestId}/review`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }),
    });
    setWorking(false);
    if (!response.ok) {
      setMessage(response.status >= 500
        ? "Recovery controls are temporarily unavailable. No review was recorded."
        : response.status === 403
        ? "Recovery approval requires recent authentication. Sign out and verify again."
        : "Recovery review requires a different Platform Owner and an unchanged dead letter.");
      return;
    }
    await loadCurrent();
  }

  async function changeVoiceMode(mode: VoiceControl["mode"]) {
    clearMessage();
    const issue = voiceRuntimeReasonError(voiceReason);
    if (issue) {
      setVoiceReasonIssue(issue);
      voiceReasonRef.current?.setCustomValidity(issue);
      voiceReasonRef.current?.reportValidity();
      voiceReasonRef.current?.focus();
      return;
    }
    setVoiceReasonIssue("");
    voiceReasonRef.current?.setCustomValidity("");
    const reasonCode = normalizePlatformVoiceReason(voiceReason);
    const warning = mode === "emergency_stop"
      ? uiCopy("หยุดฉุกเฉินจะจบเซสชัน Voice ที่ใช้งานอยู่ทั้งหมดและป้องกันเซสชันใหม่ ดำเนินการต่อหรือไม่?", "Emergency stop ends every active Voice session and prevents new sessions. Continue?")
      : mode === "running"
        ? uiCopy("กลับมาเปิดรับเซสชัน Voice ใหม่หรือไม่? โปรดยืนยันความพร้อมของการติดตั้งก่อน", "Resume new Voice sessions? Confirm deployment readiness first.")
        : uiCopy("หยุดรับเซสชัน Voice ใหม่ชั่วคราวหรือไม่? เซสชันที่ใช้งานอยู่จะดำเนินต่อ", "Pause admission of new Voice sessions? Active sessions will continue.");
    if (!window.confirm(warning)) return;
    setWorking(true);
    const response = await safeMutationFetch("/platform/voice/runtime-control", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, reasonCode }),
    });
    setWorking(false);
    if (!response.ok) {
      setMessage(response.status === 403
        ? "Voice controls require recent authentication. Sign out and verify again."
        : "Voice runtime control could not be changed.");
      return;
    }
    showMessage("Voice runtime control updated.", "success");
    await loadCurrent();
  }

  async function sendVoiceRoutingCommand(command: Record<string, unknown>, successMessage: string) {
    setWorking(true); clearMessage();
    const response = await safeMutationFetch("/platform/voice/routing", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command),
    });
    setWorking(false);
    if (!response.ok) {
      setMessage(response.status >= 500
        ? "Advanced Voice controls are temporarily unavailable. No routing state changed."
        : response.status === 403
        ? "Advanced Voice changes require recent authentication. Sign out and verify again."
        : "Advanced Voice command was rejected. Check review separation, evidence, and current route state.");
      return false;
    }
    showMessage(successMessage, "success");
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
    if (!window.confirm(decision === "approve"
      ? uiCopy("อนุมัติการเปลี่ยนเส้นทาง Advanced Voice นี้หรือไม่?", "Approve this Advanced Voice routing change?")
      : uiCopy("ปฏิเสธการเปลี่ยนเส้นทาง Advanced Voice นี้หรือไม่?", "Reject this Advanced Voice routing change?"))) return;
    await sendVoiceRoutingCommand({ command: "change.review", changeId, decision }, `Routing change ${decision}d.`);
  }

  async function applyVoiceChange(changeId: string, action: "start_canary" | "promote" | "rollback") {
    clearMessage();
    const issue = voiceRoutingActionReasonError(routingActionReason);
    if (issue) {
      setRoutingActionReasonIssue(issue);
      routingActionReasonRef.current?.setCustomValidity(issue);
      routingActionReasonRef.current?.reportValidity();
      routingActionReasonRef.current?.focus();
      return;
    }
    setRoutingActionReasonIssue("");
    routingActionReasonRef.current?.setCustomValidity("");
    const reason = normalizePlatformVoiceReason(routingActionReason);
    if (!window.confirm(uiCopy(`ดำเนินการ ${action.replaceAll("_", " ")} กับการเปลี่ยนแปลง Advanced Voice ที่ตรวจสอบแล้วหรือไม่?`, `${action.replaceAll("_", " ")} this reviewed Advanced Voice change?`))) return;
    await sendVoiceRoutingCommand({ command: "change.apply", changeId, action, reason }, `Routing action ${action.replaceAll("_", " ")} completed.`);
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
    if (!window.confirm(decision === "approve"
      ? uiCopy("อนุมัติการเปลี่ยนการรับงาน Advanced Voice นี้หรือไม่?", "Approve this Advanced Voice admission change?")
      : uiCopy("ปฏิเสธการเปลี่ยนการรับงาน Advanced Voice นี้หรือไม่?", "Reject this Advanced Voice admission change?"))) return;
    await sendVoiceRoutingCommand({ command: "admission.review", changeId, decision }, `Admission change ${decision}d.`);
  }

  async function applyVoiceAdmission(changeId: string, enabled: boolean) {
    if (!window.confirm(enabled
      ? uiCopy("เปิดรับงาน Advanced Voice ในโปรดักชันตอนนี้หรือไม่?", "Enable Advanced Voice production admission now?")
      : uiCopy("ปิดรับงาน Advanced Voice ในโปรดักชันตอนนี้หรือไม่?", "Disable Advanced Voice production admission now?"))) return;
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
    if (!window.confirm(decision === "approve"
      ? uiCopy("อนุมัติคำแนะนำจากการตรวจเครดิตหรือไม่?", "Approve the credit review recommendation?")
      : uiCopy("ปฏิเสธคำแนะนำจากการตรวจเครดิตหรือไม่?", "Reject the credit review recommendation?"))) return;
    await sendVoiceRoutingCommand({ command: "incident.credit_review", incidentId, decision }, `Credit review ${decision}d.`);
  }

  async function resolveVoiceIncident(incidentId: string, resolution: string) {
    const succeeded = await sendVoiceRoutingCommand({ command: "incident.resolve", incidentId, resolution }, "Incident resolved; routing remains explicit and fail-closed.");
    if (succeeded) setResolvingIncidentId(null);
    return succeeded;
  }

  if (stage === "loading") return <main className="platform-loading">กำลังตรวจสอบเซสชันแพลตฟอร์ม…</main>;
  if (stage === "error") return <main><div className="topline" /><header><span className="mark">D</span><strong>DJAY BOT</strong><span>การดำเนินงานแพลตฟอร์ม</span></header><section className="platform-session-error" aria-labelledby="platform-session-error-title" role="alert"><p>ไม่พร้อมใช้งานชั่วคราว</p><h1 id="platform-session-error-title">โหลดข้อมูลการดำเนินงานแพลตฟอร์มไม่สำเร็จ</h1><span>สิทธิ์และข้อมูลการดำเนินงานของคุณไม่เปลี่ยนแปลง โปรดตรวจการเชื่อมต่อบริการภายในแล้วลองใหม่</span><button type="button" onClick={() => void loadCurrent()}>ลองใหม่</button></section></main>;
  if (stage === "dashboard" && user) {
    if (!platformNavigationForRole(user.role).some((item) => item.key === area)) {
      return <main className="platform-shell"><aside><div className="platform-brand"><span className="mark">D</span><strong>DJAY BOT</strong></div><p>ระบบจัดการแพลตฟอร์ม</p><PlatformNavigation role={user.role} activeArea={area} /><button className="quiet-button" type="button" onClick={() => void logout()}>ออกจากระบบ</button></aside><section className="platform-content"><header><div><p>การดำเนินงานภายใน</p><h1>{platformAreaTitles[area]}</h1></div><span><span data-no-localize>{user.displayName}</span><small>{formatPlatformRole(user.role)}</small></span></header><div className="platform-resource-status error" role="alert"><div><strong>บทบาทนี้ไม่มีสิทธิ์เปิดพื้นที่ปฏิบัติการนี้</strong><span>ไม่มีข้อมูลถูกโหลดหรือเปลี่ยนแปลง เลือกพื้นที่ที่ปรากฏในเมนูของคุณ</span></div></div></section></main>;
    }
    return (
      <main className="platform-shell">
        <aside>
          <div className="platform-brand"><span className="mark">D</span><strong>DJAY BOT</strong></div>
          <p>ระบบจัดการแพลตฟอร์ม</p>
          <PlatformNavigation role={user.role} activeArea={area} />
          <button className="quiet-button" type="button" onClick={() => void logout()}>ออกจากระบบ</button>
        </aside>
        <section className="platform-content">
          <header><div><p>การดำเนินงานภายใน</p><h1>{platformAreaTitles[area]}</h1></div><span><span data-no-localize>{user.displayName}</span><small>{formatPlatformRole(user.role)}</small></span></header>
          {message ? <div className={`platform-message dashboard-message ${messageTone}`} role={messageTone === "error" ? "alert" : "status"}>{message}</div> : null}
          {dashboardLoading ? <div className="platform-resource-status loading" aria-live="polite" aria-busy="true"><strong>กำลังรีเฟรชข้อมูลการดำเนินงานที่ได้รับอนุญาต…</strong><span>ส่วนควบคุมจะยังใช้ไม่ได้จนกว่าทรัพยากรที่ร้องขอทั้งหมดจะตอบกลับ</span></div> : null}
          {resourceErrors.length ? <div className="platform-resource-status error" role="alert"><div><strong>โหลดข้อมูลการดำเนินงานบางส่วนไม่สำเร็จ</strong><span>ไม่มีสถานะการดำเนินงานใดถูกเปลี่ยน ส่วนที่ไม่พร้อมใช้งาน: {resourceErrors.map(formatPlatformLabel).join(", ")}</span></div><button type="button" disabled={dashboardLoading} onClick={() => void loadCurrent()}>ลองใหม่</button></div> : null}
          {area === "overview" ? <><div className="metrics-band" id="overview">
            <div><span>ผู้ใช้แพลตฟอร์ม</span><strong>{health?.platformUsers ?? "-"}</strong></div>
            <div><span>เซสชันที่ใช้งานอยู่</span><strong>{health?.activeSessions ?? "-"}</strong></div>
            <div><span>สถานะ MFA</span><strong>ยืนยันแล้ว</strong></div>
            {commerce ? <><div><span>ลูกค้าธุรกิจ SME</span><strong>{commerce.tenants}</strong></div>
            <div><span>การสมัครใช้บริการ</span><strong>{commerce.subscriptions}</strong></div>
            <div><span>รอเปิดใช้งาน</span><strong>{commerce.pending}</strong></div></> : null}
          </div>
          <div className="operations-band"><p>หลักฐานจากระบบ</p><h2>ตรวจสอบข้อมูลตัวตน การเปิดใช้ และการดำเนินงานตามสิทธิ์ของบทบาท</h2></div></> : null}
          {readinessStage === "loading" && !readiness ? <div className="subscription-band release-readiness-band readiness-placeholder" id="release-operations" aria-live="polite"><div><p>การดำเนินงานเพื่อเปิดใช้</p><h2>กำลังตรวจสอบความพร้อมเปิดใช้…</h2></div><p className="operational-note">กำลังโหลดหลักฐาน SLO เหตุขัดข้อง เวรรับผิดชอบ การกู้ระบบ การเล่นซ้ำ คิว พูล ความปลอดภัย ความเป็นส่วนตัว การสนับสนุน และการใช้งาน</p></div> : null}
          {readinessStage === "error" ? <div className="subscription-band release-readiness-band status-blocked readiness-placeholder" id="release-operations" role="alert"><div><p>การดำเนินงานเพื่อเปิดใช้</p><h2>โหลดหลักฐานความพร้อมเปิดใช้ไม่ได้</h2></div><p className="operational-note">เกณฑ์อนุมัติการเปิดใช้ยังไม่ผ่าน ห้ามเลื่อนบริการขึ้นระบบจริงขณะที่ตรวจสอบหลักฐานปัจจุบันไม่ได้</p><button type="button" disabled={controlsBusy} onClick={() => void loadCurrent()}>ตรวจสอบความพร้อมอีกครั้ง</button></div> : null}
          {readiness ? <div className={`subscription-band release-readiness-band status-${readiness.status}`} id="release-operations">
            <div className="readiness-heading"><div><p>การดำเนินงานเพื่อเปิดใช้</p><h2>ความพร้อมเปิดให้บริการสาธารณะ</h2></div><span className="readiness-status" role="status">{readiness.status === "ready" ? "พร้อมเปิดใช้หลังผ่านการตรวจ" : "ยังเปิดใช้ไม่ได้"}</span></div>
            <p className="operational-note">ระบบจะยังไม่อนุญาตให้เปิดใช้ จนกว่าเป้าหมายบริการทั้ง 7 ข้อ หลักฐานรับรองการปฏิบัติงานแบบมีอายุทั้ง 9 รายการ การทบทวนเหตุขัดข้อง การกระทบยอดการใช้งาน และสิทธิ์ลงทะเบียนระบบจริงจะผ่านพร้อมกัน</p>
            <div className="readiness-summary">
              <div><span>สภาพแวดล้อม</span><strong>{readiness.environment}</strong><small>{readiness.releaseVersion}</small></div>
              <div><span>เป้าหมายระดับบริการ</span><strong>{readiness.services.filter((service) => service.passing).length}/{readiness.services.length}</strong><small>ผ่าน</small></div>
              <div><span>หลักฐานรับรอง</span><strong>{readiness.attestations.filter((item) => item.passing).length}/{readiness.attestations.length}</strong><small>ปัจจุบัน</small></div>
              <div><span>เหตุขัดข้องที่ขัดขวางการเปิดใช้</span><strong>{readiness.incidents.blocking}</strong><small>ระดับร้ายแรงหรือวิกฤต</small></div>
              <div><span>บัญชีรายการการใช้งาน</span><strong>{readiness.usage.passing ? "ปกติ" : "ต้องตรวจสอบ"}</strong><small>{formatPlatformLabel(readiness.usage.status)}</small></div>
              <div><span>สิทธิ์อนุมัติการลงทะเบียน (Registration authority)</span><strong>{readiness.registration.passing ? "พร้อมใช้งาน" : "ถูกระงับ"}</strong><small>{readiness.registration.passing ? `${readiness.registration.termsVersion} · ${readiness.registration.privacyVersion}` : "ต้องมีชุดเอกสารที่อนุมัติแล้ว (Approved bundle required)"}</small></div>
            </div>
            <div className="readiness-service-grid">
              {readiness.services.map((service) => <article className={`readiness-service-card ${service.status}`} key={service.serviceKey}>
                <div><span className="readiness-dot" aria-hidden="true" /><strong>{service.publicLabel}</strong></div><span>{formatPlatformLabel(service.status)}</span>
                {service.observation ? <small>{(service.observation.availabilityBasisPoints / 100).toFixed(2)}% availability · {service.observation.latencyP95Ms}ms P95</small> : <small>ต้องมีหลักฐานย้อนหลัง 24 ชั่วโมง</small>}
                {!service.passing ? <em>{service.issues.join(" · ")}</em> : null}
              </article>)}
            </div>
            <div className="readiness-attestations" aria-label="หลักฐานรับรองการปฏิบัติงาน">
              {readiness.attestations.map((item) => <div className={item.passing ? "passing" : "blocked"} key={item.kind}><strong>{formatPlatformLabel(item.kind)}</strong><span>{item.passing ? "เป็นปัจจุบัน" : formatPlatformLabel(item.status)}</span><small>{item.validUntil ? `ใช้ได้ถึง ${new Date(item.validUntil).toLocaleString(currentIntlLocale())}` : "ต้องมีหลักฐาน"}</small></div>)}
            </div>
            <div className="readiness-authority"><strong>{formatPlatformRole(user.role)}</strong><span>{user.role === "platform_owner" ? "อนุมัติ deployment ผ่าน workflow เปิดใช้ที่ผ่านการตรวจแล้วเท่านั้น หลัง gate นี้พร้อม"
              : user.role === "platform_support" ? "รักษาหลักฐานเวรรับผิดชอบและ runbook สนับสนุนให้เป็นปัจจุบัน และยกระดับเหตุขัดข้องที่ขวางการเปิดใช้ทุกกรณี"
                : user.role === "platform_ai_operations" ? "แก้เป้าหมาย runtime ที่ล้มเหลวโดยไม่เปิดเผย routing ภายในให้พื้นผิวลูกค้าเห็น"
                  : "gate ทางเทคนิคนี้ไม่ให้อำนาจด้านราคา ใบแจ้งหนี้ ภาษี หรือการเก็บเงิน"}</span><small>ตรวจเมื่อ {new Date(readiness.asOf).toLocaleString(currentIntlLocale())}</small></div>
          </div> : null}
          {reconciliationStage === "loading" && !reconciliation ? <div className="subscription-band reconciliation-band reconciliation-placeholder" id="usage-reconciliation" aria-live="polite">
            <div><p>การดำเนินงานด้านการเรียกเก็บเงิน · จำกัดสิทธิ์</p><h2>กำลังตรวจสอบการกระทบยอดการใช้งาน…</h2></div>
            <p className="operational-note">กำลังเปรียบเทียบยอดหน่วยใช้งานของลูกค้ากับการจองและหลักฐานเหตุการณ์ที่แก้ไขไม่ได้</p>
          </div> : null}
          {reconciliationStage === "error" ? <div className="subscription-band reconciliation-band status-attention reconciliation-placeholder" id="usage-reconciliation" role="alert">
            <div><p>การดำเนินงานด้านการเรียกเก็บเงิน · จำกัดสิทธิ์</p><h2>ข้อมูลกระทบยอดการใช้งานไม่พร้อม</h2></div>
            <p className="operational-note">ไม่มีการเปลี่ยนยอดคงเหลือหรือสถานะเรียกเก็บเงิน ให้ถือว่าเกณฑ์นี้ยังไม่ผ่านการกระทบยอดจนกว่าจะโหลดหลักฐานได้</p>
            <button type="button" disabled={controlsBusy} onClick={() => void loadCurrent()}>กระทบยอดอีกครั้ง</button>
          </div> : null}
          {reconciliation ? <div className={`subscription-band reconciliation-band status-${reconciliation.status}`} id="usage-reconciliation">
            <div className="reconciliation-heading">
              <div><p>การดำเนินงานด้านการเรียกเก็บเงิน · จำกัดสิทธิ์</p><h2>การกระทบยอดการใช้งาน</h2></div>
              <span className="reconciliation-status" role="status">{reconciliation.status === "healthy" ? "Reconciled" : "Attention required"}</span>
            </div>
            <p className="operational-note">ระบบตรวจยอดหน่วยใช้งานของลูกค้ากับรายการจองที่ยังเปิดและเหตุการณ์ชำระบัญชีที่แก้ไขไม่ได้ ข้อมูลนี้เป็นหลักฐานการดำเนินงานเท่านั้น ไม่ได้เปิดการเรียกเก็บเงินหรือให้อำนาจออกใบแจ้งหนี้</p>
            <div className="reconciliation-summary">
              <div><span>บัญชีที่ตรวจสอบ</span><strong>{reconciliation.summary.quotaAccounts}</strong><small>{reconciliation.summary.healthyAccounts} reconciled</small></div>
              <div><span>ต้องตรวจสอบ</span><strong>{reconciliation.summary.attentionAccounts}</strong><small>ยอดหรือเหตุการณ์ไม่ตรงกัน</small></div>
              <div><span>ไม่พบบัญชีรอบปัจจุบัน</span><strong>{reconciliation.summary.activeWithoutCurrentAccount}</strong><small>การสมัครใช้บริการที่ใช้งานอยู่</small></div>
              <div><span>เหตุการณ์ที่ยังไม่จับคู่</span><strong>{reconciliation.summary.orphanUsageEvents}</strong><small>ต้องจับคู่รอบบัญชี</small></div>
              <div><span>การจองที่หมดอายุ</span><strong>{reconciliation.summary.expiredOpenReservations}</strong><small>รายการรอบก่อนที่ยังเปิดอยู่</small></div>
              <div><span>ต้องตรวจสอบข้อมูลผู้ให้บริการ</span><strong>{reconciliation.summary.providerAttentionResults + reconciliation.summary.unreconciledProviderEvents}</strong><small>{reconciliation.summary.openReconciliationCases} open cases</small></div>
            </div>
            <div className="reconciliation-authority">
              <strong>{user.role === "platform_finance" ? "Finance review" : "Platform Owner review"}</strong>
              <span>{user.role === "platform_finance"
                ? "Read-only evidence. Escalate a variance; never repair immutable usage or quota totals with direct SQL."
                : "Pause rollout expansion when a variance appears and use the documented idempotent recovery workflow."}</span>
              <small>As of {new Date(reconciliation.asOf).toLocaleString(currentIntlLocale())}</small>
            </div>
            <div className="platform-table reconciliation-table" role="list" aria-label="บัญชีสำหรับกระทบยอดการใช้งาน">
              {reconciliation.accounts.map((account) => <div className={`platform-row reconciliation-row ${account.status}`} role="listitem" key={account.quotaAccountId}>
                <div><strong data-no-localize>{account.businessName}</strong><span><span data-no-localize>{account.publicName}</span> · {account.customerUnit.replaceAll("_", " ")}</span></div>
                <div><strong>{account.accountSettled}</strong><span>settled · {account.accountReserved} reserved</span></div>
                <div><strong>{account.status === "healthy" ? "Reconciled" : "Review"}</strong><span>{account.status === "healthy" ? "No variance" : `Settled ${account.settledVariance} · reserved ${account.reservedVariance} · event ${account.eventVariance}`}</span></div>
                <span>{new Date(account.periodStart).toLocaleDateString(currentIntlLocale())} – {new Date(account.periodEnd).toLocaleDateString(currentIntlLocale())}</span>
              </div>)}
              {!reconciliation.accounts.length ? <p className="empty-row" role="listitem">ไม่มีบัญชีโควตาที่ต้องกระทบยอด</p> : null}
            </div>
            {reconciliation.summary.quotaAccounts > reconciliation.summary.displayedAccounts ? <small className="reconciliation-limit">แสดง {reconciliation.summary.displayedAccounts} บัญชีที่มีลำดับความสำคัญสูงสุด การตรวจแบบรวมครอบคลุมทั้งหมด {reconciliation.summary.quotaAccounts} บัญชี</small> : null}
            <div className="platform-table reconciliation-table provider-reconciliation-table" role="list" aria-label="รายการกระทบยอดการใช้งานจากผู้ให้บริการที่ต้องตรวจสอบ">
              {reconciliation.providerResults.map((result) => <div className="platform-row provider-reconciliation-row attention" role="listitem" key={result.resultId}>
                <div><strong data-no-localize>{result.businessName}</strong><span>{result.providerKey} · {result.providerMeterKey}</span></div>
                <div><strong>{result.nativeQuantity} {result.nativeUnit}</strong><span>{result.status.replaceAll("_", " ")}</span></div>
                {result.caseId ? <div><strong>{result.requestedAction?.replaceAll("_", " ")}</strong><span>{result.caseStatus?.replaceAll("_", " ")}</span></div> : <form onSubmit={(event) => void requestUsageReconciliation(event, result)}>
                  <select name="action" defaultValue="investigate"><option value="investigate">ตรวจสอบ</option><option value="correct_correlation">แก้ไขการจับคู่</option><option value="request_provider_credit">ขอเครดิตจากผู้ให้บริการ</option><option value="accept_provider_only">ยอมรับเหตุการณ์ที่มีเฉพาะฝั่งผู้ให้บริการ</option></select>
                  <input name="reason" minLength={8} maxLength={1000} defaultValue="Investigate missing customer usage correlation" required />
                  <button type="submit" disabled={controlsBusy}>ส่งให้ตรวจสอบ</button>
                </form>}
                <div className="row-actions">{result.caseId && result.caseStatus === "requested" ? <><button disabled={controlsBusy} onClick={() => void reviewUsageReconciliation(result.caseId!, true)}>อนุมัติ</button><button className="outline-button" disabled={controlsBusy} onClick={() => void reviewUsageReconciliation(result.caseId!, false)}>ปฏิเสธ</button></> : null}</div>
              </div>)}
              {!reconciliation.providerResults.length ? <p className="empty-row" role="listitem">ไม่พบข้อผิดพลาดในการจับคู่ข้อมูลผู้ให้บริการ</p> : null}
            </div>
          </div> : null}
          {financialReconciliation ? <div className={`subscription-band reconciliation-band status-${financialReconciliation.status}`} id="financial-reconciliation">
            <div className="reconciliation-heading">
              <div><p>การดำเนินงานการเงิน · จำกัดสิทธิ์</p><h2>การกระทบยอดใบแจ้งหนี้ Stripe</h2></div>
              <span className="reconciliation-status" role="status">{financialReconciliation.status === "healthy" ? "Reconciled" : "Attention required"}</span>
            </div>
            <p className="operational-note">ระบบเปรียบเทียบหลักฐานใบแจ้งหนี้ที่แก้ไขไม่ได้กับสถานะใบแจ้งหนี้ Stripe ที่ดึงมาแยกต่างหาก การแก้ไขต้องมีผู้ตรวจฝ่ายการเงินอีกคน</p>
            <div className="reconciliation-summary">
              <div><span>ตรวจแล้ว</span><strong>{financialReconciliation.summary.total}</strong><small>ภาพสถานะจากผู้ให้บริการ</small></div>
              <div><span>ตรงกัน</span><strong>{financialReconciliation.summary.matched}</strong><small>สถานะมาตรฐานที่ตรงกัน</small></div>
              <div><span>ต้องตรวจสอบ</span><strong>{financialReconciliation.summary.attention}</strong><small>ต้องตรวจสอบ</small></div>
            </div>
            <div className="platform-table reconciliation-table" role="list" aria-label="การกระทบยอดใบแจ้งหนี้ Stripe">
              {financialReconciliation.results.map((result) => <div className={`platform-row provider-reconciliation-row ${result.status === "matched" ? "healthy" : "attention"}`} role="listitem" key={result.resultId}>
                <div><strong data-no-localize>{result.businessName}</strong><span>Invoice {result.externalInvoiceRef}</span></div>
                <div><strong>{result.status.replaceAll("_", " ")}</strong><span>{Object.keys(result.differences).length ? Object.keys(result.differences).join(", ") : "No difference"}</span></div>
                {result.status === "matched" ? <span>Reconciled {new Date(result.reconciledAt).toLocaleString(currentIntlLocale())}</span>
                  : result.caseId ? <div><strong>{result.requestedAction?.replaceAll("_", " ")}</strong><span>{result.reviewStatus ?? "review requested"}</span></div>
                    : <form onSubmit={(event) => void requestFinancialReconciliation(event, result.resultId)}>
                      <select name="action" defaultValue="investigate"><option value="investigate">ตรวจสอบ</option><option value="retry_provider_retrieval">โหลดใหม่</option><option value="request_stripe_correction">ขอให้แก้ไขข้อมูล Stripe</option><option value="issue_customer_credit">ออกเครดิตให้ลูกค้า</option></select>
                      <input name="reason" minLength={8} maxLength={1000} defaultValue="Investigate Stripe invoice reconciliation difference" required />
                      <button type="submit" disabled={controlsBusy}>ส่งให้ตรวจสอบ</button>
                    </form>}
                <div className="row-actions">{result.caseId && !result.reviewStatus ? <><button type="button" disabled={controlsBusy} onClick={() => void reviewFinancialReconciliation(result.caseId!, true)}>อนุมัติ</button><button className="outline-button" type="button" disabled={controlsBusy} onClick={() => void reviewFinancialReconciliation(result.caseId!, false)}>ปฏิเสธ</button></> : null}</div>
              </div>)}
              {!financialReconciliation.results.length ? <p className="empty-row" role="listitem">ยังไม่มีใบแจ้งหนี้ Stripe ที่ผ่านการกระทบยอด</p> : null}
            </div>
          </div> : null}
          {financialEventReconciliation ? <div className={`subscription-band reconciliation-band status-${financialEventReconciliation.status}`} id="financial-event-reconciliation">
            <div className="reconciliation-heading"><div><p>การดำเนินงานการเงิน · จำกัดสิทธิ์</p><h2>การกระทบยอดการชำระเงิน การคืนเงิน และเครดิตของ Stripe</h2></div>
              <span className="reconciliation-status" role="status">{financialEventReconciliation.status === "healthy" ? "Reconciled" : "Attention required"}</span></div>
            <p className="operational-note">ระบบดึงข้อมูลการชำระเงิน การคืนเงิน และใบลดหนี้แยกต่างหากเพื่อเปรียบเทียบกับหลักฐานภายในที่แก้ไขไม่ได้ การแก้ไขต้องมีผู้ตรวจอีกคน</p>
            <div className="reconciliation-summary">
              <div><span>ตรวจแล้ว</span><strong>{financialEventReconciliation.summary.total}</strong><small>เหตุการณ์จากผู้ให้บริการ</small></div>
              <div><span>ตรงกัน</span><strong>{financialEventReconciliation.summary.matched}</strong><small>สถานะมาตรฐานที่ตรงกัน</small></div>
              <div><span>ต้องตรวจสอบ</span><strong>{financialEventReconciliation.summary.attention}</strong><small>ต้องตรวจสอบ</small></div>
            </div>
            <div className="platform-table reconciliation-table" role="list" aria-label="การกระทบยอดเหตุการณ์ทางการเงินของ Stripe">
              {financialEventReconciliation.results.map((result) => <div className={`platform-row provider-reconciliation-row ${result.status === "matched" ? "healthy" : "attention"}`} role="listitem" key={result.resultId}>
                <div><strong data-no-localize>{result.businessName}</strong><span>{result.evidenceKind.replaceAll("_", " ")} {result.externalRef}</span></div>
                <div><strong>{result.status.replaceAll("_", " ")}</strong><span>{Object.keys(result.differences).length ? Object.keys(result.differences).join(", ") : "No difference"}</span></div>
                {result.status === "matched" ? <span>Reconciled {new Date(result.reconciledAt).toLocaleString(currentIntlLocale())}</span>
                  : result.caseId ? <div><strong>{result.requestedAction?.replaceAll("_", " ")}</strong><span>{result.reviewStatus ?? "review requested"}</span></div>
                    : <form onSubmit={(event) => void requestFinancialEventReconciliation(event, result.resultId)}>
                      <select name="action" defaultValue="investigate"><option value="investigate">ตรวจสอบ</option><option value="retry_provider_retrieval">โหลดใหม่</option><option value="request_stripe_correction">ขอให้แก้ไขข้อมูล Stripe</option><option value="issue_customer_credit">ออกเครดิตให้ลูกค้า</option></select>
                      <input name="reason" minLength={8} maxLength={1000} defaultValue="Investigate Stripe financial event difference" required />
                      <button type="submit" disabled={controlsBusy}>ส่งให้ตรวจสอบ</button>
                    </form>}
                <div className="row-actions">{result.caseId && !result.reviewStatus ? <><button type="button" disabled={controlsBusy} onClick={() => void reviewFinancialEventReconciliation(result.caseId!, true)}>อนุมัติ</button><button className="outline-button" type="button" disabled={controlsBusy} onClick={() => void reviewFinancialEventReconciliation(result.caseId!, false)}>ปฏิเสธ</button></> : null}</div>
              </div>)}
              {!financialEventReconciliation.results.length ? <p className="empty-row" role="listitem">ยังไม่มีหลักฐานการชำระเงิน การคืนเงิน หรือเครดิตที่ผ่านการกระทบยอด</p> : null}
            </div>
          </div> : null}
          {accountingReconciliation ? <div className={`subscription-band reconciliation-band status-${accountingReconciliation.status}`} id="accounting-reconciliation">
            <div className="reconciliation-heading">
              <div><p>การดำเนินงานการเงิน · จำกัดสิทธิ์</p><h2>การกระทบยอด FlowAccount</h2></div>
              <span className="reconciliation-status" role="status">{accountingReconciliation.status === "healthy" ? "Reconciled" : "Attention required"}</span>
            </div>
            <p className="operational-note">ระบบเปรียบเทียบหลักฐานรายวันจากภายนอกกับใบแจ้งหนี้และเครดิตภายในที่แก้ไขไม่ได้ สถานะจากผู้ให้บริการไม่สามารถเขียนทับบัญชีแยกประเภทภายใน</p>
            <div className="reconciliation-summary">
              <div><span>ตรวจแล้ว</span><strong>{accountingReconciliation.summary.total}</strong><small>ภาพสถานะจากภายนอก</small></div>
              <div><span>ตรงกัน</span><strong>{accountingReconciliation.summary.matched}</strong><small>หลักฐานภายในที่ตรงกัน</small></div>
              <div><span>ต้องตรวจสอบ</span><strong>{accountingReconciliation.summary.attention}</strong><small>ต้องตรวจสอบ</small></div>
            </div>
            <div className="platform-table reconciliation-table" role="list" aria-label="การกระทบยอด FlowAccount">
              {accountingReconciliation.results.map((result) => <div className={`platform-row provider-reconciliation-row ${result.status === "matched" ? "healthy" : "attention"}`} role="listitem" key={result.resultId}>
                <div><strong data-no-localize>{result.businessName}</strong><span>{result.documentKind.replaceAll("_", " ")} {result.externalDocumentRef ?? "reference pending"}</span></div>
                <div><strong>{result.status.replaceAll("_", " ")}</strong><span>{Object.keys(result.differences).length ? Object.keys(result.differences).join(", ") : "No difference"}</span></div>
                {result.status === "matched" ? <span>Reconciled {new Date(result.reconciledAt).toLocaleString(currentIntlLocale())}</span>
                  : result.caseId ? <div><strong>{result.requestedAction?.replaceAll("_", " ")}</strong><span>{result.reviewStatus ?? "review requested"}</span></div>
                    : <form onSubmit={(event) => void requestAccountingReconciliation(event, result.resultId)}>
                      <select name="action" defaultValue="investigate"><option value="investigate">ตรวจสอบ</option><option value="retry_retrieval">โหลดใหม่</option><option value="request_flowaccount_correction">ขอแก้ไขข้อมูล FlowAccount</option><option value="credit_and_replace">ออกเครดิตและสร้างเอกสารทดแทน</option></select>
                      <input name="reason" minLength={8} maxLength={1000} defaultValue="Investigate FlowAccount reconciliation difference" required />
                      <button type="submit" disabled={controlsBusy}>ส่งให้ตรวจสอบ</button>
                    </form>}
                <div className="row-actions">{result.caseId && !result.reviewStatus ? <><button type="button" disabled={controlsBusy} onClick={() => void reviewAccountingReconciliation(result.caseId!, true)}>อนุมัติ</button><button className="outline-button" type="button" disabled={controlsBusy} onClick={() => void reviewAccountingReconciliation(result.caseId!, false)}>ปฏิเสธ</button></> : null}</div>
              </div>)}
              {!accountingReconciliation.results.length ? <p className="empty-row" role="listitem">ยังไม่มีเอกสาร FlowAccount ที่ผ่านการกระทบยอด</p> : null}
            </div>
          </div> : null}
          {["platform_owner", "platform_finance"].includes(user.role) ? <div className="subscription-band reconciliation-band" id="subscription-dunning">
            <div className="reconciliation-heading"><div><p>นโยบายเรียกเก็บเงิน · จำกัดสิทธิ์</p><h2>การติดตามยอดค้างชำระ</h2></div>
              <span className="reconciliation-status" role="status">{dunningPolicies.find((policy) => policy.status === "active") ? "นโยบายใช้งานอยู่" : "ปิดการบังคับใช้"}</span></div>
            <p className="operational-note">ยังไม่ใช้ระยะผ่อนผันและกำหนดเวลาจำกัดสิทธิ์เมื่อชำระเงินไม่สำเร็จ จนกว่าเจ้าของแพลตฟอร์มอีกคนจะอนุมัตินโยบายที่มีเวอร์ชัน</p>
            {user.role === "platform_owner" ? <form className="support-request-form" onSubmit={requestDunningPolicy}>
              <label>ระยะผ่อนผัน (ชั่วโมง)<input name="gracePeriodHours" type="number" min="0" max="2160" required /></label>
              <label>จำกัดสิทธิ์หลังผ่านไป (ชั่วโมง)<input name="restrictAfterHours" type="number" min="0" max="4320" required /></label>
              <label>ช่วงเวลาส่งการแจ้งเตือน<input name="noticeOffsets" inputMode="numeric" placeholder="0, 24, 72" required /></label>
              <label>เหตุผลของนโยบาย<input name="reason" minLength={8} maxLength={1000} required /></label>
              <button type="submit" disabled={controlsBusy}>ส่งนโยบายให้อนุมัติ</button>
            </form> : null}
            <div className="platform-table" role="list" aria-label="นโยบายติดตามยอดค้างชำระ">
              {dunningPolicies.map((policy) => <div className="platform-row provider-reconciliation-row" role="listitem" key={policy.id}>
                <div><strong>Version {policy.version} · {policy.status.replaceAll("_", " ")}</strong><span>{policy.reason}</span></div>
                <div><strong>{policy.gracePeriodHours}h grace</strong><span>restrict after {policy.restrictAfterHours}h</span></div>
                <span>Notices {policy.customerNoticeOffsetsHours.length ? policy.customerNoticeOffsetsHours.map((hours) => `${hours}h`).join(", ") : "none"}</span>
                <div className="row-actions">{user.role === "platform_owner" && policy.status === "pending_review" ? <>
                  <button type="button" disabled={controlsBusy || policy.requestedByPlatformUserId === user.id} onClick={() => void reviewDunningPolicy(policy.id, true)}>เปิดใช้งาน</button>
                  <button className="outline-button" type="button" disabled={controlsBusy || policy.requestedByPlatformUserId === user.id} onClick={() => void reviewDunningPolicy(policy.id, false)}>ปฏิเสธ</button>
                </> : null}</div>
              </div>)}
              {!dunningPolicies.length ? <p className="empty-row" role="listitem">ยังไม่มีนโยบายติดตามยอดค้างชำระที่อนุมัติแล้ว</p> : null}
            </div>
          </div> : null}
          {["platform_owner", "platform_finance"].includes(user.role) ? <div className="subscription-band reconciliation-band" id="webhook-recovery">
            <div className="reconciliation-heading"><div><p>การกู้คืนงานเรียกเก็บเงิน · จำกัดสิทธิ์</p><h2>สิทธิ์จัดการ webhook ของ Stripe</h2></div>
              <span className="reconciliation-status" role="status">{webhookRecovery.some((item) => ["attention", "failed"].includes(item.status)) ? "ต้องตรวจสอบ" : "ไม่มีหลักฐานค้างตรวจ"}</span></div>
            <p className="operational-note">ระบบดึงเหตุการณ์การสมัครใช้บริการที่ถูกละเว้นจาก Stripe แยกต่างหาก การเล่นซ้ำหรือยอมรับต้องมีผู้ตรวจอีกคน และหลักฐาน payload ยังคงเข้ารหัส</p>
            <div className="platform-table" role="list" aria-label="การกู้คืน webhook ของ Stripe">
              {webhookRecovery.map((item) => <div className="platform-row provider-reconciliation-row attention" role="listitem" key={item.jobId}>
                <div><strong>{item.eventType}</strong><span>{item.reasonCode.replaceAll("_", " ")} · event …{item.externalEventId.slice(-8)}</span></div>
                <div><strong>{item.status}</strong><span>{item.providerEvidenceCount} provider evidence snapshot{item.providerEvidenceCount === 1 ? "" : "s"}</span></div>
                {item.caseId ? <div><strong>{item.requestedAction?.replaceAll("_", " ")}</strong><span>{item.reviewStatus ?? "review requested"}</span></div>
                  : user.role === "platform_owner" && item.status === "attention" ? <form onSubmit={(event) => void requestWebhookRecovery(event, item.jobId)}>
                    <select name="action" defaultValue="retry_application"><option value="retry_application">ประมวลผลอีกครั้ง</option><option value="accept_unsupported">ยอมรับเหตุการณ์ที่ไม่รองรับ</option><option value="escalate_provider">ยกระดับให้ผู้ให้บริการตรวจสอบ</option></select>
                    <input name="reason" minLength={8} maxLength={1000} defaultValue="Review independently confirmed Stripe event authority" required />
                    <button type="submit" disabled={controlsBusy}>ส่งให้ตรวจสอบ</button>
                  </form> : <span>{new Date(item.occurredAt).toLocaleString(currentIntlLocale())}</span>}
                <div className="row-actions">{user.role === "platform_owner" && item.caseId && !item.reviewStatus ? <>
                  <button type="button" disabled={controlsBusy || item.requestedByPlatformUserId === user.id} onClick={() => void reviewWebhookRecovery(item.caseId!, true)}>อนุมัติ</button>
                  <button className="outline-button" type="button" disabled={controlsBusy || item.requestedByPlatformUserId === user.id} onClick={() => void reviewWebhookRecovery(item.caseId!, false)}>ปฏิเสธ</button>
                </> : null}</div>
              </div>)}
              {!webhookRecovery.length ? <p className="empty-row" role="listitem">ไม่มีเหตุการณ์ Stripe ที่ถูกละเว้นและต้องกู้คืน</p> : null}
            </div>
          </div> : null}
          {voiceControl ? <div className={`subscription-band voice-control-band mode-${voiceControl.mode}`} id="voice-operations">
            <div><p>การดำเนินงานระบบเสียง</p><h2>การอนุมัติระบบรันไทม์และการกู้คืน</h2></div>
            <div className="voice-control-summary">
              <div><span>โหมด</span><strong>{voiceControl.mode.replaceAll("_", " ")}</strong><small>{voiceControl.reasonCode.replaceAll("_", " ")}</small></div>
              <div><span>ใช้งานอยู่</span><strong>{voiceControl.activeSessions}</strong><small>{voiceControl.reconnectingSessions} reconnecting</small></div>
              <div><span>คิวกู้คืน</span><strong>{voiceControl.expiredGrants + voiceControl.staleConnections}</strong><small>{voiceControl.staleConnections} stale connections</small></div>
            </div>
            <label className="voice-reason" htmlFor="voice-runtime-reason">เหตุผลในการดำเนินการ<input {...voiceRuntimeReasonFieldConstraints} id="voice-runtime-reason" ref={voiceReasonRef} value={voiceReason} aria-describedby={voiceReasonIssue ? "voice-runtime-reason-error" : undefined} aria-invalid={Boolean(voiceReasonIssue)} onChange={(event) => { setVoiceReason(event.target.value); if (voiceReasonIssue) setVoiceReasonIssue(""); event.currentTarget.setCustomValidity(""); }} />{voiceReasonIssue ? <span className="voice-reason-error" id="voice-runtime-reason-error" role="alert">{voiceReasonIssue}</span> : null}</label>
            <div className="voice-control-actions">
              <button type="button" disabled={controlsBusy || voiceControl.mode === "running"} onClick={() => void changeVoiceMode("running")}>เปิดรับงานอีกครั้ง</button>
              <button className="outline-button" type="button" disabled={controlsBusy || voiceControl.mode === "paused"} onClick={() => void changeVoiceMode("paused")}>หยุดรับเซสชันใหม่</button>
              <button className="danger-button" type="button" disabled={controlsBusy || voiceControl.mode === "emergency_stop"} onClick={() => void changeVoiceMode("emergency_stop")}>หยุดฉุกเฉิน</button>
            </div>
            <small>Version {voiceControl.version} · changed {new Date(voiceControl.changedAt).toLocaleString(currentIntlLocale())}</small>
          </div> : null}
          {voiceRouting ? <div className={`subscription-band advanced-voice-band mode-${voiceRouting.profiles[0]?.mode || "paused"}`}>
            <div><p>Advanced Voice · จำกัดสิทธิ์</p><h2>การกำกับเส้นทางระบบรุ่นที่สอง</h2></div>
            <p className="operational-note">รหัสผู้ให้บริการและโมเดลจะแสดงเฉพาะเจ้าของแพลตฟอร์มและทีมปฏิบัติการ AI เส้นทางจะยังใช้ไม่ได้จนกว่าผู้ตรวจอีกคนจะรับรองและอนุมัติการทดสอบแบบ Canary โดยระบบจะไม่ย้อนกลับไปใช้รุ่นแรก</p>
            <div className="voice-control-summary">
              <div><span>โปรไฟล์</span><strong>ระบบรุ่นที่สอง</strong><small>ระบบเสียงรุ่นที่สอง</small></div>
              <div><span>โหมด</span><strong>{voiceRouting.profiles[0]?.mode || "paused"}</strong><small>{voiceRouting.profiles[0]?.reasonCode.replaceAll("_", " ") || "qualification required"}</small></div>
              <div><span>การอนุมัติเข้าใช้งาน</span><strong>{voiceRouting.admissionEnabled ? "enabled" : "disabled"}</strong><small>{voiceRouting.admissionEnabled ? "reviewed production traffic" : "fail-closed"}</small></div>
              <div><span>Canary</span><strong>{voiceRouting.profiles[0]?.canaryPercent || 0}%</strong><small>เวอร์ชัน {voiceRouting.profiles[0]?.version || 1}</small></div>
            </div>
            <div className="voice-governance-grid">
              <form onSubmit={proposeVoiceCandidate}><h3>1. เสนอเส้นทาง</h3><label>รหัสผู้ให้บริการ<input name="providerKey" pattern="[a-z0-9][a-z0-9._-]{1,79}" required /></label><label>รหัสโมเดล<input name="modelKey" minLength={2} maxLength={160} required /></label><label>รหัสภูมิภาค<input name="regionKey" pattern="[a-z0-9][a-z0-9._-]{1,79}" required /></label><button disabled={controlsBusy} type="submit">ส่งตัวเลือกเข้าตรวจสอบ</button></form>
              <form onSubmit={reviewVoiceCandidate}><h3>2. ตรวจรับรองโดยผู้ตรวจอิสระ</h3><label>ตัวเลือกที่เสนอ<select name="candidateId" required defaultValue=""><option value="" disabled>เลือกตัวเลือก</option>{voiceRouting.candidates.filter((candidate) => candidate.status === "proposed").map((candidate) => <option key={candidate.id} value={candidate.id} disabled={candidate.proposedByPlatformUserId === user.id}>{candidate.providerKey} / {candidate.modelKey}{candidate.proposedByPlatformUserId === user.id ? " · ต้องใช้ผู้ตรวจอีกคน" : ""}</option>)}</select></label><label>คำตัดสิน<select name="decision" defaultValue="qualify"><option value="qualify">คัดกรอง</option><option value="reject">ปฏิเสธ</option></select></label><label>ค่า SHA-256 ของหลักฐานการรับรอง<input name="evidenceSha256" pattern="[a-fA-F0-9]{64}" minLength={64} maxLength={64} required /></label><button disabled={controlsBusy} type="submit">บันทึกผลการตรวจ</button></form>
              <form onSubmit={requestVoiceChange}><h3>3. ขอทดสอบแบบ Canary</h3><label>ตัวเลือกที่ผ่านการรับรอง<select name="candidateId" required defaultValue=""><option value="" disabled>เลือกตัวเลือก</option>{voiceRouting.candidates.filter((candidate) => candidate.status === "qualified").map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.providerKey} / {candidate.modelKey}</option>)}</select></label><label>สัดส่วน Canary<input name="canaryPercent" type="number" min={1} max={100} defaultValue={10} required /></label><label>เหตุผลในการดำเนินการ<input name="reason" minLength={12} maxLength={500} required /></label><label>ค่า SHA-256 ของหลักฐานการประเมิน<input name="evidenceSha256" pattern="[a-fA-F0-9]{64}" minLength={64} maxLength={64} required /></label><button disabled={controlsBusy} type="submit">ส่งคำขอเปลี่ยนแปลง</button></form>
            </div>
            <label className="voice-reason" htmlFor="voice-routing-action-reason">เหตุผลการดำเนินการ<input {...voiceRoutingActionReasonFieldConstraints} id="voice-routing-action-reason" ref={routingActionReasonRef} value={routingActionReason} aria-describedby={routingActionReasonIssue ? "voice-routing-action-reason-error" : undefined} aria-invalid={Boolean(routingActionReasonIssue)} onChange={(event) => { setRoutingActionReason(event.target.value); if (routingActionReasonIssue) setRoutingActionReasonIssue(""); event.currentTarget.setCustomValidity(""); }} />{routingActionReasonIssue ? <span className="voice-reason-error" id="voice-routing-action-reason-error" role="alert">{routingActionReasonIssue}</span> : null}</label>
            <div className="platform-table" role="list" aria-label="การเปลี่ยนเส้นทาง Advanced Voice">
              {voiceRouting.changes.map((change) => <div className="platform-row voice-route-row" role="listitem" key={change.id}><div><strong>{voiceRouting.candidates.find((candidate) => candidate.id === change.candidateId)?.modelKey || change.candidateId}</strong><span>{change.reason} · Canary {change.canaryPercent}%</span></div><span>{formatPlatformLabel(change.status)}</span><div className="row-actions">{change.status === "requested" ? <><button disabled={controlsBusy || change.requestedByPlatformUserId === user.id} onClick={() => void reviewVoiceChange(change.id, "approve")}>อนุมัติ</button><button className="outline-button" disabled={controlsBusy || change.requestedByPlatformUserId === user.id} onClick={() => void reviewVoiceChange(change.id, "reject")}>ปฏิเสธ</button></> : null}{change.status === "approved" ? <button disabled={controlsBusy} onClick={() => void applyVoiceChange(change.id, "start_canary")}>เริ่ม Canary</button> : null}{change.status === "canary" ? <><button disabled={controlsBusy} onClick={() => void applyVoiceChange(change.id, "promote")}>เลื่อนขึ้นใช้งาน</button><button className="outline-button" disabled={controlsBusy} onClick={() => void applyVoiceChange(change.id, "rollback")}>ย้อนกลับเวอร์ชัน</button></> : null}{change.status === "active" ? <button className="danger-button" disabled={controlsBusy} onClick={() => void applyVoiceChange(change.id, "rollback")}>ย้อนกลับเวอร์ชัน</button> : null}</div></div>)}
              {!voiceRouting.changes.length ? <p className="empty-row" role="listitem">ไม่มีการเปลี่ยนเส้นทาง</p> : null}
            </div>
            <div className="voice-governance-grid admission-governance-grid">
              <form onSubmit={requestVoiceAdmission}><h3>4. อนุมัติเข้าสู่ระบบจริง</h3><label>สถานะที่ขอ<select name="enabled" defaultValue={voiceRouting.admissionEnabled ? "false" : "true"}><option value="true">เปิดทราฟฟิกระบบจริง</option><option value="false">ปิดทราฟฟิกระบบจริง</option></select></label><label>เหตุผลการยอมรับ<input name="reason" minLength={12} maxLength={500} required /></label><label>ค่า SHA-256 ของหลักฐานการยอมรับ<input name="evidenceSha256" pattern="[a-fA-F0-9]{64}" minLength={64} maxLength={64} required /></label><button disabled={controlsBusy} type="submit">ขอเปลี่ยนสถานะอนุมัติ</button></form>
              <div className="platform-table" role="list" aria-label="การเปลี่ยนสถานะอนุมัติ Advanced Voice">{voiceRouting.admissionChanges.map((change) => <div className="platform-row voice-route-row" role="listitem" key={change.id}><div><strong>{change.targetEnabled ? "เปิด" : "ปิด"}การรับงาน</strong><span>{change.reason}</span></div><span>{formatPlatformLabel(change.status)}</span><div className="row-actions">{change.status === "requested" ? <><button disabled={controlsBusy || change.requestedByPlatformUserId === user.id} onClick={() => void reviewVoiceAdmission(change.id, "approve")}>อนุมัติ</button><button className="outline-button" disabled={controlsBusy || change.requestedByPlatformUserId === user.id} onClick={() => void reviewVoiceAdmission(change.id, "reject")}>ปฏิเสธ</button></> : null}{change.status === "approved" ? <button className={change.targetEnabled ? "danger-button" : undefined} disabled={controlsBusy} onClick={() => void applyVoiceAdmission(change.id, change.targetEnabled)}>{change.targetEnabled ? "เปิดทราฟฟิก" : "ปิดทราฟฟิก"}</button> : null}</div></div>)}{!voiceRouting.admissionChanges.length ? <p className="empty-row" role="listitem">ไม่มีการเปลี่ยนสถานะอนุมัติ</p> : null}</div>
            </div>
            <form className="incident-open-form" onSubmit={openVoiceIncident}><h3>เปิดเหตุขัดข้อง</h3><label>ระดับความรุนแรง<select name="severity" defaultValue="major"><option value="minor">เล็กน้อย · ประสิทธิภาพลดลง</option><option value="major">ร้ายแรง · หยุดชั่วคราว</option><option value="critical">วิกฤต · หยุดทันที</option></select></label><label>การเปลี่ยนแปลงที่เกี่ยวข้อง<select name="routingChangeId" defaultValue=""><option value="">ไม่มีการเปลี่ยนแปลงที่เกี่ยวข้อง</option>{voiceRouting.changes.map((change) => <option key={change.id} value={change.id}>{change.status} · {change.reason}</option>)}</select></label><label>สาเหตุเหตุขัดข้อง<input name="reason" minLength={12} maxLength={1000} required /></label><label className="checkbox-label"><input name="creditReviewRequired" type="checkbox" />ต้องตรวจสอบเครดิต</label><button disabled={controlsBusy} type="submit">เปิดเหตุขัดข้องและใช้มาตรการป้องกัน</button></form>
          </div> : null}
          {voiceIncidents ? <div className="subscription-band incident-band">
            <div><p>Advanced Voice</p><h2>การตรวจเหตุขัดข้องและเครดิต</h2></div>
            <div className="platform-table" role="list" aria-label="เหตุขัดข้อง Advanced Voice">{voiceIncidents.map((incident) => <div className="platform-row incident-row" role="listitem" key={incident.id}><div><strong>{formatPlatformLabel(incident.severity)} · {formatPlatformLabel(incident.status)}</strong><span>{incident.reason}</span></div><span>{formatPlatformLabel(incident.creditReviewStatus)}</span><div className="row-actions">{incident.creditReviewStatus === "required" && ["platform_owner", "platform_finance"].includes(user.role) ? <><button disabled={controlsBusy || incident.openedByPlatformUserId === user.id} onClick={() => void reviewVoiceCredit(incident.id, "approve")}>อนุมัติการตรวจสอบเครดิต</button><button className="outline-button" disabled={controlsBusy || incident.openedByPlatformUserId === user.id} onClick={() => void reviewVoiceCredit(incident.id, "reject")}>ปฏิเสธ</button></> : null}{incident.status !== "resolved" && ["platform_owner", "platform_ai_operations"].includes(user.role) ? <button disabled={controlsBusy} onClick={() => { clearMessage(); setResolvingIncidentId(incident.id); }}>แก้ไขแล้ว</button> : null}</div>{resolvingIncidentId === incident.id ? <VoiceIncidentResolutionForm incidentId={incident.id} severity={incident.severity} working={controlsBusy} onResolve={(resolution) => resolveVoiceIncident(incident.id, resolution)} onCancel={() => setResolvingIncidentId(null)} /> : null}</div>)}{!voiceIncidents.length ? <p className="empty-row" role="listitem">ไม่มีเหตุขัดข้อง Advanced Voice</p> : null}</div>
          </div> : null}
          {health?.socialChannels?.length ? <div className="subscription-band"><div><p>การดำเนินงานแชต AI</p><h2>สถานะช่องทางโซเชียล</h2></div><div className="platform-table" role="list" aria-label="สถานะช่องทางโซเชียล">{health.socialChannels.map((channel) => <div className="platform-row" role="listitem" key={channel.channel}><div><strong>{channel.channel === "line" ? "LINE" : channel.channel === "whatsapp" ? "WhatsApp" : "Messenger"}</strong><span>{channel.activeConnections} ใช้งานอยู่ / {channel.reauthorizationRequired} ต้องยืนยันสิทธิ์ใหม่</span></div><span>{channel.queuedInbound} ขาเข้ารอคิว / เก่าสุด {channel.oldestInboundQueueSeconds} วินาที</span><span>{channel.queuedDeliveries} การส่งรอคิว / เก่าสุด {channel.oldestDeliveryQueueSeconds} วินาที</span><span>{channel.deadLetterInbound + channel.deadLetterDeliveries} dead letter / {channel.failedAttempts24h} ครั้งที่ล้มเหลว</span></div>)}</div></div> : null}
          {recoveryStage === "loading" && !recovery ? <div className="subscription-band recovery-band" id="queue-recovery" aria-busy="true"><div><p>การกู้คืนคิว · จำกัดสิทธิ์</p><h2>กำลังโหลดข้อมูลกู้คืนที่ผ่านการตรวจ</h2></div><p className="operational-note">กำลังตรวจสอบสิทธิ์เล่นซ้ำและสถานะการตรวจโดยผู้ตรวจอิสระ</p></div> : null}
          {recoveryStage === "error" ? <div className="subscription-band recovery-band" id="queue-recovery"><div><p>การกู้คืนคิว · จำกัดสิทธิ์</p><h2>ส่วนควบคุมการกู้คืนไม่พร้อมใช้งาน</h2></div><p className="operational-note" role="alert">ระบบปิดกั้นเพื่อความปลอดภัย ห้ามใช้ SQL โดยตรง ให้กู้บริการกู้คืนแล้วลองโหลดข้อมูลอีกครั้ง</p><button type="button" disabled={controlsBusy} onClick={() => void loadCurrent()}>โหลดส่วนควบคุมการกู้คืนอีกครั้ง</button></div> : null}
          {recoveryStage !== "error" && recovery ? <div className="subscription-band recovery-band" id="queue-recovery" aria-busy={recoveryStage === "loading"}>
            <div><p>การกู้คืนคิว · จำกัดสิทธิ์</p><h2>การเล่นซ้ำรายการ dead letter ที่ผ่านการตรวจ</h2></div>
            <p className="operational-note">เฉพาะการส่งอีเมลที่มี idempotency key แบบถาวรเท่านั้นที่มีสิทธิ์เล่นซ้ำ webhook ของ FlowBot และคิวโซเชียลจะยังถูกระงับเพื่อตรวจหาสาเหตุ เพราะยังยืนยันไม่ได้ว่าการทำผลกระทบภายนอกซ้ำจะปลอดภัย</p>
            <div className="voice-control-summary recovery-summary">
              <div><span>มีสิทธิ์</span><strong>{recovery.recoverable.length}</strong><small>อีเมลและปฏิทิน dead letter ที่กู้คืนได้อย่างปลอดภัย</small></div>
              <div><span>รอตรวจสอบ</span><strong>{recovery.requests.filter((request) => request.status === "requested").length}</strong><small>ต้องใช้เจ้าของรายการคนอื่น</small></div>
              <div><span>ไม่นำมารวม</span><strong>{recovery.policy.excludedQueueKinds.length}</strong><small>ประเภทคิวที่ทำซ้ำแล้วอาจเกิดผลซ้ำ</small></div>
            </div>
            {recovery.recoverable.length ? <form className="support-request-form recovery-request-form" onSubmit={requestRecovery}>
              <label>dead letter ที่มีสิทธิ์<select name="recoveryTarget" required defaultValue=""><option value="" disabled>เลือกรายการคิวแบบไม่เปิดเผยข้อมูล</option>{recovery.recoverable.map((item) => <option key={`${item.queueKind}:${item.itemId}`} value={`${item.queueKind}|${item.itemId}|${item.attemptCount}`}>{formatPlatformLabel(item.queueKind)} · …{item.itemId.slice(-8)} · ครั้งที่ลอง {item.attemptCount}</option>)}</select></label>
              <label>สาเหตุหลักและเหตุผลที่ขอเล่นซ้ำ<input name="reason" minLength={12} maxLength={500} required placeholder="แก้สาเหตุแล้ว อนุมัติให้ลองซ้ำแบบไม่เกิดผลซ้ำ 1 ครั้ง" /></label>
              <button type="submit" disabled={controlsBusy}>ขอเล่นซ้ำ</button>
            </form> : <p className="empty-row">ไม่มี dead letter ที่มีสิทธิ์กู้คืน</p>}
            <div className="platform-table" role="list" aria-label="คำขอกู้คืน dead letter">
              {recovery.requests.map((request) => <div className="platform-row recovery-row" role="listitem" key={request.recordId}>
                <div><strong>{formatPlatformLabel(request.queueKind)} · …{request.itemId.slice(-8)}</strong><span data-no-localize>{request.reason}</span></div>
                <span>{formatPlatformLabel(request.status)}</span><span>ครั้งที่ลอง {request.attemptCount} · {new Date(request.occurredAt).toLocaleString(currentIntlLocale())}</span>
                <div className="row-actions">{user.role === "platform_owner" && request.status === "requested" ? <><button type="button" disabled={controlsBusy || request.requestedByPlatformUserId === user.id} onClick={() => void reviewRecovery(request.recordId, "approve")}>อนุมัติให้ลองซ้ำ 1 ครั้ง</button><button className="outline-button" type="button" disabled={controlsBusy || request.requestedByPlatformUserId === user.id} onClick={() => void reviewRecovery(request.recordId, "reject")}>ปฏิเสธ</button></> : null}</div>
              </div>)}
              {!recovery.requests.length ? <p className="empty-row" role="listitem">ไม่มีคำขอกู้คืน</p> : null}
            </div>
            <small>หน้านี้จะไม่เปิดเผย payload ผู้รับ รหัสลูกค้า ข้อมูลรับรอง ผู้ให้บริการ หรือโมเดล ทุกคำขอและผลตรวจเป็นหลักฐานตรวจสอบที่แก้ไขไม่ได้</small>
          </div> : null}
          {commerce ? <div className="subscription-band" id="commerce">
            <div><p>การค้า</p><h2>การสมัครใช้ผลิตภัณฑ์</h2></div>
            <div className="platform-table" role="list" aria-label="การสมัครใช้ผลิตภัณฑ์">
              {subscriptions.map((subscription) => (
                <div className="platform-row" role="listitem" key={subscription.id}>
                  <div><strong data-no-localize>{subscription.businessName}</strong><span data-no-localize>{subscription.publicName}</span></div>
                  <span>{formatPlatformLabel(subscription.status)}</span>
                  {user.role === "platform_owner" && subscription.status === "pending" ? (
                    <button type="button" disabled={controlsBusy} onClick={() => void activate(subscription.id)}>เปิดโครงการนำร่อง</button>
                  ) : <span />}
                </div>
              ))}
              {!subscriptions.length && !resourceErrors.includes("Product subscriptions") ? <p className="empty-row" role="listitem">ยังไม่มีการสมัครใช้ผลิตภัณฑ์</p> : null}
            </div>
          </div> : null}
          {sharedOperations ? <div className="subscription-band fulfillment-band" id="fulfillment">
            <div className="readiness-heading"><div><p>การดำเนินงานสำหรับร้านค้า</p><h2>การจัดเตรียมส่วนเสริมและบริการ</h2></div><span className="readiness-status">เปิดอยู่ {sharedOperations.addOns.length + sharedOperations.services.length + sharedOperations.engagements.length} รายการ</span></div>
            <p className="operational-note">คำขอของลูกค้าไม่เปลี่ยนสิทธิ์ผลิตภัณฑ์ ส่วนเสริมจะมีผลหลังผ่านการตรวจและจัดเตรียมแล้ว ส่วนบริการจากผู้เชี่ยวชาญจะถูกติดตามเป็นงานพร้อมผู้รับผิดชอบขั้นตอนถัดไป</p>
            <h3>คำขอส่วนเสริม</h3>
            <div className="platform-table" role="list" aria-label="คำขอจัดเตรียมส่วนเสริม">
              {sharedOperations.addOns.map((request) => <div className="platform-row fulfillment-row" role="listitem" key={request.id}>
                <div><strong data-no-localize>{request.businessName}</strong><span>{formatPlatformLabel(request.addOnKey)} · จำนวน {request.quantity}</span></div>
                <span>{formatPlatformLabel(request.status)}</span><span>{new Date(request.createdAt).toLocaleString(currentIntlLocale())}</span>
                <div className="row-actions">{user.role === "platform_owner" ? <button type="button" disabled={controlsBusy} onClick={() => void provisionSharedAddOn(request.id)}>จัดเตรียม</button> : null}</div>
              </div>)}
              {!sharedOperations.addOns.length ? <p className="empty-row" role="listitem">ไม่มีคำขอส่วนเสริมที่เปิดอยู่</p> : null}
            </div>
            <h3>คำขอบริการจากผู้เชี่ยวชาญ</h3>
            <div className="platform-table" role="list" aria-label="คำขอบริการจากผู้เชี่ยวชาญ">
              {sharedOperations.services.map((request) => <div className="platform-row fulfillment-service-row" role="listitem" key={request.id}>
                <div><strong data-no-localize>{request.businessName}</strong><span>{formatPlatformLabel(request.serviceKind)} · {request.productKey ? formatPlatformLabel(request.productKey) : "เวิร์กสเปซ"}</span></div>
                <span>{formatPlatformLabel(request.status)}</span><span>{new Date(request.createdAt).toLocaleString(currentIntlLocale())}</span>
                {["platform_owner", "platform_support"].includes(user.role) ? <form onSubmit={(event) => void createServiceEngagement(event, request.id)}>
                  <label>ชื่องานบริการ<input name="title" minLength={3} maxLength={200} required /></label>
                  <label>ขอบเขตการส่งมอบ<textarea name="scope" minLength={20} maxLength={20000} rows={2} required /></label>
                  <label>ขั้นตอนถัดไป<select name="nextActionOwner" defaultValue="djai"><option value="djai">DJAI</option><option value="customer">ลูกค้า</option><option value="shared">รับผิดชอบร่วมกัน</option></select></label>
                  <button disabled={controlsBusy}>สร้างงานบริการ</button>
                </form> : null}
              </div>)}
              {!sharedOperations.services.length ? <p className="empty-row" role="listitem">ไม่มีคำขอบริการที่เปิดอยู่</p> : null}
            </div>
            <h3>งานบริการที่กำลังดำเนินการ</h3>
            <div className="platform-table" role="list" aria-label="งานบริการจากผู้เชี่ยวชาญที่กำลังดำเนินการ">
              {sharedOperations.engagements.map((engagement) => <div className="platform-row fulfillment-service-row" role="listitem" key={engagement.id}>
                <div><strong data-no-localize>{engagement.businessName}</strong><span><span data-no-localize>{engagement.title}</span> · ขั้นตอนถัดไป {formatPlatformLabel(engagement.nextActionOwner)}</span></div>
                <span>{formatPlatformLabel(engagement.status)}</span><span>{new Date(engagement.updatedAt).toLocaleString(currentIntlLocale())}</span>
                {(["platform_owner", "platform_support"] as string[]).includes(user.role) ? <form onSubmit={(event) => void updateServiceEngagement(event, engagement.id)}>
                  <label>สถานะ<select name="status" defaultValue={engagement.status}><option value="awaiting_customer">รอลูกค้า</option><option value="scheduled">กำหนดเวลาแล้ว</option><option value="in_progress">กำลังดำเนินการ</option><option value="review">ตรวจสอบ</option><option value="completed">เสร็จสิ้น</option><option value="cancelled">ยกเลิกแล้ว</option></select></label>
                  <label>ข้อมูลอัปเดตที่ลูกค้าเห็น<textarea name="body" minLength={2} maxLength={5000} rows={2} required /></label>
                  <label>ขั้นตอนถัดไป<select name="nextActionOwner" defaultValue={engagement.nextActionOwner}><option value="djai">DJAI</option><option value="customer">ลูกค้า</option><option value="shared">รับผิดชอบร่วมกัน</option></select></label>
                  <button disabled={controlsBusy}>บันทึกข้อมูลอัปเดต</button>
                </form> : null}
              </div>)}
              {!sharedOperations.engagements.length ? <p className="empty-row" role="listitem">ไม่มีงานบริการที่กำลังดำเนินการ</p> : null}
            </div>
          </div> : null}
          {supportTickets ? <PlatformSupportTicketPanel queue={supportTickets} busy={controlsBusy} formatLabel={formatPlatformLabel} onRespond={(event, ticketId) => void respondToSupportTicket(event, ticketId)} onDownload={(attachmentId) => void downloadSupportAttachment(attachmentId)} /> : null}
          {area === "support-access" ? <PlatformSupportAccessPanel user={user} tenants={tenants} grants={supportGrants} busy={controlsBusy} resourceErrors={resourceErrors} formatLabel={formatPlatformLabel} onRequest={(event) => void requestSupport(event)} onDecide={(grantId, command) => void decideSupport(grantId, command)} /> : null}
        </section>
      </main>
    );
  }

  return (
    <main>
      <div className="topline" />
      <header><span className="mark">D</span><strong>DJAY BOT</strong><span>การดำเนินงานแพลตฟอร์ม</span></header>
      <section aria-labelledby="platform-login-title">
        <p>พื้นที่จำกัดสิทธิ์</p>
        <h1 id="platform-login-title">{stage === "mfa" ? "ยืนยันตัวตนของคุณ" : "เข้าสู่ระบบแพลตฟอร์ม"}</h1>
        {stage === "mfa" ? (
          <form onSubmit={verifyMfa}>
            <label>รหัสจากแอปยืนยันตัวตน<input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} name="code" autoComplete="one-time-code" required /></label>
            <button type="submit" disabled={controlsBusy}>{working ? "กำลังยืนยัน..." : "ยืนยัน"}</button>
          </form>
        ) : (
          <form onSubmit={passwordLogin}>
            <label>อีเมลแพลตฟอร์ม<input type="email" name="email" autoComplete="email" {...emailFieldConstraints} required /></label>
            <label>รหัสผ่าน<input type="password" name="password" autoComplete="current-password" maxLength={128} required /></label>
            <button type="submit" disabled={controlsBusy}>{working ? "กำลังตรวจสอบ..." : "ดำเนินการต่อ"}</button>
          </form>
        )}
        {message ? <div className={`platform-message ${messageTone}`} role={messageTone === "error" ? "alert" : "status"}>{message}</div> : null}
        <small>ต้องยืนยันตัวตนหลายปัจจัย</small>
      </section>
    </main>
  );
}
