"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
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
import { PlatformNavigation } from "./PlatformNavigation";
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
type Tenant = { id: string; businessName: string; slug: string; status: string };
type SupportGrant = { id: string; tenantId: string; businessName: string; requestedByPlatformUserId: string; approvedByPlatformUserId: string | null; reason: string; status: string; startsAt: string; expiresAt: string };
type SharedOperationsQueue = {
  addOns: Array<{ id: string; tenantId: string; businessName: string; addOnKey: string; quantity: number; status: string; createdAt: string }>;
  services: Array<{ id: string; tenantId: string; businessName: string; serviceKind: string; productKey: string | null; status: string; createdAt: string }>;
  engagements: Array<{ id: string; tenantId: string; businessName: string; serviceRequestId: string; title: string; scopeText: string; status: string; nextActionOwner: string; targetAt: string | null; updatedAt: string }>;
};
type RecoveryItem = { recordKind: "recoverable"; recordId: string; queueKind: "system_email" | "flowbot_email" | "ai_chat_email"; itemId: string; attemptCount: number; safeErrorCode: string; occurredAt: string; status: "dead_letter" };
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

export default function PlatformMasterPage() {
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
  const [readinessStage, setReadinessStage] = useState<"loading" | "ready" | "error">("loading");
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [dunningPolicies, setDunningPolicies] = useState<DunningPolicy[]>([]);
  const [webhookRecovery, setWebhookRecovery] = useState<WebhookRecovery[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [supportGrants, setSupportGrants] = useState<SupportGrant[]>([]);
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
    setReadinessStage("loading");
    setSubscriptions([]);
    setDunningPolicies([]);
    setWebhookRecovery([]);
    setTenants([]);
    setSupportGrants([]);
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
    const canReadBilling = ["platform_owner", "platform_finance"].includes(result.user.role);
    const canReadTenants = ["platform_owner", "platform_support", "platform_finance"].includes(result.user.role);
    const canReadVoice = ["platform_owner", "platform_ai_operations"].includes(result.user.role);
    const canReadRecovery = ["platform_owner", "platform_support", "platform_ai_operations"].includes(result.user.role);
    const canReadVoiceIncidents = ["platform_owner", "platform_ai_operations", "platform_finance"].includes(result.user.role);
    const canReadFulfillment = ["platform_owner", "platform_support", "platform_finance"].includes(result.user.role);
    setReadinessStage("loading");
    setReconciliationStage(canReadBilling ? "loading" : "hidden");
    setRecoveryStage(canReadRecovery ? "loading" : "hidden");
    const [
      nextHealth, readinessResult, nextCommerce, reconciliationResult, financialResult, financialEventResult, accountingResult,
      nextSubscriptions, nextDunningPolicies, nextWebhookRecovery, nextTenants, nextSupportGrants, recoveryResult,
      nextVoiceControl, nextVoiceRouting, nextVoiceIncidents, nextSharedOperations,
    ] = await Promise.all([
      loadResource<Health>("/platform/health-summary", "health", "Platform health"),
      loadPanel<ReleaseReadiness>("/platform/release-readiness", "readiness"),
      canReadBilling ? loadResource<Commerce>("/platform/commerce-overview", "commerce", "Commerce overview") : Promise.resolve(null),
      canReadBilling ? loadPanel<UsageReconciliation>("/platform/usage-reconciliation", "reconciliation") : Promise.resolve({ value: null, available: false }),
      canReadBilling ? loadPanel<FinancialReconciliation>("/platform/financial-reconciliation", "financialReconciliation") : Promise.resolve({ value: null, available: false }),
      canReadBilling ? loadPanel<FinancialEventReconciliation>("/platform/financial-event-reconciliation", "financialEventReconciliation") : Promise.resolve({ value: null, available: false }),
      canReadBilling ? loadPanel<AccountingReconciliation>("/platform/accounting-reconciliation", "accountingReconciliation") : Promise.resolve({ value: null, available: false }),
      canReadBilling ? loadResource<Subscription[]>("/platform/subscriptions", "subscriptions", "Product subscriptions") : Promise.resolve(null),
      canReadBilling ? loadResource<DunningPolicy[]>("/platform/subscription-dunning", "policies", "Subscription dunning policies") : Promise.resolve(null),
      canReadBilling ? loadResource<WebhookRecovery[]>("/platform/webhook-recovery", "recovery", "Stripe webhook recovery") : Promise.resolve(null),
      canReadTenants ? loadResource<Tenant[]>("/platform/tenants", "tenants", "Tenant directory") : Promise.resolve(null),
      loadResource<SupportGrant[]>("/platform/support-grants", "grants", "Support access grants"),
      canReadRecovery ? loadPanel<RecoveryOverview>("/platform/dead-letter-recovery", "recovery") : Promise.resolve({ value: null, available: false }),
      canReadVoice ? loadResource<VoiceControl>("/platform/voice/runtime-control", "control", "Voice runtime controls") : Promise.resolve(null),
      canReadVoice ? loadResource<VoiceRouting>("/platform/voice/routing", "routing", "Advanced Voice routing") : Promise.resolve(null),
      canReadVoiceIncidents ? loadResource<VoiceIncident[]>("/platform/voice/incidents", "incidents", "Voice incidents") : Promise.resolve(null),
      canReadFulfillment ? loadResource<SharedOperationsQueue>("/platform/shared-operations", "queue", "SaaS fulfillment") : Promise.resolve(null),
    ]);
    if (generation !== loadGeneration.current) return;
    setHealth(nextHealth);
    setReadiness(readinessResult.value);
    setReadinessStage(readinessResult.available ? "ready" : "error");
    setCommerce(nextCommerce);
    setReconciliation(reconciliationResult.value);
    setReconciliationStage(canReadBilling ? reconciliationResult.available ? "ready" : "error" : "hidden");
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

  if (stage === "loading") return <main className="platform-loading">Checking platform session...</main>;
  if (stage === "error") return <main><div className="topline" /><header><span className="mark">D</span><strong>DJAY BOT</strong><span>Platform operations</span></header><section className="platform-session-error" aria-labelledby="platform-session-error-title" role="alert"><p>Temporarily unavailable</p><h1 id="platform-session-error-title">Platform operations could not be loaded</h1><span>Your access and operational data have not changed. Check the internal service connection and try again.</span><button type="button" onClick={() => void loadCurrent()}>Try again</button></section></main>;
  if (stage === "dashboard" && user) {
    return (
      <main className="platform-shell">
        <aside>
          <div className="platform-brand"><span className="mark">D</span><strong>DJAY BOT</strong></div>
          <p>Platform Master</p>
          <PlatformNavigation role={user.role} />
          <button className="quiet-button" type="button" onClick={() => void logout()}>Sign out</button>
        </aside>
        <section className="platform-content">
          <header><div><p>Internal operations</p><h1>Platform health</h1></div><span><span data-no-localize>{user.displayName}</span><small>{user.role.replaceAll("_", " ")}</small></span></header>
          {message ? <div className={`platform-message dashboard-message ${messageTone}`} role={messageTone === "error" ? "alert" : "status"}>{message}</div> : null}
          {dashboardLoading ? <div className="platform-resource-status loading" aria-live="polite" aria-busy="true"><strong>Refreshing authorized operations data…</strong><span>Current controls remain unavailable until each requested resource responds.</span></div> : null}
          {resourceErrors.length ? <div className="platform-resource-status error" role="alert"><div><strong>Some operations data could not be loaded</strong><span>No operational state was changed. Unavailable areas: {resourceErrors.join(", ")}.</span></div><button type="button" disabled={dashboardLoading} onClick={() => void loadCurrent()}>Try again</button></div> : null}
          <div className="metrics-band" id="overview">
            <div><span>Platform users</span><strong>{health?.platformUsers ?? "-"}</strong></div>
            <div><span>Active sessions</span><strong>{health?.activeSessions ?? "-"}</strong></div>
            <div><span>MFA status</span><strong>Verified</strong></div>
            {commerce ? <><div><span>SME tenants</span><strong>{commerce.tenants}</strong></div>
            <div><span>Subscriptions</span><strong>{commerce.subscriptions}</strong></div>
            <div><span>Pending activation</span><strong>{commerce.pending}</strong></div></> : null}
          </div>
          <div className="operations-band"><p>System evidence</p><h2>Review current identity, release, and role-authorized operations data</h2></div>
          {readinessStage === "loading" && !readiness ? <div className="subscription-band release-readiness-band readiness-placeholder" id="release-operations" aria-live="polite"><div><p>Release operations</p><h2>Checking release readiness…</h2></div><p className="operational-note">Loading current SLO, incident, on-call, restore, replay, queue, pool, security, privacy, support, and usage evidence.</p></div> : null}
          {readinessStage === "error" ? <div className="subscription-band release-readiness-band status-blocked readiness-placeholder" id="release-operations" role="alert"><div><p>Release operations</p><h2>Release evidence unavailable</h2></div><p className="operational-note">The release gate is blocked. No service should be promoted while current evidence cannot be verified.</p><button type="button" disabled={controlsBusy} onClick={() => void loadCurrent()}>Retry readiness check</button></div> : null}
          {readiness ? <div className={`subscription-band release-readiness-band status-${readiness.status}`} id="release-operations">
            <div className="readiness-heading"><div><p>Release operations</p><h2>Public release readiness</h2></div><span className="readiness-status" role="status">{readiness.status === "ready" ? "Ready for reviewed release" : "Release blocked"}</span></div>
            <p className="operational-note">A release remains fail-closed until all seven service objectives, nine time-limited operational attestations, incident review, usage reconciliation, and live registration authority pass together.</p>
            <div className="readiness-summary">
              <div><span>Environment</span><strong>{readiness.environment}</strong><small>{readiness.releaseVersion}</small></div>
              <div><span>Service objectives</span><strong>{readiness.services.filter((service) => service.passing).length}/{readiness.services.length}</strong><small>passing</small></div>
              <div><span>Attestations</span><strong>{readiness.attestations.filter((item) => item.passing).length}/{readiness.attestations.length}</strong><small>current</small></div>
              <div><span>Blocking incidents</span><strong>{readiness.incidents.blocking}</strong><small>major or critical</small></div>
              <div><span>Usage ledger</span><strong>{readiness.usage.passing ? "Healthy" : "Review"}</strong><small>{readiness.usage.status}</small></div>
              <div><span>Registration authority</span><strong>{readiness.registration.passing ? "Ready" : "Blocked"}</strong><small>{readiness.registration.passing ? `${readiness.registration.termsVersion} · ${readiness.registration.privacyVersion}` : "Approved bundle required"}</small></div>
            </div>
            <div className="readiness-service-grid">
              {readiness.services.map((service) => <article className={`readiness-service-card ${service.status}`} key={service.serviceKey}>
                <div><span className="readiness-dot" aria-hidden="true" /><strong>{service.publicLabel}</strong></div><span>{service.status}</span>
                {service.observation ? <small>{(service.observation.availabilityBasisPoints / 100).toFixed(2)}% availability · {service.observation.latencyP95Ms}ms P95</small> : <small>24-hour evidence required</small>}
                {!service.passing ? <em>{service.issues.join(" · ")}</em> : null}
              </article>)}
            </div>
            <div className="readiness-attestations" aria-label="Operational attestations">
              {readiness.attestations.map((item) => <div className={item.passing ? "passing" : "blocked"} key={item.kind}><strong>{item.kind.replaceAll("_", " ")}</strong><span>{item.passing ? "Current" : item.status}</span><small>{item.validUntil ? `Valid until ${new Date(item.validUntil).toLocaleString(currentIntlLocale())}` : "Evidence required"}</small></div>)}
            </div>
            <div className="readiness-authority"><strong>{user.role === "platform_owner" ? "Platform Owner" : user.role === "platform_support" ? "Support operations" : user.role === "platform_ai_operations" ? "AI operations" : "Platform Finance"}</strong><span>{user.role === "platform_owner" ? "Approve deployment only through the reviewed release workflow after this gate is ready."
              : user.role === "platform_support" ? "Keep on-call and support-runbook evidence current; escalate every blocking incident."
                : user.role === "platform_ai_operations" ? "Resolve failing runtime objectives without exposing internal routing to customer surfaces."
                  : "This technical gate does not authorize prices, invoices, tax, or payment collection."}</span><small>Checked {new Date(readiness.asOf).toLocaleString(currentIntlLocale())}</small></div>
          </div> : null}
          {reconciliationStage === "loading" && !reconciliation ? <div className="subscription-band reconciliation-band reconciliation-placeholder" id="usage-reconciliation" aria-live="polite">
            <div><p>Billing operations · restricted</p><h2>Checking usage reconciliation…</h2></div>
            <p className="operational-note">Comparing customer-unit balances with reservation and immutable event evidence.</p>
          </div> : null}
          {reconciliationStage === "error" ? <div className="subscription-band reconciliation-band status-attention reconciliation-placeholder" id="usage-reconciliation" role="alert">
            <div><p>Billing operations · restricted</p><h2>Usage reconciliation unavailable</h2></div>
            <p className="operational-note">No balance or billing state was changed. Treat the gate as not reconciled until the evidence can be loaded.</p>
            <button type="button" disabled={controlsBusy} onClick={() => void loadCurrent()}>Retry reconciliation</button>
          </div> : null}
          {reconciliation ? <div className={`subscription-band reconciliation-band status-${reconciliation.status}`} id="usage-reconciliation">
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
              <div><span>Provider attention</span><strong>{reconciliation.summary.providerAttentionResults + reconciliation.summary.unreconciledProviderEvents}</strong><small>{reconciliation.summary.openReconciliationCases} open cases</small></div>
            </div>
            <div className="reconciliation-authority">
              <strong>{user.role === "platform_finance" ? "Finance review" : "Platform Owner review"}</strong>
              <span>{user.role === "platform_finance"
                ? "Read-only evidence. Escalate a variance; never repair immutable usage or quota totals with direct SQL."
                : "Pause rollout expansion when a variance appears and use the documented idempotent recovery workflow."}</span>
              <small>As of {new Date(reconciliation.asOf).toLocaleString(currentIntlLocale())}</small>
            </div>
            <div className="platform-table reconciliation-table" role="list" aria-label="Usage reconciliation accounts">
              {reconciliation.accounts.map((account) => <div className={`platform-row reconciliation-row ${account.status}`} role="listitem" key={account.quotaAccountId}>
                <div><strong data-no-localize>{account.businessName}</strong><span><span data-no-localize>{account.publicName}</span> · {account.customerUnit.replaceAll("_", " ")}</span></div>
                <div><strong>{account.accountSettled}</strong><span>settled · {account.accountReserved} reserved</span></div>
                <div><strong>{account.status === "healthy" ? "Reconciled" : "Review"}</strong><span>{account.status === "healthy" ? "No variance" : `Settled ${account.settledVariance} · reserved ${account.reservedVariance} · event ${account.eventVariance}`}</span></div>
                <span>{new Date(account.periodStart).toLocaleDateString(currentIntlLocale())} – {new Date(account.periodEnd).toLocaleDateString(currentIntlLocale())}</span>
              </div>)}
              {!reconciliation.accounts.length ? <p className="empty-row" role="listitem">No quota accounts to reconcile</p> : null}
            </div>
            {reconciliation.summary.quotaAccounts > reconciliation.summary.displayedAccounts ? <small className="reconciliation-limit">Showing the {reconciliation.summary.displayedAccounts} highest-priority accounts. Aggregate checks cover all {reconciliation.summary.quotaAccounts} accounts.</small> : null}
            <div className="platform-table reconciliation-table provider-reconciliation-table" role="list" aria-label="Provider usage reconciliation attention">
              {reconciliation.providerResults.map((result) => <div className="platform-row provider-reconciliation-row attention" role="listitem" key={result.resultId}>
                <div><strong data-no-localize>{result.businessName}</strong><span>{result.providerKey} · {result.providerMeterKey}</span></div>
                <div><strong>{result.nativeQuantity} {result.nativeUnit}</strong><span>{result.status.replaceAll("_", " ")}</span></div>
                {result.caseId ? <div><strong>{result.requestedAction?.replaceAll("_", " ")}</strong><span>{result.caseStatus?.replaceAll("_", " ")}</span></div> : <form onSubmit={(event) => void requestUsageReconciliation(event, result)}>
                  <select name="action" defaultValue="investigate"><option value="investigate">Investigate</option><option value="correct_correlation">Correct correlation</option><option value="request_provider_credit">Request provider credit</option><option value="accept_provider_only">Accept provider-only event</option></select>
                  <input name="reason" minLength={8} maxLength={1000} defaultValue="Investigate missing customer usage correlation" required />
                  <button type="submit" disabled={controlsBusy}>Request review</button>
                </form>}
                <div className="row-actions">{result.caseId && result.caseStatus === "requested" ? <><button disabled={controlsBusy} onClick={() => void reviewUsageReconciliation(result.caseId!, true)}>Approve</button><button className="outline-button" disabled={controlsBusy} onClick={() => void reviewUsageReconciliation(result.caseId!, false)}>Reject</button></> : null}</div>
              </div>)}
              {!reconciliation.providerResults.length ? <p className="empty-row" role="listitem">No provider correlation failures</p> : null}
            </div>
          </div> : null}
          {financialReconciliation ? <div className={`subscription-band reconciliation-band status-${financialReconciliation.status}`} id="financial-reconciliation">
            <div className="reconciliation-heading">
              <div><p>Finance operations · restricted</p><h2>Stripe invoice reconciliation</h2></div>
              <span className="reconciliation-status" role="status">{financialReconciliation.status === "healthy" ? "Reconciled" : "Attention required"}</span>
            </div>
            <p className="operational-note">Immutable invoice evidence is compared with independently retrieved Stripe invoice state. Remediation requires a separate finance reviewer.</p>
            <div className="reconciliation-summary">
              <div><span>Checked</span><strong>{financialReconciliation.summary.total}</strong><small>provider snapshots</small></div>
              <div><span>Matched</span><strong>{financialReconciliation.summary.matched}</strong><small>exact normalized state</small></div>
              <div><span>Attention</span><strong>{financialReconciliation.summary.attention}</strong><small>review required</small></div>
            </div>
            <div className="platform-table reconciliation-table" role="list" aria-label="Stripe invoice reconciliation">
              {financialReconciliation.results.map((result) => <div className={`platform-row provider-reconciliation-row ${result.status === "matched" ? "healthy" : "attention"}`} role="listitem" key={result.resultId}>
                <div><strong data-no-localize>{result.businessName}</strong><span>Invoice {result.externalInvoiceRef}</span></div>
                <div><strong>{result.status.replaceAll("_", " ")}</strong><span>{Object.keys(result.differences).length ? Object.keys(result.differences).join(", ") : "No difference"}</span></div>
                {result.status === "matched" ? <span>Reconciled {new Date(result.reconciledAt).toLocaleString(currentIntlLocale())}</span>
                  : result.caseId ? <div><strong>{result.requestedAction?.replaceAll("_", " ")}</strong><span>{result.reviewStatus ?? "review requested"}</span></div>
                    : <form onSubmit={(event) => void requestFinancialReconciliation(event, result.resultId)}>
                      <select name="action" defaultValue="investigate"><option value="investigate">Investigate</option><option value="retry_provider_retrieval">Retry retrieval</option><option value="request_stripe_correction">Request Stripe correction</option><option value="issue_customer_credit">Issue customer credit</option></select>
                      <input name="reason" minLength={8} maxLength={1000} defaultValue="Investigate Stripe invoice reconciliation difference" required />
                      <button type="submit" disabled={controlsBusy}>Request review</button>
                    </form>}
                <div className="row-actions">{result.caseId && !result.reviewStatus ? <><button type="button" disabled={controlsBusy} onClick={() => void reviewFinancialReconciliation(result.caseId!, true)}>Approve</button><button className="outline-button" type="button" disabled={controlsBusy} onClick={() => void reviewFinancialReconciliation(result.caseId!, false)}>Reject</button></> : null}</div>
              </div>)}
              {!financialReconciliation.results.length ? <p className="empty-row" role="listitem">No Stripe invoices have been reconciled</p> : null}
            </div>
          </div> : null}
          {financialEventReconciliation ? <div className={`subscription-band reconciliation-band status-${financialEventReconciliation.status}`} id="financial-event-reconciliation">
            <div className="reconciliation-heading"><div><p>Finance operations · restricted</p><h2>Stripe payment, refund and credit reconciliation</h2></div>
              <span className="reconciliation-status" role="status">{financialEventReconciliation.status === "healthy" ? "Reconciled" : "Attention required"}</span></div>
            <p className="operational-note">Payments, refunds and credit notes are independently retrieved and compared with immutable local evidence. Corrections require a separate reviewer.</p>
            <div className="reconciliation-summary">
              <div><span>Checked</span><strong>{financialEventReconciliation.summary.total}</strong><small>provider events</small></div>
              <div><span>Matched</span><strong>{financialEventReconciliation.summary.matched}</strong><small>exact normalized state</small></div>
              <div><span>Attention</span><strong>{financialEventReconciliation.summary.attention}</strong><small>review required</small></div>
            </div>
            <div className="platform-table reconciliation-table" role="list" aria-label="Stripe financial event reconciliation">
              {financialEventReconciliation.results.map((result) => <div className={`platform-row provider-reconciliation-row ${result.status === "matched" ? "healthy" : "attention"}`} role="listitem" key={result.resultId}>
                <div><strong data-no-localize>{result.businessName}</strong><span>{result.evidenceKind.replaceAll("_", " ")} {result.externalRef}</span></div>
                <div><strong>{result.status.replaceAll("_", " ")}</strong><span>{Object.keys(result.differences).length ? Object.keys(result.differences).join(", ") : "No difference"}</span></div>
                {result.status === "matched" ? <span>Reconciled {new Date(result.reconciledAt).toLocaleString(currentIntlLocale())}</span>
                  : result.caseId ? <div><strong>{result.requestedAction?.replaceAll("_", " ")}</strong><span>{result.reviewStatus ?? "review requested"}</span></div>
                    : <form onSubmit={(event) => void requestFinancialEventReconciliation(event, result.resultId)}>
                      <select name="action" defaultValue="investigate"><option value="investigate">Investigate</option><option value="retry_provider_retrieval">Retry retrieval</option><option value="request_stripe_correction">Request Stripe correction</option><option value="issue_customer_credit">Issue customer credit</option></select>
                      <input name="reason" minLength={8} maxLength={1000} defaultValue="Investigate Stripe financial event difference" required />
                      <button type="submit" disabled={controlsBusy}>Request review</button>
                    </form>}
                <div className="row-actions">{result.caseId && !result.reviewStatus ? <><button type="button" disabled={controlsBusy} onClick={() => void reviewFinancialEventReconciliation(result.caseId!, true)}>Approve</button><button className="outline-button" type="button" disabled={controlsBusy} onClick={() => void reviewFinancialEventReconciliation(result.caseId!, false)}>Reject</button></> : null}</div>
              </div>)}
              {!financialEventReconciliation.results.length ? <p className="empty-row" role="listitem">No payment, refund or credit evidence has been reconciled</p> : null}
            </div>
          </div> : null}
          {accountingReconciliation ? <div className={`subscription-band reconciliation-band status-${accountingReconciliation.status}`} id="accounting-reconciliation">
            <div className="reconciliation-heading">
              <div><p>Finance operations · restricted</p><h2>FlowAccount reconciliation</h2></div>
              <span className="reconciliation-status" role="status">{accountingReconciliation.status === "healthy" ? "Reconciled" : "Attention required"}</span>
            </div>
            <p className="operational-note">Daily remote evidence is compared with immutable local invoices and credits. Provider state cannot overwrite the local accounting ledger.</p>
            <div className="reconciliation-summary">
              <div><span>Checked</span><strong>{accountingReconciliation.summary.total}</strong><small>remote snapshots</small></div>
              <div><span>Matched</span><strong>{accountingReconciliation.summary.matched}</strong><small>exact local evidence</small></div>
              <div><span>Attention</span><strong>{accountingReconciliation.summary.attention}</strong><small>review required</small></div>
            </div>
            <div className="platform-table reconciliation-table" role="list" aria-label="FlowAccount reconciliation">
              {accountingReconciliation.results.map((result) => <div className={`platform-row provider-reconciliation-row ${result.status === "matched" ? "healthy" : "attention"}`} role="listitem" key={result.resultId}>
                <div><strong data-no-localize>{result.businessName}</strong><span>{result.documentKind.replaceAll("_", " ")} {result.externalDocumentRef ?? "reference pending"}</span></div>
                <div><strong>{result.status.replaceAll("_", " ")}</strong><span>{Object.keys(result.differences).length ? Object.keys(result.differences).join(", ") : "No difference"}</span></div>
                {result.status === "matched" ? <span>Reconciled {new Date(result.reconciledAt).toLocaleString(currentIntlLocale())}</span>
                  : result.caseId ? <div><strong>{result.requestedAction?.replaceAll("_", " ")}</strong><span>{result.reviewStatus ?? "review requested"}</span></div>
                    : <form onSubmit={(event) => void requestAccountingReconciliation(event, result.resultId)}>
                      <select name="action" defaultValue="investigate"><option value="investigate">Investigate</option><option value="retry_retrieval">Retry retrieval</option><option value="request_flowaccount_correction">Request FlowAccount correction</option><option value="credit_and_replace">Credit and replace</option></select>
                      <input name="reason" minLength={8} maxLength={1000} defaultValue="Investigate FlowAccount reconciliation difference" required />
                      <button type="submit" disabled={controlsBusy}>Request review</button>
                    </form>}
                <div className="row-actions">{result.caseId && !result.reviewStatus ? <><button type="button" disabled={controlsBusy} onClick={() => void reviewAccountingReconciliation(result.caseId!, true)}>Approve</button><button className="outline-button" type="button" disabled={controlsBusy} onClick={() => void reviewAccountingReconciliation(result.caseId!, false)}>Reject</button></> : null}</div>
              </div>)}
              {!accountingReconciliation.results.length ? <p className="empty-row" role="listitem">No FlowAccount documents have been reconciled</p> : null}
            </div>
          </div> : null}
          {["platform_owner", "platform_finance"].includes(user.role) ? <div className="subscription-band reconciliation-band" id="subscription-dunning">
            <div className="reconciliation-heading"><div><p>Billing policy · restricted</p><h2>Subscription dunning</h2></div>
              <span className="reconciliation-status" role="status">{dunningPolicies.find((policy) => policy.status === "active") ? "Active policy" : "Enforcement disabled"}</span></div>
            <p className="operational-note">Payment-failure grace and restriction timing remains disabled until a different Platform Owner approves a versioned policy.</p>
            {user.role === "platform_owner" ? <form className="support-request-form" onSubmit={requestDunningPolicy}>
              <label>Grace period hours<input name="gracePeriodHours" type="number" min="0" max="2160" required /></label>
              <label>Restrict after hours<input name="restrictAfterHours" type="number" min="0" max="4320" required /></label>
              <label>Notice offsets<input name="noticeOffsets" inputMode="numeric" placeholder="0, 24, 72" required /></label>
              <label>Policy reason<input name="reason" minLength={8} maxLength={1000} required /></label>
              <button type="submit" disabled={controlsBusy}>Request policy</button>
            </form> : null}
            <div className="platform-table" role="list" aria-label="Subscription dunning policies">
              {dunningPolicies.map((policy) => <div className="platform-row provider-reconciliation-row" role="listitem" key={policy.id}>
                <div><strong>Version {policy.version} · {policy.status.replaceAll("_", " ")}</strong><span>{policy.reason}</span></div>
                <div><strong>{policy.gracePeriodHours}h grace</strong><span>restrict after {policy.restrictAfterHours}h</span></div>
                <span>Notices {policy.customerNoticeOffsetsHours.length ? policy.customerNoticeOffsetsHours.map((hours) => `${hours}h`).join(", ") : "none"}</span>
                <div className="row-actions">{user.role === "platform_owner" && policy.status === "pending_review" ? <>
                  <button type="button" disabled={controlsBusy || policy.requestedByPlatformUserId === user.id} onClick={() => void reviewDunningPolicy(policy.id, true)}>Activate</button>
                  <button className="outline-button" type="button" disabled={controlsBusy || policy.requestedByPlatformUserId === user.id} onClick={() => void reviewDunningPolicy(policy.id, false)}>Reject</button>
                </> : null}</div>
              </div>)}
              {!dunningPolicies.length ? <p className="empty-row" role="listitem">No dunning policy has been approved</p> : null}
            </div>
          </div> : null}
          {["platform_owner", "platform_finance"].includes(user.role) ? <div className="subscription-band reconciliation-band" id="webhook-recovery">
            <div className="reconciliation-heading"><div><p>Billing recovery · restricted</p><h2>Stripe webhook authority</h2></div>
              <span className="reconciliation-status" role="status">{webhookRecovery.some((item) => ["attention", "failed"].includes(item.status)) ? "Attention required" : "No unresolved evidence"}</span></div>
            <p className="operational-note">Ignored subscription events are independently retrieved from Stripe. Replay or acceptance requires a different reviewer; payload evidence remains encrypted.</p>
            <div className="platform-table" role="list" aria-label="Stripe webhook recovery">
              {webhookRecovery.map((item) => <div className="platform-row provider-reconciliation-row attention" role="listitem" key={item.jobId}>
                <div><strong>{item.eventType}</strong><span>{item.reasonCode.replaceAll("_", " ")} · event …{item.externalEventId.slice(-8)}</span></div>
                <div><strong>{item.status}</strong><span>{item.providerEvidenceCount} provider evidence snapshot{item.providerEvidenceCount === 1 ? "" : "s"}</span></div>
                {item.caseId ? <div><strong>{item.requestedAction?.replaceAll("_", " ")}</strong><span>{item.reviewStatus ?? "review requested"}</span></div>
                  : user.role === "platform_owner" && item.status === "attention" ? <form onSubmit={(event) => void requestWebhookRecovery(event, item.jobId)}>
                    <select name="action" defaultValue="retry_application"><option value="retry_application">Retry application</option><option value="accept_unsupported">Accept unsupported</option><option value="escalate_provider">Escalate provider</option></select>
                    <input name="reason" minLength={8} maxLength={1000} defaultValue="Review independently confirmed Stripe event authority" required />
                    <button type="submit" disabled={controlsBusy}>Request review</button>
                  </form> : <span>{new Date(item.occurredAt).toLocaleString(currentIntlLocale())}</span>}
                <div className="row-actions">{user.role === "platform_owner" && item.caseId && !item.reviewStatus ? <>
                  <button type="button" disabled={controlsBusy || item.requestedByPlatformUserId === user.id} onClick={() => void reviewWebhookRecovery(item.caseId!, true)}>Approve</button>
                  <button className="outline-button" type="button" disabled={controlsBusy || item.requestedByPlatformUserId === user.id} onClick={() => void reviewWebhookRecovery(item.caseId!, false)}>Reject</button>
                </> : null}</div>
              </div>)}
              {!webhookRecovery.length ? <p className="empty-row" role="listitem">No ignored Stripe events require recovery</p> : null}
            </div>
          </div> : null}
          {voiceControl ? <div className={`subscription-band voice-control-band mode-${voiceControl.mode}`} id="voice-operations">
            <div><p>Voice operations</p><h2>Runtime admission and recovery</h2></div>
            <div className="voice-control-summary">
              <div><span>Mode</span><strong>{voiceControl.mode.replaceAll("_", " ")}</strong><small>{voiceControl.reasonCode.replaceAll("_", " ")}</small></div>
              <div><span>Active</span><strong>{voiceControl.activeSessions}</strong><small>{voiceControl.reconnectingSessions} reconnecting</small></div>
              <div><span>Recovery queue</span><strong>{voiceControl.expiredGrants + voiceControl.staleConnections}</strong><small>{voiceControl.staleConnections} stale connections</small></div>
            </div>
            <label className="voice-reason" htmlFor="voice-runtime-reason">Operational reason<input {...voiceRuntimeReasonFieldConstraints} id="voice-runtime-reason" ref={voiceReasonRef} value={voiceReason} aria-describedby={voiceReasonIssue ? "voice-runtime-reason-error" : undefined} aria-invalid={Boolean(voiceReasonIssue)} onChange={(event) => { setVoiceReason(event.target.value); if (voiceReasonIssue) setVoiceReasonIssue(""); event.currentTarget.setCustomValidity(""); }} />{voiceReasonIssue ? <span className="voice-reason-error" id="voice-runtime-reason-error" role="alert">{voiceReasonIssue}</span> : null}</label>
            <div className="voice-control-actions">
              <button type="button" disabled={controlsBusy || voiceControl.mode === "running"} onClick={() => void changeVoiceMode("running")}>Resume admission</button>
              <button className="outline-button" type="button" disabled={controlsBusy || voiceControl.mode === "paused"} onClick={() => void changeVoiceMode("paused")}>Pause new sessions</button>
              <button className="danger-button" type="button" disabled={controlsBusy || voiceControl.mode === "emergency_stop"} onClick={() => void changeVoiceMode("emergency_stop")}>Emergency stop</button>
            </div>
            <small>Version {voiceControl.version} · changed {new Date(voiceControl.changedAt).toLocaleString(currentIntlLocale())}</small>
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
              <form onSubmit={proposeVoiceCandidate}><h3>1. Propose route</h3><label>Provider key<input name="providerKey" pattern="[a-z0-9][a-z0-9._-]{1,79}" required /></label><label>Model key<input name="modelKey" minLength={2} maxLength={160} required /></label><label>Region key<input name="regionKey" pattern="[a-z0-9][a-z0-9._-]{1,79}" required /></label><button disabled={controlsBusy} type="submit">Submit candidate</button></form>
              <form onSubmit={reviewVoiceCandidate}><h3>2. Independent qualification</h3><label>Proposed candidate<select name="candidateId" required defaultValue=""><option value="" disabled>Select candidate</option>{voiceRouting.candidates.filter((candidate) => candidate.status === "proposed").map((candidate) => <option key={candidate.id} value={candidate.id} disabled={candidate.proposedByPlatformUserId === user.id}>{candidate.providerKey} / {candidate.modelKey}{candidate.proposedByPlatformUserId === user.id ? " · another reviewer required" : ""}</option>)}</select></label><label>Decision<select name="decision" defaultValue="qualify"><option value="qualify">Qualify</option><option value="reject">Reject</option></select></label><label>Qualification evidence SHA-256<input name="evidenceSha256" pattern="[a-fA-F0-9]{64}" minLength={64} maxLength={64} required /></label><button disabled={controlsBusy} type="submit">Record review</button></form>
              <form onSubmit={requestVoiceChange}><h3>3. Request canary</h3><label>Qualified candidate<select name="candidateId" required defaultValue=""><option value="" disabled>Select candidate</option>{voiceRouting.candidates.filter((candidate) => candidate.status === "qualified").map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.providerKey} / {candidate.modelKey}</option>)}</select></label><label>Canary percent<input name="canaryPercent" type="number" min={1} max={100} defaultValue={10} required /></label><label>Operational reason<input name="reason" minLength={12} maxLength={500} required /></label><label>Evaluation evidence SHA-256<input name="evidenceSha256" pattern="[a-fA-F0-9]{64}" minLength={64} maxLength={64} required /></label><button disabled={controlsBusy} type="submit">Request change</button></form>
            </div>
            <label className="voice-reason" htmlFor="voice-routing-action-reason">Action reason<input {...voiceRoutingActionReasonFieldConstraints} id="voice-routing-action-reason" ref={routingActionReasonRef} value={routingActionReason} aria-describedby={routingActionReasonIssue ? "voice-routing-action-reason-error" : undefined} aria-invalid={Boolean(routingActionReasonIssue)} onChange={(event) => { setRoutingActionReason(event.target.value); if (routingActionReasonIssue) setRoutingActionReasonIssue(""); event.currentTarget.setCustomValidity(""); }} />{routingActionReasonIssue ? <span className="voice-reason-error" id="voice-routing-action-reason-error" role="alert">{routingActionReasonIssue}</span> : null}</label>
            <div className="platform-table" role="list" aria-label="Advanced Voice routing changes">
              {voiceRouting.changes.map((change) => <div className="platform-row voice-route-row" role="listitem" key={change.id}><div><strong>{voiceRouting.candidates.find((candidate) => candidate.id === change.candidateId)?.modelKey || change.candidateId}</strong><span>{change.reason} · {change.canaryPercent}% canary</span></div><span>{change.status.replaceAll("_", " ")}</span><div className="row-actions">{change.status === "requested" ? <><button disabled={controlsBusy || change.requestedByPlatformUserId === user.id} onClick={() => void reviewVoiceChange(change.id, "approve")}>Approve</button><button className="outline-button" disabled={controlsBusy || change.requestedByPlatformUserId === user.id} onClick={() => void reviewVoiceChange(change.id, "reject")}>Reject</button></> : null}{change.status === "approved" ? <button disabled={controlsBusy} onClick={() => void applyVoiceChange(change.id, "start_canary")}>Start canary</button> : null}{change.status === "canary" ? <><button disabled={controlsBusy} onClick={() => void applyVoiceChange(change.id, "promote")}>Promote</button><button className="outline-button" disabled={controlsBusy} onClick={() => void applyVoiceChange(change.id, "rollback")}>Rollback</button></> : null}{change.status === "active" ? <button className="danger-button" disabled={controlsBusy} onClick={() => void applyVoiceChange(change.id, "rollback")}>Rollback</button> : null}</div></div>)}
              {!voiceRouting.changes.length ? <p className="empty-row" role="listitem">No routing changes</p> : null}
            </div>
            <div className="voice-governance-grid admission-governance-grid">
              <form onSubmit={requestVoiceAdmission}><h3>4. Production admission</h3><label>Requested state<select name="enabled" defaultValue={voiceRouting.admissionEnabled ? "false" : "true"}><option value="true">Enable production traffic</option><option value="false">Disable production traffic</option></select></label><label>Acceptance reason<input name="reason" minLength={12} maxLength={500} required /></label><label>Acceptance evidence SHA-256<input name="evidenceSha256" pattern="[a-fA-F0-9]{64}" minLength={64} maxLength={64} required /></label><button disabled={controlsBusy} type="submit">Request admission change</button></form>
              <div className="platform-table" role="list" aria-label="Advanced Voice admission changes">{voiceRouting.admissionChanges.map((change) => <div className="platform-row voice-route-row" role="listitem" key={change.id}><div><strong>{change.targetEnabled ? "Enable" : "Disable"} admission</strong><span>{change.reason}</span></div><span>{change.status}</span><div className="row-actions">{change.status === "requested" ? <><button disabled={controlsBusy || change.requestedByPlatformUserId === user.id} onClick={() => void reviewVoiceAdmission(change.id, "approve")}>Approve</button><button className="outline-button" disabled={controlsBusy || change.requestedByPlatformUserId === user.id} onClick={() => void reviewVoiceAdmission(change.id, "reject")}>Reject</button></> : null}{change.status === "approved" ? <button className={change.targetEnabled ? "danger-button" : undefined} disabled={controlsBusy} onClick={() => void applyVoiceAdmission(change.id, change.targetEnabled)}>{change.targetEnabled ? "Enable traffic" : "Disable traffic"}</button> : null}</div></div>)}{!voiceRouting.admissionChanges.length ? <p className="empty-row" role="listitem">No admission changes</p> : null}</div>
            </div>
            <form className="incident-open-form" onSubmit={openVoiceIncident}><h3>Open incident</h3><label>Severity<select name="severity" defaultValue="major"><option value="minor">Minor · degraded</option><option value="major">Major · pause</option><option value="critical">Critical · pause</option></select></label><label>Related change<select name="routingChangeId" defaultValue=""><option value="">No related change</option>{voiceRouting.changes.map((change) => <option key={change.id} value={change.id}>{change.status} · {change.reason}</option>)}</select></label><label>Incident reason<input name="reason" minLength={12} maxLength={1000} required /></label><label className="checkbox-label"><input name="creditReviewRequired" type="checkbox" />Credit review required</label><button disabled={controlsBusy} type="submit">Open and safeguard</button></form>
          </div> : null}
          {voiceIncidents ? <div className="subscription-band incident-band">
            <div><p>Advanced Voice</p><h2>Incident and credit review</h2></div>
            <div className="platform-table" role="list" aria-label="Advanced Voice incidents">{voiceIncidents.map((incident) => <div className="platform-row incident-row" role="listitem" key={incident.id}><div><strong>{incident.severity} · {incident.status}</strong><span>{incident.reason}</span></div><span>{incident.creditReviewStatus.replaceAll("_", " ")}</span><div className="row-actions">{incident.creditReviewStatus === "required" && ["platform_owner", "platform_finance"].includes(user.role) ? <><button disabled={controlsBusy || incident.openedByPlatformUserId === user.id} onClick={() => void reviewVoiceCredit(incident.id, "approve")}>Approve credit review</button><button className="outline-button" disabled={controlsBusy || incident.openedByPlatformUserId === user.id} onClick={() => void reviewVoiceCredit(incident.id, "reject")}>Reject</button></> : null}{incident.status !== "resolved" && ["platform_owner", "platform_ai_operations"].includes(user.role) ? <button disabled={controlsBusy} onClick={() => { clearMessage(); setResolvingIncidentId(incident.id); }}>Resolve</button> : null}</div>{resolvingIncidentId === incident.id ? <VoiceIncidentResolutionForm incidentId={incident.id} severity={incident.severity} working={controlsBusy} onResolve={(resolution) => resolveVoiceIncident(incident.id, resolution)} onCancel={() => setResolvingIncidentId(null)} /> : null}</div>)}{!voiceIncidents.length ? <p className="empty-row" role="listitem">No Advanced Voice incidents</p> : null}</div>
          </div> : null}
          {health?.socialChannels?.length ? <div className="subscription-band"><div><p>AI Chat operations</p><h2>Social channel health</h2></div><div className="platform-table" role="list" aria-label="Social channel health">{health.socialChannels.map((channel) => <div className="platform-row" role="listitem" key={channel.channel}><div><strong>{channel.channel === "line" ? "LINE" : channel.channel === "whatsapp" ? "WhatsApp" : "Messenger"}</strong><span>{channel.activeConnections} active / {channel.reauthorizationRequired} reauthorization</span></div><span>{channel.queuedInbound} inbound queued / {channel.oldestInboundQueueSeconds}s oldest</span><span>{channel.queuedDeliveries} delivery queued / {channel.oldestDeliveryQueueSeconds}s oldest</span><span>{channel.deadLetterInbound + channel.deadLetterDeliveries} dead letters / {channel.failedAttempts24h} failed attempts</span></div>)}</div></div> : null}
          {recoveryStage === "loading" && !recovery ? <div className="subscription-band recovery-band" id="queue-recovery" aria-busy="true"><div><p>Queue recovery · restricted</p><h2>Loading reviewed recovery</h2></div><p className="operational-note">Checking replay eligibility and independent-review state.</p></div> : null}
          {recoveryStage === "error" ? <div className="subscription-band recovery-band" id="queue-recovery"><div><p>Queue recovery · restricted</p><h2>Recovery controls unavailable</h2></div><p className="operational-note" role="alert">Failing closed. Do not use direct SQL; restore the recovery service and retry this read.</p><button type="button" disabled={controlsBusy} onClick={() => void loadCurrent()}>Retry recovery controls</button></div> : null}
          {recoveryStage !== "error" && recovery ? <div className="subscription-band recovery-band" id="queue-recovery" aria-busy={recoveryStage === "loading"}>
            <div><p>Queue recovery · restricted</p><h2>Reviewed dead-letter replay</h2></div>
            <p className="operational-note">Only email deliveries with our durable idempotency key are eligible. FlowBot webhooks and social queues remain blocked for root-cause review because an external side effect cannot be proven safe to repeat.</p>
            <div className="voice-control-summary recovery-summary">
              <div><span>Eligible</span><strong>{recovery.recoverable.length}</strong><small>safe email dead letters</small></div>
              <div><span>Awaiting review</span><strong>{recovery.requests.filter((request) => request.status === "requested").length}</strong><small>different owner required</small></div>
              <div><span>Excluded</span><strong>{recovery.policy.excludedQueueKinds.length}</strong><small>non-idempotent queue classes</small></div>
            </div>
            {recovery.recoverable.length ? <form className="support-request-form recovery-request-form" onSubmit={requestRecovery}>
              <label>Eligible dead letter<select name="recoveryTarget" required defaultValue=""><option value="" disabled>Select an opaque queue item</option>{recovery.recoverable.map((item) => <option key={`${item.queueKind}:${item.itemId}`} value={`${item.queueKind}|${item.itemId}|${item.attemptCount}`}>{item.queueKind.replaceAll("_", " ")} · …{item.itemId.slice(-8)} · attempt {item.attemptCount}</option>)}</select></label>
              <label>Root-cause and replay reason<input name="reason" minLength={12} maxLength={500} required placeholder="Cause corrected; approve one idempotent retry" /></label>
              <button type="submit" disabled={controlsBusy}>Request replay</button>
            </form> : <p className="empty-row">No eligible email dead letters</p>}
            <div className="platform-table" role="list" aria-label="Dead-letter recovery requests">
              {recovery.requests.map((request) => <div className="platform-row recovery-row" role="listitem" key={request.recordId}>
                <div><strong>{request.queueKind.replaceAll("_", " ")} · …{request.itemId.slice(-8)}</strong><span>{request.reason}</span></div>
                <span>{request.status}</span><span>Attempt {request.attemptCount} · {new Date(request.occurredAt).toLocaleString(currentIntlLocale())}</span>
                <div className="row-actions">{user.role === "platform_owner" && request.status === "requested" ? <><button type="button" disabled={controlsBusy || request.requestedByPlatformUserId === user.id} onClick={() => void reviewRecovery(request.recordId, "approve")}>Approve one retry</button><button className="outline-button" type="button" disabled={controlsBusy || request.requestedByPlatformUserId === user.id} onClick={() => void reviewRecovery(request.recordId, "reject")}>Reject</button></> : null}</div>
              </div>)}
              {!recovery.requests.length ? <p className="empty-row" role="listitem">No recovery requests</p> : null}
            </div>
            <small>Payloads, recipients, tenant identifiers, credentials, providers, and models are never exposed here. Every request and review is immutable audit evidence.</small>
          </div> : null}
          {commerce ? <div className="subscription-band" id="commerce">
            <div><p>Commerce</p><h2>Product subscriptions</h2></div>
            <div className="platform-table" role="list" aria-label="Product subscriptions">
              {subscriptions.map((subscription) => (
                <div className="platform-row" role="listitem" key={subscription.id}>
                  <div><strong data-no-localize>{subscription.businessName}</strong><span data-no-localize>{subscription.publicName}</span></div>
                  <span>{subscription.status.replaceAll("_", " ")}</span>
                  {user.role === "platform_owner" && subscription.status === "pending" ? (
                    <button type="button" disabled={controlsBusy} onClick={() => void activate(subscription.id)}>Activate pilot</button>
                  ) : <span />}
                </div>
              ))}
              {!subscriptions.length && !resourceErrors.includes("Product subscriptions") ? <p className="empty-row" role="listitem">No product subscriptions</p> : null}
            </div>
          </div> : null}
          {sharedOperations ? <div className="subscription-band fulfillment-band" id="fulfillment">
            <div className="readiness-heading"><div><p>Merchant operations</p><h2>Add-on and service fulfillment</h2></div><span className="readiness-status">{sharedOperations.addOns.length + sharedOperations.services.length + sharedOperations.engagements.length} open</span></div>
            <p className="operational-note">Customer requests do not change product access. Add-ons become effective only after reviewed provisioning; professional services become trackable engagements with a named next-action owner.</p>
            <h3>Add-on requests</h3>
            <div className="platform-table" role="list" aria-label="Add-on fulfillment requests">
              {sharedOperations.addOns.map((request) => <div className="platform-row fulfillment-row" role="listitem" key={request.id}>
                <div><strong data-no-localize>{request.businessName}</strong><span>{request.addOnKey.replaceAll("_", " ")} · quantity {request.quantity}</span></div>
                <span>{request.status}</span><span>{new Date(request.createdAt).toLocaleString(currentIntlLocale())}</span>
                <div className="row-actions">{user.role === "platform_owner" ? <button type="button" disabled={controlsBusy} onClick={() => void provisionSharedAddOn(request.id)}>Provision</button> : null}</div>
              </div>)}
              {!sharedOperations.addOns.length ? <p className="empty-row" role="listitem">No open add-on requests</p> : null}
            </div>
            <h3>Professional service requests</h3>
            <div className="platform-table" role="list" aria-label="Professional service requests">
              {sharedOperations.services.map((request) => <div className="platform-row fulfillment-service-row" role="listitem" key={request.id}>
                <div><strong data-no-localize>{request.businessName}</strong><span>{request.serviceKind.replaceAll("_", " ")} · {request.productKey?.replaceAll("_", " ") || "workspace"}</span></div>
                <span>{request.status}</span><span>{new Date(request.createdAt).toLocaleString(currentIntlLocale())}</span>
                {["platform_owner", "platform_support"].includes(user.role) ? <form onSubmit={(event) => void createServiceEngagement(event, request.id)}>
                  <label>Engagement title<input name="title" minLength={3} maxLength={200} required /></label>
                  <label>Delivery scope<textarea name="scope" minLength={20} maxLength={20000} rows={2} required /></label>
                  <label>Next action<select name="nextActionOwner" defaultValue="djai"><option value="djai">DJAI</option><option value="customer">Customer</option><option value="shared">Shared</option></select></label>
                  <button disabled={controlsBusy}>Create engagement</button>
                </form> : null}
              </div>)}
              {!sharedOperations.services.length ? <p className="empty-row" role="listitem">No open service requests</p> : null}
            </div>
            <h3>Active service engagements</h3>
            <div className="platform-table" role="list" aria-label="Active professional service engagements">
              {sharedOperations.engagements.map((engagement) => <div className="platform-row fulfillment-service-row" role="listitem" key={engagement.id}>
                <div><strong data-no-localize>{engagement.businessName}</strong><span><span data-no-localize>{engagement.title}</span> · next action {engagement.nextActionOwner}</span></div>
                <span>{engagement.status}</span><span>{new Date(engagement.updatedAt).toLocaleString(currentIntlLocale())}</span>
                {(["platform_owner", "platform_support"] as string[]).includes(user.role) ? <form onSubmit={(event) => void updateServiceEngagement(event, engagement.id)}>
                  <label>Status<select name="status" defaultValue={engagement.status}><option value="awaiting_customer">Awaiting customer</option><option value="scheduled">Scheduled</option><option value="in_progress">In progress</option><option value="review">Review</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label>
                  <label>Customer-visible update<textarea name="body" minLength={2} maxLength={5000} rows={2} required /></label>
                  <label>Next action<select name="nextActionOwner" defaultValue={engagement.nextActionOwner}><option value="djai">DJAI</option><option value="customer">Customer</option><option value="shared">Shared</option></select></label>
                  <button disabled={controlsBusy}>Save update</button>
                </form> : null}
              </div>)}
              {!sharedOperations.engagements.length ? <p className="empty-row" role="listitem">No active service engagements</p> : null}
            </div>
          </div> : null}
          <div className="subscription-band support-band" id="support-access">
            <div><p>Controlled support</p><h2>Time-limited tenant access grants</h2></div>
            {(user.role === "platform_owner" || user.role === "platform_support") && tenants.length ? <form className="support-request-form" onSubmit={requestSupport}>
              <label>Tenant<select name="tenantId" required defaultValue=""><option value="" disabled>Select tenant</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.businessName}</option>)}</select></label>
              <label>Reason<input name="reason" minLength={12} maxLength={500} required /></label>
              <label>Duration<select name="durationMinutes" defaultValue="60"><option value="30">30 minutes</option><option value="60">1 hour</option><option value="120">2 hours</option><option value="240">4 hours</option></select></label>
              <button type="submit" disabled={controlsBusy}>Request</button>
            </form> : null}
            <div className="platform-table" role="list" aria-label="Support access grants">
              {supportGrants.map((grant) => <div className="platform-row support-row" role="listitem" key={grant.id}>
                <div><strong data-no-localize>{grant.businessName}</strong><span data-no-localize>{grant.reason}</span></div><span>{grant.status}</span><span>{new Date(grant.expiresAt).toLocaleString(currentIntlLocale())}</span>
                <div className="row-actions">{user.role === "platform_owner" && grant.status === "requested" ? <button type="button" disabled={controlsBusy || grant.requestedByPlatformUserId === user.id} onClick={() => void decideSupport(grant.id, "approve")}>Approve</button> : null}{user.role === "platform_owner" && ["requested", "approved", "active"].includes(grant.status) ? <button className="outline-button" type="button" disabled={controlsBusy} onClick={() => void decideSupport(grant.id, "revoke")}>Revoke</button> : null}</div>
              </div>)}
              {!supportGrants.length && !resourceErrors.includes("Support access grants") ? <p className="empty-row" role="listitem">No support access grants</p> : null}
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
            <button type="submit" disabled={controlsBusy}>{working ? "Verifying..." : "Verify"}</button>
          </form>
        ) : (
          <form onSubmit={passwordLogin}>
            <label>Platform email<input type="email" name="email" autoComplete="email" {...emailFieldConstraints} required /></label>
            <label>Password<input type="password" name="password" autoComplete="current-password" maxLength={128} required /></label>
            <button type="submit" disabled={controlsBusy}>{working ? "Checking..." : "Continue"}</button>
          </form>
        )}
        {message ? <div className={`platform-message ${messageTone}`} role={messageTone === "error" ? "alert" : "status"}>{message}</div> : null}
        <small>Multi-factor verification is required.</small>
      </section>
    </main>
  );
}
