"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { WorkspaceSidebar } from "../WorkspaceSidebar";
import { WorkspaceSessionLoadError } from "../WorkspaceAccess";
import { useWorkspaceSession } from "../useWorkspaceSession";

type CustomerUnit = "flow_execution" | "ai_response" | "voice_minute";
type UsageSubscription = {
  subscriptionId: string;
  productKey: "flowbot" | "ai_chat" | "voice";
  planKey: string;
  publicName: string;
  tierName: string;
  status: string;
  accessMode: "none" | "read_only" | "active";
  customerUnit: CustomerUnit;
  periodStart: string;
  periodEnd: string;
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
};
type UsageOverview = {
  asOf: string;
  billingMode: "pre_release" | "configured";
  invoicesAvailable: false;
  subscriptions: UsageSubscription[];
};

const unitCopy: Record<CustomerUnit, { short: string; singular: string; plural: string }> = {
  flow_execution: { short: "Flow runs", singular: "flow run", plural: "flow runs" },
  ai_response: { short: "AI responses", singular: "AI response", plural: "AI responses" },
  voice_minute: { short: "Voice minutes", singular: "voice minute", plural: "voice minutes" },
};

function formatQuantity(quantity: number, unit: CustomerUnit) {
  const formatted = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(quantity);
  return `${formatted} ${quantity === 1 ? unitCopy[unit].singular : unitCopy[unit].plural}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function formatMoney(minor: number) {
  return new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 2 }).format(minor / 100);
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
  const activeWorkspace = useMemo(
    () => session.workspaces.find((workspace) => workspace.tenantId === session.selectedTenantId),
    [session.workspaces, session.selectedTenantId],
  );
  const loadUsage = useCallback(async () => {
    setLoadingUsage(true);
    setLoadError(false);
    const response = await fetch("/tenant/usage", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) {
      setUsage(null);
      setLoadError(true);
      setLoadingUsage(false);
      return;
    }
    const result = await response.json();
    setUsage(result.usage);
    setLoadingUsage(false);
  }, []);

  useEffect(() => {
    if (session.selectedTenantId) void loadUsage();
  }, [loadUsage, session.selectedTenantId]);

  if (session.error) return <WorkspaceSessionLoadError onRetry={() => window.location.reload()} />;
  if (session.loading || !session.selectedTenantId) return <main className="workspace-loading">Loading usage...</main>;
  const isOwner = activeWorkspace?.role === "tenant_master_admin";
  const subscriptions = usage?.subscriptions ?? [];
  const activeCount = subscriptions.filter((subscription) => subscription.accessMode === "active").length;

  return (
    <main className="workspace-shell">
      <WorkspaceSidebar
        active="usage"
        workspaces={session.workspaces}
        selectedTenantId={session.selectedTenantId}
        onSelect={(tenantId) => void session.selectWorkspace(tenantId)}
        onLogout={() => void session.logout()}
      />
      <section className="workspace-main usage-center">
        <header className="workspace-header">
          <div><p>Workspace</p><h1>Plans and usage</h1></div>
          <span className="role-label">{activeWorkspace?.businessName}</span>
        </header>

        <section className="usage-intro" aria-labelledby="usage-summary-title">
          <div>
            <p>Account overview</p>
            <h2 id="usage-summary-title">Understand what your workspace is using</h2>
            <span>Usage is shown in customer-friendly units. Internal processing and provider details are never included.</span>
          </div>
          <dl className="usage-summary-grid">
            <div><dt>Products</dt><dd>{subscriptions.length}</dd></div>
            <div><dt>Available now</dt><dd>{activeCount}</dd></div>
            <div><dt>Billing status</dt><dd>{usage?.billingMode === "configured" ? "Configured" : "Pilot metering"}</dd></div>
          </dl>
        </section>

        {loadingUsage ? (
          <section className="usage-state" aria-live="polite"><span className="usage-state-dot" /><strong>Loading current usage…</strong></section>
        ) : loadError ? (
          <section className="usage-state usage-state-error" role="alert">
            <div><strong>Usage is temporarily unavailable</strong><span>Your plans are unchanged. Try loading this page again.</span></div>
            <button className="secondary-command" type="button" onClick={() => void loadUsage()}>Try again</button>
          </section>
        ) : subscriptions.length ? (
          <section className="tool-band usage-products" aria-labelledby="usage-products-title">
            <div className="band-heading">
              <div><p>Products</p><h2 id="usage-products-title">Current period</h2></div>
              <span>Updated {usage ? new Date(usage.asOf).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "now"}</span>
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
                      <span>Current period</span>
                      <strong>{formatDate(subscription.periodStart)} – {formatDate(subscription.periodEnd)}</strong>
                    </div>
                    <div className="usage-total">
                      <span>{unitCopy[subscription.customerUnit].short} used</span>
                      <strong>{formatQuantity(subscription.settledQuantity, subscription.customerUnit)}</strong>
                      {subscription.reservedQuantity > 0 ? <small>{formatQuantity(subscription.reservedQuantity, subscription.customerUnit)} currently reserved</small> : <small>No usage currently reserved</small>}
                    </div>
                    {included === null ? (
                      <div className="usage-unconfigured">
                        <strong>Allowance not commercially configured</strong>
                        <span>Metering is active for pilot visibility, but no public allowance or overage promise has been published.</span>
                      </div>
                    ) : (
                      <div className="usage-meter-wrap">
                        <div className="usage-meter-label"><span>Included allowance</span><strong>{Math.round(progress)}%</strong></div>
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
                      <div><dt>Safety cap</dt><dd>{subscription.safetyCapQuantity === null ? "Not set" : formatQuantity(subscription.safetyCapQuantity, subscription.customerUnit)}</dd></div>
                      <div><dt>Overage</dt><dd>{subscription.pricingConfigured && subscription.overageRateMinor !== null ? `${formatMoney(subscription.overageRateMinor)} / ${unitCopy[subscription.customerUnit].singular}` : "Not enabled"}</dd></div>
                      <div><dt>Plan access</dt><dd>{statusCopy(subscription.status, subscription.accessMode)}</dd></div>
                    </dl>
                  </article>
                );
              })}
            </div>
          </section>
        ) : (
          <section className="usage-state">
            <div><strong>No product plan yet</strong><span>Choose a product during workspace onboarding to start tracking usage.</span></div>
          </section>
        )}

        <section className="tool-band muted-band billing-readiness" aria-labelledby="billing-title">
          <div className="band-heading"><div><p>Billing</p><h2 id="billing-title">Invoices and plan management</h2></div><span>{usage?.invoicesAvailable ? "Available" : "Not yet available"}</span></div>
          <div className="billing-readiness-copy">
            <div className="billing-lock" aria-hidden="true">D</div>
            <div>
              <strong>{usage?.billingMode === "configured" ? "Commercial billing is configured" : "No public charges are being collected"}</strong>
              <p>{usage?.billingMode === "configured"
                ? "Invoice access and plan actions will appear here when enabled for this workspace."
                : "Prices, invoices, overage charges, tax treatment, and cancellation actions stay unavailable until the commercial launch review is approved."}</p>
              <span>{isOwner ? "As workspace owner, you will manage payment and plan changes here once they are released." : "Only the workspace owner can manage payment methods, plan changes, and cancellation."}</span>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
