"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  conversationMessageFieldConstraints,
  currentIntlLocale,
  conversationMessageTextError,
  normalizeConversationMessageText,
  safeMutationFetch,
} from "@djay/shared";
import { WorkspaceSidebar } from "../WorkspaceSidebar";
import { WorkspacePageLoadError, WorkspaceSessionLoadError, WorkspaceViewOnly } from "../WorkspaceAccess";
import { WorkspaceSupportBanner } from "../WorkspaceSupportBanner";
import { useWorkspaceSession } from "../useWorkspaceSession";
import { humanizeToken } from "../../../lib/workspace-labels";

type Conversation = {
  id: string; contactName: string; productKey: string; channelKind: string;
  automationMode: string; status: string; legalHold?: boolean;
  lastMessage: string | null; lastMessageAt: string | null;
  voiceStatus: string | null; voiceTerminalReason: string | null; voiceMinutes: number | null;
  voiceDurationSeconds: number | null; voiceOutcome: string | null; voiceSummary: string | null;
  callbackStatus: string | null; callbackDueAt: string | null;
};
type Message = { id: string; sequence: number; actorType: string; direction: string; text: string; createdAt: string };
const quickReplies = [
  "Thanks for contacting us. I’m checking this for you now.",
  "Could you share a little more detail so I can help you correctly?",
  "Thank you. We have received your request and will follow up shortly.",
] as const;

export default function InboxPage() {
  const session = useWorkspaceSession();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [notice, setNotice] = useState("");
  const [noticeTone, setNoticeTone] = useState<"success" | "error">("success");
  const [working, setWorking] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [messageLoadError, setMessageLoadError] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [composeMode, setComposeMode] = useState<"reply" | "note">("reply");
  const selected = conversations.find((conversation) => conversation.id === selectedId) || null;
  const workspace = useMemo(() => session.workspaces.find((item) => item.tenantId === session.selectedTenantId), [session]);
  const canReply = session.allows("conversations.reply");
  const canAssign = session.allows("conversations.assign");

  async function loadInbox(query = searchQuery) {
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      const response = await fetch(`/tenant/conversations${params.size ? `?${params}` : ""}`, { cache: "no-store" });
      if (!response.ok) throw new Error("inbox_unavailable");
      const result = await response.json();
      const next = result.conversations || [];
      setConversations(next);
      const requestedConversation = typeof window === "undefined" ? null : new URL(window.location.href).searchParams.get("conversation");
      setSelectedId((current) => requestedConversation && next.some((item: Conversation) => item.id === requestedConversation)
        ? requestedConversation : current && next.some((item: Conversation) => item.id === current) ? current : next[0]?.id || null);
      setLoadError(false);
    } catch { setLoadError(true); }
  }

  async function loadMessages(conversationId: string) {
    try {
      const response = await fetch(`/tenant/conversations/${conversationId}/messages`, { cache: "no-store" });
      if (!response.ok) throw new Error("messages_unavailable");
      setMessages((await response.json()).messages || []);
      setMessageLoadError(false);
    } catch { setMessages([]); setMessageLoadError(true); }
  }

  useEffect(() => { if (session.selectedTenantId) void loadInbox(); }, [session.selectedTenantId, searchQuery]);
  useEffect(() => { setNotice(""); setDraft(""); setComposeMode("reply"); if (selectedId) void loadMessages(selectedId); else setMessages([]); }, [selectedId]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearchQuery(searchDraft.trim());
  }

  async function reply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !canReply) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const validationError = conversationMessageTextError(data.get("text"));
    if (validationError) {
      const field = form.elements.namedItem("text");
      if (field instanceof HTMLTextAreaElement) { field.setCustomValidity(validationError); field.reportValidity(); }
      setNoticeTone("error");
      setNotice(validationError);
      return;
    }
    setWorking(true);
    setNotice("");
    const response = await safeMutationFetch(`/tenant/conversations/${selectedId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actorType: "human",
        direction: composeMode === "note" ? "internal" : "outbound",
        text: normalizeConversationMessageText(data.get("text")),
      }),
    });
    setWorking(false);
    if (!response.ok) {
      setNoticeTone("error");
      setNotice(response.status === 409 ? "Take over this conversation before replying." : `${composeMode === "note" ? "Private note" : "Reply"} could not be saved. Your text is still available to retry.`);
      return;
    }
    form.reset();
    setDraft("");
    setNoticeTone("success");
    setNotice(composeMode === "note" ? "Private note saved. Customers cannot see it." : "Reply sent.");
    await Promise.all([loadMessages(selectedId), loadInbox()]);
  }

  async function transition(action: "takeover" | "release") {
    if (!selectedId || !canAssign) return;
    setWorking(true);
    setNotice("");
    const response = await safeMutationFetch(`/tenant/conversations/${selectedId}/${action}`, { method: "POST" });
    setWorking(false);
    if (!response.ok) {
      setNoticeTone("error");
      setNotice(action === "takeover" ? "Conversation could not be taken over." : "Conversation could not be released.");
      return;
    }
    setNoticeTone("success");
    setNotice(action === "takeover" ? "Conversation taken over. You can now reply." : "Conversation returned to automation.");
    await Promise.all([loadInbox(), loadMessages(selectedId)]);
  }

  if (session.error) return <WorkspaceSessionLoadError onRetry={() => window.location.reload()} />;
  if (session.loading || !session.selectedTenantId) return <main className="workspace-loading">กำลังโหลดกล่องข้อความ...</main>;
  if (loadError) {
    return (
      <WorkspacePageLoadError
        active="inbox"
        title="กล่องข้อความ"
        resource="conversations"
        workspaces={session.workspaces}
        selectedTenantId={session.selectedTenantId}
        onSelect={(id) => void session.selectWorkspace(id)}
        onLogout={() => void session.logout()}
        onRetry={() => void loadInbox()}
      />
    );
  }

  return (
    <main className="workspace-shell">
      <WorkspaceSidebar
        active="inbox"
        workspaces={session.workspaces}
        selectedTenantId={session.selectedTenantId}
        onSelect={(id) => void session.selectWorkspace(id)}
        onLogout={() => void session.logout()}
      />
      <section id="workspace-main" className="workspace-main inbox-page" tabIndex={-1}>
        <WorkspaceSupportBanner tenantId={session.selectedTenantId} />
        <header className="workspace-header">
          <div><p>การสนทนา</p><h1>กล่องข้อความ</h1></div>
          <span data-no-localize className="role-label">{workspace?.businessName}</span>
        </header>
        {!canReply && !canAssign ? (
          <WorkspaceViewOnly>คุณดูการสนทนาและผลลัพธ์ได้ ผู้ปฏิบัติงานหรือผู้ดูแลเป็นผู้รับช่วงและตอบกลับ</WorkspaceViewOnly>
        ) : null}
        <form className="inbox-search" onSubmit={submitSearch} role="search">
          <label>
            <span className="visually-hidden">ค้นหาข้อมูลติดต่อ</span>
            <input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="ค้นหาชื่อ โทรศัพท์ หรืออีเมล"
              maxLength={120}
              autoComplete="off"
            />
          </label>
          <button type="submit">ค้นหา</button>
          {searchQuery ? (
            <button type="button" className="secondary-command" onClick={() => { setSearchDraft(""); setSearchQuery(""); }}>
              Clear
            </button>
          ) : null}
        </form>
        <div className="inbox-layout">
          <div className="conversation-list" aria-label="การสนทนา">
            {conversations.map((conversation) => (
              <button
                className={conversation.id === selectedId ? "selected" : ""}
                key={conversation.id}
                type="button"
                onClick={() => setSelectedId(conversation.id)}
              >
                <span>
                  <strong><span data-no-localize>{conversation.contactName}</span>{conversation.legalHold ? " · ระงับตามกฎหมาย" : ""}</strong>
                  <small>{humanizeToken(conversation.channelKind)} / {humanizeToken(conversation.productKey)}</small>
                </span>
                <span data-no-localize>{conversation.lastMessage || "เริ่มการสนทนาแล้ว"}</span>
              </button>
            ))}
            {!conversations.length ? (
              <div className="inbox-empty">
                <strong>{searchQuery ? "No matches" : "No conversations"}</strong>
                <span>{searchQuery ? "Try another name, phone, or email." : "Product conversations will appear here."}</span>
              </div>
            ) : null}
          </div>
          <section className="conversation-panel" aria-label="การสนทนาที่เลือก">
            {selected ? (
              <>
                <header>
                  <div>
                    <strong data-no-localize>{selected.contactName}</strong>
                    <span>{humanizeToken(selected.automationMode)} / {humanizeToken(selected.status)}</span>
                  </div>
                  <div>
                    {canAssign && selected.status === "open"
                      ? selected.automationMode === "human"
                        ? <button type="button" className="secondary-command" disabled={working} onClick={() => void transition("release")}>ระบบเผยแพร่อัตโนมัติ</button>
                        : <button type="button" className="secondary-command" disabled={working} onClick={() => void transition("takeover")}>รับช่วงการสนทนา</button>
                      : null}
                  </div>
                </header>
                {selected.productKey === "voice" ? (
                  <section className="voice-call-summary" aria-label="ผลลัพธ์ของสาย">
                    <div>
                      <span>ผลลัพธ์</span>
                      <strong>
                        {selected.voiceOutcome
                          ? humanizeToken(selected.voiceOutcome)
                          : selected.voiceTerminalReason
                            ? humanizeToken(selected.voiceTerminalReason)
                            : "In progress"}
                      </strong>
                    </div>
                    <div>
                      <span>การใช้งานสาย</span>
                      <strong>
                        {selected.voiceMinutes ?? 0} min
                        {selected.voiceDurationSeconds !== null ? ` / ${selected.voiceDurationSeconds}s` : ""}
                      </strong>
                    </div>
                    <div>
                      <span>ติดต่อกลับ</span>
                      <strong>
                        {selected.callbackStatus
                          ? `${humanizeToken(selected.callbackStatus)}${selected.callbackDueAt ? ` · ${new Date(selected.callbackDueAt).toLocaleString(currentIntlLocale())}` : ""}`
                          : "Not requested"}
                      </strong>
                    </div>
                    <p data-no-localize>{selected.voiceSummary || "สรุปการโทรถาวรจะแสดงหลังจากจบเทิร์นแรก"}</p>
                  </section>
                ) : null}
                <div className="message-stream">
                  {messages.map((message) => (
                    <div className={`message-bubble ${message.direction}`} key={message.id}>
                      <span>{message.direction === "internal" ? "Private team note" : humanizeToken(message.actorType)}</span>
                      <p data-no-localize>{message.text}</p>
                      <time>{new Date(message.createdAt).toLocaleString(currentIntlLocale())}</time>
                    </div>
                  ))}
                </div>
                {messageLoadError ? (
                  <div className="inline-message inline-retry" role="alert">
                    <span>โหลดข้อความไม่สำเร็จ</span>
                    <button className="secondary-command" type="button" onClick={() => void loadMessages(selected.id)}>ลองส่งข้อความใหม่</button>
                  </div>
                ) : null}
                {selected.status === "closed" ? (
                  <div className="closed-line">การสนทนานี้ปิดแล้ว</div>
                ) : canReply ? (
                  <form className="reply-form" onSubmit={reply} noValidate>
                    <div className="composer-tabs" role="group" aria-label="Message type">
                      <button type="button" className={composeMode === "reply" ? "active" : ""} onClick={() => setComposeMode("reply")} disabled={selected.automationMode !== "human"}>Reply to customer</button>
                      <button type="button" className={composeMode === "note" ? "active" : ""} onClick={() => setComposeMode("note")}>Private note</button>
                    </div>
                    {selected.automationMode !== "human" ? <div className="closed-line">Automation is active. Add a private note, or {canAssign ? "take over to reply." : "ask a manager to take over before replying."}</div> : null}
                    {composeMode === "reply" && selected.automationMode === "human" ? <div className="quick-replies" aria-label="Quick replies">{quickReplies.map((text) => <button type="button" className="secondary-command" key={text} onClick={() => setDraft(text)}>{text.split(".")[0]}</button>)}</div> : null}
                    <label>
                      <span className="visually-hidden">{composeMode === "note" ? "Private note" : "Reply"}</span>
                      <textarea
                        name="text"
                        rows={3}
                        {...conversationMessageFieldConstraints}
                        placeholder={composeMode === "note" ? "Write a private note for your team" : "Write a reply to the customer"}
                        required
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        aria-describedby="inbox-reply-guidance"
                        onInput={(event) => {
                          event.currentTarget.setCustomValidity("");
                          if (noticeTone === "error") setNotice("");
                        }}
                      />
                    </label>
                    <span className="visually-hidden" id="inbox-reply-guidance">
                      Replies cannot be blank and may contain up to 20,000 characters.
                    </span>
                    <button type="submit" disabled={working || (composeMode === "reply" && selected.automationMode !== "human")}>{working ? "Saving..." : composeMode === "note" ? "Save private note" : "Send reply"}</button>
                  </form>
                ) : (
                  <div className="closed-line">สิทธิ์ดูอย่างเดียวไม่สามารถส่งข้อความตอบกลับ</div>
                )}
                {notice ? <p className={`inline-message ${noticeTone}`} role={noticeTone === "error" ? "alert" : "status"}>{notice}</p> : null}
              </>
            ) : (
              <div className="inbox-empty">
                <strong>เลือกการสนทนา</strong>
                <span>ข้อความเรียงตามลำดับและแยกตามเวิร์กสเปซ</span>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
