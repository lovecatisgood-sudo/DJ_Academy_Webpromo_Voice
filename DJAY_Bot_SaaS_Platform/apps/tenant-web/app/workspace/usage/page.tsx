"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { currentIntlLocale, currentUiLocale, safeMutationFetch, uiCopy } from "@djay/shared";
import { WorkspaceSidebar } from "../WorkspaceSidebar";
import { WorkspaceSessionLoadError } from "../WorkspaceAccess";
import { useWorkspaceSession } from "../useWorkspaceSession";
import { resolveCheckoutReturnState, type CheckoutReturnState } from "../../../lib/checkout-return-state";
import { resolveChromeLocale, setupChrome } from "../../../lib/i18n/setup-chrome";
import { humanizePlanKey, humanizeToken } from "../../../lib/workspace-labels";

type CustomerUnit = "flow_execution" | "ai_response" | "voice_minute";
type CatalogPlan = {
  planKey: string;
  productKey: "flowbot" | "ai_chat" | "voice";
  publicName: string;
  tierName: string;
  summary: string;
  sellable: boolean;
  firstTermAmountMinor: number;
  renewalAmountMinor: number;
  publicHighlights: string[];
};
type UsageSubscription = {
  subscriptionId: string;
  productKey: "flowbot" | "ai_chat" | "voice";
  planKey: string;
  publicName: string;
  tierName: string;
  status: string;
  trialStatus: "active" | "expired" | "exhausted" | null;
  accessMode: "none" | "read_only" | "active";
  customerUnit: CustomerUnit;
  periodStart: string;
  periodEnd: string;
  cancelAt: string | null;
  cancellationStatus: "prepared" | "scheduled" | "revoked" | "applied" | "failed" | null;
  includedQuantity: number | null;
  safetyCapQuantity: number | null;
  reservedQuantity: number;
  settledQuantity: number;
  committedQuantity: number;
  remainingIncludedQuantity: number | null;
  remainingSafetyCapQuantity: number | null;
  recurringAmountMinor: number | null;
  billingInterval: "month" | "year" | null;
  overageRateMinor: number | null;
  pricingConfigured: boolean;
  alertPolicy: {
    thresholds: number[];
    exhaustionAlert: boolean;
    anomalyAlert: boolean;
    cooldownHours: number;
    emailConfigured: boolean;
  };
  forecast: {
    projectedQuantity: number;
    projectedOverageQuantity: number | null;
    estimatedOverageMinor: number | null;
    projectedExhaustionAt: string | null;
    confidence: "low" | "medium" | "high";
  };
};
type UsageOverview = {
  asOf: string;
  billingMode: "pre_release" | "configured";
  invoicesAvailable: boolean;
  subscriptions: UsageSubscription[];
};
type FinancialDocument = {
  documentId: string; documentKind: "invoice" | "credit_note";
  subscriptionId: string; documentNumber: string; status: string; currency: "THB";
  subtotalMinor: number; taxMinor: number; totalMinor: number;
  amountPaidMinor: number; amountRemainingMinor: number;
  issuedAt: string | null; recordedAt: string;
};
type ResourceBoundaries = {
  seatCapacity: { allowed: boolean; limit: number; occupied: number };
  products: Array<{
    subscriptionId: string; productKey: "flowbot" | "ai_chat" | "voice"; planKey: string;
    boundaries: Array<{ key: string; used: number; limit: number | null; excess: number }>;
  }>;
};
type AlertDraft = {
  thresholds: number[];
  exhaustionAlert: boolean;
  anomalyAlert: boolean;
  cooldownHours: number;
  recipientEmail: string;
};
const billingEventKeys = [
  "subscription.active", "subscription.past_due", "subscription.grace_period",
  "subscription.restricted", "subscription.cancelled", "cancellation.scheduled",
  "cancellation.revoked", "cancellation.failed", "payment.succeeded", "payment.failed",
  "refund.updated", "credit_note.issued",
] as const;
type BillingEventKey = typeof billingEventKeys[number];
type BillingNotificationOverview = {
  preference: { emailEnabled: boolean; locale: "en" | "th"; eventKeys: BillingEventKey[]; updatedAt: string } | null;
  notifications: Array<{
    id: string; subscriptionId: string | null; eventKey: BillingEventKey;
    facts: Record<string, unknown>; effectiveAt: string; readAt: string | null;
  }>;
};

const unitCopy: Record<CustomerUnit, { short: string; singular: string; plural: string }> = {
  flow_execution: { short: "Flow runs", singular: "flow run", plural: "flow runs" },
  ai_response: { short: "AI responses", singular: "AI response", plural: "AI responses" },
  voice_minute: { short: "Voice minutes", singular: "voice minute", plural: "voice minutes" },
};

function formatQuantity(quantity: number, unit: CustomerUnit) {
  const formatted = new Intl.NumberFormat(currentIntlLocale(), { maximumFractionDigits: 2 }).format(quantity);
  if (currentUiLocale() === "th") {
    const thaiUnit: Record<CustomerUnit, string> = { flow_execution: "ครั้งที่ Flow ทำงาน", ai_response: "คำตอบจาก AI", voice_minute: "นาทีเสียง" };
    return `${formatted} ${thaiUnit[unit]}`;
  }
  return `${formatted} ${quantity === 1 ? unitCopy[unit].singular : unitCopy[unit].plural}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(currentIntlLocale(), { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function formatMoney(minor: number) {
  return new Intl.NumberFormat(currentIntlLocale(), { style: "currency", currency: "THB", maximumFractionDigits: 2 }).format(minor / 100);
}

function statusCopy(status: string, accessMode: UsageSubscription["accessMode"]) {
  if (accessMode === "active") return "Available";
  if (accessMode === "read_only") return "Read only";
  if (status === "pending") return "Awaiting activation";
  return status.replaceAll("_", " ");
}

export default function UsagePage() {
  const session = useWorkspaceSession();
  const [usage, setUsage] = useState<UsageOverview | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [resourceBoundaries, setResourceBoundaries] = useState<ResourceBoundaries | null>(null);
  const [documents, setDocuments] = useState<FinancialDocument[]>([]);
  const [documentsUnavailable, setDocumentsUnavailable] = useState(false);
  const [billingNotifications, setBillingNotifications] = useState<BillingNotificationOverview | null>(null);
  const [billingNotificationEmail, setBillingNotificationEmail] = useState("");
  const [billingNotificationStatus, setBillingNotificationStatus] = useState("");
  const [portalStatus, setPortalStatus] = useState("");
  const [cancellationStatus, setCancellationStatus] = useState<Record<string, string>>({});
  const [capDrafts, setCapDrafts] = useState<Record<string, string>>({});
  const [capStatus, setCapStatus] = useState<Record<string, string>>({});
  const [alertDrafts, setAlertDrafts] = useState<Record<string, AlertDraft>>({});
  const [alertStatus, setAlertStatus] = useState<Record<string, string>>({});
  const [catalogPlans, setCatalogPlans] = useState<CatalogPlan[]>([]);
  const [catalogStage, setCatalogStage] = useState<"loading" | "ready" | "error">("loading");
  const [selectedPlanKey, setSelectedPlanKey] = useState("flowbot_basic");
  const [planActionStatus, setPlanActionStatus] = useState("");
  const [checkoutStatus, setCheckoutStatus] = useState<Record<string, string>>({});
  const [checkoutReturnState, setCheckoutReturnState] = useState<CheckoutReturnState | null>(null);
  const [checkoutReturnLocale, setCheckoutReturnLocale] = useState<"en" | "th">("th");
  const activeWorkspace = useMemo(
    () => session.workspaces.find((workspace) => workspace.tenantId === session.selectedTenantId),
    [session.workspaces, session.selectedTenantId],
  );
  const loadUsage = useCallback(async () => {
    setLoadingUsage(true);
    setLoadError(false);
    const [response, boundaryResponse, documentResponse, notificationResponse] = await Promise.all([
      fetch("/tenant/usage", { cache: "no-store" }).catch(() => null),
      fetch("/tenant/resource-boundaries", { cache: "no-store" }).catch(() => null),
      fetch("/tenant/billing/documents", { cache: "no-store" }).catch(() => null),
      fetch("/tenant/billing/notifications", { cache: "no-store" }).catch(() => null),
    ]);
    if (!response?.ok) {
      setUsage(null);
      setLoadError(true);
      setLoadingUsage(false);
      return;
    }
    const result = await response.json();
    setUsage(result.usage);
    setResourceBoundaries(boundaryResponse?.ok ? (await boundaryResponse.json()).boundaries : null);
    setDocuments(documentResponse?.ok ? (await documentResponse.json()).documents ?? [] : []);
    setDocumentsUnavailable(!documentResponse?.ok);
    setBillingNotifications(notificationResponse?.ok
      ? (await notificationResponse.json()).billingNotifications : null);
    setLoadingUsage(false);
  }, []);

  const loadCatalog = useCallback(async () => {
    setCatalogStage("loading");
    const response = await fetch("/public/catalog", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) {
      setCatalogPlans([]);
      setCatalogStage("error");
      return;
    }
    const result = await response.json().catch(() => null);
    const plans = Array.isArray(result?.plans) ? result.plans as CatalogPlan[] : [];
    setCatalogPlans(plans);
    setCatalogStage("ready");
    if (plans.some((plan) => plan.planKey === "flowbot_basic")) {
      setSelectedPlanKey("flowbot_basic");
    } else if (plans[0]?.planKey) {
      setSelectedPlanKey(plans[0].planKey);
    }
  }, []);

  useEffect(() => {
    if (session.selectedTenantId) {
      void loadUsage();
      void loadCatalog();
    }
  }, [loadCatalog, loadUsage, session.selectedTenantId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "return") return;
    let cancelled = false;
    let attempts = 0;
    params.delete("checkout");
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", next);

    const refreshReturnState = async () => {
      const [profileResponse, usageResponse, catalogResponse] = await Promise.all([
        fetch("/tenant/profile", { cache: "no-store" }).catch(() => null),
        fetch("/tenant/usage", { cache: "no-store" }).catch(() => null),
        fetch("/public/catalog", { cache: "no-store" }).catch(() => null),
      ]);
      if (cancelled) return null;
      const profile = profileResponse?.ok ? await profileResponse.json().catch(() => null) : null;
      const locale = resolveChromeLocale(profile?.profile?.locale);
      setCheckoutReturnLocale(locale);
      const usageJson = usageResponse?.ok ? await usageResponse.json().catch(() => null) : null;
      const catalogJson = catalogResponse?.ok ? await catalogResponse.json().catch(() => null) : null;
      const state = resolveCheckoutReturnState({
        subscriptions: Array.isArray(usageJson?.usage?.subscriptions) ? usageJson.usage.subscriptions : [],
        catalogPlans: Array.isArray(catalogJson?.plans) ? catalogJson.plans : [],
        focusPlanKey: "flowbot_basic",
      });
      setCheckoutReturnState(state);
      await loadUsage();
      return state;
    };

    void (async () => {
      let state = await refreshReturnState();
      while (!cancelled && state === "processing" && attempts < 5) {
        attempts += 1;
        await new Promise((resolve) => window.setTimeout(resolve, Math.min(2000 * attempts, 8000)));
        if (cancelled) return;
        state = await refreshReturnState();
      }
    })();

    return () => { cancelled = true; };
  }, [loadUsage]);

  if (session.error) return <WorkspaceSessionLoadError onRetry={() => window.location.reload()} />;
  if (session.loading || !session.selectedTenantId) return <main className="workspace-loading">กำลังโหลดการใช้งาน...</main>;
  const isOwner = activeWorkspace?.role === "tenant_master_admin";
  const canManageUsage = isOwner || activeWorkspace?.role === "tenant_billing_manager";
  const subscriptions = usage?.subscriptions ?? [];
  const terminalTrials = subscriptions.filter((subscription) => subscription.trialStatus === "expired"
    || subscription.trialStatus === "exhausted");
  const activeCount = subscriptions.filter((subscription) => subscription.accessMode === "active").length;
  const updateSafetyCap = async (subscription: UsageSubscription) => {
    const draft = capDrafts[subscription.subscriptionId];
    const quantity = draft === undefined || draft.trim() === ""
      ? subscription.safetyCapQuantity : Number(draft);
    if (quantity !== null && (!Number.isSafeInteger(quantity) || quantity < 0)) {
      setCapStatus((current) => ({ ...current, [subscription.subscriptionId]: "Enter a whole number" }));
      return;
    }
    setCapStatus((current) => ({ ...current, [subscription.subscriptionId]: "Saving" }));
    const response = await fetch("/tenant/usage/safety-cap", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ subscriptionId: subscription.subscriptionId, safetyCapQuantity: quantity }),
    }).catch(() => null);
    if (response?.ok) {
      setCapStatus((current) => ({ ...current, [subscription.subscriptionId]: "Saved" }));
      await loadUsage();
      return;
    }
    const result = response ? await response.json().catch(() => null) : null;
    setCapStatus((current) => ({
      ...current,
      [subscription.subscriptionId]: result?.status === "reauthentication_required"
        ? "Sign in again with MFA" : result?.status === "overage_consent_required"
          ? "Overage consent required" : result?.status === "below_committed_usage"
            ? "Below committed usage" : "Could not save",
    }));
  };
  const alertDraft = (subscription: UsageSubscription): AlertDraft => alertDrafts[subscription.subscriptionId] ?? {
    thresholds: subscription.alertPolicy.thresholds,
    exhaustionAlert: subscription.alertPolicy.exhaustionAlert,
    anomalyAlert: subscription.alertPolicy.anomalyAlert,
    cooldownHours: subscription.alertPolicy.cooldownHours,
    recipientEmail: "",
  };
  const updateAlertDraft = (subscription: UsageSubscription, change: Partial<AlertDraft>) => {
    setAlertDrafts((current) => ({
      ...current, [subscription.subscriptionId]: { ...alertDraft(subscription), ...change },
    }));
  };
  const saveAlertPolicy = async (subscription: UsageSubscription) => {
    const draft = alertDraft(subscription);
    if (!draft.recipientEmail.trim()) {
      setAlertStatus((current) => ({ ...current, [subscription.subscriptionId]: "Enter the billing recipient email" }));
      return;
    }
    setAlertStatus((current) => ({ ...current, [subscription.subscriptionId]: "Saving" }));
    const response = await fetch("/tenant/usage/alerts", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...draft, subscriptionId: subscription.subscriptionId }),
    }).catch(() => null);
    if (response?.ok) {
      setAlertStatus((current) => ({ ...current, [subscription.subscriptionId]: "Saved" }));
      setAlertDrafts((current) => ({
        ...current, [subscription.subscriptionId]: { ...draft, recipientEmail: "" },
      }));
      await loadUsage();
      return;
    }
    const result = response ? await response.json().catch(() => null) : null;
    setAlertStatus((current) => ({
      ...current, [subscription.subscriptionId]: result?.status === "reauthentication_required"
        ? "Sign in again with MFA" : "Could not save",
    }));
  };
  const openBillingPortal = async () => {
    setPortalStatus("Opening secure billing");
    const response = await fetch("/tenant/billing/portal", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ returnTo: "usage" }),
    }).catch(() => null);
    const result = response ? await response.json().catch(() => null) : null;
    if (response?.ok && typeof result?.portalUrl === "string") {
      window.location.assign(result.portalUrl);
      return;
    }
    setPortalStatus(result?.status === "reauthentication_required" ? "Sign in again with MFA"
      : result?.status === "portal_unavailable" ? "Billing Portal is not configured" : "Billing Portal could not be opened");
  };

  const checkoutFailureCopy = (status: string | undefined) => {
    if (status === "reauthentication_required") return "Sign in again with MFA to continue";
    if (status === "rate_limited") return "Too many checkout attempts. Wait and try again";
    if (status === "checkout_unavailable") return "Checkout is not open for this plan yet. Your preference stays saved";
    if (status === "temporarily_unavailable") return "Checkout is temporarily unavailable";
    return "Could not start checkout";
  };

  const startCheckout = async (subscription: UsageSubscription) => {
    setCheckoutStatus((current) => ({ ...current, [subscription.subscriptionId]: "Preparing secure checkout…" }));
    const contractResponse = await safeMutationFetch(`/tenant/subscriptions/${subscription.subscriptionId}/contract`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accepted: true }),
    });
    const contractResult = await contractResponse.json().catch(() => null);
    if (!contractResponse.ok || typeof contractResult?.contractId !== "string") {
      setCheckoutStatus((current) => ({
        ...current,
        [subscription.subscriptionId]: checkoutFailureCopy(contractResult?.status),
      }));
      return;
    }
    const checkoutResponse = await safeMutationFetch("/tenant/billing/checkout", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "").slice(0, 8),
      },
      body: JSON.stringify({
        subscriptionId: subscription.subscriptionId,
        contractSnapshotId: contractResult.contractId,
      }),
    });
    const checkoutResult = await checkoutResponse.json().catch(() => null);
    if (checkoutResponse.ok && typeof checkoutResult?.checkoutUrl === "string") {
      window.location.assign(checkoutResult.checkoutUrl);
      return;
    }
    setCheckoutStatus((current) => ({
      ...current,
      [subscription.subscriptionId]: checkoutFailureCopy(checkoutResult?.status),
    }));
  };

  const selectPlan = async () => {
    if (!selectedPlanKey) {
      setPlanActionStatus("Choose a product first");
      return;
    }
    setPlanActionStatus("Saving plan preference…");
    const response = await safeMutationFetch("/tenant/subscriptions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planKey: selectedPlanKey }),
    });
    const result = await response.json().catch(() => null);
    if (response.ok && result?.status === "created") {
      setPlanActionStatus("Preference saved. Continue to payment when checkout is available.");
      await loadUsage();
      return;
    }
    if (result?.status === "product_already_subscribed") {
      setPlanActionStatus("This product is already on the workspace");
      return;
    }
    if (result?.status === "reauthentication_required") {
      setPlanActionStatus("Sign in again with MFA to choose a product");
      return;
    }
    if (result?.status === "rate_limited") {
      setPlanActionStatus("Too many attempts. Wait and try again");
      return;
    }
    setPlanActionStatus(result?.status === "plan_unavailable" ? "That plan is unavailable" : "Could not save plan preference");
  };
  const changeCancellation = async (subscription: UsageSubscription, action: "schedule" | "revoke") => {
    if (action === "schedule" && !window.confirm(
      uiCopy(`ยกเลิก ${subscription.publicName} เมื่อสิ้นสุดรอบรายปีปัจจุบันหรือไม่? การเข้าถึงยังใช้ได้จนถึงวันนั้น`, `Cancel ${subscription.publicName} at the end of the current annual term? Access remains available until then.`),
    )) return;
    setCancellationStatus((current) => ({ ...current, [subscription.subscriptionId]: "Saving" }));
    const response = await fetch("/tenant/billing/cancellation", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ subscriptionId: subscription.subscriptionId, action }),
    }).catch(() => null);
    const result = response ? await response.json().catch(() => null) : null;
    if (response?.ok) {
      setCancellationStatus((current) => ({ ...current,
        [subscription.subscriptionId]: action === "schedule" ? "Cancellation scheduled" : "Renewal restored" }));
      await loadUsage();
      return;
    }
    setCancellationStatus((current) => ({ ...current,
      [subscription.subscriptionId]: result?.status === "reauthentication_required"
        ? "Sign in again with MFA" : result?.status === "cancellation_unavailable"
          ? "Cancellation is not available for this plan" : "Could not update renewal" }));
  };
  const saveBillingNotifications = async () => {
    const preference = billingNotifications?.preference;
    const emailEnabled = preference?.emailEnabled ?? true;
    if (emailEnabled && !billingNotificationEmail.trim()) {
      setBillingNotificationStatus("Enter the billing recipient email");
      return;
    }
    setBillingNotificationStatus("Saving");
    const response = await fetch("/tenant/billing/notifications", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "configure", emailEnabled,
        recipientEmail: emailEnabled ? billingNotificationEmail.trim() : null,
        locale: preference?.locale ?? "th", eventKeys: preference?.eventKeys ?? [...billingEventKeys] }),
    }).catch(() => null);
    const result = response ? await response.json().catch(() => null) : null;
    if (!response?.ok) {
      setBillingNotificationStatus(result?.status === "reauthentication_required"
        ? "Sign in again with MFA" : "Could not save billing notifications");
      return;
    }
    setBillingNotificationEmail("");
    setBillingNotificationStatus("Saved");
    await loadUsage();
  };
  const updateBillingPreference = (change: Partial<NonNullable<BillingNotificationOverview["preference"]>>) => {
    setBillingNotifications((current) => current ? {
      ...current,
      preference: { emailEnabled: true, locale: "en", eventKeys: [...billingEventKeys],
        updatedAt: new Date().toISOString(), ...current.preference, ...change },
    } : current);
  };
  const markBillingNotificationRead = async (notificationId: string) => {
    const response = await fetch("/tenant/billing/notifications", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "mark_read", notificationId }),
    }).catch(() => null);
    if (response?.ok) await loadUsage();
  };

  return (
    <main className="workspace-shell">
      <WorkspaceSidebar
        active="usage"
        workspaces={session.workspaces}
        selectedTenantId={session.selectedTenantId}
        onSelect={(tenantId) => void session.selectWorkspace(tenantId)}
        onLogout={() => void session.logout()}
      />
      <section id="workspace-main" className="workspace-main usage-center" tabIndex={-1}>
        <header className="workspace-header">
          <div><p>เวิร์กสเปซ</p><h1>แผนและการใช้งาน</h1></div>
          <span className="role-label">{activeWorkspace?.businessName}</span>
        </header>

        {checkoutReturnState ? (() => {
          const copy = setupChrome(checkoutReturnLocale);
          const title = checkoutReturnState === "active" ? copy.checkoutReturnActiveTitle
            : checkoutReturnState === "action_required" ? copy.checkoutReturnActionTitle
              : checkoutReturnState === "expired" ? copy.checkoutReturnExpiredTitle
                : checkoutReturnState === "unavailable" ? copy.checkoutReturnUnavailableTitle
                  : copy.checkoutReturnProcessingTitle;
          const body = checkoutReturnState === "active" ? copy.checkoutReturnActive
            : checkoutReturnState === "action_required" ? copy.checkoutReturnAction
              : checkoutReturnState === "expired" ? copy.checkoutReturnExpired
                : checkoutReturnState === "unavailable" ? copy.checkoutReturnUnavailable
                  : copy.checkoutReturnProcessing;
          return (
            <section className="usage-state" role="status" aria-live="polite" data-checkout-return={checkoutReturnState}>
              <div>
                <strong>{title}</strong>
                <span>{body}</span>
              </div>
              <div className="usage-state-actions">
                {checkoutReturnState === "action_required" || checkoutReturnState === "active" ? (
                  <button className="secondary-command" type="button" onClick={() => void openBillingPortal()}>จัดการการเรียกเก็บเงิน</button>
                ) : null}
                <button className="secondary-command" type="button" onClick={() => setCheckoutReturnState(null)}>ปิดข้อความ</button>
              </div>
            </section>
          );
        })() : null}

        <section className="usage-intro" aria-labelledby="usage-summary-title">
          <div>
            <p>ภาพรวมบัญชี</p>
            <h2 id="usage-summary-title">ทำความเข้าใจการใช้งานของเวิร์กสเปซ</h2>
            <span>แสดงการใช้งานด้วยหน่วยที่ลูกค้าเข้าใจง่าย โดยไม่รวมรายละเอียดการประมวลผลภายในหรือผู้ให้บริการ</span>
          </div>
          <dl className="usage-summary-grid">
            <div><dt>ผลิตภัณฑ์</dt><dd>{subscriptions.length}</dd></div>
            <div><dt>พร้อมใช้งานแล้ว</dt><dd>{activeCount}</dd></div>
            <div><dt>สถานะการเรียกเก็บเงิน</dt><dd>{usage?.billingMode === "configured" ? "Configured" : "Pilot metering"}</dd></div>
          </dl>
        </section>

        {terminalTrials.map((subscription) => (
          <section className="usage-state usage-state-error" role="status" key={`trial-${subscription.subscriptionId}`}>
            <div>
              <strong>{subscription.trialStatus === "exhausted"
                ? uiCopy("ทดลองใช้ครบโควตาแล้ว", "Trial allowance used")
                : uiCopy("ช่วงทดลองใช้สิ้นสุดแล้ว", "Trial ended")}</strong>
              <span>{uiCopy(
                `${subscription.publicName} หยุดรับการใช้งานใหม่แล้ว เลือกแผนแบบชำระเงินเพื่อใช้งานต่อ`,
                `${subscription.publicName} has stopped accepting new trial usage. Choose a paid plan to continue.`,
              )}</span>
            </div>
            {canManageUsage ? <a className="secondary-command" href="#usage-plan-picker-title"
              onClick={() => setSelectedPlanKey(subscription.planKey)}>
              {uiCopy("ดูแผนแบบชำระเงิน", "View paid plans")}
            </a> : null}
          </section>
        ))}

        {canManageUsage && !loadingUsage && !loadError ? (
          <section className="tool-band usage-plan-picker" aria-labelledby="usage-plan-picker-title">
            <div className="band-heading">
              <div>
                <p>ดำเนินการด้วยตนเอง</p>
                <h2 id="usage-plan-picker-title">เลือกผลิตภัณฑ์</h2>
              </div>
              <span>ราคาอ้างอิงจากรายการผลิตภัณฑ์บนเซิร์ฟเวอร์</span>
            </div>
            <p className="control-copy">
              Selecting a plan saves a server-side preference. Access activates after successful payment — not from email verification or this browser alone.
            </p>
            {catalogStage === "loading" ? <p className="usage-plan-status" aria-live="polite">กำลังโหลดผลิตภัณฑ์…</p> : null}
            {catalogStage === "error" ? (
              <div className="usage-state usage-state-error" role="alert">
                <div><strong>โหลดผลิตภัณฑ์ไม่สำเร็จ</strong><span>ลองใหม่ก่อนเลือกแผน</span></div>
                <button className="secondary-command" type="button" onClick={() => void loadCatalog()}>ลองใหม่</button>
              </div>
            ) : null}
            {catalogStage === "ready" ? (
              <fieldset className="usage-plan-options">
                <legend className="sr-only">ผลิตภัณฑ์ที่พร้อมใช้งาน</legend>
                {catalogPlans.length ? catalogPlans.map((plan) => {
                  const alreadyHeld = subscriptions.some((subscription) => subscription.productKey === plan.productKey
                    && subscription.status !== "cancelled");
                  return (
                    <label
                      className={`usage-plan-option${selectedPlanKey === plan.planKey ? " selected" : ""}${alreadyHeld ? " held" : ""}`}
                      key={plan.planKey}
                    >
                      <input
                        type="radio"
                        name="workspacePlanKey"
                        value={plan.planKey}
                        checked={selectedPlanKey === plan.planKey}
                        disabled={alreadyHeld}
                        onChange={() => setSelectedPlanKey(plan.planKey)}
                      />
                      <span>
                        <strong>{plan.publicName}</strong>
                        <small>{plan.summary}</small>
                        <small>
                          First year {formatMoney(plan.firstTermAmountMinor)}
                          {plan.sellable ? "" : " · checkout opens when this SKU is sellable"}
                        </small>
                      </span>
                    </label>
                  );
                }) : <p className="usage-plan-status">ขณะนี้ไม่มีผลิตภัณฑ์ที่เลือกได้</p>}
              </fieldset>
            ) : null}
            {canManageUsage && catalogStage === "ready" && catalogPlans.some((plan) => !subscriptions.some((subscription) => subscription.productKey === plan.productKey && subscription.status !== "cancelled")) ? (
              <div className="usage-plan-actions">
                <button type="button" onClick={() => void selectPlan()}>บันทึกแผนที่สนใจ</button>
                <span className="usage-plan-status" aria-live="polite">{planActionStatus}</span>
              </div>
            ) : null}
          </section>
        ) : null}

        {loadingUsage ? (
          <section className="usage-state" aria-live="polite"><span className="usage-state-dot" /><strong>กำลังโหลดการใช้งานปัจจุบัน…</strong></section>
        ) : loadError ? (
          <section className="usage-state usage-state-error" role="alert">
            <div><strong>ข้อมูลการใช้งานไม่พร้อมชั่วคราว</strong><span>แผนของคุณไม่ถูกเปลี่ยน โปรดลองโหลดหน้านี้ใหม่</span></div>
            <button className="secondary-command" type="button" onClick={() => void loadUsage()}>ลองใหม่</button>
          </section>
        ) : subscriptions.length ? (
          <section className="tool-band usage-products" aria-labelledby="usage-products-title">
            <div className="band-heading">
              <div><p>ผลิตภัณฑ์</p><h2 id="usage-products-title">รอบปัจจุบัน</h2></div>
              <span>Updated {usage ? new Date(usage.asOf).toLocaleTimeString(currentIntlLocale(), { hour: "2-digit", minute: "2-digit" }) : "now"}</span>
            </div>
            <div className="usage-card-grid">
              {subscriptions.map((subscription) => {
                const included = subscription.includedQuantity;
                const progress = included && included > 0
                  ? Math.min(100, Math.max(0, (subscription.committedQuantity / included) * 100)) : 0;
                return (
                  <article className="usage-card" key={subscription.subscriptionId}>
                    <header>
                      <div><span>{subscription.productKey.replaceAll("_", " ")}</span><h3>{subscription.publicName}</h3></div>
                      <span className={`usage-status usage-status-${subscription.accessMode}`}>{statusCopy(subscription.status, subscription.accessMode)}</span>
                    </header>
                    <div className="usage-period">
                      <span>รอบปัจจุบัน</span>
                      <strong>{formatDate(subscription.periodStart)} – {formatDate(subscription.periodEnd)}</strong>
                    </div>
                    <div className="usage-total">
                      <span>{unitCopy[subscription.customerUnit].short} used</span>
                      <strong>{formatQuantity(subscription.settledQuantity, subscription.customerUnit)}</strong>
                      {subscription.reservedQuantity > 0 ? <small>{formatQuantity(subscription.reservedQuantity, subscription.customerUnit)} currently reserved</small> : <small>ไม่มีโควตาที่ถูกจองใช้อยู่</small>}
                    </div>
                    {included === null ? (
                      <div className="usage-unconfigured">
                        <strong>ยังไม่ได้กำหนดโควตาเชิงพาณิชย์</strong>
                        <span>ระบบกำลังวัดการใช้งานสำหรับโครงการนำร่อง แต่ยังไม่ได้เผยแพร่โควตาหรือเงื่อนไขการใช้เกินโควตาต่อสาธารณะ</span>
                      </div>
                    ) : (
                      <div className="usage-meter-wrap">
                        <div className="usage-meter-label"><span>โควตาที่รวมในแผน</span><strong>{Math.round(progress)}%</strong></div>
                        <div className="usage-meter" role="progressbar" aria-label={`${subscription.publicName} included usage`} aria-valuemin={0} aria-valuemax={included} aria-valuenow={Math.min(included, subscription.committedQuantity)}>
                          <span style={{ width: `${progress}%` }} />
                        </div>
                        <div className="usage-meter-copy">
                          <span>{formatQuantity(subscription.committedQuantity, subscription.customerUnit)} committed</span>
                          <span>{formatQuantity(subscription.remainingIncludedQuantity ?? 0, subscription.customerUnit)} remaining</span>
                        </div>
                      </div>
                    )}
                    <dl className="usage-card-details">
                      <div><dt>การใช้งานที่คาดการณ์</dt><dd>{formatQuantity(subscription.forecast.projectedQuantity, subscription.customerUnit)}</dd></div>
                      <div><dt>ความมั่นใจของการคาดการณ์</dt><dd>{subscription.forecast.confidence}</dd></div>
                      <div><dt>คาดการณ์การใช้เกินโควตา</dt><dd>{subscription.forecast.estimatedOverageMinor === null ? "Not enabled" : formatMoney(subscription.forecast.estimatedOverageMinor)}</dd></div>
                      <div><dt>ขีดจำกัดความปลอดภัย</dt><dd>{subscription.safetyCapQuantity === null ? "Not set" : formatQuantity(subscription.safetyCapQuantity, subscription.customerUnit)}</dd></div>
                      <div><dt>การใช้เกินโควตา</dt><dd>{subscription.pricingConfigured && subscription.overageRateMinor !== null ? `${formatMoney(subscription.overageRateMinor)} / ${unitCopy[subscription.customerUnit].singular}` : "Not enabled"}</dd></div>
                      <div><dt>สิทธิ์ตามแผน</dt><dd>{statusCopy(subscription.status, subscription.accessMode)}</dd></div>
                      <div><dt>การต่ออายุ</dt><dd>{subscription.cancelAt
                        ? `Ends ${formatDate(subscription.cancelAt)}` : "Renews automatically"}</dd></div>
                    </dl>
                    {canManageUsage && !subscription.trialStatus
                      && (subscription.accessMode === "none" || subscription.status === "pending") ? (
                      <div className="usage-cap-control usage-checkout-control">
                        <span>การชำระเงินจะเปิดสิทธิ์ใช้ผลิตภัณฑ์นี้</span>
                        <button type="button" onClick={() => void startCheckout(subscription)}>
                          Continue to payment
                        </button>
                        <span aria-live="polite">{checkoutStatus[subscription.subscriptionId] ?? ""}</span>
                      </div>
                    ) : null}
                    {canManageUsage && ["trialing", "active", "past_due", "grace_period", "restricted", "paused"].includes(subscription.status) ? (
                      <div className="usage-cap-control">
                        <span>{subscription.cancelAt ? "Cancellation scheduled" : "Annual renewal"}</span>
                        <button className="secondary-command" type="button"
                          onClick={() => void changeCancellation(subscription, subscription.cancelAt ? "revoke" : "schedule")}>
                          {subscription.cancelAt ? "Keep subscription" : "Cancel at term end"}
                        </button>
                        <span aria-live="polite">{cancellationStatus[subscription.subscriptionId] ?? ""}</span>
                      </div>
                    ) : null}
                    {canManageUsage && !["expired", "exhausted"].includes(subscription.trialStatus ?? "") ? (
                      <form className="usage-cap-control" onSubmit={(event) => {
                        event.preventDefault(); void updateSafetyCap(subscription);
                      }}>
                        <label htmlFor={`cap-${subscription.subscriptionId}`}>ขีดจำกัดความปลอดภัย</label>
                        <input id={`cap-${subscription.subscriptionId}`} type="number" min="0" step="1"
                          value={capDrafts[subscription.subscriptionId] ?? subscription.safetyCapQuantity ?? ""}
                          onChange={(event) => setCapDrafts((current) => ({
                            ...current, [subscription.subscriptionId]: event.target.value,
                          }))} />
                        <button className="secondary-command" type="submit">อัปเดตขีดจำกัด</button>
                        <span aria-live="polite">{capStatus[subscription.subscriptionId] ?? ""}</span>
                      </form>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        ) : (
          <section className="usage-state">
            <div>
              <strong>ยังไม่มีผลิตภัณฑ์ที่เปิดใช้งาน</strong>
              <span>เลือกผลิตภัณฑ์ด้านบนเพื่อบันทึกความสนใจ แล้วดำเนินการชำระเงินเมื่อระบบเปิดให้บริการ การเปิดใช้แบบนำร่องสงวนไว้สำหรับบัญชีที่ได้รับอนุมัติเท่านั้น</span>
            </div>
          </section>
        )}

        {subscriptions.length && canManageUsage ? (
          <section className="tool-band usage-alert-settings" aria-labelledby="usage-alerts-title">
            <div className="band-heading">
              <div><p>การควบคุม</p><h2 id="usage-alerts-title">การแจ้งเตือนการใช้งาน</h2></div>
              <span>ผู้จัดการการเรียกเก็บเงินและเจ้าของ</span>
            </div>
            <div className="usage-alert-list">
              {subscriptions.map((subscription) => {
                const draft = alertDraft(subscription);
                return <form className="usage-alert-row" key={subscription.subscriptionId} onSubmit={(event) => {
                  event.preventDefault(); void saveAlertPolicy(subscription);
                }}>
                  <div className="usage-alert-product">
                    <strong>{subscription.publicName}</strong>
                    <span>{subscription.alertPolicy.emailConfigured ? "Email delivery configured" : "Email delivery not configured"}</span>
                  </div>
                  <fieldset>
                    <legend>เกณฑ์โควตา</legend>
                    {[50, 75, 90, 100].map((threshold) => <label key={threshold}>
                      <input type="checkbox" checked={draft.thresholds.includes(threshold)} onChange={(event) => {
                        const thresholds = event.target.checked
                          ? [...draft.thresholds, threshold].sort((left, right) => left - right)
                          : draft.thresholds.filter((value) => value !== threshold);
                        updateAlertDraft(subscription, { thresholds });
                      }} /> {threshold}%
                    </label>)}
                  </fieldset>
                  <div className="usage-alert-toggles">
                    <label><input type="checkbox" checked={draft.exhaustionAlert} onChange={(event) => updateAlertDraft(subscription, { exhaustionAlert: event.target.checked })} /> คาดว่าจะใช้หมดเมื่อ</label>
                    <label><input type="checkbox" checked={draft.anomalyAlert} onChange={(event) => updateAlertDraft(subscription, { anomalyAlert: event.target.checked })} /> การใช้งานผิดปกติ</label>
                  </div>
                  <label className="usage-alert-cooldown">Cooldown
                    <select value={draft.cooldownHours} onChange={(event) => updateAlertDraft(subscription, { cooldownHours: Number(event.target.value) })}>
                      <option value={6}>6 ชั่วโมง</option><option value={12}>12 ชั่วโมง</option>
                      <option value={24}>24 ชั่วโมง</option><option value={48}>48 ชั่วโมง</option>
                      <option value={72}>72 ชั่วโมง</option><option value={168}>7 วัน</option>
                    </select>
                  </label>
                  <label className="usage-alert-recipient">Billing recipient
                    <input type="email" maxLength={320} required placeholder={subscription.alertPolicy.emailConfigured ? "Enter email to update" : "billing@business.com"}
                      value={draft.recipientEmail} onChange={(event) => updateAlertDraft(subscription, { recipientEmail: event.target.value })} />
                  </label>
                  <button className="secondary-command" type="submit">บันทึกการแจ้งเตือน</button>
                  <span className="usage-alert-result" aria-live="polite">{alertStatus[subscription.subscriptionId] ?? ""}</span>
                </form>;
              })}
            </div>
          </section>
        ) : null}

        {resourceBoundaries ? (
          <section className="tool-band" aria-labelledby="resource-limits-title">
            <div className="band-heading">
              <div><p>ขอบเขตสัญญาการทำงาน</p><h2 id="resource-limits-title">ทรัพยากรและจำนวนผู้ใช้</h2></div>
              <span>{resourceBoundaries.seatCapacity.occupied} / {resourceBoundaries.seatCapacity.limit} seats</span>
            </div>
            <div className="data-table">
              {resourceBoundaries.products.flatMap((product) => product.boundaries.map((boundary) => (
                <div className="data-row" key={`${product.subscriptionId}-${boundary.key}`}>
                  <div><strong>{humanizeToken(product.productKey)} · {humanizeToken(boundary.key)}</strong><span>{humanizePlanKey(product.planKey)}</span></div>
                  <span>{boundary.used} used</span>
                  <span>{boundary.limit === null ? "Unlimited" : `${boundary.limit} included${boundary.excess ? ` · ${boundary.excess} excess` : ""}`}</span>
                </div>
              )))}
            </div>
          </section>
        ) : null}

        <section className="tool-band usage-alert-settings" aria-labelledby="billing-notifications-title">
          <div className="band-heading">
            <div><p>กิจกรรมในบัญชี</p><h2 id="billing-notifications-title">การแจ้งเตือนการเรียกเก็บเงิน</h2></div>
            <span>{billingNotifications?.notifications.filter((notice) => !notice.readAt).length ?? 0} unread</span>
          </div>
          {canManageUsage ? <form className="usage-alert-row" onSubmit={(event) => {
            event.preventDefault(); void saveBillingNotifications();
          }}>
            <label><input type="checkbox" checked={billingNotifications?.preference?.emailEnabled ?? true}
              onChange={(event) => updateBillingPreference({ emailEnabled: event.target.checked })} /> เหตุการณ์เรียกเก็บเงินทางอีเมล</label>
            <label className="usage-alert-cooldown">Language
              <select value={billingNotifications?.preference?.locale ?? "th"}
                onChange={(event) => updateBillingPreference({ locale: event.target.value as "en" | "th" })}>
                <option value="en">English</option><option value="th">ไทย</option>
              </select>
            </label>
            <label className="usage-alert-recipient">Billing recipient
              <input type="email" maxLength={320}
                required={billingNotifications?.preference?.emailEnabled ?? true}
                disabled={billingNotifications?.preference?.emailEnabled === false}
                placeholder={billingNotifications?.preference ? "Enter email to update" : "billing@business.com"}
                value={billingNotificationEmail} onChange={(event) => setBillingNotificationEmail(event.target.value)} />
            </label>
            <fieldset>
              <legend>เหตุการณ์</legend>
              {billingEventKeys.map((eventKey) => <label key={eventKey}>
                <input type="checkbox" checked={(billingNotifications?.preference?.eventKeys ?? billingEventKeys).includes(eventKey)}
                  onChange={(event) => {
                    const current = billingNotifications?.preference?.eventKeys ?? [...billingEventKeys];
                    updateBillingPreference({ eventKeys: event.target.checked
                      ? [...new Set([...current, eventKey])] : current.filter((key) => key !== eventKey) });
                  }} /> {eventKey.replaceAll(".", " ").replaceAll("_", " ")}
              </label>)}
            </fieldset>
            <button className="secondary-command" type="submit">บันทึกการแจ้งเตือน</button>
            <span className="usage-alert-result" aria-live="polite">{billingNotificationStatus}</span>
          </form> : null}
          <div className="data-table" role="list" aria-label="การแจ้งเตือนการเรียกเก็บเงินล่าสุด">
            {billingNotifications?.notifications.length ? billingNotifications.notifications.map((notice) => (
              <div className="data-row" role="listitem" key={notice.id}>
                <div><strong>{notice.eventKey.replaceAll(".", " ").replaceAll("_", " ")}</strong>
                  <span>{formatDate(notice.effectiveAt)}</span></div>
                <span>{notice.readAt ? "Read" : "New"}</span>
                {!notice.readAt ? <button className="secondary-command" type="button"
                  onClick={() => void markBillingNotificationRead(notice.id)}>ทำเครื่องหมายว่าอ่านแล้ว</button> : <span />}
              </div>
            )) : <div className="billing-document-state" role="listitem"><strong>ยังไม่มีกิจกรรมการเรียกเก็บเงิน</strong>
              <span>เหตุการณ์สมัครใช้บริการ ชำระเงิน ยกเลิก และเครดิตจะแสดงที่นี่</span></div>}
          </div>
        </section>

        <section className="tool-band billing-readiness" aria-labelledby="billing-title">
          <div className="band-heading">
            <div><p>การเรียกเก็บเงิน</p><h2 id="billing-title">ใบแจ้งหนี้และการจัดการแผน</h2></div>
            {canManageUsage ? <button className="secondary-command" type="button" onClick={() => void openBillingPortal()}>จัดการการเรียกเก็บเงิน</button> : null}
          </div>
          {portalStatus ? <p className="billing-action-status" role="status">{portalStatus}</p> : null}
          {documentsUnavailable ? <div className="billing-document-state" role="alert">เอกสารการเรียกเก็บเงินไม่พร้อมใช้งานชั่วคราว</div>
            : documents.length ? <div className="billing-document-list" role="list" aria-label="เอกสารการเรียกเก็บเงิน">
              {documents.map((document) => <div className="billing-document-row" role="listitem" key={document.documentId}>
                <div><strong>{document.documentKind === "invoice" ? "Invoice" : "Credit note"} {document.documentNumber}</strong>
                  <span>{formatDate(document.issuedAt ?? document.recordedAt)}</span></div>
                <span>{document.status.replaceAll("_", " ")}</span>
                <span>{formatMoney(document.totalMinor)}</span>
                {document.documentKind === "invoice" ? <span>{document.amountRemainingMinor > 0
                  ? `${formatMoney(document.amountRemainingMinor)} due` : `${formatMoney(document.amountPaidMinor)} paid`}</span> : <span>เครดิตในบัญชี</span>}
              </div>)}
            </div> : <div className="billing-document-state">
              <strong>ยังไม่มีเอกสารการเรียกเก็บเงิน</strong>
              <span>{usage?.billingMode === "configured" ? "Invoices and credit notes will appear after Stripe finalizes them."
                : "Public charging remains disabled until the commercial release gates are approved."}</span>
            </div>}
        </section>
      </section>
    </main>
  );
}
