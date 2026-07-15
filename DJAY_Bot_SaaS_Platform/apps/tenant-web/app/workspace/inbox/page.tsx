"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { WorkspaceSidebar } from "../WorkspaceSidebar";
import { WorkspaceSupportBanner } from "../WorkspaceSupportBanner";
import { useWorkspaceSession } from "../useWorkspaceSession";

type Conversation = {
  id: string; contactName: string; productKey: string; channelKind: string;
  automationMode: string; status: string; lastMessage: string | null; lastMessageAt: string | null;
  voiceStatus: string | null; voiceTerminalReason: string | null; voiceMinutes: number | null;
  voiceDurationSeconds: number | null; voiceOutcome: string | null; voiceSummary: string | null;
  callbackStatus: string | null; callbackDueAt: string | null;
};
type Message = { id: string; sequence: number; actorType: string; direction: string; text: string; createdAt: string };

export default function InboxPage() {
  const session = useWorkspaceSession(); const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null); const [messages, setMessages] = useState<Message[]>([]);
  const [notice, setNotice] = useState(""); const [working, setWorking] = useState(false);
  const selected = conversations.find((conversation) => conversation.id === selectedId) || null;
  const workspace = useMemo(() => session.workspaces.find((item) => item.tenantId === session.selectedTenantId), [session]);

  async function loadInbox() {
    const response = await fetch("/tenant/conversations", { cache: "no-store" });
    if (!response.ok) return; const result = await response.json(); const next = result.conversations || [];
    setConversations(next); setSelectedId((current) => current && next.some((item: Conversation) => item.id === current) ? current : next[0]?.id || null);
  }
  async function loadMessages(conversationId: string) {
    const response = await fetch(`/tenant/conversations/${conversationId}/messages`, { cache: "no-store" });
    if (response.ok) setMessages((await response.json()).messages || []);
  }
  useEffect(() => { if (session.selectedTenantId) void loadInbox(); }, [session.selectedTenantId]);
  useEffect(() => { if (selectedId) void loadMessages(selectedId); else setMessages([]); }, [selectedId]);

  async function reply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedId) return; setWorking(true); setNotice(""); const form = event.currentTarget; const data = new FormData(form);
    const response = await fetch(`/tenant/conversations/${selectedId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actorType: "human", direction: "outbound", text: data.get("text") }) });
    setWorking(false); if (!response.ok) { setNotice("Reply could not be sent."); return; }
    form.reset(); await Promise.all([loadMessages(selectedId), loadInbox()]);
  }
  async function transition(action: "takeover" | "release") {
    if (!selectedId) return; setWorking(true); setNotice("");
    const response = await fetch(`/tenant/conversations/${selectedId}/${action}`, { method: "POST" });
    setWorking(false); if (!response.ok) { setNotice(action === "takeover" ? "Conversation could not be taken over." : "Conversation could not be released."); return; }
    await Promise.all([loadInbox(), loadMessages(selectedId)]);
  }

  if (session.loading || !session.selectedTenantId) return <main className="workspace-loading">Loading inbox...</main>;
  return <main className="workspace-shell">
    <WorkspaceSidebar active="inbox" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} />
    <section className="workspace-main inbox-page"><WorkspaceSupportBanner tenantId={session.selectedTenantId} />
      <header className="workspace-header"><div><p>Conversations</p><h1>Inbox</h1></div><span className="role-label">{workspace?.businessName}</span></header>
      <div className="inbox-layout">
        <div className="conversation-list" aria-label="Conversations">
          {conversations.map((conversation) => <button className={conversation.id === selectedId ? "selected" : ""} key={conversation.id} type="button" onClick={() => setSelectedId(conversation.id)}>
            <span><strong>{conversation.contactName}</strong><small>{conversation.channelKind} / {conversation.productKey.replaceAll("_", " ")}</small></span>
            <span>{conversation.lastMessage || "Conversation started"}</span>
          </button>)}
          {!conversations.length ? <div className="inbox-empty"><strong>No conversations</strong><span>Product conversations will appear here.</span></div> : null}
        </div>
        <section className="conversation-panel" aria-label="Selected conversation">
          {selected ? <>
            <header><div><strong>{selected.contactName}</strong><span>{selected.automationMode.replaceAll("_", " ")} / {selected.status}</span></div><div>{selected.status === "open" ? selected.automationMode === "human" ? <button type="button" className="secondary-command" disabled={working} onClick={() => void transition("release")}>Release automation</button> : <button type="button" className="secondary-command" disabled={working} onClick={() => void transition("takeover")}>Take over</button> : null}</div></header>
            {selected.productKey === "voice" ? <section className="voice-call-summary" aria-label="Voice call outcome">
              <div><span>Outcome</span><strong>{selected.voiceOutcome?.replaceAll("_", " ") || selected.voiceTerminalReason?.replaceAll("_", " ") || "In progress"}</strong></div>
              <div><span>Call usage</span><strong>{selected.voiceMinutes ?? 0} min{selected.voiceDurationSeconds !== null ? ` / ${selected.voiceDurationSeconds}s` : ""}</strong></div>
              <div><span>Callback</span><strong>{selected.callbackStatus ? `${selected.callbackStatus}${selected.callbackDueAt ? ` · ${new Date(selected.callbackDueAt).toLocaleString()}` : ""}` : "Not requested"}</strong></div>
              <p>{selected.voiceSummary || "The durable call summary will appear after the first completed turn."}</p>
            </section> : null}
            <div className="message-stream">{messages.map((message) => <div className={`message-bubble ${message.direction}`} key={message.id}><span>{message.actorType}</span><p>{message.text}</p><time>{new Date(message.createdAt).toLocaleString()}</time></div>)}</div>
            {selected.status !== "closed" && selected.automationMode === "human" ? <form className="reply-form" onSubmit={reply}><label><span className="visually-hidden">Reply</span><textarea name="text" rows={3} maxLength={20000} placeholder="Write a reply" required /></label><button type="submit" disabled={working}>{working ? "Sending..." : "Send reply"}</button></form> : selected.status === "closed" ? <div className="closed-line">This conversation is closed.</div> : <div className="closed-line">Take over before replying.</div>}
            {notice ? <p className="inline-message" role="alert">{notice}</p> : null}
          </> : <div className="inbox-empty"><strong>Select a conversation</strong><span>Messages are ordered and tenant scoped.</span></div>}
        </section>
      </div>
    </section>
  </main>;
}
