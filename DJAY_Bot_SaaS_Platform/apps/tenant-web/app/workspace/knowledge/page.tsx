"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { WorkspaceSidebar } from "../WorkspaceSidebar";
import { WorkspaceViewOnly } from "../WorkspaceAccess";
import { WorkspaceSupportBanner } from "../WorkspaceSupportBanner";
import { useWorkspaceSession } from "../useWorkspaceSession";

type Source = { id: string; name: string; sourceKind: string; status: string; version: number; revisionCreatedAt: string };

export default function KnowledgePage() {
  const session = useWorkspaceSession(); const [sources, setSources] = useState<Source[]>([]); const [message, setMessage] = useState(""); const [working, setWorking] = useState(false);
  const workspace = useMemo(() => session.workspaces.find((item) => item.tenantId === session.selectedTenantId), [session]);
  const canWrite = session.allows("knowledge.write");
  async function load() { const response = await fetch("/tenant/knowledge", { cache: "no-store" }); if (response.ok) setSources((await response.json()).sources || []); }
  useEffect(() => { if (session.selectedTenantId) void load(); }, [session.selectedTenantId]);
  async function createSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!canWrite) return; setWorking(true); setMessage(""); const form = event.currentTarget; const data = new FormData(form);
    const response = await fetch("/tenant/knowledge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: data.get("name"), sourceKind: data.get("sourceKind"), content: data.get("content") }) });
    setWorking(false); if (!response.ok) { setMessage("Knowledge source could not be added."); return; } form.reset(); setMessage("Knowledge source added as revision 1."); await load();
  }
  if (session.loading || !session.selectedTenantId) return <main className="workspace-loading">Loading knowledge...</main>;
  return <main className="workspace-shell"><WorkspaceSidebar active="knowledge" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} />
    <section className="workspace-main"><WorkspaceSupportBanner tenantId={session.selectedTenantId} />
      <header className="workspace-header"><div><p>Business content</p><h1>Knowledge</h1></div><span className="role-label">{workspace?.businessName}</span></header>
      {!canWrite ? <WorkspaceViewOnly>You can review approved business content. A workspace administrator can add sources.</WorkspaceViewOnly> : null}
      {canWrite ? <section className="tool-band"><div className="band-heading"><div><p>Source library</p><h2>Add source</h2></div></div>
        <form className="knowledge-form" onSubmit={createSource}><div><label>Name<input name="name" minLength={2} maxLength={160} required /></label><label>Type<select name="sourceKind" defaultValue="text"><option value="text">Text</option><option value="url">URL content</option><option value="structured">Structured</option><option value="file">File text</option></select></label></div><label>Content<textarea name="content" rows={8} maxLength={500000} required /></label><button type="submit" disabled={working}>{working ? "Adding..." : "Add source"}</button></form>
        {message ? <p className="inline-message" role="status">{message}</p> : null}
      </section> : null}
      <section className="tool-band muted-band"><div className="band-heading"><div><p>Sources</p><h2>Revision-backed library</h2></div><span>{sources.length}</span></div><div className="data-table">
        {sources.map((source) => <div className="data-row" key={source.id}><div><strong>{source.name}</strong><span>{source.sourceKind} / revision {source.version}</span></div><span>{source.status}</span><span>{new Date(source.revisionCreatedAt).toLocaleDateString()}</span></div>)}
        {!sources.length ? <div className="pending-line"><strong>No knowledge sources</strong><span>Add approved business content.</span></div> : null}
      </div></section>
    </section>
  </main>;
}
