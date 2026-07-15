"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { WorkspaceSidebar } from "../WorkspaceSidebar";
import { WorkspaceSupportBanner } from "../WorkspaceSupportBanner";
import { useWorkspaceSession } from "../useWorkspaceSession";

type Deployment = {
  id: string; name: string; keyPrefix: string; allowedOrigins: string[]; defaultLocale: "th" | "en";
  maxCallSeconds: number; reconnectWindowSeconds: number; status: "active" | "disabled" | "revoked";
};
type VoiceResult = {
  capability: { enabled: true; publicLabel: "First-Generation Voice Engine" } | null;
  deployments: Deployment[];
};

export default function VoicePage() {
  const session = useWorkspaceSession();
  const [result, setResult] = useState<VoiceResult>({ capability: null, deployments: [] });
  const [deploymentKey, setDeploymentKey] = useState("");
  const [message, setMessage] = useState(""); const [working, setWorking] = useState(false);
  const workspace = useMemo(() => session.workspaces.find((item) => item.tenantId === session.selectedTenantId), [session]);
  const canDeploy = workspace?.role === "tenant_master_admin" || workspace?.role === "tenant_admin";

  async function load() {
    const response = await fetch("/tenant/voice/deployments", { cache: "no-store" });
    if (response.ok) setResult(await response.json());
  }
  useEffect(() => { if (session.selectedTenantId) void load(); }, [session.selectedTenantId]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    setWorking(true); setMessage(""); setDeploymentKey("");
    const response = await fetch("/tenant/voice/deployments", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: data.get("name"), allowedOrigins: [data.get("origin")], defaultLocale: data.get("defaultLocale"),
        greetingTh: data.get("greetingTh"), greetingEn: data.get("greetingEn"),
        automatedDisclosureTh: data.get("automatedDisclosureTh"), automatedDisclosureEn: data.get("automatedDisclosureEn"),
        maxCallSeconds: Number(data.get("maxCallSeconds")), reconnectWindowSeconds: Number(data.get("reconnectWindowSeconds")),
      }),
    });
    const body = await response.json(); setWorking(false);
    if (!response.ok) { setMessage(response.status === 403 ? "Voice Agent Basic is not active for this workspace." : "Deployment could not be created."); return; }
    setDeploymentKey(body.deploymentKey); setMessage("Deployment created. Copy its key now; it will not be shown again.");
    form.reset(); await load();
  }

  async function changeStatus(deploymentId: string, action: "enable" | "disable" | "revoke") {
    setWorking(true); setMessage("");
    const response = await fetch(`/tenant/voice/deployments/${deploymentId}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }),
    });
    setWorking(false); setMessage(response.ok ? `Deployment ${action} request completed.` : "Deployment state could not be changed.");
    await load();
  }

  if (session.loading || !session.selectedTenantId) return <main className="workspace-loading">Loading Voice...</main>;
  return <main className="workspace-shell">
    <WorkspaceSidebar active="voice" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} />
    <section className="workspace-main"><WorkspaceSupportBanner tenantId={session.selectedTenantId} />
      <header className="workspace-header"><div><p>Browser voice</p><h1>Voice Agent Basic</h1></div><span className="role-label">{result.capability?.publicLabel || "Unavailable"}</span></header>
      <section className="tool-band"><div className="band-heading"><div><p>Opaque browser sessions</p><h2>Voice deployments</h2></div><span>{result.deployments.length}</span></div>
        <p className="field-help">Provider routing is managed internally and is never exposed here. Recording remains off. Public Voice runtime activation is still controlled by the release gate.</p>
        {canDeploy && result.capability ? <form className="flowbot-deploy" onSubmit={create}>
          <label>Name<input name="name" minLength={2} maxLength={160} required /></label>
          <label>Allowed website origin<input name="origin" type="url" placeholder="https://www.example.com" required /></label>
          <label>Default language<select name="defaultLocale" defaultValue="en"><option value="en">English</option><option value="th">Thai</option></select></label>
          <label>English greeting<input name="greetingEn" defaultValue="Hello, how can I help?" maxLength={1000} required /></label>
          <label>Thai greeting<input name="greetingTh" defaultValue="สวัสดีครับ มีอะไรให้ช่วยได้บ้าง?" maxLength={1000} required /></label>
          <label>English automated-agent disclosure<input name="automatedDisclosureEn" defaultValue="This is our automated voice assistant." minLength={8} maxLength={500} required /></label>
          <label>Thai automated-agent disclosure<input name="automatedDisclosureTh" defaultValue="นี่คือผู้ช่วยเสียงอัตโนมัติของเรา" minLength={8} maxLength={500} required /></label>
          <label>Maximum call seconds<input name="maxCallSeconds" type="number" min={30} max={14400} defaultValue={900} required /></label>
          <label>Reconnect window seconds<input name="reconnectWindowSeconds" type="number" min={0} max={300} defaultValue={30} required /></label>
          <button disabled={working}>Create deployment</button>
        </form> : null}
        {deploymentKey ? <div className="deployment-secret"><strong>One-time Voice deployment key</strong><code>{deploymentKey}</code><p className="field-help">The browser widget transport is the next P7 slice. Store this key in your deployment configuration; DJAY stores only its digest.</p></div> : null}
        {message ? <p className="inline-message" role="status">{message}</p> : null}
        <div className="data-table">{result.deployments.map((deployment) => <div className="data-row" key={deployment.id}>
          <div><strong>{deployment.name}</strong><span>{deployment.allowedOrigins.join(", ")} / {deployment.maxCallSeconds}s max / {deployment.reconnectWindowSeconds}s reconnect</span></div>
          <span>{deployment.status}</span><code>{deployment.keyPrefix}…</code>
          {canDeploy && deployment.status !== "revoked" ? <div className="flowbot-actions">
            <button type="button" className="secondary-command" disabled={working} onClick={() => void changeStatus(deployment.id, deployment.status === "active" ? "disable" : "enable")}>{deployment.status === "active" ? "Disable" : "Enable"}</button>
            <button type="button" className="secondary-command" disabled={working} onClick={() => void changeStatus(deployment.id, "revoke")}>Revoke</button>
          </div> : null}
        </div>)}{!result.deployments.length ? <div className="pending-line"><strong>No Voice deployments</strong><span>{result.capability ? "Create an exact-origin browser deployment." : "Voice Agent Basic is not active."}</span></div> : null}</div>
      </section>
    </section>
  </main>;
}
