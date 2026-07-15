export type FlowbotWidgetOptions = Readonly<{
  deploymentKey: string;
  apiBaseUrl: string;
  mountTarget?: HTMLElement;
  language?: "th" | "en";
  openOnLoad?: boolean;
  storage?: Storage;
}>;

type RuntimeMessage = Readonly<{
  type: "text" | "media" | "options" | "form" | "system";
  nodeId: string;
  content: Record<string, unknown>;
}>;
type RuntimeResponse = Readonly<{
  inputId: string;
  messages: readonly RuntimeMessage[];
  status: "active" | "waiting" | "handover" | "completed";
  nextSequence: number;
}>;
type SyncResponse = Readonly<{
  status: RuntimeResponse["status"];
  lastMessageSequence: number;
  messages: readonly Readonly<{ sequence: number; message: RuntimeMessage }>[];
}>;
type PublicConfig = Readonly<{
  name: string;
  defaultLanguage: "th" | "en";
  brandingRemoved: boolean;
}>;

const copy = {
  en: { open: "Open chat", close: "Close chat", send: "Send", placeholder: "Type a message...", retry: "Retry", loading: "Connecting...", offline: "Connection unavailable.", submit: "Submit", restart: "Restart", handover: "A team member will continue this conversation.", powered: "Powered by DJAY Bot" },
  th: { open: "เปิดแชท", close: "ปิดแชท", send: "ส่ง", placeholder: "พิมพ์ข้อความ...", retry: "ลองใหม่", loading: "กำลังเชื่อมต่อ...", offline: "ไม่สามารถเชื่อมต่อได้", submit: "ส่งข้อมูล", restart: "เริ่มใหม่", handover: "ทีมงานจะเข้ามาดูแลการสนทนาต่อ", powered: "ขับเคลื่อนโดย DJAY Bot" },
} as const;

export function normalizeApiBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

export function flowbotSessionStorageKey(deploymentKey: string) {
  return `djay:flowbot:${deploymentKey.slice(0, 24)}:session`;
}

export function mountFlowbotWidget(options: FlowbotWidgetOptions): HTMLElement {
  return new FlowbotWidget(options).mount();
}

class FlowbotWidget {
  private readonly host = document.createElement("div");
  private readonly shadow = this.host.attachShadow({ mode: "open" });
  private readonly apiBaseUrl: string;
  private readonly storage: Storage | null;
  private opened: boolean;
  private loading = true;
  private offline = false;
  private config: PublicConfig | null = null;
  private sessionToken: string | null = null;
  private language: "th" | "en";
  private status: RuntimeResponse["status"] = "active";
  private messages: RuntimeMessage[] = [];
  private lastMessageSequence = 0;
  private pollTimer: number | null = null;

  constructor(private readonly options: FlowbotWidgetOptions) {
    this.apiBaseUrl = normalizeApiBaseUrl(options.apiBaseUrl);
    this.language = options.language ?? "en";
    this.opened = Boolean(options.openOnLoad);
    this.storage = options.storage ?? safeStorage();
    this.host.dataset.djayFlowbot = options.deploymentKey.slice(0, 16);
  }

  mount() {
    (this.options.mountTarget ?? document.body).append(this.host);
    this.render();
    void this.bootstrap();
    return this.host;
  }

  private async bootstrap() {
    try {
      const result = await this.request<{ status: "available"; config: PublicConfig }>("/public/flowbot/config");
      this.config = result.config;
      await this.request<{ status: "recorded" }>("/public/flowbot/install", { method: "POST", body: "{}" });
      this.language = this.options.language ?? result.config.defaultLanguage;
      this.sessionToken = this.storage?.getItem(flowbotSessionStorageKey(this.options.deploymentKey)) ?? null;
      if (this.sessionToken) await this.sync(false);
      this.offline = false;
    } catch {
      this.offline = true;
    } finally {
      this.loading = false;
      this.render();
    }
    if (this.opened && !this.sessionToken) await this.startSession();
    this.startPolling();
  }

  private async startSession() {
    try {
      this.loading = true;
      this.render();
      const result = await this.request<{ status: "started"; sessionToken: string; response: RuntimeResponse }>("/public/flowbot/session", {
        method: "POST",
        body: JSON.stringify({ language: this.language }),
      });
      this.sessionToken = result.sessionToken;
      this.storage?.setItem(flowbotSessionStorageKey(this.options.deploymentKey), result.sessionToken);
      this.messages = [];
      this.lastMessageSequence = 0;
      await this.sync(false);
      this.offline = false;
    } catch {
      this.offline = true;
    } finally {
      this.loading = false;
      this.render();
    }
  }

  private async send(input: Record<string, unknown>) {
    if (!this.sessionToken) await this.startSession();
    if (!this.sessionToken) return;
    try {
      this.loading = true;
      this.render();
      await this.request<{ status: "accepted"; response: RuntimeResponse }>("/public/flowbot/message", {
        method: "POST",
        headers: { "x-djay-flowbot-session": this.sessionToken },
        body: JSON.stringify({ inputId: crypto.randomUUID(), input }),
      });
      await this.sync(false);
      this.offline = false;
    } catch {
      this.offline = true;
    } finally {
      this.loading = false;
      this.render();
    }
  }

  private async sync(renderAfter = true) {
    if (!this.sessionToken) return;
    const result = await this.request<{ status: "synced"; response: SyncResponse }>("/public/flowbot/sync", {
      method: "POST",
      headers: { "x-djay-flowbot-session": this.sessionToken },
      body: JSON.stringify({ afterSequence: this.lastMessageSequence }),
    });
    const additions = [...result.response.messages]
      .filter((entry) => entry.sequence > this.lastMessageSequence)
      .sort((left, right) => left.sequence - right.sequence);
    this.messages.push(...additions.map((entry) => entry.message));
    this.lastMessageSequence = Math.max(this.lastMessageSequence, result.response.lastMessageSequence);
    this.status = result.response.status;
    if (renderAfter) this.render();
  }

  private startPolling() {
    if (this.pollTimer !== null) return;
    this.pollTimer = window.setInterval(() => {
      if (!this.host.isConnected) {
        if (this.pollTimer !== null) window.clearInterval(this.pollTimer);
        this.pollTimer = null;
        return;
      }
      if (this.opened && this.sessionToken && !this.loading) {
        void this.sync().then(() => { this.offline = false; }).catch(() => { this.offline = true; this.render(); });
      }
    }, 5_000);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-djay-flowbot-key": this.options.deploymentKey,
        ...init.headers,
      },
    });
    if (!response.ok) throw new Error("flowbot_request_failed");
    return response.json() as Promise<T>;
  }

  private render() {
    const text = copy[this.language];
    this.shadow.replaceChildren();
    const style = document.createElement("style");
    style.textContent = styles;
    this.shadow.append(style);
    const shell = element("div", "shell");
    if (this.opened) {
      const panel = element("section", "panel");
      panel.setAttribute("aria-label", this.config?.name ?? "DJAY Bot");
      const header = element("header", "header");
      const title = element("strong", "title", this.config?.name ?? "DJAY Bot");
      const close = button("×", text.close, "icon");
      close.addEventListener("click", () => { this.opened = false; this.render(); });
      header.append(title, close);
      const stream = element("div", "stream");
      stream.setAttribute("aria-live", "polite");
      for (const message of this.messages) stream.append(this.renderMessage(message));
      if (this.loading) stream.append(element("div", "notice", text.loading));
      if (this.offline) {
        const notice = element("div", "notice error", text.offline);
        const retry = button(text.retry, text.retry, "small");
        retry.addEventListener("click", () => void (this.sessionToken ? this.send({ type: "action", payload: { action: "restart" } }) : this.bootstrap()));
        notice.append(retry); stream.append(notice);
      }
      if (this.status === "handover") stream.append(element("div", "notice", text.handover));
      const composer = element("form", "composer") as HTMLFormElement;
      const input = document.createElement("input");
      input.name = "message"; input.placeholder = text.placeholder; input.maxLength = 4000;
      input.setAttribute("aria-label", text.placeholder);
      input.disabled = this.loading || this.status === "waiting" || this.status === "handover" || this.status === "completed";
      const send = button(text.send, text.send, "send"); send.type = "submit"; send.disabled = input.disabled;
      composer.append(input, send);
      composer.addEventListener("submit", (event) => {
        event.preventDefault(); const value = input.value.trim();
        if (value) void this.send({ type: "text", payload: { text: value } });
      });
      panel.append(header, stream, composer);
      if (!this.config?.brandingRemoved) panel.append(element("div", "brand", text.powered));
      shell.append(panel);
    }
    const launcher = button(this.opened ? "×" : "D", this.opened ? text.close : text.open, "launcher");
    launcher.addEventListener("click", () => {
      this.opened = !this.opened; this.render();
      if (this.opened && !this.sessionToken) void this.startSession();
    });
    shell.append(launcher);
    this.shadow.append(shell);
    queueMicrotask(() => this.shadow.querySelector(".stream")?.scrollTo({ top: 99_999 }));
  }

  private renderMessage(message: RuntimeMessage) {
    const wrap = element("div", `message ${message.type}`);
    if (message.type === "text" || message.type === "system") {
      wrap.append(element("p", "", String(message.content.text ?? "")));
    } else if (message.type === "options") {
      wrap.append(element("p", "", String(message.content.text ?? "")));
      const options = Array.isArray(message.content.options) ? message.content.options : [];
      for (const item of options) {
        if (!item || typeof item !== "object") continue;
        const value = item as { id?: unknown; label?: unknown };
        if (typeof value.id !== "string") continue;
        const option = button(String(value.label ?? "Option"), String(value.label ?? "Option"), "choice");
        option.addEventListener("click", () => void this.send({ type: "option", payload: { optionId: value.id } }));
        wrap.append(option);
      }
    } else if (message.type === "form") {
      wrap.append(element("p", "", String(message.content.text ?? "")));
      const form = element("form", "flow-form") as HTMLFormElement;
      const fields = Array.isArray(message.content.fields) ? message.content.fields : [];
      for (const item of fields) {
        if (!item || typeof item !== "object") continue;
        const field = item as { key?: unknown; label?: unknown; type?: unknown; required?: unknown };
        if (typeof field.key !== "string") continue;
        const label = element("label", "", String(field.label ?? field.key));
        const input = field.type === "textarea" ? document.createElement("textarea") : document.createElement("input");
        input.setAttribute("name", field.key); input.setAttribute("aria-label", String(field.label ?? field.key));
        if (input instanceof HTMLInputElement) input.type = field.type === "email" || field.type === "phone" ? String(field.type).replace("phone", "tel") : "text";
        if (field.required === true) input.setAttribute("required", "");
        label.append(input); form.append(label);
      }
      const submit = button(copy[this.language].submit, copy[this.language].submit, "submit"); submit.type = "submit"; form.append(submit);
      form.addEventListener("submit", (event) => {
        event.preventDefault(); const data = Object.fromEntries(new FormData(form).entries());
        void this.send({ type: "form", payload: { nodeId: message.nodeId, data } });
      });
      wrap.append(form);
    } else if (message.type === "media") {
      wrap.append(element("p", "", String(message.content.label ?? "Media")));
    }
    return wrap;
  }
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string) {
  const result = document.createElement(tag); result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}

function button(label: string, accessibleName: string, className: string) {
  const result = element("button", className, label); result.type = "button"; result.setAttribute("aria-label", accessibleName); return result;
}

function safeStorage() {
  try { return window.localStorage; } catch { return null; }
}

const styles = `
  :host { all: initial; color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
  * { box-sizing: border-box; letter-spacing: 0; }
  button, input, textarea { font: inherit; }
  .shell { position: fixed; z-index: 2147483000; right: max(16px, env(safe-area-inset-right)); bottom: max(16px, env(safe-area-inset-bottom)); display: grid; justify-items: end; gap: 10px; }
  .launcher { width: 52px; height: 52px; border: 0; border-radius: 50%; background: #126149; color: #fff; font-size: 20px; font-weight: 900; box-shadow: 0 7px 24px #1a2c2738; cursor: pointer; }
  .panel { width: min(380px, calc(100vw - 24px)); height: min(610px, calc(100vh - 92px)); min-height: 360px; display: grid; grid-template-rows: auto minmax(0, 1fr) auto auto; overflow: hidden; border: 1px solid #cfd8d4; border-radius: 8px; background: #fff; color: #1b211f; box-shadow: 0 18px 50px #1a2c2740; }
  .header { min-height: 58px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border-bottom: 1px solid #dfe5e2; background: #163f35; color: #fff; }
  .title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; }
  .icon { width: 36px; height: 36px; border: 0; background: transparent; color: inherit; font-size: 24px; cursor: pointer; }
  .stream { min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; padding: 14px; background: #f7f9f8; }
  .message { max-width: 92%; align-self: flex-start; display: grid; gap: 8px; padding: 10px 12px; border: 1px solid #d7dfdc; border-radius: 7px; background: #fff; }
  .message p { margin: 0; overflow-wrap: anywhere; color: #202724; font-size: 14px; line-height: 1.45; white-space: pre-wrap; }
  .choice, .submit, .small { width: 100%; min-height: 38px; padding: 7px 10px; border: 1px solid #8fb8aa; border-radius: 5px; background: #eef7f3; color: #104b3a; font-weight: 700; cursor: pointer; }
  .notice { display: grid; gap: 8px; padding: 10px; border-left: 3px solid #568f7c; background: #e9f4f0; color: #34554a; font-size: 13px; }
  .notice.error { border-color: #b34a42; background: #fff1f0; color: #7b302b; }
  .flow-form { display: grid; gap: 10px; }
  .flow-form label { display: grid; gap: 5px; color: #49534f; font-size: 12px; font-weight: 700; }
  .flow-form input, .flow-form textarea { width: 100%; min-height: 40px; padding: 8px 9px; border: 1px solid #aebbb6; border-radius: 5px; background: #fff; color: #1b211f; }
  .composer { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; padding: 10px; border-top: 1px solid #dfe5e2; background: #fff; }
  .composer input { min-width: 0; height: 42px; padding: 0 10px; border: 1px solid #aebbb6; border-radius: 5px; color: #1b211f; }
  .send { min-width: 64px; height: 42px; padding: 0 12px; border: 0; border-radius: 5px; background: #126149; color: #fff; font-weight: 800; cursor: pointer; }
  button:disabled, input:disabled { cursor: not-allowed; opacity: .6; }
  .brand { min-height: 27px; display: grid; place-items: center; border-top: 1px solid #edf0ef; color: #6b7571; font-size: 10px; }
  @media (max-width: 480px) { .shell { right: 8px; bottom: 8px; } .panel { width: calc(100vw - 16px); height: calc(100vh - 76px); } }
`;
