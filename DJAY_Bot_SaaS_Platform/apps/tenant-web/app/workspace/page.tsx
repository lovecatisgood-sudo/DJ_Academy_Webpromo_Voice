"use client";

import { useEffect, useState } from "react";
import { safeMutationFetch } from "@djay/shared";
import { WorkspaceSidebar, type WorkspaceSummary } from "./WorkspaceSidebar";
import { BrandLockup, LocaleSwitch } from "../BrandChrome";

type ProductState = { productKey: string; activeAccess: boolean; configured: boolean; tested: boolean; deployed: boolean };
type HomePayload = {
  selectedTenantId: string;
  workspaces: WorkspaceSummary[];
  onboarding: {
    business_name: string;
    preferences: { complete: boolean; conversationExamplesReviewed: boolean };
    readiness: { productStates: ProductState[] };
  };
};
type Conversation = { id: string; status: string; channel: string; customerDisplayName?: string | null; updatedAt?: string };

function setupComplete(payload: HomePayload) {
  const flowbot = payload.onboarding.readiness.productStates.find((item) => item.productKey === "flowbot");
  return Boolean(payload.onboarding.preferences.complete
    && payload.onboarding.preferences.conversationExamplesReviewed
    && flowbot?.configured
    && flowbot.tested);
}

export default function WorkspaceHomePage() {
  const [payload, setPayload] = useState<HomePayload | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  async function load() {
    setLoading(true); setError(false);
    try {
      const response = await fetch("/tenant/setup", { cache: "no-store" });
      if ([401, 403].includes(response.status)) { window.location.replace("/"); return; }
      if (!response.ok) throw new Error("home_unavailable");
      const result = await response.json() as HomePayload;
      if (!setupComplete(result)) { window.location.replace("/workspace/setup"); return; }
      setPayload(result); setWorkspaces(result.workspaces); setLoading(false);
      void fetch("/tenant/conversations", { cache: "no-store" }).then(async (activityResponse) => {
        if (!activityResponse.ok) return;
        const activity = await activityResponse.json();
        setConversations((activity.conversations || []).slice(0, 3));
      }).catch(() => undefined);
    } catch { setError(true); setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function selectWorkspace(tenantId: string) {
    const response = await safeMutationFetch("/tenant/workspace/select", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId }),
    });
    if (response.ok) window.location.replace("/workspace/start");
    else setError(true);
  }

  async function logout() {
    const response = await safeMutationFetch("/tenant/auth/logout", { method: "POST" });
    if (response.ok) window.location.replace("/");
    else setError(true);
  }

  if (loading) return <main className="workspace-home-loading"><BrandLockup /><div className="home-skeleton" /><div className="home-skeleton short" /></main>;
  if (error || !payload) return <main className="workspace-home-loading"><BrandLockup /><h1>We couldn’t load your workspace</h1><p>Your saved information is safe.</p><button onClick={() => void load()}>Try again</button></main>;

  const flowbot = payload.onboarding.readiness.productStates.find((item) => item.productKey === "flowbot");
  const nextAction = flowbot?.deployed
    ? { title: "Your chatbot is running", detail: "Open conversations when a customer needs your team.", href: "/workspace/inbox", label: "Check conversations" }
    : { title: "Add your chatbot to your website", detail: "Your conversation is ready. Connect it to the website where customers will use it.", href: "/workspace/flowbot", label: "Add to website" };

  return <main className="workspace-shell simple-workspace-home">
    <WorkspaceSidebar active="overview" workspaces={workspaces} selectedTenantId={payload.selectedTenantId} onSelect={(id) => void selectWorkspace(id)} onLogout={() => void logout()} />
    <section id="workspace-main" className="workspace-main" tabIndex={-1}>
      <header className="simple-home-header"><div><p>Good to see you</p><h1 data-no-localize>{payload.onboarding.business_name}</h1></div><LocaleSwitch /></header>
      <div className="simple-home-content">
        <section className="home-next-action" aria-labelledby="home-next-title"><div><span>Recommended next step</span><h2 id="home-next-title">{nextAction.title}</h2><p>{nextAction.detail}</p></div><a href={nextAction.href}>{nextAction.label}</a></section>
        <section className="home-status-row" aria-label="Chatbot status"><div><span>Chatbot</span><strong>{flowbot?.configured && flowbot.tested ? "Ready" : "Needs attention"}</strong></div><div><span>Customer conversations</span><strong>{conversations === null ? "Loading…" : conversations.length ? `${conversations.length} recent` : "None yet"}</strong></div></section>
        <section className="home-conversations" aria-labelledby="home-conversations-title"><div className="simple-section-heading"><div><h2 id="home-conversations-title">Recent customer conversations</h2><p>Only the latest activity appears here.</p></div><a href="/workspace/inbox">View all</a></div>
          {conversations === null ? <div className="home-activity-skeleton" aria-label="Loading recent conversations" /> : conversations.length ? <div className="home-conversation-list">{conversations.map((item) => <a href="/workspace/inbox" key={item.id}><strong data-no-localize>{item.customerDisplayName || "Website customer"}</strong><span>{item.channel} · {item.status}</span></a>)}</div> : <div className="home-empty"><strong>No customer conversations yet</strong><span>They will appear here after your chatbot is connected to your website.</span></div>}
        </section>
        <div className="home-secondary-links"><a href="/workspace/flowbot">Manage chatbot</a><a href="/workspace/support">Get help</a></div>
      </div>
    </section>
  </main>;
}
