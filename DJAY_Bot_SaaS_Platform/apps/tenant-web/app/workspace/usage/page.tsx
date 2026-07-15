"use client";

import { useEffect, useMemo, useState } from "react";
import { WorkspaceSidebar } from "../WorkspaceSidebar";
import { useWorkspaceSession } from "../useWorkspaceSession";

type Subscription = {
  id: string; productKey: string; planKey: string; publicName: string; tierName: string;
  status: string; accessMode: string; periodStart: string | null; periodEnd: string | null;
};

export default function UsagePage() {
  const session = useWorkspaceSession();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const activeWorkspace = useMemo(
    () => session.workspaces.find((workspace) => workspace.tenantId === session.selectedTenantId),
    [session.workspaces, session.selectedTenantId],
  );
  useEffect(() => {
    if (!session.selectedTenantId) return;
    void fetch("/tenant/subscriptions", { cache: "no-store" }).then(async (response) => {
      if (response.ok) setSubscriptions((await response.json()).subscriptions || []);
    });
  }, [session.selectedTenantId]);

  if (session.loading || !session.selectedTenantId) return <main className="workspace-loading">Loading usage...</main>;
  return (
    <main className="workspace-shell">
      <WorkspaceSidebar active="usage" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId}
        onSelect={(tenantId) => void session.selectWorkspace(tenantId)} onLogout={() => void session.logout()} />
      <section className="workspace-main">
        <header className="workspace-header"><div><p>Workspace</p><h1>Plans and usage</h1></div><span className="role-label">{activeWorkspace?.businessName}</span></header>
        <section className="tool-band">
          <div className="band-heading"><div><p>Products</p><h2>Subscriptions</h2></div><span>{subscriptions.length}</span></div>
          <div className="data-table" role="table" aria-label="Product subscriptions">
            {subscriptions.map((subscription) => (
              <div className="data-row" role="row" key={subscription.id}>
                <div><strong>{subscription.publicName}</strong><span>{subscription.productKey.replaceAll("_", " ")}</span></div>
                <span className="role-label">{subscription.status.replaceAll("_", " ")}</span>
                <span>{subscription.accessMode === "active" ? "Available" : subscription.accessMode === "read_only" ? "Read only" : "Awaiting activation"}</span>
              </div>
            ))}
            {!subscriptions.length ? <div className="pending-line"><strong>No plan selected</strong><span>Select a product during onboarding.</span></div> : null}
          </div>
        </section>
      </section>
    </main>
  );
}
