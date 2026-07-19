"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { safeMutationFetch } from "@djay/shared";
import { WorkspaceSidebar } from "../WorkspaceSidebar";
import { WorkspacePageLoadError, WorkspaceSessionLoadError, WorkspaceViewOnly } from "../WorkspaceAccess";
import { useWorkspaceSession } from "../useWorkspaceSession";

type Operations = {
  addOns: { id: string; addOnKey: string; quantity: number; status: string; createdAt: string }[];
  activeAddOns: { addOnKey: string; quantity: number; status: string }[];
  serviceRequests: { id: string; serviceKind: string; productKey: string | null; status: string; createdAt: string }[];
  engagements: { id: string; serviceRequestId: string; title: string; scopeText: string; status: string; nextActionOwner: string; targetAt: string | null; updatedAt: string }[];
  engagementUpdates: { id: string; engagementId: string; authorKind: "customer" | "djai"; body: string; nextActionOwner: string | null; createdAt: string }[];
  tutorials: { tutorialKey: string; status: string; lastStepKey: string | null }[];
};
type Subscription = { id: string; productKey: "flowbot" | "ai_chat" | "voice"; planKey: string; publicName: string; status: string };

const addOnLabels: Record<string, string> = { additional_administrator: "Additional administrator", additional_workspace: "Additional workspace", additional_social_channel: "Additional social channel", starter_branding_removal: "Remove DJay Bots branding" };
const serviceLabels: Record<string, string> = { flow_starter_setup: "Starter Flow Setup", flow_advanced_design: "Advanced Flow Design", flow_complex_automation: "Complex Flow Automation", knowledge_base_setup: "Knowledge-Base Setup", ai_sales_configuration: "AI Sales Configuration", ai_advanced_sales_system: "Advanced AI Sales System", voice_agent_setup: "Voice Agent Setup", telephone_integration: "Telephone Integration", custom_voice_automation: "Custom Voice Automation", enterprise: "Enterprise solution" };
const productGuides = {
  flowbot: { tutorialKey: "flowbot.setup", title: "Flow Bot setup", href: "/workspace/flowbot" },
  ai_chat: { tutorialKey: "ai_chat.setup", title: "AI Text Bot setup", href: "/workspace/ai-chat" },
  voice: { tutorialKey: "voice.setup", title: "AI Voice Bot setup", href: "/workspace/voice" },
} as const;

export default function OperationsPage() {
  const session = useWorkspaceSession(); const [operations, setOperations] = useState<Operations | null>(null); const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loadError, setLoadError] = useState(false); const [working, setWorking] = useState(false); const [message, setMessage] = useState("");
  const [selectedAddOn, setSelectedAddOn] = useState("additional_administrator");
  const addOnIdempotencyKey = useRef<string | null>(null);
  const serviceIdempotencyKey = useRef<string | null>(null);
  const engagementIdempotencyKeys = useRef(new Map<string, string>());
  async function load() {
    try {
      const [operationResponse, subscriptionResponse] = await Promise.all([fetch("/tenant/operations", { cache: "no-store" }), fetch("/tenant/subscriptions", { cache: "no-store" })]);
      if (!operationResponse.ok || !subscriptionResponse.ok) throw new Error("operations_unavailable");
      setOperations((await operationResponse.json()).operations); setSubscriptions((await subscriptionResponse.json()).subscriptions || []); setLoadError(false);
    } catch { setLoadError(true); }
  }
  useEffect(() => { if (session.selectedTenantId) void load(); }, [session.selectedTenantId]);
  async function requestAddOn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setWorking(true); setMessage("");
    const addOnKey = String(data.get("addOnKey")); const subscriptionId = String(data.get("subscriptionId") || "");
    const requestedScope = addOnKey === "additional_workspace" ? {
      businessName: String(data.get("workspaceBusinessName") || "").trim(), slug: String(data.get("workspaceSlug") || "").trim().toLowerCase(),
    } : {};
    if (addOnKey !== "additional_workspace" && !subscriptionId) { setWorking(false); setMessage("Select the product contract that will receive this add-on."); return; }
    addOnIdempotencyKey.current ??= crypto.randomUUID();
    const response = await safeMutationFetch("/tenant/operations", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request_add_on", addOnKey, quantity: Number(data.get("quantity")), ...(subscriptionId ? { subscriptionId } : {}), requestedScope, idempotencyKey: addOnIdempotencyKey.current }) });
    setWorking(false); setMessage(response.ok ? "Add-on request submitted for review and fulfillment." : "The add-on request could not be submitted."); if (response.ok) { addOnIdempotencyKey.current = null; form.reset(); await load(); }
  }
  async function requestService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setWorking(true); setMessage("");
    const productKey = String(data.get("productKey") || "");
    serviceIdempotencyKey.current ??= crypto.randomUUID();
    const response = await safeMutationFetch("/tenant/operations", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request_service", serviceKind: data.get("serviceKind"), brief: data.get("brief"), idempotencyKey: serviceIdempotencyKey.current, ...(productKey ? { productKey } : {}) }) });
    setWorking(false); setMessage(response.ok ? "Service request submitted. Its next action will appear here." : "The service request could not be submitted."); if (response.ok) { serviceIdempotencyKey.current = null; form.reset(); await load(); }
  }
  async function sendEngagementUpdate(event: FormEvent<HTMLFormElement>, engagementId: string) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setWorking(true); setMessage("");
    const idempotencyKey = engagementIdempotencyKeys.current.get(engagementId) ?? crypto.randomUUID();
    engagementIdempotencyKeys.current.set(engagementId, idempotencyKey);
    const response = await safeMutationFetch("/tenant/operations", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "engagement_update", engagementId, body: data.get("body"), idempotencyKey }) });
    setWorking(false); setMessage(response.ok ? "Update sent to the DJAI delivery team." : "The engagement update could not be sent.");
    if (response.ok) { engagementIdempotencyKeys.current.delete(engagementId); form.reset(); await load(); }
  }
  async function completeGuide(tutorialKey: string) {
    setWorking(true); setMessage("");
    const response = await safeMutationFetch("/tenant/operations", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "tutorial", tutorialKey, status: "completed", lastStepKey: "reviewed_setup_workspace" }) });
    setWorking(false); setMessage(response.ok ? "Setup guide progress saved." : "Setup guide progress could not be saved.");
    if (response.ok) await load();
  }
  if (session.error) return <WorkspaceSessionLoadError onRetry={() => window.location.reload()} />;
  if (session.loading || !session.selectedTenantId) return <main className="workspace-loading">Loading services...</main>;
  if (loadError) return <WorkspacePageLoadError active="operations" title="Services & add-ons" resource="operations" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} onRetry={() => void load()} />;
  const canManage = session.allows("subscriptions.manage");
  const eligibleSubscriptions = subscriptions.filter((subscription) => selectedAddOn === "additional_social_channel"
    ? subscription.productKey !== "voice"
    : selectedAddOn === "starter_branding_removal"
      ? ["flowbot_basic", "ai_chat_basic", "voice_basic_gen1"].includes(subscription.planKey)
      : true);
  return <main className="workspace-shell"><WorkspaceSidebar active="operations" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} />
    <section className="workspace-main"><header className="workspace-header"><div><p>Workspace operations</p><h1>Services & add-ons</h1></div><span className="role-label">{operations?.activeAddOns.length || 0} active add-ons</span></header>
      {message ? <p className="inline-message dashboard-inline-message" role="status">{message}</p> : null}
      {!canManage ? <WorkspaceViewOnly>You can review setup progress and active services. A workspace administrator can request add-ons or professional services.</WorkspaceViewOnly> : null}
      <section className="tool-band muted-band"><div className="band-heading"><div><p>Product onboarding</p><h2>Setup guides</h2></div><span>{operations?.tutorials.filter((item) => item.status === "completed").length || 0} completed</span></div>
        <div className="operations-guide-list">{subscriptions.map((subscription) => {
          const guide = productGuides[subscription.productKey]; const progress = operations?.tutorials.find((item) => item.tutorialKey === guide.tutorialKey);
          return <div key={subscription.id}><div><strong>{guide.title}</strong><span>{subscription.publicName}</span></div><small>{progress?.status || "not started"}</small><a href={guide.href}>Open setup</a>{progress?.status !== "completed" ? <button type="button" disabled={working} onClick={() => void completeGuide(guide.tutorialKey)}>Mark reviewed</button> : null}</div>;
        })}{!subscriptions.length ? <p className="field-help">Setup guides appear when a product subscription is available in this workspace.</p> : null}</div>
      </section>
      <section className="tool-band"><div className="band-heading"><div><p>Capacity and presentation</p><h2>Request an add-on</h2></div><span>Provisioned after approval</span></div>
        {canManage ? <><form className="operations-request-form" id="workspace-add-on-request" onSubmit={requestAddOn}><label>Add-on<select name="addOnKey" value={selectedAddOn} onChange={(event) => setSelectedAddOn(event.target.value)}>{Object.entries(addOnLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>Product contract<select key={selectedAddOn} name="subscriptionId" defaultValue="" disabled={selectedAddOn === "additional_workspace"} required={selectedAddOn !== "additional_workspace"}><option value="">Select product</option>{eligibleSubscriptions.map((item) => <option key={item.id} value={item.id}>{item.publicName}</option>)}</select></label>
          <label>Quantity<input name="quantity" type="number" min="1" max={selectedAddOn === "additional_workspace" || selectedAddOn === "starter_branding_removal" ? "1" : "100"} defaultValue="1" readOnly={selectedAddOn === "additional_workspace" || selectedAddOn === "starter_branding_removal"} required /></label><button disabled={working}>Submit request</button></form>
        {selectedAddOn === "additional_workspace" ? <div className="workspace-request-fields"><label>Business name<input name="workspaceBusinessName" form="workspace-add-on-request" minLength={2} maxLength={200} required /></label><label>Workspace address<input name="workspaceSlug" form="workspace-add-on-request" pattern="[a-z0-9][a-z0-9-]{1,62}" minLength={2} maxLength={63} placeholder="second-business" required /></label></div> : null}</> : null}
        <div className="operations-status-list">{operations?.addOns.map((item) => <div key={item.id}><strong>{addOnLabels[item.addOnKey] || item.addOnKey}</strong><span>{item.quantity} requested</span><small>{item.status}</small></div>)}</div>
      </section>
      <section className="tool-band muted-band"><div className="band-heading"><div><p>Professional delivery</p><h2>Setup and Enterprise services</h2></div><span>{operations?.engagements.length || 0} engagements</span></div>
        {canManage ? <form className="operations-service-form" onSubmit={requestService}><label>Service<select name="serviceKind" defaultValue="knowledge_base_setup">{Object.entries(serviceLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>Product<select name="productKey" defaultValue=""><option value="">Workspace-wide / Enterprise</option><option value="flowbot">Flow Bot</option><option value="ai_chat">AI Text Bot</option><option value="voice">AI Voice Bot</option></select></label>
          <label className="wide-field">Business requirement<textarea name="brief" minLength={20} maxLength={10000} rows={4} required /></label><button disabled={working}>Request consultation</button></form> : null}
        <div className="operations-engagement-list">{operations?.engagements.map((item) => <article key={item.id}><header><div><strong>{item.title}</strong><span>{item.scopeText}</span></div><div><small>{item.status}</small><span>Next action: {item.nextActionOwner}</span></div></header>
          <div className="engagement-timeline">{operations.engagementUpdates.filter((update) => update.engagementId === item.id).map((update) => <div key={update.id}><strong>{update.authorKind === "djai" ? "DJAI" : "Your team"}</strong><p>{update.body}</p><time dateTime={update.createdAt}>{new Date(update.createdAt).toLocaleString()}</time></div>)}</div>
          {canManage && !["completed", "cancelled"].includes(item.status) ? <form onSubmit={(event) => void sendEngagementUpdate(event, item.id)}><label>Update for the delivery team<textarea name="body" minLength={2} maxLength={5000} rows={2} required /></label><button disabled={working}>Send update</button></form> : null}
        </article>)}{operations?.serviceRequests.filter((item) => !operations.engagements.some((engagement) => engagement.serviceRequestId === item.id)).map((item) => <article key={item.id}><header><div><strong>{serviceLabels[item.serviceKind] || item.serviceKind}</strong><span>{item.productKey?.replace("ai_chat", "AI Text") || "Workspace"}</span></div><small>{item.status}</small></header></article>)}</div>
      </section>
    </section></main>;
}
