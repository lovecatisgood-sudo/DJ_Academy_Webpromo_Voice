"use client";

import { useEffect, useState } from "react";
import { tenantRoleAllows, type TenantRole } from "@djay/authorization";
import { safeMutationFetch } from "@djay/shared";
import { WorkspacePageLoadError, WorkspaceSessionLoadError, WorkspaceViewOnly } from "./WorkspaceAccess";
import { WorkspaceSidebar, type WorkspaceSummary } from "./WorkspaceSidebar";
import {
  defaultWorkspaceHome,
  humanizeOnboardingStage,
  humanizeTenantRole,
  humanizeToken,
  inboxHomeRoles,
} from "../../lib/workspace-labels";

type Workspace = WorkspaceSummary;

type Onboarding = {
  tenant_id: string;
  business_name: string;
  slug: string;
  locale: string;
  timezone: string;
  stage: "account_created" | "business_profile" | "product_selection" | "ready";
  readiness: {
    businessProfile: boolean;
    productSelected: boolean;
    activeAccess: boolean;
    selectedProducts: Subscription["productKey"][];
    configuredProducts: Subscription["productKey"][];
    testedProducts: Subscription["productKey"][];
    launchReadyProducts: Subscription["productKey"][];
    productStates: { productKey: Subscription["productKey"]; activeAccess: boolean; configured: boolean; tested: boolean; deployed: boolean; launchReady: boolean; nextAction: "activate" | "configure" | "deploy" | "test" | "operate" }[];
  };
  checklist: {
    key: string;
    label: string;
    detail: string;
    complete: boolean;
    nextHref?: string;
    nextLabel?: string;
  }[];
  primaryAction: { href: string; label: string } | null;
};
type Subscription = {
  id: string; productKey: "flowbot" | "ai_chat" | "voice"; publicName: string;
  tierName: string; status: string; accessMode: "none" | "read_only" | "active";
};

const productRoutes: Record<Subscription["productKey"], string> = {
  flowbot: "/workspace/flowbot",
  ai_chat: "/workspace/ai-chat",
  voice: "/workspace/voice",
};

export default function WorkspacePage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [mutationMessage, setMutationMessage] = useState("");
  const [mutationTone, setMutationTone] = useState<"success" | "error" | null>(null);
  const activeWorkspace = workspaces.find((workspace) => workspace.tenantId === selectedTenantId);
  const canUpdateOnboarding = activeWorkspace
    ? tenantRoleAllows(activeWorkspace.role as TenantRole, "onboarding.update")
    : false;

  async function load() {
    try {
      const sessionResponse = await fetch("/tenant/session", { cache: "no-store" });
      if ([401, 403].includes(sessionResponse.status)) { window.location.replace("/"); return; }
      if (!sessionResponse.ok) throw new Error("workspace_session_unavailable");
      const session = await sessionResponse.json();
      setWorkspaces(session.workspaces || []);
      setSelectedTenantId(session.selectedTenantId || null);
      if (session.selectedTenantId) {
        const [onboardingResponse, subscriptionResponse] = await Promise.all([
          fetch("/tenant/onboarding", { cache: "no-store" }),
          fetch("/tenant/subscriptions", { cache: "no-store" }),
        ]);
        if (!onboardingResponse.ok || !subscriptionResponse.ok) throw new Error("workspace_overview_unavailable");
        setOnboarding((await onboardingResponse.json()).onboarding);
        setSubscriptions((await subscriptionResponse.json()).subscriptions || []);
      } else setSubscriptions([]);
      setLoadError(false);
      setLoading(false);
    } catch { setLoadError(true); setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!activeWorkspace) return;
    const role = activeWorkspace.role as TenantRole;
    if (!inboxHomeRoles.has(role)) return;
    if (new URLSearchParams(window.location.search).get("stay") === "1") return;
    window.location.replace(defaultWorkspaceHome({ role }));
  }, [activeWorkspace]);

  async function selectWorkspace(tenantId: string) {
    setMutationMessage("");
    setMutationTone(null);
    const response = await safeMutationFetch("/tenant/workspace/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId }),
    });
    if (response.ok) {
      setLoading(true);
      setOnboarding(null);
      setSubscriptions([]);
      await load();
    } else {
      setMutationTone("error");
      setMutationMessage("Workspace selection is temporarily unavailable. Your current workspace has not changed.");
    }
  }

  async function refreshOnboarding() {
    if (!canUpdateOnboarding) return;
    setMutationMessage("");
    setMutationTone(null);
    setRefreshing(true);
    const response = await safeMutationFetch("/tenant/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "refresh" }),
    });
    if (response.ok) {
      setOnboarding((await response.json()).onboarding);
      setMutationTone("success");
      setMutationMessage("Launch checklist refreshed from current product evidence.");
    } else {
      setMutationTone("error");
      setMutationMessage("The launch checklist could not be refreshed. Your product setup is unchanged.");
    }
    setRefreshing(false);
  }

  async function logout() {
    setMutationMessage("");
    setMutationTone(null);
    const response = await safeMutationFetch("/tenant/auth/logout", { method: "POST" });
    if (response.ok) window.location.replace("/");
    else {
      setMutationTone("error");
      setMutationMessage("Sign out could not be confirmed. Your current session remains open.");
    }
  }

  if (loading) return <main className="workspace-loading">Loading workspace...</main>;
  if (loadError && !selectedTenantId) return <WorkspaceSessionLoadError onRetry={() => void load()} />;

  if (!selectedTenantId) {
    return (
      <main className="workspace-picker">
        <div className="picker-wrap">
          <span className="mark">D</span>
          <p>DJAY Bot workspace</p>
          <h1>Choose a business</h1>
          <div className="workspace-list">
            {workspaces.map((workspace) => (
              <button key={workspace.tenantId} type="button" onClick={() => selectWorkspace(workspace.tenantId)}>
                <strong>{workspace.businessName}</strong><span>{humanizeTenantRole(workspace.role)}</span>
              </button>
            ))}
          </div>
          {mutationMessage ? <p className="inline-message" role="alert">{mutationMessage}</p> : null}
          <button className="quiet-command" type="button" onClick={logout}>Sign out</button>
        </div>
      </main>
    );
  }

  if (loadError) return <WorkspacePageLoadError active="overview" title={activeWorkspace?.businessName || "Workspace"} resource="workspace setup" workspaces={workspaces} selectedTenantId={selectedTenantId} onSelect={(tenantId) => void selectWorkspace(tenantId)} onLogout={() => void logout()} onRetry={() => void load()} />;

  const readiness = onboarding?.readiness;
  const checklist = onboarding?.checklist ?? [];
  const primaryAction = onboarding?.primaryAction ?? null;

  return (
    <main className="workspace-shell">
      <WorkspaceSidebar
        active="overview"
        workspaces={workspaces}
        selectedTenantId={selectedTenantId}
        onSelect={(tenantId) => void selectWorkspace(tenantId)}
        onLogout={() => void logout()}
      />
      <section id="workspace-main" className="workspace-main" tabIndex={-1}>
        <header className="workspace-header">
          <div><p>Workspace</p><h1>{activeWorkspace?.businessName || onboarding?.business_name}</h1></div>
          <span className="role-label">{activeWorkspace ? humanizeTenantRole(activeWorkspace.role) : ""}</span>
        </header>
        {mutationMessage ? <p className={`inline-message dashboard-inline-message ${mutationTone || "error"}`} role={mutationTone === "success" ? "status" : "alert"}>{mutationMessage}</p> : null}
        {!canUpdateOnboarding ? <WorkspaceViewOnly>You can review launch progress. A workspace administrator can refresh the evidence after setup or testing.</WorkspaceViewOnly> : null}
        <section className="onboarding-band" aria-labelledby="onboarding-title">
          <div className="band-heading"><div><p>Guided setup</p><h2 id="onboarding-title">Launch checklist</h2></div><span>{onboarding ? humanizeOnboardingStage(onboarding.stage) : "Account created"}</span></div>
          <p className="control-copy">Progress comes from server-verified workspace and product evidence. A browser cannot mark setup ready by choosing a stage.</p>
          {primaryAction ? (
            <p className="onboarding-primary-action">
              <a className="primary-command" href={primaryAction.href}>{primaryAction.label}</a>
            </p>
          ) : null}
          <ol className="onboarding-checklist">
            {checklist.map((step, index) => <li className={step.complete ? "complete" : "pending"} key={step.key}>
              <span className="onboarding-step-number" aria-hidden="true">{step.complete ? "✓" : index + 1}</span>
              <div><strong>{step.label}</strong><p>{step.detail}</p>{step.nextHref && !step.complete ? <a href={step.nextHref}>{step.nextLabel || "Continue setup"}</a> : null}</div>
              <small>{step.complete ? "Complete" : "Action needed"}</small>
            </li>)}
          </ol>
          {readiness?.productStates.length ? <div className="product-lifecycle-list" aria-label="Product setup progress">{readiness.productStates.map((product) => {
            const title = product.productKey === "flowbot" ? "Flow Bot" : product.productKey === "ai_chat" ? "AI Text Bot" : "AI Voice Bot";
            const labels = [
              ["Access", product.activeAccess], ["Configured", product.configured], ["Deployed", product.deployed], ["Tested", product.tested], ["Ready", product.launchReady],
            ] as const;
            const actionHref = product.nextAction === "activate" ? "/workspace/usage"
              : product.nextAction === "operate" ? "/workspace/operations"
                : product.productKey === "flowbot"
                  ? "/workspace/setup"
                  : productRoutes[product.productKey];
            const actionLabel = product.nextAction === "operate"
              ? "Open operations"
              : product.nextAction === "activate"
                ? "Continue to payment"
                : `Continue ${humanizeToken(product.nextAction)}`;
            return <article key={product.productKey}><div><span>{product.launchReady ? "Live operations" : "Setup in progress"}</span><h3>{title}</h3></div>
              <ol>{labels.map(([label, complete]) => <li className={complete ? "complete" : "pending"} key={label}><span aria-hidden="true">{complete ? "✓" : "·"}</span>{label}</li>)}</ol>
              <a href={actionHref}>{actionLabel}</a>
            </article>;
          })}</div> : null}
          <div className="onboarding-refresh">
            <p>Public rollout still requires the applicable product, legal, commercial, and operational release gates.</p>
            {canUpdateOnboarding ? <button type="button" disabled={refreshing} onClick={() => void refreshOnboarding()}>{refreshing ? "Checking evidence…" : "Refresh checklist"}</button> : null}
          </div>
        </section>
        <section className="empty-band product-overview-band">
          <p>Products</p>
          <h2>{subscriptions.length ? `${subscriptions.length} product${subscriptions.length === 1 ? "" : "s"} configured` : "No products are configured yet"}</h2>
          {subscriptions.length ? <div className="product-overview-grid">{subscriptions.map((subscription) => <a href={`/workspace/${subscription.productKey === "ai_chat" ? "ai-chat" : subscription.productKey}`} key={subscription.id}>
            <span>{subscription.tierName}</span><strong>{subscription.publicName}</strong><small>{humanizeToken(subscription.status)} · {humanizeToken(subscription.accessMode)} access</small>
          </a>)}</div> : <p className="field-help">A product appears here after its subscription request is created. Public charging remains disabled until the commercial release gate is approved.</p>}
        </section>
      </section>
    </main>
  );
}
