"use client";

import { currentIntlLocale, safeMutationFetch } from "@djay/shared";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { WorkspaceSidebar } from "../WorkspaceSidebar";
import { WorkspacePageLoadError, WorkspaceSessionLoadError, WorkspaceViewOnly } from "../WorkspaceAccess";
import { WorkspaceSupportBanner } from "../WorkspaceSupportBanner";
import { useWorkspaceSession } from "../useWorkspaceSession";
import { StructuredCataloguePanel } from "./StructuredCataloguePanel";

type Source = { id: string; name: string; sourceKind: string; status: string; version: number; revisionCreatedAt: string;
  safeErrorCode: string | null; refreshIntervalHours: number | null; nextRefreshAt: string | null; lastRefreshedAt: string | null };
type SourceDetail = Source & { sourceUrl: string | null; revisionId: string | null; revisionStatus: string | null; content: string;
  contentTruncated: boolean; provenance: Record<string, unknown>; chunkCount: number; createdAt: string; updatedAt: string };
type Collection = { id: string; name: string; description: string; sourceCount: number; itemCount: number };
type ReviewOwner = { membershipId: string; displayName: string; role: string };
type KnowledgeReview = { id: string; cycleMonth: string; dueAt: string; status: "due" | "in_progress" | "completed";
  ownerMembershipId: string | null; ownerName: string | null; startedAt: string | null; completedAt: string | null;
  completionNote: string | null; sourceCount: number; attentionCount: number; changedSinceCycle: number };
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
  const [selectedSource, setSelectedSource] = useState<SourceDetail | null>(null);
  const [reviewAdvanced, setReviewAdvanced] = useState(false); const [reviewOwners, setReviewOwners] = useState<ReviewOwner[]>([]);
  const [reviews, setReviews] = useState<KnowledgeReview[]>([]);
  const [message, setMessage] = useState(""); const [working, setWorking] = useState(false); const [loadError, setLoadError] = useState(false);
  const workspace = useMemo(() => session.workspaces.find((item) => item.tenantId === session.selectedTenantId), [session]);
  const canWrite = session.allows("knowledge.write");
  const visibleSources = sourceFilter === "all" ? sources : sources.filter((source) => source.sourceKind === sourceFilter || source.status === sourceFilter);

  async function load() {
    try {
      const [sourceResponse, collectionResponse, reviewResponse] = await Promise.all([
        fetch("/tenant/knowledge", { cache: "no-store" }), fetch("/tenant/knowledge/collections", { cache: "no-store" }),
        fetch("/tenant/knowledge/reviews", { cache: "no-store" }),
      ]);
      if (!sourceResponse.ok || !collectionResponse.ok || !reviewResponse.ok) throw new Error("knowledge_unavailable");
      const nextSources = (await sourceResponse.json()).sources || []; const nextCollections = (await collectionResponse.json()).collections || [];
      const nextReviews = await reviewResponse.json(); setReviewAdvanced(nextReviews.advanced === true);
      setReviewOwners(nextReviews.owners || []); setReviews(nextReviews.reviews || []);
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
      authorized: data.get("authorized") === "on" }, "Website crawl queued with the package refresh policy.", form);
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
  async function previewSource(sourceId: string) {
    setWorking(true); setMessage("");
    try {
      const response = await fetch(`/tenant/knowledge/${sourceId}`, { cache: "no-store" });
      if (!response.ok) throw new Error("preview_failed"); setSelectedSource((await response.json()).source);
    } catch { setMessage("The source preview could not be loaded."); } finally { setWorking(false); }
  }
  async function commandSource(sourceId: string, action: "include" | "exclude" | "reprocess" | "reindex") {
    setWorking(true); setMessage("");
    const response = await safeMutationFetch(`/tenant/knowledge/${sourceId}`, { method: "PATCH",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    setWorking(false);
    if (!response.ok) { setMessage("The source change could not be completed."); return; }
    const result = await response.json(); setMessage(result.status === "queued" || result.status === "already_queued"
      ? "Source reprocessing is queued." : action === "exclude" ? "Source excluded from bot answers."
        : action === "include" ? "Source included for approved bot drafts." : "Source fully reindexed as a new immutable revision.");
    await load(); await previewSource(sourceId);
  }
  async function correctSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedSource) return; const data = new FormData(event.currentTarget);
    setWorking(true); setMessage("");
    const response = await safeMutationFetch(`/tenant/knowledge/${selectedSource.id}`, { method: "PATCH",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "correct", name: data.get("name"), content: data.get("content") }) });
    setWorking(false); if (!response.ok) { setMessage("The corrected source could not be saved."); return; }
    setMessage("Correction saved as a new immutable revision. Publish the affected bot draft when ready.");
    await load(); await previewSource(selectedSource.id);
  }
  async function deleteSource(sourceId: string) {
    if (!window.confirm("Delete this source? It will be removed from future answers and all bot drafts immediately.")) return;
    setWorking(true); setMessage(""); const response = await safeMutationFetch(`/tenant/knowledge/${sourceId}`, { method: "DELETE" }); setWorking(false);
    if (!response.ok) { setMessage("The source could not be deleted."); return; }
    setSelectedSource(null); setMessage("Source deleted from active knowledge. Governed storage cleanup remains auditable."); await load();
  }
  async function updateReview(event: FormEvent<HTMLFormElement>, action: "start" | "complete") {
    event.preventDefault(); const data = new FormData(event.currentTarget); setWorking(true); setMessage("");
    const response = await safeMutationFetch("/tenant/knowledge/reviews", { method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reviewId: data.get("reviewId"), ownerMembershipId: data.get("ownerMembershipId"),
        ...(action === "complete" ? { note: data.get("note") } : {}) }) });
    setWorking(false); if (!response.ok) { setMessage("The monthly knowledge review could not be updated."); return; }
    setMessage(action === "complete" ? "Monthly knowledge review completed with an audit note." : "Monthly knowledge review started."); await load();
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
        <section id="knowledge-website" className="tool-band"><div className="band-heading"><div><p>นำเข้าตามกำหนดเวลา</p><h2>สแกนหน้าเว็บไซต์</h2></div></div><form className="flowbot-deploy" onSubmit={createCrawl}><label>ชื่อ<input name="name" minLength={2} maxLength={160} required /></label><label>URL หน้าเว็บแบบ HTTPS<input name="url" type="url" placeholder="https://example.com/services" required /></label><label><input name="authorized" type="checkbox" required /> ฉันยืนยันว่ามีสิทธิ์นำเข้าเนื้อหาสาธารณะจากเว็บไซต์นี้</label><p className="control-copy">Starter imports this exact page and refreshes it every seven days. Advanced discovers up to 25 public pages under the same website path and uses the governed monthly review workflow.</p><button disabled={working}>เพิ่มงานสแกนเข้าคิว</button></form></section>
        <section id="knowledge-upload" className="tool-band muted-band"><div className="band-heading"><div><p>เอกสารที่สแกนแล้ว</p><h2>อัปโหลด PDF, DOCX หรือ TXT</h2></div><span>ขนาดไม่เกิน 10 MB</span></div><form className="flowbot-deploy" onSubmit={uploadFile}><label>ชื่อ<input name="name" minLength={2} maxLength={160} required /></label><label>เอกสาร<input name="file" type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" required /></label><button disabled={working}>อัปโหลดเอกสาร</button></form></section>
        <StructuredCataloguePanel collectionId={selectedCollectionId} canWrite={canWrite} />
      </> : null}
      {message ? <p className="inline-message" role="status">{message}</p> : null}
      <section className="tool-band muted-band"><div className="band-heading"><div><p>ฉบับที่พร้อมใช้</p><h2>รายการแหล่งข้อมูล</h2></div><span>{visibleSources.length} of {sources.length}</span></div><label className="source-filter">Show <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option value="all">All sources</option><option value="text">Pasted text</option><option value="url">Website pages</option><option value="file">Documents</option><option value="ready">Ready</option><option value="processing">Processing</option><option value="failed">Needs attention</option><option value="excluded">Excluded</option></select></label><div className="data-table">{visibleSources.map((source) => <div className="data-row" key={source.id}><div><strong data-no-localize>{source.name}</strong><span>{source.sourceKind} / {source.version ? `revision ${source.version}` : "revision pending"}</span>{source.sourceKind === "url" ? <small>{source.refreshIntervalHours === 168 && source.nextRefreshAt ? `Weekly refresh · next ${new Date(source.nextRefreshAt).toLocaleDateString(currentIntlLocale())}` : "Reviewed through the Advanced monthly workflow"}</small> : null}{source.status === "failed" ? <small>{sourceFailureCopy[source.safeErrorCode ?? ""] ?? "Processing failed safely. Retry or contact support with the source name."}</small> : null}</div><span>{source.status === "ready" ? "Ready for bot answers" : source.status === "failed" ? "Needs attention" : source.status === "processing" ? "Scanning or extracting" : source.status === "excluded" ? "Excluded from answers" : source.status}</span><span>{new Date(source.revisionCreatedAt).toLocaleDateString(currentIntlLocale())}</span><button type="button" className="secondary-command" disabled={working} onClick={() => void previewSource(source.id)}>Preview and manage</button></div>)}{!visibleSources.length ? <div className="pending-line"><strong>{sources.length ? "No sources match this filter" : "ยังไม่มีแหล่งข้อมูลที่พร้อมใช้"}</strong><span>{sources.length ? "Choose All sources to see every item." : "งานสแกนและไฟล์อัปโหลดในคิวจะแสดงหลังประมวลผลและดึงข้อมูล"}</span></div> : null}</div></section>
      {reviewAdvanced ? <section className="tool-band" aria-labelledby="knowledge-review-title"><div className="band-heading"><div><p>Advanced governance</p><h2 id="knowledge-review-title">Monthly knowledge review</h2></div><span>{reviews[0]?.status ?? "scheduled"}</span></div>
        {!reviews.length ? <div className="pending-line"><strong>No review is due yet</strong><span>The first review becomes due after 30 days, then once each calendar month.</span></div> : <div className="data-table">{reviews.map((review) => <div className="data-row" key={review.id}><div><strong>{review.cycleMonth}</strong><span>{review.sourceCount} sources · {review.changedSinceCycle} changed · {review.attentionCount} need attention</span>{review.completionNote ? <small data-no-localize>{review.completionNote}</small> : null}</div><span>{review.ownerName ?? "Owner not assigned"}</span><span>{review.status}</span>{canWrite && review.status !== "completed" ? <form className="review-inline-form" onSubmit={(event) => void updateReview(event, review.status === "due" ? "start" : "complete")}><input type="hidden" name="reviewId" value={review.id} /><label>Review owner<select name="ownerMembershipId" defaultValue={review.ownerMembershipId ?? reviewOwners[0]?.membershipId ?? ""} required>{reviewOwners.map((owner) => <option key={owner.membershipId} value={owner.membershipId} data-no-localize>{owner.displayName}</option>)}</select></label>{review.status === "in_progress" ? <label>Completion note<input name="note" minLength={8} maxLength={2000} required /></label> : null}<button disabled={working}>{review.status === "due" ? "Start review" : "Complete review"}</button></form> : <span />}</div>)}</div>}
      </section> : null}
      {selectedSource ? <section className="tool-band" aria-labelledby="source-preview-title"><div className="band-heading"><div><p>Source revision {selectedSource.version}</p><h2 id="source-preview-title" data-no-localize>{selectedSource.name}</h2></div><span>{selectedSource.chunkCount} chunks</span></div>
        <p className="control-copy">Preview the latest immutable revision. Corrections and full reindexing create a new revision; they never rewrite published history.</p>
        {selectedSource.sourceUrl ? <p data-no-localize>{selectedSource.sourceUrl}</p> : null}
        <form className="knowledge-form" onSubmit={correctSource} key={`${selectedSource.id}:${selectedSource.version}`}><label>Source name<input name="name" defaultValue={selectedSource.name} minLength={2} maxLength={160} required disabled={!canWrite} /></label><label>Latest content<textarea name="content" rows={12} defaultValue={selectedSource.content} maxLength={500000} required disabled={!canWrite || selectedSource.contentTruncated} /></label>{selectedSource.contentTruncated ? <p className="control-copy">This preview is limited to 100,000 characters. Use reprocess or full reindex to avoid replacing a larger source with a truncated preview.</p> : null}{canWrite ? <div className="action-row"><button disabled={working || selectedSource.contentTruncated}>Save correction</button><button type="button" className="secondary-command" disabled={working} onClick={() => void commandSource(selectedSource.id, selectedSource.status === "archived" ? "include" : "exclude")}>{selectedSource.status === "archived" ? "Include source" : "Exclude source"}</button>{selectedSource.sourceKind === "file" || selectedSource.sourceKind === "url" ? <button type="button" className="secondary-command" disabled={working} onClick={() => void commandSource(selectedSource.id, "reprocess")}>Reprocess original</button> : null}<button type="button" className="secondary-command" disabled={working || !selectedSource.revisionId} onClick={() => void commandSource(selectedSource.id, "reindex")}>Full reindex</button><button type="button" className="secondary-command" disabled={working} onClick={() => void deleteSource(selectedSource.id)}>Delete source</button></div> : null}</form>
      </section> : null}
    </section>
  </main>;
}
