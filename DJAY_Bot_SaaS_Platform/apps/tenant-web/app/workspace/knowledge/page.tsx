"use client";

import { currentIntlLocale, safeMutationFetch } from "@djay/shared";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { WorkspaceSidebar } from "../WorkspaceSidebar";
import { WorkspacePageLoadError, WorkspaceSessionLoadError, WorkspaceViewOnly } from "../WorkspaceAccess";
import { WorkspaceSupportBanner } from "../WorkspaceSupportBanner";
import { useWorkspaceSession } from "../useWorkspaceSession";

type Source = { id: string; name: string; sourceKind: string; status: string; version: number; revisionCreatedAt: string };
type Collection = { id: string; name: string; description: string; sourceCount: number; itemCount: number };
type CatalogItem = { id: string; itemKind: "product" | "service"; externalKey: string; name: string; description: string; priceMinor: number | null; currency: string | null; status: string };

export default function KnowledgePage() {
  const session = useWorkspaceSession();
  const [sources, setSources] = useState<Source[]>([]); const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState(""); const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [message, setMessage] = useState(""); const [working, setWorking] = useState(false); const [loadError, setLoadError] = useState(false);
  const workspace = useMemo(() => session.workspaces.find((item) => item.tenantId === session.selectedTenantId), [session]);
  const canWrite = session.allows("knowledge.write");

  async function load() {
    try {
      const [sourceResponse, collectionResponse] = await Promise.all([
        fetch("/tenant/knowledge", { cache: "no-store" }), fetch("/tenant/knowledge/collections", { cache: "no-store" }),
      ]);
      if (!sourceResponse.ok || !collectionResponse.ok) throw new Error("knowledge_unavailable");
      const nextSources = (await sourceResponse.json()).sources || []; const nextCollections = (await collectionResponse.json()).collections || [];
      setSources(nextSources); setCollections(nextCollections); setSelectedCollectionId((current) => current || nextCollections[0]?.id || ""); setLoadError(false);
    } catch { setLoadError(true); }
  }
  async function loadCatalog(collectionId: string) {
    if (!collectionId) { setCatalog([]); return; }
    const response = await fetch(`/tenant/knowledge/catalog?collectionId=${encodeURIComponent(collectionId)}`, { cache: "no-store" });
    setCatalog(response.ok ? (await response.json()).items || [] : []);
  }
  useEffect(() => { if (session.selectedTenantId) void load(); }, [session.selectedTenantId]);
  useEffect(() => { void loadCatalog(selectedCollectionId); }, [selectedCollectionId]);

  async function mutate(path: string, body: unknown, success: string, form?: HTMLFormElement) {
    setWorking(true); setMessage("");
    const response = await safeMutationFetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setWorking(false); if (!response.ok) { setMessage("The requested knowledge change could not be completed."); return null; }
    form?.reset(); setMessage(success); await load(); await loadCatalog(selectedCollectionId); return response;
  }
  async function createCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const response = await mutate("/tenant/knowledge/collections", { name: data.get("name"), description: data.get("description") }, "Collection created.", form);
    if (response) { const body = await response.json(); setSelectedCollectionId(body.collectionId); }
  }
  async function createSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    await mutate("/tenant/knowledge", { collectionId: selectedCollectionId, name: data.get("name"), sourceKind: "text", content: data.get("content") }, "Approved text added.", form);
  }
  async function createCrawl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    await mutate("/tenant/knowledge/crawls", { collectionId: selectedCollectionId, name: data.get("name"), url: data.get("url"),
      refreshIntervalHours: Number(data.get("refreshIntervalHours")) }, "Website crawl queued.", form);
  }
  async function uploadFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const file = data.get("file");
    if (!(file instanceof File) || !file.size) return; setWorking(true); setMessage("");
    try {
      const initiated = await safeMutationFetch("/tenant/knowledge/uploads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        collectionId: selectedCollectionId, name: data.get("name"), filename: file.name, mediaType: file.type || "text/plain", size: file.size,
      }) });
      if (!initiated.ok) throw new Error("init_failed"); const upload = await initiated.json();
      const sent = await fetch(upload.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type || "text/plain" }, body: file });
      if (!sent.ok) throw new Error("upload_failed");
      const completed = await safeMutationFetch(`/tenant/knowledge/uploads/${upload.objectId}/complete`, { method: "POST" });
      if (!completed.ok) throw new Error("complete_failed"); form.reset(); setMessage("File uploaded. Malware scanning and extraction are queued."); await load();
    } catch { setMessage("The file could not be uploaded."); } finally { setWorking(false); }
  }
  async function saveCatalog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const price = String(data.get("price") || "").trim();
    await mutate("/tenant/knowledge/catalog", { collectionId: selectedCollectionId, itemKind: data.get("itemKind"), externalKey: data.get("externalKey"),
      name: data.get("name"), description: data.get("description"), priceMinor: price ? Math.round(Number(price) * 100) : null,
      currency: price ? data.get("currency") : null, attributes: {} }, "Catalogue item saved.", form);
  }

  if (session.error) return <WorkspaceSessionLoadError onRetry={() => window.location.reload()} />;
  if (session.loading || !session.selectedTenantId) return <main className="workspace-loading">Loading knowledge...</main>;
  if (loadError) return <WorkspacePageLoadError active="knowledge" title="Knowledge" resource="business content" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} onRetry={() => void load()} />;
  return <main className="workspace-shell"><WorkspaceSidebar active="knowledge" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} />
    <section className="workspace-main"><WorkspaceSupportBanner tenantId={session.selectedTenantId} />
      <header className="workspace-header"><div><p>Business content</p><h1>Knowledge</h1></div><span className="role-label">{workspace?.businessName}</span></header>
      {!canWrite ? <WorkspaceViewOnly>You can review approved business content. A workspace administrator can add sources.</WorkspaceViewOnly> : null}
      <section className="tool-band"><div className="band-heading"><div><p>Knowledge boundaries</p><h2>Collections</h2></div><span>{collections.length}</span></div>
        {canWrite ? <form className="flowbot-deploy" onSubmit={createCollection}><label>Name<input name="name" minLength={2} maxLength={160} required /></label><label>Description<input name="description" maxLength={1000} /></label><button disabled={working}>Create collection</button></form> : null}
        <div className="data-table">{collections.map((item) => <button type="button" className={`data-row collection-row${selectedCollectionId === item.id ? " selected" : ""}`} key={item.id} onClick={() => setSelectedCollectionId(item.id)}><div><strong>{item.name}</strong><span>{item.description || "Business knowledge"}</span></div><span>{item.sourceCount} sources</span><span>{item.itemCount} catalogue items</span></button>)}{!collections.length ? <div className="pending-line"><strong>No collection</strong><span>Create the knowledge boundary for your first agent.</span></div> : null}</div>
      </section>
      {canWrite && selectedCollectionId ? <>
        <section className="tool-band muted-band"><div className="band-heading"><div><p>Approved copy</p><h2>Add text</h2></div></div><form className="knowledge-form" onSubmit={createSource}><label>Name<input name="name" minLength={2} maxLength={160} required /></label><label>Content<textarea name="content" rows={6} maxLength={500000} required /></label><button disabled={working}>Add approved text</button></form></section>
        <section className="tool-band"><div className="band-heading"><div><p>Scheduled import</p><h2>Crawl a website page</h2></div></div><form className="flowbot-deploy" onSubmit={createCrawl}><label>Name<input name="name" minLength={2} maxLength={160} required /></label><label>HTTPS page URL<input name="url" type="url" placeholder="https://example.com/services" required /></label><label>Refresh<select name="refreshIntervalHours" defaultValue="168"><option value="168">Weekly</option><option value="720">Monthly</option><option value="24">Daily</option></select></label><button disabled={working}>Queue crawl</button></form></section>
        <section className="tool-band muted-band"><div className="band-heading"><div><p>Scanned documents</p><h2>Upload PDF, DOCX or TXT</h2></div><span>10 MB max</span></div><form className="flowbot-deploy" onSubmit={uploadFile}><label>Name<input name="name" minLength={2} maxLength={160} required /></label><label>Document<input name="file" type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" required /></label><button disabled={working}>Upload document</button></form></section>
        <section className="tool-band"><div className="band-heading"><div><p>Structured recommendations</p><h2>Products and services</h2></div><span>{catalog.length}</span></div><form className="knowledge-form" onSubmit={saveCatalog}><div><label>Type<select name="itemKind"><option value="product">Product</option><option value="service">Service</option></select></label><label>Reference<input name="externalKey" pattern="[a-zA-Z0-9_.-]{1,100}" required /></label><label>Name<input name="name" minLength={2} maxLength={200} required /></label></div><label>Description<textarea name="description" rows={4} maxLength={10000} required /></label><div><label>Price<input name="price" type="number" min="0" step="0.01" /></label><label>Currency<select name="currency" defaultValue="THB"><option value="THB">THB</option><option value="USD">USD</option></select></label></div><button disabled={working}>Save item</button></form><div className="data-table">{catalog.map((item) => <div className="data-row" key={item.id}><div><strong>{item.name}</strong><span>{item.externalKey} / {item.itemKind}</span></div><span>{item.priceMinor === null ? "Contact for price" : `${item.currency} ${(item.priceMinor / 100).toLocaleString(currentIntlLocale())}`}</span><span>{item.status}</span></div>)}</div></section>
      </> : null}
      {message ? <p className="inline-message" role="status">{message}</p> : null}
      <section className="tool-band muted-band"><div className="band-heading"><div><p>Ready revisions</p><h2>Source library</h2></div><span>{sources.length}</span></div><div className="data-table">{sources.map((source) => <div className="data-row" key={source.id}><div><strong>{source.name}</strong><span>{source.sourceKind} / revision {source.version}</span></div><span>{source.status}</span><span>{new Date(source.revisionCreatedAt).toLocaleDateString(currentIntlLocale())}</span></div>)}{!sources.length ? <div className="pending-line"><strong>No ready source</strong><span>Queued crawls and uploads appear after scanning and extraction.</span></div> : null}</div></section>
    </section>
  </main>;
}
