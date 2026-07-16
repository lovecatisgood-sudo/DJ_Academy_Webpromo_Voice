"use client";

import { useEffect, useState } from "react";
import { tenantRoleAllows, type TenantRole } from "@djay/authorization";
import { WorkspaceViewOnly } from "./WorkspaceAccess";
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
  const [loading, setLoading] = useState(true);
  const activeWorkspace = workspaces.find((workspace) => workspace.tenantId === selectedTenantId);
  const canUpdateOnboarding = activeWorkspace
    ? tenantRoleAllows(activeWorkspace.role as TenantRole, "onboarding.update")
    : false;

  async function load() {
    const sessionResponse = await fetch("/tenant/session", { cache: "no-store" });
    if (!sessionResponse.ok) {
      window.location.replace("/");
      return;
    }
    const session = await sessionResponse.json();
    setWorkspaces(session.workspaces || []);
    setSelectedTenantId(session.selectedTenantId || null);
    if (session.selectedTenantId) {
      const onboardingResponse = await fetch("/tenant/onboarding", { cache: "no-store" });
      if (onboardingResponse.ok) setOnboarding((await onboardingResponse.json()).onboarding);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function selectWorkspace(tenantId: string) {
    const response = await fetch("/tenant/workspace/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId }),
    });
    if (response.ok) {
      setLoading(true);
      setOnboarding(null);
      await load();
    }
  }

  async function updateStage(stage: Onboarding["stage"]) {
    if (!canUpdateOnboarding) return;
    const response = await fetch("/tenant/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    });
    if (response.ok) setOnboarding((current) => current ? { ...current, stage } : current);
  }

  async function logout() {
    await fetch("/tenant/auth/logout", { method: "POST" });
    window.location.replace("/");
  }

  if (loading) return <main className="workspace-loading">Loading workspace...</main>;

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
          <button className="quiet-command" type="button" onClick={logout}>Sign out</button>
        </div>
      </main>
    );
  }

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
        <section className="empty-band">
          <p>Products</p>
          <h2>No product subscription is active</h2>
        </section>
      </section>
    </main>
  );
}
