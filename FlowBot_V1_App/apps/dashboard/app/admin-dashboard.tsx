"use client";

import { useEffect, useMemo, useState } from "react";
import { currentIntlLocale, uiCopy } from "../lib/thai-ui";

type Admin = { name: string; email: string; role: string };
type ConversationSummary = {
  id: string;
  status: string;
  crmStatus: string;
  lang: string;
  starred: boolean;
  archived: boolean;
  unreadAdmin: number;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  botName: string;
  flowVersionNo: number;
  lastMessageText?: string;
  lastActivityAt: string;
};
type Message = { id: string; sender: string; type: string; content: Record<string, unknown>; sequence: string; createdAt: string };
type ConversationDetail = {
  conversation: ConversationSummary & { flowVersionId: string; startedAt: string; customerId?: string | null };
  messages: Message[];
  customer: Customer | null;
  leads: Lead[];
  notes: { id: string; note: string; userName: string; createdAt: string }[];
  matchSuggestions: Customer[];
};
type Customer = {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  line_id?: string | null;
  whatsapp?: string | null;
  note?: string | null;
  conversation_count?: number;
  last_contact_at?: string | null;
  latest_crm_status?: string | null;
};
type Lead = {
  id: string;
  conversation_id?: string | null;
  customer_id?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  crm_status?: string | null;
  created_at: string;
};
type ContactChannel = { id?: string; type: string; label: string; value: string; sort_order?: number; sortOrder?: number };
type TeamUser = { id: string; email: string; name: string; role: "owner" | "admin"; created_at?: string; last_active_at?: string | null };
type WidgetSettings = {
  enabled: boolean;
  themeColor: string;
  position: "bl" | "br";
  logoUrl: string;
  openOnLoad: boolean;
  langToggle: boolean;
  greetingTh: string;
  greetingEn: string;
  defaultLang: "th" | "en";
  allowedOrigins: string[];
};
type PrivacySettings = {
  transcriptRetentionDays: number;
  privacyPolicyUrl: string;
  leadNoticeTh: string;
  leadNoticeEn: string;
  alertEmail: string;
};
type Overview = {
  conversations: { total: number; awaiting: number; admin_active: number; unread: number; last_7_days: number };
  crm: { crm_status: string; count: number }[];
  events: Record<string, number>;
  matchRate: number;
  leadsLast30Days: number;
  unmatched: { text: string | null; count: number; last_seen_at: string | Date }[];
  bots: { id: string; name: string; public_key: string; published_version_id: string | null; version_no: number | null; draft_count: number }[];
};
type FlowNode = {
  id: string;
  type: string;
  parentId: string | null;
  nextNodeId: string | null;
  sortOrder: number;
  title: string;
  contentTh: string;
  contentEn: string;
  searchableContent: boolean;
  config: Record<string, unknown>;
};
type FlowOption = { id: string; nodeId: string; targetNodeId: string; sortOrder: number; labelTh: string; labelEn: string };
type FlowKeyword = { id: string; nodeId: string; lang: "th" | "en"; keyword: string; priority: number; substringEnabled: boolean };
type NodeReferences = {
  options: { id: string; nodeId: string; targetNodeId: string; labelTh?: string; labelEn?: string }[];
  nextNodes: { id: string; nodeId: string; targetNodeId: string; title?: string }[];
};
type DraftFlow = {
  version: { id: string; versionNo: number; status: string };
  tree: FlowNode[];
  optionRows: FlowOption[];
  keywordRows: FlowKeyword[];
};

const crmOptions = [
  ["new", "New"],
  ["pending_follow_up", "Pending follow up"],
  ["appointment_made", "Appointment made"],
  ["not_closed_follow", "Not closed - follow again"],
  ["closed_deal", "Closed deal"]
] as const;

const tabs = ["overview", "chat", "customers", "settings"] as const;
type InboxView = "list" | "thread" | "profile";

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function messageText(message: Message): string {
  if (typeof message.content.text === "string") return message.content.text;
  if (typeof message.content.action === "string") return message.content.action;
  if (message.content.data && typeof message.content.data === "object") {
    return Object.entries(message.content.data as Record<string, unknown>)
      .map(([key, value]) => `${key}: ${String(value ?? "")}`)
      .join("\n");
  }
  if (Array.isArray(message.content.options)) return String(message.content.text ?? "Options");
  return JSON.stringify(message.content);
}

function statusLabel(value: string) {
  return crmOptions.find(([key]) => key === value)?.[1] ?? value.replaceAll("_", " ");
}

function conversationStatusLabel(value: string) {
  if (value === "bot") return "Bot handling";
  if (value === "awaiting_admin") return "Awaiting staff";
  if (value === "admin_active") return "Staff active";
  if (value === "closed") return "Closed";
  return value.replaceAll("_", " ");
}

export function AdminDashboard(props: {
  admin: Admin;
  initialOverview: Overview;
  initialConversations: ConversationSummary[];
  initialSelected: ConversationDetail | null;
  initialCustomers: Customer[];
  initialLeads: Lead[];
}) {
  const [clientReady, setClientReady] = useState(false);
  const [tab, setTab] = useState("overview");
  const [overview] = useState(props.initialOverview);
  const [conversations, setConversations] = useState(props.initialConversations);
  const [selected, setSelected] = useState(props.initialSelected);
  const [customers, setCustomers] = useState(props.initialCustomers);
  const [leads] = useState(props.initialLeads);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [inboxView, setInboxView] = useState<InboxView>("list");
  const [customerDraft, setCustomerDraft] = useState({ name: "", phone: "", email: "", lineId: "", whatsapp: "", note: "" });

  useEffect(() => {
    setClientReady(true);
  }, []);

  const filteredConversations = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((conversation) => {
      if (filter === "unread" && conversation.unreadAdmin <= 0) return false;
      if (filter === "awaiting" && conversation.status !== "awaiting_admin") return false;
      if (filter === "starred" && !conversation.starred) return false;
      if (filter === "archived" && !conversation.archived) return false;
      if (crmOptions.some(([key]) => key === filter) && conversation.crmStatus !== filter) return false;
      if (!q) return true;
      return [conversation.customerName, conversation.customerEmail, conversation.customerPhone, conversation.lastMessageText, conversation.id]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [conversations, filter, query]);

  async function loadConversation(id: string) {
    const response = await fetch(`/api/admin/conversations/${id}`);
    if (!response.ok) return;
    const data = (await response.json()) as ConversationDetail;
    setSelected(data);
    setInboxView("thread");
    setConversations((current) => current.map((item) => (item.id === id ? { ...item, unreadAdmin: 0 } : item)));
  }

  async function patchConversation(patch: Record<string, unknown>) {
    if (!selected) return;
    const response = await fetch(`/api/admin/conversations/${selected.conversation.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch)
    });
    if (!response.ok) return;
    const next = { ...selected.conversation, ...patch } as ConversationDetail["conversation"];
    setSelected({ ...selected, conversation: next });
    setConversations((current) => current.map((item) => (item.id === next.id ? { ...item, ...patch } : item)));
  }

  async function takeOver() {
    if (!selected) return;
    const response = await fetch(`/api/admin/conversations/${selected.conversation.id}/takeover`, { method: "POST" });
    if (response.ok) await loadConversation(selected.conversation.id);
  }

  async function releaseToBot() {
    if (!selected) return;
    const response = await fetch(`/api/admin/conversations/${selected.conversation.id}/release`, { method: "POST" });
    if (response.ok) await loadConversation(selected.conversation.id);
  }

  async function sendReply() {
    if (!selected || !reply.trim()) return;
    const response = await fetch(`/api/admin/conversations/${selected.conversation.id}/reply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: reply.trim(), idempotencyKey: crypto.randomUUID() })
    });
    if (!response.ok) return;
    setReply("");
    await loadConversation(selected.conversation.id);
  }

  async function addNote() {
    if (!selected || !note.trim()) return;
    const response = await fetch(`/api/admin/conversations/${selected.conversation.id}/notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ note: note.trim() })
    });
    if (!response.ok) return;
    setNote("");
    await loadConversation(selected.conversation.id);
  }

  async function createCustomer() {
    const response = await fetch("/api/admin/customers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(customerDraft)
    });
    if (!response.ok) return;
    const data = (await response.json()) as { customer: Customer };
    setCustomers((current) => [data.customer, ...current]);
    setCustomerDraft({ name: "", phone: "", email: "", lineId: "", whatsapp: "", note: "" });
  }

  return (
    <main className="app-shell" data-client-ready={clientReady ? "true" : "false"}>
      <aside className="sidebar">
        <div className="brand">FlowBot</div>
        {tabs.map((item) => (
          <button
            key={item}
            type="button"
            className={tab === item ? "nav-item active" : "nav-item"}
            onPointerDown={() => setTab(item)}
            onClick={() => setTab(item)}
          >
            {titleCase(item)}
          </button>
        ))}
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Website automation</p>
            <h1>{tab === "chat" ? "Inbox" : titleCase(tab)}</h1>
          </div>
          <input className="global-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations, customers, phone, email" />
          <div className="health-pill">{overview.bots[0]?.published_version_id ? "Live" : "No published flow"}</div>
          <div className="account">{props.admin.name}</div>
        </header>

        {tab === "overview" ? (
          <OverviewPanel overview={overview} />
        ) : tab === "chat" ? (
          <section className="inbox-grid" data-mobile-view={inboxView}>
            <div className="conversation-list">
              <div className="filter-row">
                {([
                  ["all", "All"],
                  ["unread", "Unread"],
                  ["awaiting", "Awaiting"]
                ] as const).map(([item, label]) => (
                  <button key={item} className={filter === item ? "chip active" : "chip"} onClick={() => setFilter(item)}>
                    {label}
                  </button>
                ))}
                <select value={filter} onChange={(event) => setFilter(event.target.value)}>
                  <option value="all">More filters</option>
                  <option value="starred">Starred</option>
                  <option value="archived">Archived</option>
                  {crmOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              {filteredConversations.map((conversation) => (
                <button
                  key={conversation.id}
                  className={selected?.conversation.id === conversation.id ? "conversation-row active" : "conversation-row"}
                  onClick={() => void loadConversation(conversation.id)}
                >
                  <span data-no-localize className="row-title">{conversation.customerName || conversation.customerPhone || conversation.customerEmail || "ผู้เยี่ยมชมเว็บไซต์"}</span>
                  <span className="row-meta">{conversationStatusLabel(conversation.status)} · {statusLabel(conversation.crmStatus)}</span>
                  <span data-no-localize className="row-preview">{conversation.lastMessageText || "ยังไม่มีข้อความ"}</span>
                  {conversation.unreadAdmin ? <strong>{conversation.unreadAdmin}</strong> : null}
                </button>
              ))}
            </div>

            <div className="thread-pane">
              {selected ? (
                <>
                  <div className="thread-header">
                    <div>
                      <h2 data-no-localize>{selected.customer?.name || selected.conversation.customerName || "ผู้เยี่ยมชมเว็บไซต์"}</h2>
                      <p>{conversationStatusLabel(selected.conversation.status)} · version {selected.conversation.flowVersionNo}</p>
                    </div>
                    <div className="thread-actions">
                      <button className="mobile-only" onClick={() => setInboxView("list")}>Back</button>
                      <button className="mobile-only" onClick={() => setInboxView("profile")}>Profile</button>
                      <button onClick={() => void patchConversation({ starred: !selected.conversation.starred })}>
                        {selected.conversation.starred ? "Unstar" : "Star"}
                      </button>
                      {selected.conversation.status === "admin_active" ? (
                        <button onClick={() => void releaseToBot()}>Release to bot</button>
                      ) : (
                        <button onClick={() => void takeOver()}>Take over</button>
                      )}
                    </div>
                  </div>
                  <div className="message-stack">
                    {selected.messages.map((message) => (
                      <div key={message.id} className={`message ${message.sender}`}>
                        <span>{message.sender}</span>
                        <p data-no-localize>{messageText(message)}</p>
                      </div>
                    ))}
                  </div>
                  <div className="reply-box">
                    <textarea value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Reply as admin" />
                    <button disabled={selected.conversation.status !== "admin_active"} onClick={() => void sendReply()}>
                      Send
                    </button>
                  </div>
                </>
              ) : (
                <div className="empty-state">Select a conversation.</div>
              )}
            </div>

            <aside className="detail-pane">
              {selected ? (
                <>
                  <div className="mobile-detail-header">
                    <button onClick={() => setInboxView("thread")}>Back to chat</button>
                  </div>
                  <section className="compact-card">
                    <h3>Conversation</h3>
                    <label>
                      CRM status
                      <select value={selected.conversation.crmStatus} onChange={(event) => void patchConversation({ crmStatus: event.target.value })}>
                        {crmOptions.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button onClick={() => void patchConversation({ archived: !selected.conversation.archived })}>
                      {selected.conversation.archived ? "Unarchive" : "Archive"}
                    </button>
                  </section>
                  <section className="compact-card">
                    <h3>Customer</h3>
                    <p data-no-localize>{selected.customer?.name || "ยังไม่มีโปรไฟล์ที่เชื่อมโยง"}</p>
                    <p data-no-localize>{selected.customer?.phone || selected.leads[0]?.phone || "ยังไม่มีเบอร์โทร"}</p>
                    <p data-no-localize>{selected.customer?.email || selected.leads[0]?.email || "ยังไม่มีอีเมล"}</p>
                    {selected.matchSuggestions.length ? <p className="hint">{selected.matchSuggestions.length} possible duplicate profile</p> : null}
                  </section>
                  <section className="compact-card">
                    <h3>Notes</h3>
                    <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add private note" />
                    <button onClick={() => void addNote()}>Save note</button>
                    {selected.notes.map((item) => (
                      <article key={item.id} className="note">
                        <p data-no-localize>{item.note}</p>
                        <span data-no-localize>{item.userName}</span>
                      </article>
                    ))}
                  </section>
                </>
              ) : null}
            </aside>
          </section>
        ) : tab === "customers" ? (
          <CustomersPanel customers={customers} leads={leads} draft={customerDraft} setDraft={setCustomerDraft} createCustomer={createCustomer} />
        ) : (
          <SettingsPanel overview={overview} admin={props.admin} />
        )}
      </section>
    </main>
  );
}

function OverviewPanel({ overview }: { overview: Overview }) {
  return (
    <section className="dashboard-grid">
      <Metric title="Awaiting admin" value={overview.conversations.awaiting} />
      <Metric title="Unread" value={overview.conversations.unread} />
      <Metric title="Leads last 30 days" value={overview.leadsLast30Days} />
      <Metric title="Typed match rate" value={`${overview.matchRate}%`} />
      <section className="wide-card">
        <h2>CRM funnel</h2>
        <div className="funnel">
          {crmOptions.map(([status, label]) => {
            const count = overview.crm.find((row) => row.crm_status === status)?.count ?? 0;
            return (
              <div key={status}>
                <span>{label}</span>
                <strong>{count}</strong>
              </div>
            );
          })}
        </div>
      </section>
      <section className="wide-card">
        <h2>Unmatched queries</h2>
        {overview.unmatched.length ? (
          overview.unmatched.map((item, index) => (
            <div className="table-row" key={`${item.text}-${index}`}>
              <span>{item.text || "Unknown"}</span>
              <strong>{item.count}</strong>
            </div>
          ))
        ) : (
          <p className="muted">No unmatched queries yet.</p>
        )}
      </section>
    </section>
  );
}

function Metric({ title, value }: { title: string; value: string | number }) {
  return (
    <section className="metric-card">
      <span>{title}</span>
      <strong>{value}</strong>
    </section>
  );
}

function CustomersPanel(props: {
  customers: Customer[];
  leads: Lead[];
  draft: { name: string; phone: string; email: string; lineId: string; whatsapp: string; note: string };
  setDraft: (next: { name: string; phone: string; email: string; lineId: string; whatsapp: string; note: string }) => void;
  createCustomer: () => Promise<void>;
}) {
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [localCustomers, setLocalCustomers] = useState(props.customers);
  const [selectedId, setSelectedId] = useState(props.customers[0]?.id ?? "");
  const selected = localCustomers.find((customer) => customer.id === selectedId) ?? localCustomers[0] ?? null;
  const [profileDraft, setProfileDraft] = useState(customerToDraft(selected));
  const selectedLeads = selected
    ? props.leads.filter((lead) => lead.customer_id === selected.id || lead.phone === selected.phone || lead.email === selected.email)
    : [];
  const filteredCustomers = localCustomers.filter((customer) =>
    [customer.name, customer.phone, customer.email, customer.line_id, customer.whatsapp]
      .join(" ")
      .toLowerCase()
      .includes(query.trim().toLowerCase())
  );

  useEffect(() => {
    setLocalCustomers(props.customers);
    setSelectedId((current) => current || props.customers[0]?.id || "");
  }, [props.customers]);

  useEffect(() => {
    setProfileDraft(customerToDraft(selected));
  }, [selected?.id]);

  async function exportCustomer(customer: Customer) {
    const response = await fetch(`/api/admin/customers/${customer.id}/export`);
    if (!response.ok) {
      setStatus("Export requires owner access.");
      return;
    }
    const data = await response.json();
    const blob = new Blob([JSON.stringify(data.export, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `flowbot-customer-${customer.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus("Customer export generated.");
  }

  async function saveCustomer(customer: Customer) {
    const response = await fetch(`/api/admin/customers/${customer.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(profileDraft)
    });
    if (!response.ok) {
      setStatus("Customer update failed.");
      return;
    }
    const data = (await response.json()) as { customer: Customer };
    setLocalCustomers((current) => current.map((item) => (item.id === customer.id ? { ...item, ...data.customer } : item)));
    setStatus("Customer profile saved.");
  }

  async function softDeleteCustomer(customer: Customer) {
    if (!window.confirm(uiCopy("ลบโปรไฟล์ลูกค้านี้แบบกู้คืนได้หรือไม่? ประวัติการสนทนาจะยังคงอยู่เพื่อการตรวจสอบ", "Soft delete this customer profile? Conversations remain available for audit."))) return;
    const response = await fetch(`/api/admin/customers/${customer.id}`, { method: "DELETE" });
    if (!response.ok) {
      setStatus("Delete failed.");
      return;
    }
    setLocalCustomers((current) => current.filter((item) => item.id !== customer.id));
    setSelectedId("");
    setStatus("Customer profile soft deleted.");
  }

  async function eraseCustomer(customer: Customer) {
    const confirmed = window.prompt(
      uiCopy("ลบข้อมูลส่วนบุคคลของลูกค้านี้หรือไม่? ระบบจะปกปิดข้อมูลระบุตัวบุคคลในรายการที่เชื่อมโยงทั้งหมดและไม่สามารถย้อนกลับได้ พิมพ์ ERASE เพื่อดำเนินการต่อ", "Erase personal data for this customer? This redacts customer PII across linked records and cannot be undone. Type ERASE to continue.")
    );
    if (confirmed !== "ERASE") return;
    const response = await fetch(`/api/admin/customers/${customer.id}/erase`, { method: "POST" });
    if (!response.ok) {
      setStatus("Erasure requires owner access.");
      return;
    }
    setLocalCustomers((current) => current.filter((item) => item.id !== customer.id));
    setSelectedId("");
    setStatus("Customer personal data erased.");
  }

  return (
    <section className="customers-grid">
      <div className="wide-card">
        <div className="section-header">
          <div>
            <h2>Customers</h2>
            <p className="muted">Profiles are explicit records. Shared phone or email values are allowed.</p>
          </div>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customers" />
        </div>
        <div className="customer-form" aria-label="Create customer">
          <label>
            Name
            <input value={props.draft.name} onChange={(event) => props.setDraft({ ...props.draft, name: event.target.value })} />
          </label>
          <label>
            Phone
            <input value={props.draft.phone} onChange={(event) => props.setDraft({ ...props.draft, phone: event.target.value })} />
          </label>
          <label>
            Email
            <input value={props.draft.email} onChange={(event) => props.setDraft({ ...props.draft, email: event.target.value })} />
          </label>
          <label>
            LINE
            <input value={props.draft.lineId} onChange={(event) => props.setDraft({ ...props.draft, lineId: event.target.value })} />
          </label>
          <label>
            WhatsApp
            <input value={props.draft.whatsapp} onChange={(event) => props.setDraft({ ...props.draft, whatsapp: event.target.value })} />
          </label>
          <button onClick={() => void props.createCustomer()}>Create</button>
        </div>
        <div className="customer-table">
          <div className="table-row table-head">
            <span>Name</span>
            <span>Phone</span>
            <span>Email</span>
            <span>LINE / WhatsApp</span>
            <span>Conversations</span>
          </div>
          {filteredCustomers.map((customer) => (
            <button
              className={selected?.id === customer.id ? "customer-row active" : "customer-row"}
              key={customer.id}
              onClick={() => setSelectedId(customer.id)}
            >
              <span data-no-localize>{customer.name || "ลูกค้ายังไม่มีชื่อ"}</span>
              <span data-no-localize>{customer.phone || "-"}</span>
              <span data-no-localize>{customer.email || "-"}</span>
              <span data-no-localize>{customer.line_id || customer.whatsapp || "-"}</span>
              <strong>{customer.conversation_count ?? 0}</strong>
            </button>
          ))}
        </div>
        {status ? <p className="hint">{status}</p> : null}
      </div>
      <div className="profile-card wide-card">
        {selected ? (
          <>
            <div className="section-header">
              <div>
                <h2 data-no-localize>{selected.name || selected.phone || selected.email || "โปรไฟล์ลูกค้า"}</h2>
                <p className="muted">Last contact: {selected.last_contact_at ? new Date(selected.last_contact_at).toLocaleString(currentIntlLocale()) : "No conversation yet"}</p>
              </div>
              <strong>{statusLabel(selected.latest_crm_status ?? "new")}</strong>
            </div>
            <div className="profile-form">
              <label>
                Client name
                <input value={profileDraft.name} onChange={(event) => setProfileDraft({ ...profileDraft, name: event.target.value })} />
              </label>
              <label>
                Phone
                <input value={profileDraft.phone} onChange={(event) => setProfileDraft({ ...profileDraft, phone: event.target.value })} />
              </label>
              <label>
                Email
                <input value={profileDraft.email} onChange={(event) => setProfileDraft({ ...profileDraft, email: event.target.value })} />
              </label>
              <label>
                LINE ID
                <input value={profileDraft.lineId} onChange={(event) => setProfileDraft({ ...profileDraft, lineId: event.target.value })} />
              </label>
              <label>
                WhatsApp
                <input value={profileDraft.whatsapp} onChange={(event) => setProfileDraft({ ...profileDraft, whatsapp: event.target.value })} />
              </label>
              <label>
                Internal note
                <textarea value={profileDraft.note} onChange={(event) => setProfileDraft({ ...profileDraft, note: event.target.value })} />
              </label>
            </div>
            <div className="flow-actions">
              <button onClick={() => void saveCustomer(selected)}>Save profile</button>
              <button onClick={() => void exportCustomer(selected)}>Export data</button>
              <button className="secondary-danger" onClick={() => void softDeleteCustomer(selected)}>Soft delete</button>
              <button className="danger-button" onClick={() => void eraseCustomer(selected)}>Erase personal data</button>
            </div>
            <h3>Lead timeline</h3>
            {selectedLeads.length ? (
              selectedLeads.map((lead) => (
                <article className="lead-card" key={lead.id}>
                  <strong data-no-localize>{lead.name || lead.phone || lead.email || "ลีด"}</strong>
                  <span>{new Date(lead.created_at).toLocaleString(currentIntlLocale())}</span>
                  <p data-no-localize>{lead.phone || "-"} · {lead.email || "-"}</p>
                </article>
              ))
            ) : (
              <p className="muted">No linked leads yet.</p>
            )}
          </>
        ) : (
          <div className="empty-state">Select or create a customer profile.</div>
        )}
      </div>
    </section>
  );
}

function customerToDraft(customer: Customer | null) {
  return {
    name: customer?.name ?? "",
    phone: customer?.phone ?? "",
    email: customer?.email ?? "",
    lineId: customer?.line_id ?? "",
    whatsapp: customer?.whatsapp ?? "",
    note: customer?.note ?? ""
  };
}

function SettingsPanel({ overview, admin }: { overview: Overview; admin: Admin }) {
  const bot = overview.bots[0];
  const [settingsTab, setSettingsTab] = useState("knowledge");
  return (
    <section className="settings-layout">
      <section className="settings-tabs wide-card">
        <div>
          <h2>{bot?.name ?? "Bot settings"}</h2>
          <p className="muted">
            Public key: {bot?.public_key ?? "-"} · Published version: {bot?.version_no ?? "none"} · Draft versions: {bot?.draft_count ?? 0}
          </p>
        </div>
        <div className="tab-row">
          {([
            ["knowledge", "Knowledge"],
            ["widget", "Widget"],
            ["contacts", "Contact channels"],
            ["team", "Team"],
            ["privacy", "Data & privacy"]
          ] as const).map(([value, label]) => (
            <button key={value} className={settingsTab === value ? "chip active" : "chip"} onClick={() => setSettingsTab(value)}>
              {label}
            </button>
          ))}
        </div>
      </section>
      {bot && settingsTab === "knowledge" ? <FlowBuilder botId={bot.id} /> : null}
      {bot && settingsTab === "widget" ? <WidgetSettingsEditor botId={bot.id} /> : null}
      {bot && settingsTab === "contacts" ? <ContactChannelsEditor botId={bot.id} /> : null}
      {settingsTab === "team" ? <TeamSettings currentAdmin={admin} /> : null}
      {settingsTab === "privacy" ? <PrivacySettingsEditor currentAdmin={admin} /> : null}
    </section>
  );
}

function WidgetSettingsEditor({ botId }: { botId: string }) {
  const [settings, setSettings] = useState<WidgetSettings | null>(null);
  const [originText, setOriginText] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    void load();
  }, [botId]);

  async function load() {
    const response = await fetch(`/api/admin/bots/${botId}/widget-settings`);
    if (!response.ok) {
      setStatus("Could not load widget settings.");
      return;
    }
    const data = (await response.json()) as { settings: WidgetSettings };
    setSettings(data.settings);
    setOriginText(data.settings.allowedOrigins.join("\n"));
    setStatus("");
  }

  async function save() {
    if (!settings) return;
    const response = await fetch(`/api/admin/bots/${botId}/widget-settings`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...settings,
        allowedOrigins: originText
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
      })
    });
    setStatus(response.ok ? "Widget settings saved." : "Save failed.");
    if (response.ok) await load();
  }

  if (!settings) {
    return (
      <section className="wide-card">
        <h2>Widget</h2>
        <p className="muted">{status || "Loading widget settings..."}</p>
      </section>
    );
  }

  return (
    <section className="wide-card settings-form">
      <h2>Widget</h2>
      <label className="checkbox-row">
        <input type="checkbox" checked={settings.enabled} onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })} />
        Enabled
      </label>
      <label>
        Brand color
        <input value={settings.themeColor} onChange={(event) => setSettings({ ...settings, themeColor: event.target.value })} />
      </label>
      <label>
        Position
        <select value={settings.position} onChange={(event) => setSettings({ ...settings, position: event.target.value as "bl" | "br" })}>
          <option value="br">Bottom right</option>
          <option value="bl">Bottom left</option>
        </select>
      </label>
      <label>
        Default language
        <select value={settings.defaultLang} onChange={(event) => setSettings({ ...settings, defaultLang: event.target.value as "th" | "en" })}>
          <option value="th">Thai</option>
          <option value="en">English</option>
        </select>
      </label>
      <label className="checkbox-row">
        <input type="checkbox" checked={settings.langToggle} onChange={(event) => setSettings({ ...settings, langToggle: event.target.checked })} />
        Show language toggle
      </label>
      <label className="checkbox-row">
        <input type="checkbox" checked={settings.openOnLoad} onChange={(event) => setSettings({ ...settings, openOnLoad: event.target.checked })} />
        Open on load
      </label>
      <label>
        Greeting TH
        <textarea value={settings.greetingTh} onChange={(event) => setSettings({ ...settings, greetingTh: event.target.value })} />
      </label>
      <label>
        Greeting EN
        <textarea value={settings.greetingEn} onChange={(event) => setSettings({ ...settings, greetingEn: event.target.value })} />
      </label>
      <label>
        Allowed origins
        <textarea value={originText} onChange={(event) => setOriginText(event.target.value)} placeholder="https://example.com" />
      </label>
      <button onClick={() => void save()}>Save widget settings</button>
      {status ? <p className="hint">{status}</p> : null}
    </section>
  );
}

function ContactChannelsEditor({ botId }: { botId: string }) {
  const [channels, setChannels] = useState<ContactChannel[]>([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    void load();
  }, [botId]);

  async function load() {
    const response = await fetch(`/api/admin/bots/${botId}/contact-channels`);
    if (!response.ok) {
      setStatus("Could not load contact channels.");
      return;
    }
    const data = (await response.json()) as { channels: ContactChannel[] };
    setChannels(data.channels.map((channel) => ({ ...channel, sortOrder: channel.sort_order ?? channel.sortOrder ?? 0 })));
    setStatus("");
  }

  async function save() {
    const response = await fetch(`/api/admin/bots/${botId}/contact-channels`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        channels: channels.map((channel, index) => ({
          type: channel.type,
          label: channel.label,
          value: channel.value,
          sortOrder: index + 1
        }))
      })
    });
    setStatus(response.ok ? "Contact channels saved." : "Save failed.");
    if (response.ok) await load();
  }

  return (
    <section className="wide-card settings-form">
      <h2>Contact channels</h2>
      {channels.map((channel, index) => (
        <div className="channel-row" key={`${channel.id ?? "new"}-${index}`}>
          <select value={channel.type} onChange={(event) => setChannels(channels.map((item, itemIndex) => (itemIndex === index ? { ...item, type: event.target.value } : item)))}>
            {["line", "whatsapp", "messenger", "phone", "email", "url"].map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <input value={channel.label} onChange={(event) => setChannels(channels.map((item, itemIndex) => (itemIndex === index ? { ...item, label: event.target.value } : item)))} placeholder="Label" />
          <input value={channel.value} onChange={(event) => setChannels(channels.map((item, itemIndex) => (itemIndex === index ? { ...item, value: event.target.value } : item)))} placeholder="Value" />
          <button onClick={() => setChannels(channels.filter((_item, itemIndex) => itemIndex !== index))}>Remove</button>
        </div>
      ))}
      <div className="flow-actions">
        <button onClick={() => setChannels([...channels, { type: "email", label: "Email", value: "" }])}>Add channel</button>
        <button onClick={() => void save()}>Save channels</button>
      </div>
      {status ? <p className="hint">{status}</p> : null}
    </section>
  );
}

function TeamSettings({ currentAdmin }: { currentAdmin: Admin }) {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [draft, setDraft] = useState({ email: "", name: "", role: "admin" as "owner" | "admin", password: "" });
  const [status, setStatus] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const response = await fetch("/api/admin/team");
    if (!response.ok) {
      setStatus(currentAdmin.role === "owner" ? "Could not load team." : "Owner role required.");
      return;
    }
    const data = (await response.json()) as { users: TeamUser[] };
    setUsers(data.users);
    setStatus("");
  }

  async function create() {
    const response = await fetch("/api/admin/team", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft)
    });
    setStatus(response.ok ? "Team member saved." : "Create failed. Password must be at least 12 characters.");
    if (response.ok) {
      setDraft({ email: "", name: "", role: "admin", password: "" });
      await load();
    }
  }

  async function remove(userId: string) {
    const response = await fetch(`/api/admin/team/${userId}`, { method: "DELETE" });
    setStatus(response.ok ? "Team member removed." : "Remove failed.");
    if (response.ok) await load();
  }

  return (
    <section className="wide-card settings-form">
      <h2>Team</h2>
      <div className="team-form">
        <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Name" />
        <input value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} placeholder="Email" />
        <select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as "owner" | "admin" })}>
          <option value="admin">Admin</option>
          <option value="owner">Owner</option>
        </select>
        <input value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} placeholder="Temporary password" type="password" />
        <button onClick={() => void create()}>Create/update</button>
      </div>
      {users.map((user) => (
        <div className="table-row" key={user.id}>
          <span data-no-localize>{user.name}</span>
          <span data-no-localize>{user.email}</span>
          <span>{user.role}</span>
          <button disabled={user.email === currentAdmin.email} onClick={() => void remove(user.id)}>
            Delete
          </button>
        </div>
      ))}
      {status ? <p className="hint">{status}</p> : null}
    </section>
  );
}

function PrivacySettingsEditor({ currentAdmin }: { currentAdmin: Admin }) {
  const [settings, setSettings] = useState<PrivacySettings | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const response = await fetch("/api/admin/privacy");
    if (!response.ok) {
      setStatus(currentAdmin.role === "owner" ? "Could not load privacy settings." : "Owner role required.");
      return;
    }
    const data = (await response.json()) as { settings: PrivacySettings };
    setSettings(data.settings);
    setStatus("");
  }

  async function save() {
    if (!settings) return;
    const response = await fetch("/api/admin/privacy", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(settings)
    });
    setStatus(response.ok ? "Privacy settings saved." : "Save failed.");
    if (response.ok) await load();
  }

  if (!settings) {
    return (
      <section className="wide-card">
        <h2>Data & privacy</h2>
        <p className="muted">{status || "Loading privacy settings..."}</p>
      </section>
    );
  }

  return (
    <section className="wide-card settings-form">
      <h2>Data & privacy</h2>
      <label>
        Transcript retention days
        <input
          type="number"
          value={settings.transcriptRetentionDays}
          onChange={(event) => setSettings({ ...settings, transcriptRetentionDays: Number(event.target.value) })}
        />
      </label>
      <label>
        Privacy policy URL
        <input value={settings.privacyPolicyUrl} onChange={(event) => setSettings({ ...settings, privacyPolicyUrl: event.target.value })} />
      </label>
      <label>
        Alert email
        <input value={settings.alertEmail} onChange={(event) => setSettings({ ...settings, alertEmail: event.target.value })} />
      </label>
      <label>
        Lead notice TH
        <textarea value={settings.leadNoticeTh} onChange={(event) => setSettings({ ...settings, leadNoticeTh: event.target.value })} />
      </label>
      <label>
        Lead notice EN
        <textarea value={settings.leadNoticeEn} onChange={(event) => setSettings({ ...settings, leadNoticeEn: event.target.value })} />
      </label>
      <button onClick={() => void save()}>Save privacy settings</button>
      {status ? <p className="hint">{status}</p> : null}
    </section>
  );
}

function FlowBuilder({ botId }: { botId: string }) {
  const [draft, setDraft] = useState<DraftFlow | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [simInput, setSimInput] = useState("");
  const [simOutput, setSimOutput] = useState("");
  const [references, setReferences] = useState<NodeReferences | null>(null);

  useEffect(() => {
    if (!selectedId) {
      setReferences(null);
      return;
    }
    void loadReferences(selectedId);
  }, [selectedId]);

  async function loadDraft() {
    setStatus("Loading draft...");
    const response = await fetch(`/api/admin/bots/${botId}/draft`);
    if (!response.ok) {
      setStatus("Could not load draft.");
      return;
    }
    const data = (await response.json()) as DraftFlow;
    setDraft(data);
    setSelectedId((current) => current ?? data.tree[0]?.id ?? null);
    setStatus("");
  }

  async function patchNode(nodeId: string, patch: Record<string, unknown>) {
    const response = await fetch(`/api/admin/nodes/${nodeId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch)
    });
    if (!response.ok) {
      setStatus("Node update failed.");
      return;
    }
    await loadDraft();
  }

  async function createChild(parentId: string) {
    const response = await fetch(`/api/admin/bots/${botId}/draft`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "message",
        parentId,
        title: "New node",
        contentTh: "ข้อความใหม่",
        contentEn: "New message",
        sortOrder: (draft?.tree.length ?? 0) + 1
      })
    });
    if (!response.ok) {
      setStatus("Create node failed.");
      return;
    }
    const data = (await response.json()) as { node: FlowNode };
    setSelectedId(data.node.id);
    await loadDraft();
  }

  async function addOption(nodeId: string, targetNodeId: string) {
    const response = await fetch(`/api/admin/nodes/${nodeId}/options`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targetNodeId, labelTh: "ตัวเลือก", labelEn: "Option", sortOrder: (draft?.optionRows.length ?? 0) + 1 })
    });
    setStatus(response.ok ? "" : "Add option failed.");
    await loadDraft();
  }

  async function deleteSelectedNode(node: FlowNode) {
    if (node.parentId === null) {
      setStatus("Root node cannot be deleted.");
      return;
    }
    const incoming = (references?.options.length ?? 0) + (references?.nextNodes.length ?? 0);
    const confirmed = window.confirm(incoming
      ? uiCopy(`โนดนี้มีการอ้างอิงขาเข้า ${incoming} รายการ ระบบจะไม่อนุญาตให้ลบหากรายการเหล่านั้นไม่ได้อยู่ในโครงสร้างย่อยที่โนดนี้เป็นเจ้าของ ดำเนินการต่อหรือไม่?`, `This node has ${incoming} incoming reference(s). Delete will be blocked unless they are inside the owned subtree. Continue?`)
      : uiCopy("ลบโนดนี้และโนดย่อยที่เป็นเจ้าของทั้งหมดหรือไม่?", "Delete this node and its owned descendants?"));
    if (!confirmed) return;
    const response = await fetch(`/api/admin/nodes/${node.id}?mode=cascade`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(data.error?.message ?? "Delete blocked. Rewire incoming references first.");
      return;
    }
    setStatus("Node deleted.");
    setSelectedId(null);
    await loadDraft();
  }

  async function loadReferences(nodeId: string) {
    const response = await fetch(`/api/admin/nodes/${nodeId}/references`);
    if (!response.ok) {
      setReferences(null);
      return;
    }
    setReferences((await response.json()) as NodeReferences);
  }

  async function updateOption(option: FlowOption, patch: Record<string, unknown>) {
    const response = await fetch(`/api/admin/options/${option.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch)
    });
    setStatus(response.ok ? "" : "Option update failed.");
    await loadDraft();
  }

  async function saveKeywords(nodeId: string, text: string) {
    const keywords = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        const parts = line.includes(":") ? line.split(":") : ["th", line];
        const lang = parts[0] ?? "th";
        const rest = parts.slice(1);
        return {
          lang: lang.trim() === "th" ? "th" : "en",
          keyword: rest.join(":").trim(),
          priority: index + 1,
          substringEnabled: true
        };
      })
      .filter((item) => item.keyword);
    const response = await fetch(`/api/admin/nodes/${nodeId}/keywords`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ keywords })
    });
    setStatus(response.ok ? "Keywords saved." : "Keyword update failed.");
    await loadDraft();
  }

  async function publish() {
    const response = await fetch(`/api/admin/bots/${botId}/publish`, { method: "POST" });
    const data = await response.json().catch(() => ({}));
    setStatus(response.ok ? `Published version ${data.versionNo}.` : data.error?.message ?? "Publish failed.");
    await loadDraft();
  }

  async function simulate(nodeId: string) {
    const response = await fetch(`/api/admin/bots/${botId}/simulate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        state: { currentNodeId: nodeId, status: "bot", lang: "th" },
        input: { type: "text", payload: { text: simInput || "สวัสดี" } }
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setSimOutput(data.error?.message ?? "Simulation failed.");
      return;
    }
    setSimOutput(JSON.stringify(data.result, null, 2));
  }

  if (!draft) {
    return (
      <section className="wide-card">
        <h2>Knowledge flow</h2>
        <p className="muted">Load the draft to edit nodes, options, and keywords.</p>
        <button onClick={() => void loadDraft()}>Load draft editor</button>
        {status ? <p className="hint">{status}</p> : null}
      </section>
    );
  }

  const selected = draft.tree.find((node) => node.id === selectedId) ?? draft.tree[0];
  const selectedOptions = selected ? draft.optionRows.filter((option) => option.nodeId === selected.id) : [];
  const keywordText = selected
    ? draft.keywordRows
        .filter((keyword) => keyword.nodeId === selected.id)
        .map((keyword) => `${keyword.lang}:${keyword.keyword}`)
        .join("\n")
    : "";

  return (
    <section className="flow-builder wide-card">
      <div className="flow-toolbar">
        <div>
          <h2>Knowledge flow</h2>
          <p className="muted">Draft version {draft.version.versionNo}</p>
        </div>
        <button onClick={() => void publish()}>Publish</button>
      </div>
      {status ? <p className="hint">{status}</p> : null}
      <div className="flow-grid">
        <div className="node-list">
          {draft.tree.map((node) => (
            <button key={node.id} className={selected?.id === node.id ? "node-row active" : "node-row"} onClick={() => setSelectedId(node.id)}>
              <span>{node.title}</span>
              <small>{node.type}</small>
            </button>
          ))}
          <div className="mini-graph">
            <h3>Graph</h3>
            {draft.optionRows.map((option) => (
              <span key={option.id}>
                {nodeTitle(draft, option.nodeId)} {"->"} {nodeTitle(draft, option.targetNodeId)}
              </span>
            ))}
            {draft.optionRows.length === 0 ? <p className="muted">No option references yet.</p> : null}
          </div>
        </div>
        {selected ? (
          <div className="node-editor">
            <label>
              Title
              <input key={`${selected.id}-title`} defaultValue={selected.title} onBlur={(event) => void patchNode(selected.id, { title: event.target.value })} />
            </label>
            <label>
              Type
              <select value={selected.type} onChange={(event) => void patchNode(selected.id, { type: event.target.value })}>
                {["message", "options", "cta_link", "cta_lead_form", "cta_contact_card", "cta_live_chat"].map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Thai content
              <textarea key={`${selected.id}-th`} defaultValue={selected.contentTh} onBlur={(event) => void patchNode(selected.id, { contentTh: event.target.value })} />
            </label>
            <label>
              English content
              <textarea key={`${selected.id}-en`} defaultValue={selected.contentEn} onBlur={(event) => void patchNode(selected.id, { contentEn: event.target.value })} />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={selected.searchableContent}
                onChange={(event) => void patchNode(selected.id, { searchableContent: event.target.checked })}
              />
              Search this content for typed visitor questions
            </label>
            <div className="flow-actions">
              <button onClick={() => void createChild(selected.id)}>Create child node</button>
              {draft.tree.length > 1 ? <button onClick={() => void addOption(selected.id, draft.tree.find((node) => node.id !== selected.id)?.id ?? selected.id)}>Add option</button> : null}
              <button className="secondary-danger" disabled={selected.parentId === null} onClick={() => void deleteSelectedNode(selected)}>
                Delete node
              </button>
            </div>
            <section className="reference-panel">
              <h3>Incoming references</h3>
              {references && references.options.length + references.nextNodes.length > 0 ? (
                <>
                  {references.options.map((reference) => (
                    <p key={reference.id}>Option from {nodeTitle(draft, reference.nodeId)}</p>
                  ))}
                  {references.nextNodes.map((reference) => (
                    <p key={reference.id}>Next node from {nodeTitle(draft, reference.nodeId)}</p>
                  ))}
                </>
              ) : (
                <p className="muted">No incoming references.</p>
              )}
            </section>
            <h3>Options</h3>
            {selectedOptions.map((option) => (
              <div className="option-editor" key={option.id}>
                <input defaultValue={option.labelTh} onBlur={(event) => void updateOption(option, { labelTh: event.target.value })} />
                <input defaultValue={option.labelEn} onBlur={(event) => void updateOption(option, { labelEn: event.target.value })} />
                <select value={option.targetNodeId} onChange={(event) => void updateOption(option, { targetNodeId: event.target.value })}>
                  {draft.tree.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.title}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <h3>Keywords</h3>
            <KeywordEditor key={selected.id} initialValue={keywordText} onSave={(value) => void saveKeywords(selected.id, value)} />
            <h3>Simulator</h3>
            <div className="simulator">
              <input value={simInput} onChange={(event) => setSimInput(event.target.value)} placeholder="Type test input" />
              <button onClick={() => void simulate(selected.id)}>Run</button>
            </div>
            {simOutput ? <pre className="sim-output">{simOutput}</pre> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function KeywordEditor({ initialValue, onSave }: { initialValue: string; onSave: (value: string) => void }) {
  const [value, setValue] = useState(initialValue);
  return (
    <div className="keyword-editor">
      <textarea value={value} onChange={(event) => setValue(event.target.value)} placeholder="en:pricing&#10;th:ราคา" />
      <button onClick={() => onSave(value)}>Save keywords</button>
    </div>
  );
}

function nodeTitle(draft: DraftFlow, nodeId: string) {
  return draft.tree.find((node) => node.id === nodeId)?.title ?? "Unknown node";
}
