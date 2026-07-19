import { djayWidgetBaseStyles, normalizeWidgetApiOrigin, widgetFetch } from "@djay/shared/widget-ui";

export type AiChatWidgetOptions = Readonly<{
  deploymentKey: string;
  apiBaseUrl: string;
  mountTarget?: HTMLElement;
  language?: "th" | "en";
  openOnLoad?: boolean;
  storage?: Storage;
}>;

type ChatMessage = Readonly<{ role: "customer" | "assistant" | "human"; text: string; sequence?: number }>;
type PublicAction = Readonly<{ type: "booking" | "quotation" | "checkout" | "call" | "line" | "website"; label: string; url: string }>;
type PublicConfig = Readonly<{ agentName: string; defaultLanguage: "th" | "en"; brandingRemoved: boolean }>;
type SyncResponse = Readonly<{
  status: "active" | "processing" | "handover" | "completed" | "failed" | "expired";
  lastMessageSequence: number;
  messages: readonly Readonly<{ sequence: number; message: { content?: { text?: string; quickReplies?: string[]; actions?: PublicAction[] } } }>[];
}>;

const copy = {
  en: { open: "Open AI chat", close: "Close AI chat", product: "AI sales assistant", send: "Send", placeholder: "Ask a question…", connecting: "Connecting…", thinking: "Preparing a response…", unavailable: "Chat is temporarily unavailable. Your conversation is still saved.", retry: "Reconnect", handover: "A team member will continue this conversation.", completed: "This conversation is complete.", failed: "This conversation could not continue.", expired: "This conversation has expired.", newConversation: "Start a new conversation", powered: "Powered by DJAY Bot" },
  th: { open: "เปิดแชท AI", close: "ปิดแชท AI", product: "ผู้ช่วยฝ่ายขาย AI", send: "ส่ง", placeholder: "สอบถามได้เลย…", connecting: "กำลังเชื่อมต่อ…", thinking: "กำลังเตรียมคำตอบ…", unavailable: "แชทไม่พร้อมใช้งานชั่วคราว การสนทนาของคุณยังถูกบันทึกไว้", retry: "เชื่อมต่อใหม่", handover: "ทีมงานจะเข้ามาดูแลการสนทนาต่อ", completed: "การสนทนานี้เสร็จสิ้นแล้ว", failed: "ไม่สามารถดำเนินการสนทนานี้ต่อได้", expired: "การสนทนานี้หมดอายุแล้ว", newConversation: "เริ่มการสนทนาใหม่", powered: "ขับเคลื่อนโดย DJAY Bot" },
} as const;

export function normalizeAiApiBaseUrl(value: string) { return normalizeWidgetApiOrigin(value); }
export function aiChatSessionStorageKey(deploymentKey: string) { return `djay:ai-chat:${deploymentKey.slice(0, 24)}:session`; }
export function mountAiChatWidget(options: AiChatWidgetOptions) { return new AiChatWidget(options).mount(); }

let aiChatWidgetSequence = 0;

class AiChatWidget {
  private readonly host = document.createElement("div");
  private readonly shadow = this.host.attachShadow({ mode: "open" });
  private readonly apiBaseUrl: string;
  private readonly storage: Storage | null;
  private opened: boolean;
  private loading = true;
  private unavailable = false;
  private config: PublicConfig | null = null;
  private sessionToken: string | null = null;
  private language: "th" | "en";
  private status: SyncResponse["status"] = "active";
  private messages: ChatMessage[] = [];
  private lastMessageSequence = 0;
  private pollTimer: number | null = null;
  private syncing = false;
  private announcement = "";
  private quickReplies: string[] = [];
  private actions: PublicAction[] = [];
  private readonly panelId = `djay-ai-chat-panel-${++aiChatWidgetSequence}`;

  constructor(private readonly options: AiChatWidgetOptions) {
    this.apiBaseUrl = normalizeAiApiBaseUrl(options.apiBaseUrl);
    this.language = options.language ?? "en";
    this.opened = Boolean(options.openOnLoad);
    this.storage = options.storage ?? safeStorage();
    this.host.dataset.djayAiChat = options.deploymentKey.slice(0, 16);
  }

  mount() {
    (this.options.mountTarget ?? document.body).append(this.host);
    this.render();
    void this.bootstrap();
    return this.host;
  }

  private async bootstrap() {
    this.announcement = copy[this.language].connecting;
    this.loading = true; this.render();
    try {
      const result = await this.jsonRequest<{ status: "available"; config: PublicConfig }>("/public/ai-chat/config");
      this.config = result.config;
      this.language = this.options.language ?? result.config.defaultLanguage;
      this.sessionToken = this.storage?.getItem(aiChatSessionStorageKey(this.options.deploymentKey)) ?? null;
      if (this.sessionToken) await this.sync(false);
      this.unavailable = false;
    } catch { this.unavailable = true; this.announcement = copy[this.language].unavailable; }
    finally { this.loading = false; this.render(); if (this.opened) this.focusComposer(); }
    if (this.opened && !this.sessionToken) await this.startSession();
    this.startPolling();
  }

  private async startSession() {
    try {
      this.announcement = copy[this.language].connecting;
      this.loading = true; this.render();
      const result = await this.jsonRequest<{
        status: "started"; sessionToken: string; greeting: string; nextMessageSequence: number;
      }>("/public/ai-chat/session", { method: "POST", body: JSON.stringify({ language: this.language }) });
      this.sessionToken = result.sessionToken;
      this.storage?.setItem(aiChatSessionStorageKey(this.options.deploymentKey), result.sessionToken);
      this.messages = [{ role: "assistant", text: result.greeting, sequence: 1 }];
      this.lastMessageSequence = 1;
      this.status = "active";
      this.unavailable = false;
      this.announcement = result.greeting;
    } catch { this.unavailable = true; this.announcement = copy[this.language].unavailable; }
    finally { this.loading = false; this.render(); if (this.opened) this.focusComposer(); }
  }

  private async send(message: string) {
    if (!this.sessionToken) await this.startSession();
    if (!this.sessionToken) return;
    const inputId = crypto.randomUUID();
    this.messages.push({ role: "customer", text: message });
    this.announcement = copy[this.language].thinking;
    this.loading = true; this.unavailable = false; this.render();
    try {
      const response = await widgetFetch(`${this.apiBaseUrl}/public/ai-chat/message`, {
        method: "POST",
        headers: this.headers({ "x-djay-ai-session": this.sessionToken }),
        body: JSON.stringify({ inputId, message }),
      });
      if (!response.ok || !response.body) throw new Error("ai_chat_request_failed");
      const assistant = { role: "assistant" as const, text: "" };
      this.messages.push(assistant); this.render();
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let pending = "";
      for (;;) {
        const part = await reader.read();
        pending += part.value ?? "";
        const lines = pending.split("\n"); pending = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          this.applyStreamEvent(JSON.parse(line), assistant);
          this.updateStreamingAssistant(assistant.text);
        }
        if (part.done) {
          if (pending.trim()) { this.applyStreamEvent(JSON.parse(pending), assistant); this.updateStreamingAssistant(assistant.text); }
          break;
        }
      }
      this.unavailable = false;
      await this.sync(false);
    } catch {
      this.messages = this.messages.filter((item) => item.text.length > 0);
      this.unavailable = true;
      this.announcement = copy[this.language].unavailable;
    } finally { this.loading = false; this.render(); this.focusComposer(); }
  }

  private applyStreamEvent(value: unknown, assistant: { role: "assistant"; text: string }) {
    if (!value || typeof value !== "object") throw new Error("ai_chat_stream_invalid");
    const event = value as { type?: unknown; text?: unknown; status?: unknown; quickReplies?: unknown; actions?: unknown };
    if (event.type === "response.delta" && typeof event.text === "string") assistant.text += event.text;
    if (event.type === "response.done" && ["active", "processing", "handover", "completed", "failed", "expired"].includes(String(event.status))) {
      this.status = event.status as SyncResponse["status"];
      this.quickReplies = Array.isArray(event.quickReplies) ? event.quickReplies.filter((item): item is string => typeof item === "string").slice(0, 6) : [];
      this.actions = Array.isArray(event.actions) ? event.actions.filter(safePublicAction).slice(0, 12) : [];
      this.announcement = assistant.text;
    }
  }

  private updateStreamingAssistant(text: string) {
    const messages = this.shadow.querySelectorAll<HTMLElement>(".message.assistant");
    const latest = messages.item(messages.length - 1);
    if (latest) latest.textContent = text;
  }

  private async sync(renderAfter = true) {
    if (!this.sessionToken || this.syncing) return;
    this.syncing = true;
    try {
      const result = await this.jsonRequest<{ status: "synced"; response: SyncResponse }>("/public/ai-chat/sync", {
        method: "POST",
        headers: { "x-djay-ai-session": this.sessionToken },
        body: JSON.stringify({ afterSequence: this.lastMessageSequence }),
      });
      const previousStatus = this.status;
      let added = false;
      let latestText = "";
      for (const entry of [...result.response.messages].sort((a, b) => a.sequence - b.sequence)) {
        const text = entry.message.content?.text;
        if (entry.sequence > this.lastMessageSequence && text) {
          const duplicate = this.messages.some((message) => message.sequence === entry.sequence || (message.role === "assistant" && message.text === text));
          if (!duplicate) { this.messages.push({ role: result.response.status === "handover" ? "human" : "assistant", text, sequence: entry.sequence }); added = true; latestText = text; }
          this.quickReplies = Array.isArray(entry.message.content?.quickReplies) ? entry.message.content.quickReplies.slice(0, 6) : [];
          this.actions = Array.isArray(entry.message.content?.actions) ? entry.message.content.actions.filter(safePublicAction).slice(0, 12) : [];
        }
      }
      this.lastMessageSequence = Math.max(this.lastMessageSequence, result.response.lastMessageSequence);
      this.status = result.response.status;
      const wasUnavailable = this.unavailable;
      this.unavailable = false;
      if (latestText) this.announcement = latestText;
      else if (previousStatus !== this.status) {
        this.announcement = this.status === "handover" ? copy[this.language].handover
          : this.status === "completed" ? copy[this.language].completed
            : this.status === "failed" ? copy[this.language].failed
              : this.status === "expired" ? copy[this.language].expired : "";
      }
      if (renderAfter && (added || previousStatus !== this.status || wasUnavailable)) this.render();
    } finally {
      this.syncing = false;
    }
  }

  private startPolling() {
    if (this.pollTimer !== null) return;
    this.pollTimer = window.setInterval(() => {
      if (!this.host.isConnected) {
        if (this.pollTimer !== null) window.clearInterval(this.pollTimer);
        this.pollTimer = null; return;
      }
      if (document.visibilityState !== "hidden" && this.opened && this.sessionToken && !this.loading && !this.hasEditableFocus()) {
        void this.sync().catch(() => { this.unavailable = true; this.announcement = copy[this.language].unavailable; this.render(); });
      }
    }, 5_000);
  }

  private headers(extra: HeadersInit = {}): HeadersInit {
    return { "content-type": "application/json", "x-djay-ai-key": this.options.deploymentKey, ...extra };
  }

  private async jsonRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await widgetFetch(`${this.apiBaseUrl}${path}`, { ...init, headers: this.headers(init.headers) });
    if (!response.ok) throw new Error("ai_chat_request_failed");
    return response.json() as Promise<T>;
  }

  private hasEditableFocus() { return this.shadow.activeElement instanceof HTMLInputElement; }

  private focusComposer() {
    queueMicrotask(() => this.shadow.querySelector<HTMLInputElement>(".composer input:not(:disabled)")?.focus());
  }

  private setOpened(opened: boolean) {
    this.opened = opened; this.render();
    if (opened) this.focusComposer();
    else queueMicrotask(() => this.shadow.querySelector<HTMLButtonElement>(".launcher")?.focus());
  }

  private async startOver() {
    this.storage?.removeItem(aiChatSessionStorageKey(this.options.deploymentKey));
    this.sessionToken = null; this.messages = []; this.lastMessageSequence = 0; this.status = "active"; this.unavailable = false; this.announcement = "";
    await this.startSession();
  }

  private render() {
    const text = copy[this.language];
    const previousInput = this.shadow.querySelector<HTMLInputElement>(".composer input");
    const draft = previousInput?.value ?? "";
    const restoreInputFocus = this.shadow.activeElement === previousInput;
    this.shadow.replaceChildren();
    const style = document.createElement("style"); style.textContent = styles; this.shadow.append(style);
    const shell = element("div", "shell");
    if (this.opened) {
      const panel = element("section", "panel"); panel.id = this.panelId; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "false"); panel.setAttribute("aria-label", this.config?.agentName ?? "DJAY Bot");
      panel.addEventListener("keydown", (event) => { if (event.key === "Escape") this.setOpened(false); });
      const header = element("header", "header");
      const identity = element("div", "identity"); const identityCopy = element("div", "identity-copy");
      identityCopy.append(element("strong", "title", this.config?.agentName ?? "DJAY Bot"), element("span", "product-label", text.product));
      identity.append(element("span", "mark", "DJ"), identityCopy); header.append(identity);
      const close = button("×", text.close, "icon"); close.addEventListener("click", () => this.setOpened(false)); header.append(close);
      const stream = element("div", "stream"); stream.setAttribute("aria-busy", String(this.loading));
      for (const message of this.messages) stream.append(element("div", `message ${message.role}`, message.text));
      if (this.loading || this.status === "processing") stream.append(element("div", "notice", this.sessionToken ? text.thinking : text.connecting));
      if (this.unavailable) { const retry = button(text.retry, text.retry, "small"); retry.addEventListener("click", () => void this.bootstrap()); const notice = element("div", "notice error", text.unavailable); notice.setAttribute("role", "alert"); notice.append(retry); stream.append(notice); }
      if (this.status === "handover") stream.append(element("div", "notice", text.handover));
      if (this.actions.length) { const actions = element("div", "response-actions"); for (const action of this.actions) { const link = document.createElement("a"); link.className = "response-action"; link.href = action.url; link.textContent = action.label; link.target = action.type === "call" ? "_self" : "_blank"; link.rel = "noopener noreferrer"; actions.append(link); } stream.append(actions); }
      if (this.quickReplies.length && this.status === "active") { const replies = element("div", "quick-replies"); for (const label of this.quickReplies) { const choice = button(label, label, "quick-reply"); choice.addEventListener("click", () => { this.quickReplies = []; void this.send(label); }); replies.append(choice); } stream.append(replies); }
      if (["completed", "failed", "expired"].includes(this.status)) {
        const notice = element("div", `notice ${this.status === "failed" ? "error" : ""}`, text[this.status as "completed" | "failed" | "expired"]); if (this.status === "failed") notice.setAttribute("role", "alert");
        const start = button(text.newConversation, text.newConversation, "small"); start.addEventListener("click", () => void this.startOver()); notice.append(start); stream.append(notice);
      }
      if (this.announcement && !this.unavailable && this.status !== "failed") { const live = element("div", "sr-only", this.announcement); live.setAttribute("aria-live", "polite"); live.setAttribute("aria-atomic", "true"); stream.append(live); }
      const composer = element("form", "composer") as HTMLFormElement;
      const input = document.createElement("input"); input.placeholder = text.placeholder; input.maxLength = 2000; input.value = draft; input.autocomplete = "off"; input.setAttribute("aria-label", text.placeholder);
      input.disabled = this.loading || ["processing", "handover", "completed", "failed", "expired"].includes(this.status);
      const send = button(text.send, text.send, "send"); send.type = "submit"; send.disabled = input.disabled;
      composer.append(input, send); composer.addEventListener("submit", (event) => { event.preventDefault(); const value = input.value.trim(); if (value) void this.send(value); });
      panel.append(header, stream, composer);
      if (!this.config?.brandingRemoved) panel.append(element("div", "brand", text.powered));
      shell.append(panel);
    }
    const launcher = button(this.opened ? "×" : "DJ", this.opened ? text.close : text.open, "launcher"); launcher.setAttribute("aria-expanded", String(this.opened)); launcher.setAttribute("aria-controls", this.panelId);
    launcher.addEventListener("click", () => { this.setOpened(!this.opened); if (this.opened && !this.sessionToken) void this.startSession(); });
    shell.append(launcher); this.shadow.append(shell);
    queueMicrotask(() => this.shadow.querySelector(".stream")?.scrollTo({ top: 99_999 }));
    if (restoreInputFocus) queueMicrotask(() => { const input = this.shadow.querySelector<HTMLInputElement>(".composer input:not(:disabled)"); input?.focus(); input?.setSelectionRange(input.value.length, input.value.length); });
  }
}

function element(tag: string, className: string, text?: string) { const node = document.createElement(tag); node.className = className; if (text !== undefined) node.textContent = text; return node; }
function button(label: string, ariaLabel: string, className: string) { const node = document.createElement("button"); node.type = "button"; node.className = className; node.textContent = label; node.setAttribute("aria-label", ariaLabel); return node; }
function safeStorage() { try { return window.localStorage; } catch { return null; } }
function safePublicAction(value: unknown): value is PublicAction { if (!value || typeof value !== "object") return false; const action = value as Record<string, unknown>; if (typeof action.label !== "string" || typeof action.url !== "string" || !["booking", "quotation", "checkout", "call", "line", "website"].includes(String(action.type))) return false; try { const protocol = new URL(action.url).protocol; return action.type === "call" ? protocol === "tel:" : protocol === "https:"; } catch { return false; } }

const styles = `
${djayWidgetBaseStyles}
.response-actions,.quick-replies{display:flex;flex-wrap:wrap;gap:8px}.response-action,.quick-reply{min-height:40px;display:inline-flex;align-items:center;border:1px solid var(--djay-widget-green);border-radius:6px;padding:8px 11px;background:var(--djay-widget-surface);color:var(--djay-widget-green-hover);font:inherit;font-weight:700;text-decoration:none;cursor:pointer}.response-action:hover,.quick-reply:hover{background:var(--djay-widget-green-soft)}
.panel{height:min(640px,calc(100vh - 108px));height:min(640px,calc(100dvh - 108px));display:grid;grid-template-rows:auto minmax(0,1fr) auto auto}.stream{min-height:0;padding:16px;overflow:auto;display:flex;flex-direction:column;gap:10px;background:var(--djay-widget-canvas)}.message{max-width:84%;padding:11px 13px;border:1px solid transparent;border-radius:14px;overflow-wrap:anywhere;white-space:pre-wrap;line-height:1.45;font-size:14px}.assistant{align-self:flex-start;background:var(--djay-widget-surface);border-color:var(--djay-widget-border)}.human{align-self:flex-start;background:var(--djay-widget-green-soft);border-color:#9fc9b8}.customer{align-self:flex-end;background:var(--djay-widget-warning-soft);border-color:#ead59f}.notice{display:grid;gap:8px;padding:10px 12px;border-left:3px solid var(--djay-widget-green);border-radius:0 6px 6px 0;background:var(--djay-widget-green-soft);color:var(--djay-widget-green-hover);font-size:13px;line-height:1.45}.notice.error{border-color:var(--djay-widget-danger);background:var(--djay-widget-danger-soft);color:#812e29}.small{min-height:44px;border:1px solid currentColor;border-radius:6px;background:transparent;color:inherit;padding:8px 10px;cursor:pointer;font-weight:800}.composer{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:10px;border-top:1px solid var(--djay-widget-border);background:var(--djay-widget-surface)}.composer input{min-width:0;height:46px;border:1px solid #aebbb6;border-radius:6px;padding:0 11px;color:var(--djay-widget-ink)}.send{min-width:68px;height:46px;border:0;border-radius:6px;padding:0 14px;background:var(--djay-widget-green);color:#fff;font-weight:800;cursor:pointer}.send:hover{background:var(--djay-widget-green-hover)}@media(max-width:520px){.panel{height:calc(100vh - 82px - env(safe-area-inset-bottom));height:calc(100dvh - 82px - env(safe-area-inset-bottom))}}
`;
