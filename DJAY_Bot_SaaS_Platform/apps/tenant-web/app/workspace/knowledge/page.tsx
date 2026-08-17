"use client";

import { currentIntlLocale, safeMutationFetch } from "@djay/shared";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { WorkspaceSidebar } from "../WorkspaceSidebar";
import { WorkspacePageLoadError, WorkspaceSessionLoadError, WorkspaceViewOnly } from "../WorkspaceAccess";
import { WorkspaceSupportBanner } from "../WorkspaceSupportBanner";
import { useWorkspaceSession } from "../useWorkspaceSession";
import { StructuredCataloguePanel } from "./StructuredCataloguePanel";

type Source = { id: string; name: string; sourceKind: string; status: string; version: number; revisionCreatedAt: string; safeErrorCode: string | null };
type Collection = { id: string; name: string; description: string; sourceCount: number; itemCount: number };
const sourceFailureCopy: Record<string, string> = {
  malware_detected: "The file was rejected by malware scanning.", file_signature_mismatch: "The file contents do not match its declared type.",
  upload_size_mismatch: "The uploaded file size did not match the approved upload.", file_type_rejected: "This file type is not supported.",
  malware_scanner_unavailable: "Malware scanning is temporarily unavailable; processing will retry.",
  crawl_robots_disallowed: "This page is excluded by the website's robots policy.",
  crawl_access_denied: "The website did not permit access to the requested page.",
  crawl_scope_empty: "No accessible public pages were found in the approved website scope.",
  crawl_address_rejected: "The address is private or otherwise unsafe to crawl.",
};
export default function KnowledgePage() {
  const session = useWorkspaceSession();
  const [sources, setSources] = useState<Source[]>([]); const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [message, setMessage] = useState(""); const [working, setWorking] = useState(false); const [loadError, setLoadError] = useState(false);
  const workspace = useMemo(() => session.workspaces.find((item) => item.tenantId === session.selectedTenantId), [session]);
  const canWrite = session.allows("knowledge.write");
  const visibleSources = sourceFilter === "all" ? sources : sources.filter((source) => source.sourceKind === sourceFilter || source.status === sourceFilter);

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
  useEffect(() => { if (session.selectedTenantId) void load(); }, [session.selectedTenantId]);
  useEffect(() => {
    if (!sources.some((source) => source.status === "processing")) return;
    const timer = window.setInterval(() => void load(), 5000); return () => window.clearInterval(timer);
  }, [sources, session.selectedTenantId]);

  async function mutate(path: string, body: unknown, success: string, form?: HTMLFormElement) {
    setWorking(true); setMessage("");
    const response = await safeMutationFetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setWorking(false); if (!response.ok) { setMessage("The requested knowledge change could not be completed."); return null; }
    form?.reset(); setMessage(success); await load(); return response;
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
      refreshIntervalHours: Number(data.get("refreshIntervalHours")), authorized: data.get("authorized") === "on" }, "Website crawl queued.", form);
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
  if (session.error) return <WorkspaceSessionLoadError onRetry={() => window.location.reload()} />;
  if (session.loading || !session.selectedTenantId) return <main className="workspace-loading">กำลังโหลดคลังความรู้...</main>;
  if (loadError) return <WorkspacePageLoadError active="knowledge" title="คลังความรู้" resource="business content" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} onRetry={() => void load()} />;
  return <main className="workspace-shell"><WorkspaceSidebar active="knowledge" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} />
    <section id="workspace-main" className="workspace-main" tabIndex={-1}><WorkspaceSupportBanner tenantId={session.selectedTenantId} />
      <header className="workspace-header"><div><p>เนื้อหาธุรกิจ</p><h1>คลังความรู้</h1></div><span className="role-label">{workspace?.businessName}</span></header>
      {!canWrite ? <WorkspaceViewOnly>คุณดูเนื้อหาธุรกิจที่อนุมัติแล้วได้ ผู้ดูแลเวิร์กสเปซเป็นผู้เพิ่มแหล่งข้อมูล</WorkspaceViewOnly> : null}
      <section className="knowledge-start" aria-labelledby="knowledge-start-title"><div className="band-heading"><div><p>Choose the easiest method</p><h2 id="knowledge-start-title">How do you want to teach your bot?</h2></div></div><div className="knowledge-choice-grid">
        <a href="#knowledge-paste"><strong>Paste answers</strong><span>Best for a few FAQs, policies, or service details.</span></a>
        <a href="#knowledge-website"><strong>Use a web page</strong><span>Best when approved information already lives on your HTTPS website.</span></a>
        <a href="#knowledge-upload"><strong>Upload a document</strong><span>Best for an existing PDF, DOCX, or TXT guide.</span></a>
        <a href="#knowledge-catalog"><strong>Add products or services</strong><span>Best for structured names, descriptions, and prices.</span></a>
      </div><p className="control-copy">Only add information customers are allowed to receive. Review source status below before relying on new content in a live bot.</p></section>
      <section className="tool-band"><div className="band-heading"><div><p>ขอบเขตคลังความรู้</p><h2>ชุดความรู้</h2></div><span>{collections.length}</span></div>
        {canWrite ? <form className="flowbot-deploy" onSubmit={createCollection}><label>ชื่อ<input name="name" minLength={2} maxLength={160} required /></label><label>คำอธิบาย<input name="description" maxLength={1000} /></label><button disabled={working}>สร้างชุดความรู้</button></form> : null}
        <div className="data-table">{collections.map((item) => <button type="button" className={`data-row collection-row${selectedCollectionId === item.id ? " selected" : ""}`} key={item.id} onClick={() => setSelectedCollectionId(item.id)}><div><strong data-no-localize>{item.name}</strong><span data-no-localize>{item.description || "ความรู้ธุรกิจ"}</span></div><span>{item.sourceCount} sources</span><span>{item.itemCount} catalogue items</span></button>)}{!collections.length ? <div className="pending-line"><strong>ยังไม่มีชุดความรู้</strong><span>กำหนดขอบเขตคลังความรู้สำหรับเอเจนต์รายการแรก</span></div> : null}</div>
      </section>
      {canWrite && selectedCollectionId ? <>
        <section id="knowledge-paste" className="tool-band muted-band"><div className="band-heading"><div><p>ข้อความที่อนุมัติ</p><h2>เพิ่มข้อความ</h2></div></div><form className="knowledge-form" onSubmit={createSource}><label>ชื่อ<input name="name" minLength={2} maxLength={160} required /></label><label>เนื้อหา<textarea name="content" rows={6} maxLength={500000} required /></label><button disabled={working}>เพิ่มข้อความที่อนุมัติแล้ว</button></form></section>
        <section id="knowledge-website" className="tool-band"><div className="band-heading"><div><p>นำเข้าตามกำหนดเวลา</p><h2>สแกนหน้าเว็บไซต์</h2></div></div><form className="flowbot-deploy" onSubmit={createCrawl}><label>ชื่อ<input name="name" minLength={2} maxLength={160} required /></label><label>URL หน้าเว็บแบบ HTTPS<input name="url" type="url" placeholder="https://example.com/services" required /></label><label>รีเฟรช<select name="refreshIntervalHours" defaultValue="168"><option value="168">รายสัปดาห์</option><option value="720">รายเดือน</option><option value="24">รายวัน</option></select></label><label><input name="authorized" type="checkbox" required /> ฉันยืนยันว่ามีสิทธิ์นำเข้าเนื้อหาสาธารณะจากเว็บไซต์นี้</label><p className="control-copy">Starter imports this exact page. Advanced discovers up to 25 public pages under the same website path, subject to robots policy and safety limits.</p><button disabled={working}>เพิ่มงานสแกนเข้าคิว</button></form></section>
        <section id="knowledge-upload" className="tool-band muted-band"><div className="band-heading"><div><p>เอกสารที่สแกนแล้ว</p><h2>อัปโหลด PDF, DOCX หรือ TXT</h2></div><span>ขนาดไม่เกิน 10 MB</span></div><form className="flowbot-deploy" onSubmit={uploadFile}><label>ชื่อ<input name="name" minLength={2} maxLength={160} required /></label><label>เอกสาร<input name="file" type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" required /></label><button disabled={working}>อัปโหลดเอกสาร</button></form></section>
        <StructuredCataloguePanel collectionId={selectedCollectionId} canWrite={canWrite} />
      </> : null}
      {message ? <p className="inline-message" role="status">{message}</p> : null}
      <section className="tool-band muted-band"><div className="band-heading"><div><p>ฉบับที่พร้อมใช้</p><h2>รายการแหล่งข้อมูล</h2></div><span>{visibleSources.length} of {sources.length}</span></div><label className="source-filter">Show <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option value="all">All sources</option><option value="text">Pasted text</option><option value="url">Website pages</option><option value="file">Documents</option><option value="ready">Ready</option><option value="processing">Processing</option><option value="failed">Needs attention</option></select></label><div className="data-table">{visibleSources.map((source) => <div className="data-row" key={source.id}><div><strong data-no-localize>{source.name}</strong><span>{source.sourceKind} / {source.version ? `revision ${source.version}` : "revision pending"}</span>{source.status === "failed" ? <small>{sourceFailureCopy[source.safeErrorCode ?? ""] ?? "Processing failed safely. Retry or contact support with the source name."}</small> : null}</div><span>{source.status === "ready" ? "Ready for bot answers" : source.status === "failed" ? "Needs attention" : source.status === "processing" ? "Scanning or extracting" : source.status}</span><span>{new Date(source.revisionCreatedAt).toLocaleDateString(currentIntlLocale())}</span></div>)}{!visibleSources.length ? <div className="pending-line"><strong>{sources.length ? "No sources match this filter" : "ยังไม่มีแหล่งข้อมูลที่พร้อมใช้"}</strong><span>{sources.length ? "Choose All sources to see every item." : "งานสแกนและไฟล์อัปโหลดในคิวจะแสดงหลังประมวลผลและดึงข้อมูล"}</span></div> : null}</div></section>
    </section>
  </main>;
}
