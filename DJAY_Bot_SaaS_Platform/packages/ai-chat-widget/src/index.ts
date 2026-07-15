export type AiChatWidgetOptions = Readonly<{
  deploymentKey: string;
  apiBaseUrl: string;
  mountTarget?: HTMLElement;
  language?: "th" | "en";
  openOnLoad?: boolean;
  storage?: Storage;
}>;

type ChatMessage = Readonly<{ role: "customer" | "assistant" | "human"; text: string; sequence?: number }>;
type PublicConfig = Readonly<{ agentName: string; defaultLanguage: "th" | "en"; brandingRemoved: boolean }>;
type SyncResponse = Readonly<{
  status: "active" | "processing" | "handover" | "completed" | "failed" | "expired";
  lastMessageSequence: number;
  messages: readonly Readonly<{ sequence: number; message: { content?: { text?: string } } }>[];
}>;

const copy = {
  en: { open: "Open AI chat", close: "Close chat", send: "Send", placeholder: "Ask a question…", connecting: "Connecting…", thinking: "Thinking…", unavailable: "Chat is temporarily unavailable.", retry: "Retry", handover: "A team member will continue this conversation.", powered: "Powered by DJAY Bot" },
  th: { open: "เปิดแชท AI", close: "ปิดแชท", send: "ส่ง", placeholder: "สอบถามได้เลย…", connecting: "กำลังเชื่อมต่อ…", thinking: "กำลังคิด…", unavailable: "แชทไม่พร้อมใช้งานชั่วคราว", retry: "ลองใหม่", handover: "ทีมงานจะเข้ามาดูแลการสนทนาต่อ", powered: "ขับเคลื่อนโดย DJAY Bot" },
} as const;

export function normalizeAiApiBaseUrl(value: string) { return value.replace(/\/+$/, ""); }
export function aiChatSessionStorageKey(deploymentKey: string) { return `djay:ai-chat:${deploymentKey.slice(0, 24)}:session`; }
export function mountAiChatWidget(options: AiChatWidgetOptions) { return new AiChatWidget(options).mount(); }

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
    try {
      const result = await this.jsonRequest<{ status: "available"; config: PublicConfig }>("/public/ai-chat/config");
      this.config = result.config;
      this.language = this.options.language ?? result.config.defaultLanguage;
      this.sessionToken = this.storage?.getItem(aiChatSessionStorageKey(this.options.deploymentKey)) ?? null;
      if (this.sessionToken) await this.sync(false);
      this.unavailable = false;
    } catch { this.unavailable = true; }
    finally { this.loading = false; this.render(); }
    if (this.opened && !this.sessionToken) await this.startSession();
    this.startPolling();
  }

  private async startSession() {
    try {
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
    } catch { this.unavailable = true; }
    finally { this.loading = false; this.render(); }
  }

  private async send(message: string) {
    if (!this.sessionToken) await this.startSession();
    if (!this.sessionToken) return;
    const inputId = crypto.randomUUID();
    this.messages.push({ role: "customer", text: message });
    this.loading = true; this.unavailable = false; this.render();
    try {
      const response = await fetch(`${this.apiBaseUrl}/public/ai-chat/message`, {
        method: "POST",
        headers: this.headers({ "x-djay-ai-session": this.sessionToken }),
        body: JSON.stringify({ inputId, message }),
      });
      if (!response.ok || !response.body) throw new Error("ai_chat_request_failed");
      const assistant = { role: "assistant" as const, text: "" };
      this.messages.push(assistant);
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let pending = "";
      for (;;) {
        const part = await reader.read();
        pending += part.value ?? "";
        const lines = pending.split("\n"); pending = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          const event = JSON.parse(line) as { type: string; text?: string; status?: SyncResponse["status"] };
          if (event.type === "response.delta" && event.text) assistant.text += event.text;
          if (event.type === "response.done" && event.status) this.status = event.status;
          this.render();
        }
        if (part.done) break;
      }
      this.unavailable = false;
      await this.sync(false);
    } catch {
      this.messages = this.messages.filter((item) => item.text.length > 0);
      this.unavailable = true;
    } finally { this.loading = false; this.render(); }
  }

  private async sync(renderAfter = true) {
    if (!this.sessionToken) return;
    const result = await this.jsonRequest<{ status: "synced"; response: SyncResponse }>("/public/ai-chat/sync", {
      method: "POST",
      headers: { "x-djay-ai-session": this.sessionToken },
      body: JSON.stringify({ afterSequence: this.lastMessageSequence }),
    });
    for (const entry of [...result.response.messages].sort((a, b) => a.sequence - b.sequence)) {
      const text = entry.message.content?.text;
      if (entry.sequence > this.lastMessageSequence && text) {
        const duplicate = this.messages.some((message) => message.sequence === entry.sequence || (message.role === "assistant" && message.text === text));
        if (!duplicate) this.messages.push({ role: result.response.status === "handover" ? "human" : "assistant", text, sequence: entry.sequence });
      }
    }
    this.lastMessageSequence = Math.max(this.lastMessageSequence, result.response.lastMessageSequence);
    this.status = result.response.status;
    if (renderAfter) this.render();
  }

  private startPolling() {
    if (this.pollTimer !== null) return;
    this.pollTimer = window.setInterval(() => {
      if (!this.host.isConnected) {
        if (this.pollTimer !== null) window.clearInterval(this.pollTimer);
        this.pollTimer = null; return;
      }
      if (this.opened && this.sessionToken && !this.loading) void this.sync().catch(() => undefined);
    }, 5_000);
  }

  private headers(extra: HeadersInit = {}): HeadersInit {
    return { "content-type": "application/json", "x-djay-ai-key": this.options.deploymentKey, ...extra };
  }

  private async jsonRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.apiBaseUrl}${path}`, { ...init, headers: this.headers(init.headers) });
    if (!response.ok) throw new Error("ai_chat_request_failed");
    return response.json() as Promise<T>;
  }

  private render() {
    const text = copy[this.language];
    this.shadow.replaceChildren();
    const style = document.createElement("style"); style.textContent = styles; this.shadow.append(style);
    const shell = element("div", "shell");
    if (this.opened) {
      const panel = element("section", "panel"); panel.setAttribute("aria-label", this.config?.agentName ?? "DJAY Bot");
      const header = element("header", "header"); header.append(element("strong", "title", this.config?.agentName ?? "DJAY Bot"));
      const close = button("×", text.close, "icon"); close.addEventListener("click", () => { this.opened = false; this.render(); }); header.append(close);
      const stream = element("div", "stream"); stream.setAttribute("aria-live", "polite");
      for (const message of this.messages) stream.append(element("div", `message ${message.role}`, message.text));
      if (this.loading) stream.append(element("div", "notice", this.sessionToken ? text.thinking : text.connecting));
      if (this.unavailable) { const retry = button(text.retry, text.retry, "small"); retry.addEventListener("click", () => void this.bootstrap()); const notice = element("div", "notice error", text.unavailable); notice.append(retry); stream.append(notice); }
      if (this.status === "handover") stream.append(element("div", "notice", text.handover));
      const composer = element("form", "composer") as HTMLFormElement;
      const input = document.createElement("input"); input.placeholder = text.placeholder; input.maxLength = 2000; input.setAttribute("aria-label", text.placeholder);
      input.disabled = this.loading || this.status === "handover" || this.status === "completed";
      const send = button(text.send, text.send, "send"); send.type = "submit"; send.disabled = input.disabled;
      composer.append(input, send); composer.addEventListener("submit", (event) => { event.preventDefault(); const value = input.value.trim(); if (value) void this.send(value); });
      panel.append(header, stream, composer);
      if (!this.config?.brandingRemoved) panel.append(element("div", "brand", text.powered));
      shell.append(panel);
    }
    const launcher = button(this.opened ? "×" : "D", this.opened ? text.close : text.open, "launcher");
    launcher.addEventListener("click", () => { this.opened = !this.opened; this.render(); if (this.opened && !this.sessionToken) void this.startSession(); });
    shell.append(launcher); this.shadow.append(shell);
    queueMicrotask(() => this.shadow.querySelector(".stream")?.scrollTo({ top: 99_999 }));
  }
}

function element(tag: string, className: string, text?: string) { const node = document.createElement(tag); node.className = className; if (text !== undefined) node.textContent = text; return node; }
function button(label: string, ariaLabel: string, className: string) { const node = document.createElement("button"); node.type = "button"; node.className = className; node.textContent = label; node.setAttribute("aria-label", ariaLabel); return node; }
function safeStorage() { try { return window.localStorage; } catch { return null; } }

const styles = `
:host{all:initial;position:fixed;right:20px;bottom:20px;z-index:2147483000;font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#19231f}.shell{display:flex;align-items:flex-end;flex-direction:column;gap:12px}.launcher{width:58px;height:58px;border:0;border-radius:50%;background:#163c32;color:#fff;font-size:22px;font-weight:800;box-shadow:0 14px 35px #10231d44;cursor:pointer}.panel{width:min(380px,calc(100vw - 32px));height:min(620px,calc(100vh - 116px));display:grid;grid-template-rows:auto 1fr auto auto;background:#fffdf8;border:1px solid #dfe8e2;border-radius:22px;overflow:hidden;box-shadow:0 24px 70px #10231d33}.header{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;background:#163c32;color:white}.title{font-size:16px}.icon{border:0;background:transparent;color:white;font-size:24px;cursor:pointer}.stream{padding:18px;overflow:auto;display:flex;flex-direction:column;gap:10px}.message{max-width:82%;padding:11px 13px;border-radius:16px;white-space:pre-wrap;line-height:1.45;font-size:14px}.assistant,.human{align-self:flex-start;background:#edf3ef}.customer{align-self:flex-end;background:#d9eee4}.human{border:1px solid #b7d8c7}.notice{padding:10px 12px;border-radius:12px;background:#f5f1e8;color:#5b625e;font-size:13px}.error{background:#fff0ed;color:#8a3428}.small{margin-left:8px;border:1px solid currentColor;border-radius:8px;background:transparent;color:inherit;padding:4px 8px;cursor:pointer}.composer{display:grid;grid-template-columns:1fr auto;gap:8px;padding:12px;border-top:1px solid #e5ebe7}.composer input{min-width:0;border:1px solid #cedbd4;border-radius:12px;padding:11px 12px;font:inherit}.send{border:0;border-radius:12px;padding:0 16px;background:#ca7b32;color:#fff;font-weight:700;cursor:pointer}.send:disabled,.composer input:disabled{opacity:.55}.brand{text-align:center;padding:0 12px 10px;color:#78817d;font-size:11px}@media(max-width:520px){:host{right:12px;bottom:12px}.panel{width:calc(100vw - 24px);height:calc(100dvh - 92px)}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
`;
