import { djayWidgetBaseStyles, normalizeWidgetApiOrigin, widgetFetch } from "@djay/shared/widget-ui";

export type FlowbotWidgetOptions = Readonly<{
  deploymentKey: string;
  apiBaseUrl: string;
  mountTarget?: HTMLElement;
  language?: "th" | "en";
  openOnLoad?: boolean;
  storage?: Storage;
}>;

type RuntimeMessage = Readonly<{
  type: "text" | "media" | "card" | "carousel" | "actions" | "options" | "form" | "system";
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
  en: { open: "Open chat", close: "Close chat", product: "FlowBot assistant", send: "Send", placeholder: "Type a message…", retry: "Reconnect", loading: "Connecting…", offline: "Connection unavailable. Your conversation is still saved.", submit: "Submit", restart: "Start a new conversation", waiting: "This conversation is waiting for its next step.", completed: "This conversation is complete.", handover: "A team member will continue this conversation.", powered: "Powered by DJAY Bot" },
  th: { open: "เปิดแชท", close: "ปิดแชท", product: "ผู้ช่วย FlowBot", send: "ส่ง", placeholder: "พิมพ์ข้อความ…", retry: "เชื่อมต่อใหม่", loading: "กำลังเชื่อมต่อ…", offline: "ไม่สามารถเชื่อมต่อได้ การสนทนาของคุณยังถูกบันทึกไว้", submit: "ส่งข้อมูล", restart: "เริ่มการสนทนาใหม่", waiting: "การสนทนานี้กำลังรอขั้นตอนถัดไป", completed: "การสนทนานี้เสร็จสิ้นแล้ว", handover: "ทีมงานจะเข้ามาดูแลการสนทนาต่อ", powered: "ขับเคลื่อนโดย DJAY Bot" },
} as const;

export function normalizeApiBaseUrl(value: string) {
  return normalizeWidgetApiOrigin(value);
}

export function flowbotSessionStorageKey(deploymentKey: string) {
  return `djay:flowbot:${deploymentKey.slice(0, 24)}:session`;
}

export function flowbotLanguageStorageKey(deploymentKey: string) {
  return `djay:flowbot:${deploymentKey.slice(0, 24)}:language`;
}

export function mountFlowbotWidget(options: FlowbotWidgetOptions): HTMLElement {
  return new FlowbotWidget(options).mount();
}

let flowbotWidgetSequence = 0;

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
  private languageSelected = false;
  private status: RuntimeResponse["status"] = "active";
  private messages: RuntimeMessage[] = [];
  private lastMessageSequence = 0;
  private pollTimer: number | null = null;
  private syncing = false;
  private announcement = "";
  private readonly panelId = `djay-flowbot-panel-${++flowbotWidgetSequence}`;

  constructor(private readonly options: FlowbotWidgetOptions) {
    this.apiBaseUrl = normalizeApiBaseUrl(options.apiBaseUrl);
    // Thai is used only for pre-connect accessibility copy. A new customer explicitly chooses
    // the conversation language before a session is created.
    this.language = options.language ?? "th";
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
    this.announcement = copy[this.language].loading;
    this.loading = true;
    this.render();
    try {
      await this.request<{ status: "recorded" }>("/public/flowbot/install", { method: "POST", body: "{}" });
      const result = await this.request<{ status: "available"; config: PublicConfig }>("/public/flowbot/config");
      this.config = result.config;
      this.sessionToken = this.storage?.getItem(flowbotSessionStorageKey(this.options.deploymentKey)) ?? null;
      const storedLanguage = this.storage?.getItem(flowbotLanguageStorageKey(this.options.deploymentKey));
      if (this.sessionToken) {
        this.language = storedLanguage === "en" || storedLanguage === "th"
          ? storedLanguage
          : this.options.language ?? result.config.defaultLanguage;
        this.languageSelected = true;
      }
      if (this.sessionToken) await this.sync(false);
      this.offline = false;
    } catch {
      this.offline = true;
      this.announcement = copy[this.language].offline;
    } finally {
      this.loading = false;
      this.render();
      if (this.opened) this.focusComposer();
    }
    if (this.opened && !this.sessionToken && this.languageSelected) await this.startSession();
    this.startPolling();
  }

  private chooseLanguage(language: "th" | "en") {
    if (this.sessionToken || this.loading) return;
    this.language = language;
    this.languageSelected = true;
    this.storage?.setItem(flowbotLanguageStorageKey(this.options.deploymentKey), language);
    void this.startSession();
  }

  private async startSession() {
    try {
      this.announcement = copy[this.language].loading;
      this.loading = true;
      this.render();
      const result = await this.request<{ status: "started"; sessionToken: string; response: RuntimeResponse }>("/public/flowbot/session", {
        method: "POST",
        body: JSON.stringify({ language: this.language }),
      });
      this.sessionToken = result.sessionToken;
      this.storage?.setItem(flowbotSessionStorageKey(this.options.deploymentKey), result.sessionToken);
      this.storage?.setItem(flowbotLanguageStorageKey(this.options.deploymentKey), this.language);
      this.messages = [];
      this.lastMessageSequence = 0;
      await this.sync(false);
      this.offline = false;
    } catch {
      this.offline = true;
      this.announcement = copy[this.language].offline;
    } finally {
      this.loading = false;
      this.render();
      if (this.opened) this.focusComposer();
    }
  }

  private async send(input: Record<string, unknown>) {
    if (!this.sessionToken) await this.startSession();
    if (!this.sessionToken) return;
    try {
      this.announcement = copy[this.language].loading;
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
      this.announcement = copy[this.language].offline;
    } finally {
      this.loading = false;
      this.render();
      if (this.opened) this.focusComposer();
    }
  }

  private async sync(renderAfter = true) {
    if (!this.sessionToken || this.syncing) return;
    this.syncing = true;
    try {
      const result = await this.request<{ status: "synced"; response: SyncResponse }>("/public/flowbot/sync", {
        method: "POST",
        headers: { "x-djay-flowbot-session": this.sessionToken },
        body: JSON.stringify({ afterSequence: this.lastMessageSequence }),
      });
      const previousStatus = this.status;
      const additions = [...result.response.messages]
        .filter((entry) => entry.sequence > this.lastMessageSequence)
        .sort((left, right) => left.sequence - right.sequence);
      this.messages.push(...additions.map((entry) => entry.message));
      this.lastMessageSequence = Math.max(this.lastMessageSequence, result.response.lastMessageSequence);
      this.status = result.response.status;
      const wasOffline = this.offline;
      this.offline = false;
      const latest = additions.at(-1)?.message;
      if (latest) this.announcement = String(latest.content.text ?? latest.content.label ?? "");
      else if (previousStatus !== this.status) {
        this.announcement = this.status === "waiting" ? copy[this.language].waiting
          : this.status === "handover" ? copy[this.language].handover
            : this.status === "completed" ? copy[this.language].completed : "";
      }
      if (renderAfter && (additions.length > 0 || previousStatus !== this.status || wasOffline)) this.render();
    } finally {
      this.syncing = false;
    }
  }

  private startPolling() {
    if (this.pollTimer !== null) return;
    this.pollTimer = window.setInterval(() => {
      if (!this.host.isConnected) {
        if (this.pollTimer !== null) window.clearInterval(this.pollTimer);
        this.pollTimer = null;
        return;
      }
      if (document.visibilityState !== "hidden" && this.opened && this.sessionToken && !this.loading && !this.hasEditableFocus()) {
        void this.sync().then(() => { this.offline = false; }).catch(() => { this.offline = true; this.announcement = copy[this.language].offline; this.render(); });
      }
    }, 5_000);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await widgetFetch(`${this.apiBaseUrl}${path}`, {
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

  private hasEditableFocus() {
    return this.shadow.activeElement instanceof HTMLInputElement || this.shadow.activeElement instanceof HTMLTextAreaElement;
  }

  private focusComposer() {
    queueMicrotask(() => {
      const input = this.shadow.querySelector<HTMLInputElement>(".composer input:not(:disabled)");
      input?.focus();
    });
  }

  private setOpened(opened: boolean) {
    this.opened = opened;
    this.render();
    if (opened) this.focusComposer();
    else queueMicrotask(() => this.shadow.querySelector<HTMLButtonElement>(".launcher")?.focus());
  }

  private render() {
    const text = copy[this.language];
    const previousInput = this.shadow.querySelector<HTMLInputElement>(".composer input");
    const draft = previousInput?.value ?? "";
    const restoreInputFocus = this.shadow.activeElement === previousInput;
    this.shadow.replaceChildren();
    const style = document.createElement("style");
    style.textContent = styles;
    this.shadow.append(style);
    const shell = element("div", "shell");
    if (this.opened) {
      const panel = element("section", "panel");
      panel.id = this.panelId;
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-modal", "false");
      panel.setAttribute("aria-label", this.config?.name ?? "DJAY Bot");
      panel.addEventListener("keydown", (event) => { if (event.key === "Escape") this.setOpened(false); });
      const header = element("header", "header");
      const identity = element("div", "identity");
      const identityCopy = element("div", "identity-copy");
      identityCopy.append(element("strong", "title", this.config?.name ?? "DJAY Bot"), element("span", "product-label", text.product));
      identity.append(element("span", "mark", "DJ"), identityCopy);
      const close = button("×", text.close, "icon");
      close.addEventListener("click", () => this.setOpened(false));
      header.append(identity, close);
      const stream = element("div", "stream");
      stream.setAttribute("aria-busy", String(this.loading));
      if (!this.sessionToken && !this.languageSelected && !this.loading && !this.offline) {
        const chooser = element("section", "language-choice");
        chooser.setAttribute("aria-labelledby", `${this.panelId}-language-title`);
        const title = element("strong", "language-title", "Choose language / เลือกภาษา");
        title.id = `${this.panelId}-language-title`;
        chooser.append(title, element("p", "language-help", "Your choice will be used for this conversation. / ภาษาที่เลือกจะใช้ตลอดการสนทนานี้"));
        const choices = element("div", "language-actions");
        const english = button("English", "Continue in English", "language-button");
        const thai = button("ไทย", "สนทนาต่อเป็นภาษาไทย", "language-button");
        english.addEventListener("click", () => this.chooseLanguage("en"));
        thai.addEventListener("click", () => this.chooseLanguage("th"));
        choices.append(english, thai); chooser.append(choices); stream.append(chooser);
      }
      for (const message of this.messages) stream.append(this.renderMessage(message));
      if (this.loading) stream.append(element("div", "notice", text.loading));
      if (this.offline) {
        const notice = element("div", "notice error", text.offline);
        const retry = button(text.retry, text.retry, "small");
        retry.addEventListener("click", () => void this.bootstrap());
        notice.setAttribute("role", "alert");
        notice.append(retry); stream.append(notice);
      }
      if (this.status === "waiting") stream.append(element("div", "notice", text.waiting));
      if (this.status === "handover") stream.append(element("div", "notice", text.handover));
      if (this.status === "completed") {
        const notice = element("div", "notice", text.completed);
        const restart = button(text.restart, text.restart, "small");
        restart.addEventListener("click", () => void this.send({ type: "action", payload: { action: "restart" } }));
        notice.append(restart); stream.append(notice);
      }
      if (this.announcement && !this.offline) { const live = element("div", "sr-only", this.announcement); live.setAttribute("aria-live", "polite"); live.setAttribute("aria-atomic", "true"); stream.append(live); }
      const composer = element("form", "composer") as HTMLFormElement;
      const input = document.createElement("input");
      input.name = "message"; input.placeholder = text.placeholder; input.maxLength = 4000;
      input.value = draft;
      input.autocomplete = "off";
      input.setAttribute("aria-label", text.placeholder);
      input.disabled = !this.sessionToken || this.loading || this.status === "waiting" || this.status === "handover" || this.status === "completed";
      const send = button(text.send, text.send, "send"); send.type = "submit"; send.disabled = input.disabled;
      composer.append(input, send);
      composer.addEventListener("submit", (event) => {
        event.preventDefault(); const value = input.value.trim();
        if (value) void this.send({ type: "text", payload: { text: value } });
      });
      panel.append(header, stream);
      if (this.sessionToken || this.languageSelected) panel.append(composer);
      if (!this.config?.brandingRemoved) panel.append(element("div", "brand", text.powered));
      shell.append(panel);
    }
    const launcher = button(this.opened ? "×" : "DJ", this.opened ? text.close : text.open, "launcher");
    launcher.setAttribute("aria-expanded", String(this.opened));
    launcher.setAttribute("aria-controls", this.panelId);
    launcher.addEventListener("click", () => {
      this.setOpened(!this.opened);
    });
    shell.append(launcher);
    this.shadow.append(shell);
    queueMicrotask(() => this.shadow.querySelector(".stream")?.scrollTo({ top: 99_999 }));
    if (restoreInputFocus) queueMicrotask(() => {
      const input = this.shadow.querySelector<HTMLInputElement>(".composer input:not(:disabled)");
      input?.focus(); input?.setSelectionRange(input.value.length, input.value.length);
    });
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
      const assetRef = safeHttpsUrl(message.content.assetRef);
      const label = String(message.content.label ?? "Media");
      if (!assetRef) return element("div", "message system", label);
      if (message.content.mediaType === "video") {
        const video = document.createElement("video");
        video.src = assetRef; video.controls = true; video.preload = "metadata";
        video.setAttribute("aria-label", label); wrap.append(video);
      } else {
        const image = document.createElement("img");
        image.src = assetRef; image.alt = label; image.loading = "lazy"; image.decoding = "async"; wrap.append(image);
      }
      if (label) wrap.append(element("p", "media-label", label));
    } else if (message.type === "card") {
      wrap.append(this.renderCard(message.content));
    } else if (message.type === "carousel") {
      const rail = element("div", "carousel-rail");
      const cards = Array.isArray(message.content.cards) ? message.content.cards : [];
      for (const card of cards) if (card && typeof card === "object") rail.append(this.renderCard(card as Record<string, unknown>));
      wrap.append(rail);
    } else if (message.type === "actions") {
      if (message.content.text) wrap.append(element("p", "", String(message.content.text)));
      wrap.append(this.renderActions(message.content.actions));
    }
    return wrap;
  }

  private renderCard(content: Record<string, unknown>) {
    const card = element("article", "rich-card");
    const imageUrl = safeHttpsUrl(content.imageUrl);
    if (imageUrl) {
      const image = document.createElement("img"); image.src = imageUrl; image.alt = String(content.title ?? ""); image.loading = "lazy"; image.decoding = "async"; card.append(image);
    }
    const body = element("div", "rich-card-body");
    body.append(element("strong", "rich-card-title", String(content.title ?? "")));
    if (content.description) body.append(element("p", "", String(content.description)));
    if (content.priceLabel) body.append(element("span", "price", String(content.priceLabel)));
    body.append(this.renderActions(content.actions)); card.append(body); return card;
  }

  private renderActions(value: unknown) {
    const group = element("div", "typed-actions");
    const actions = Array.isArray(value) ? value : [];
    for (const item of actions) {
      if (!item || typeof item !== "object") continue;
      const action = item as { type?: unknown; label?: unknown; url?: unknown };
      const href = safeActionUrl(action.type, action.url);
      if (!href) continue;
      const link = element("a", `typed-action action-${String(action.type)}`, String(action.label ?? "Open"));
      link.href = href;
      if (!href.startsWith("tel:")) { link.target = "_blank"; link.rel = "noopener noreferrer"; }
      group.append(link);
    }
    return group;
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

function safeHttpsUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try { const url = new URL(value); return url.protocol === "https:" ? url.toString() : null; } catch { return null; }
}

function safeActionUrl(type: unknown, value: unknown) {
  if (typeof value !== "string") return null;
  if (type === "call") return /^tel:\+?[0-9(). -]{7,30}$/.test(value) ? value : null;
  return ["line", "website", "booking", "checkout"].includes(String(type)) ? safeHttpsUrl(value) : null;
}

const styles = `
  ${djayWidgetBaseStyles}
  .panel { height: min(640px, calc(100vh - 108px)); height: min(640px, calc(100dvh - 108px)); min-height: 360px; display: grid; grid-template-rows: auto minmax(0, 1fr) auto auto; }
  .stream { min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; padding: 14px; background: var(--djay-widget-canvas); }
  .language-choice { align-self: stretch; display: grid; gap: 10px; margin: auto 0; padding: 18px; border: 1px solid var(--djay-widget-border); border-radius: 12px; background: var(--djay-widget-surface); text-align: center; }
  .language-title { color: var(--djay-widget-ink); font-size: 17px; }
  .language-help { margin: 0; color: var(--djay-widget-muted); font-size: 13px; line-height: 1.45; }
  .language-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .language-button { min-height: 46px; border: 1px solid var(--djay-widget-green); border-radius: 6px; background: var(--djay-widget-green); color: #fff; font-weight: 800; cursor: pointer; }
  .language-button:hover, .language-button:focus-visible { background: var(--djay-widget-green-hover); }
  .message { max-width: 92%; align-self: flex-start; display: grid; gap: 8px; padding: 10px 12px; border: 1px solid var(--djay-widget-border); border-radius: 12px; background: var(--djay-widget-surface); }
  .message p { margin: 0; overflow-wrap: anywhere; color: var(--djay-widget-ink); font-size: 14px; line-height: 1.45; white-space: pre-wrap; }
  .message.media { width: min(92%, 360px); }
  .message.media img, .message.media video { display: block; width: 100%; max-height: 360px; border-radius: 6px; object-fit: contain; background: #eef2f0; }
  .media-label { color: var(--djay-widget-muted) !important; font-size: 12px !important; }
  .message.card, .message.carousel { width: min(92%, 420px); padding: 0; overflow: hidden; }
  .rich-card { min-width: 240px; display: grid; background: var(--djay-widget-surface); }
  .rich-card > img { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; background: #eef2f0; }
  .rich-card-body { display: grid; gap: 8px; padding: 12px; }
  .rich-card-title { overflow-wrap: anywhere; font-size: 15px; line-height: 1.35; }
  .price { color: var(--djay-widget-green-hover); font-size: 14px; font-weight: 800; }
  .carousel-rail { display: flex; gap: 10px; overflow-x: auto; scroll-snap-type: x mandatory; padding: 10px; }
  .carousel-rail .rich-card { flex: 0 0 min(82%, 300px); border: 1px solid var(--djay-widget-border); border-radius: 6px; overflow: hidden; scroll-snap-align: start; }
  .typed-actions { display: grid; gap: 7px; }
  .typed-actions:empty { display: none; }
  .typed-action { min-height: 44px; display: grid; place-items: center; padding: 8px 10px; border: 1px solid var(--djay-widget-green); border-radius: 6px; background: var(--djay-widget-green-soft); color: var(--djay-widget-green-hover); font-size: 13px; font-weight: 800; text-align: center; text-decoration: none; overflow-wrap: anywhere; }
  .typed-action:hover, .typed-action:focus-visible { background: #d6ebe1; }
  .choice, .submit, .small { width: 100%; min-height: 44px; padding: 8px 10px; border: 1px solid var(--djay-widget-green); border-radius: 6px; background: var(--djay-widget-green-soft); color: var(--djay-widget-green-hover); font-weight: 800; cursor: pointer; }
  .notice { display: grid; gap: 8px; padding: 10px 12px; border-left: 3px solid var(--djay-widget-green); border-radius: 0 6px 6px 0; background: var(--djay-widget-green-soft); color: var(--djay-widget-green-hover); font-size: 13px; line-height: 1.45; }
  .notice.error { border-color: var(--djay-widget-danger); background: var(--djay-widget-danger-soft); color: #812e29; }
  .flow-form { display: grid; gap: 10px; }
  .flow-form label { display: grid; gap: 5px; color: var(--djay-widget-muted); font-size: 12px; font-weight: 800; }
  .flow-form input, .flow-form textarea { width: 100%; min-height: 44px; padding: 8px 9px; border: 1px solid #aebbb6; border-radius: 6px; background: var(--djay-widget-surface); color: var(--djay-widget-ink); }
  .composer { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; padding: 10px; border-top: 1px solid var(--djay-widget-border); background: var(--djay-widget-surface); }
  .composer input { min-width: 0; height: 46px; padding: 0 11px; border: 1px solid #aebbb6; border-radius: 6px; color: var(--djay-widget-ink); }
  .send { min-width: 68px; height: 46px; padding: 0 14px; border: 0; border-radius: 6px; background: var(--djay-widget-green); color: #fff; font-weight: 800; cursor: pointer; }
  .send:hover { background: var(--djay-widget-green-hover); }
  @media (max-width: 520px) { .panel { height: calc(100vh - 82px - env(safe-area-inset-bottom)); height: calc(100dvh - 82px - env(safe-area-inset-bottom)); } }
`;
