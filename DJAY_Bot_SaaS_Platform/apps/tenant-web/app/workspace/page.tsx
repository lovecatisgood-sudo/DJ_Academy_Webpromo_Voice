"use client";

import { useEffect, useState } from "react";
import { tenantRoleAllows, type TenantRole } from "@djay/authorization";
import { safeMutationFetch } from "@djay/shared";
import { WorkspacePageLoadError, WorkspaceSessionLoadError, WorkspaceViewOnly } from "./WorkspaceAccess";
import { WorkspaceSidebar, type WorkspaceSummary } from "./WorkspaceSidebar";

type Workspace = WorkspaceSummary;

type Onboarding = {
  tenant_id: string;
  business_name: string;
  slug: string;
  locale: string;
  timezone: string;
  stage: "account_created" | "business_profile" | "product_selection" | "ready";
};
type Subscription = {
  id: string; productKey: "flowbot" | "ai_chat" | "voice"; publicName: string;
  tierName: string; status: string; accessMode: "none" | "read_only" | "active";
};

const stages: Onboarding["stage"][] = ["account_created", "business_profile", "product_selection", "ready"];
const stageLabels: Record<Onboarding["stage"], string> = {
  account_created: "Account",
  business_profile: "Business",
  product_selection: "Products",
  ready: "Ready",
};

export default function WorkspacePage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [mutationMessage, setMutationMessage] = useState("");
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

  async function selectWorkspace(tenantId: string) {
    setMutationMessage("");
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
    } else setMutationMessage("Workspace selection is temporarily unavailable. Your current workspace has not changed.");
  }

  async function updateStage(stage: Onboarding["stage"]) {
    if (!canUpdateOnboarding) return;
    setMutationMessage("");
    const response = await safeMutationFetch("/tenant/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    });
    if (response.ok) setOnboarding((current) => current ? { ...current, stage } : current);
    else setMutationMessage("The onboarding stage could not be changed. Your saved setup is unchanged.");
  }

  async function logout() {
    setMutationMessage("");
    const response = await safeMutationFetch("/tenant/auth/logout", { method: "POST" });
    if (response.ok) window.location.replace("/");
    else setMutationMessage("Sign out could not be confirmed. Your current session remains open.");
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
                <strong>{workspace.businessName}</strong><span>{workspace.role.replaceAll("_", " ")}</span>
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

  return (
    <main className="workspace-shell">
      <WorkspaceSidebar
        active="overview"
        workspaces={workspaces}
        selectedTenantId={selectedTenantId}
        onSelect={(tenantId) => void selectWorkspace(tenantId)}
        onLogout={() => void logout()}
      />
      <section className="workspace-main">
        <header className="workspace-header">
          <div><p>Workspace</p><h1>{activeWorkspace?.businessName || onboarding?.business_name}</h1></div>
          <span className="role-label">{activeWorkspace?.role.replaceAll("_", " ")}</span>
        </header>
        {mutationMessage ? <p className="inline-message dashboard-inline-message" role="alert">{mutationMessage}</p> : null}
        {!canUpdateOnboarding ? <WorkspaceViewOnly>You can review workspace setup. A workspace administrator can change onboarding stages.</WorkspaceViewOnly> : null}
        <section className="onboarding-band" aria-labelledby="onboarding-title">
          <div className="band-heading"><div><p>Setup</p><h2 id="onboarding-title">Workspace onboarding</h2></div><span>{onboarding?.timezone || "Asia/Bangkok"}</span></div>
          <div className="stage-control" aria-label="Onboarding stage">
            {stages.map((stage) => (
              <button
                key={stage}
                type="button"
                className={onboarding?.stage === stage ? "current" : ""}
                disabled={!canUpdateOnboarding}
                onClick={() => void updateStage(stage)}
              >{stageLabels[stage]}</button>
            ))}
          </div>
        </section>
        <section className="empty-band product-overview-band">
          <p>Products</p>
          <h2>{subscriptions.length ? `${subscriptions.length} product${subscriptions.length === 1 ? "" : "s"} configured` : "No products are configured yet"}</h2>
          {subscriptions.length ? <div className="product-overview-grid">{subscriptions.map((subscription) => <a href={`/workspace/${subscription.productKey === "ai_chat" ? "ai-chat" : subscription.productKey}`} key={subscription.id}>
            <span>{subscription.tierName}</span><strong>{subscription.publicName}</strong><small>{subscription.status.replaceAll("_", " ")} · {subscription.accessMode.replaceAll("_", " ")} access</small>
          </a>)}</div> : <p className="field-help">A product appears here after its subscription request is created. Public charging remains disabled until the commercial release gate is approved.</p>}
        </section>
      </section>
    </main>
  );
}
