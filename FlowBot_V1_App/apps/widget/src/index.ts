export type FlowBotWidgetConfig = {
  botKey: string;
  apiBaseUrl: string;
  mountTarget?: HTMLElement;
  storage?: Storage;
  initialLang?: Language;
  openOnLoad?: boolean;
};

type Language = "th" | "en";
type Status = "bot" | "awaiting_admin" | "admin_active" | "closed";

type PublicConfig = {
  botName: string;
  enabled: boolean;
  defaultLang: Language;
  langToggle: boolean;
  theme: {
    color?: string;
    themeColor?: string;
    position?: "bl" | "br";
    logoUrl?: string;
    openOnLoad?: boolean;
  };
  greeting: Record<Language, string>;
  contactChannels: ContactChannel[];
  hasPublishedFlow: boolean;
  widgetBundleVersion: string;
};

type ContactChannel = {
  type: string;
  label: string;
  value: string;
};

type ConversationState = {
  status: Status;
  currentNodeId?: string | null;
  flowVersionId: string;
  lang: Language;
};

type ApiMessage = {
  id: string;
  sequence: string;
  sender: "bot" | "visitor" | "admin" | "system";
  type: "text" | "options" | "cta" | "form" | "image" | "audio" | "system";
  content: Record<string, unknown>;
  nodeId?: string;
  createdAt: string;
};

type SessionResponse = {
  sessionToken: string;
  conversationId: string;
  state: ConversationState;
  messages: ApiMessage[];
  lastSequence: string;
  expiresAt: string;
};

type WidgetState = {
  config: PublicConfig | null;
  opened: boolean;
  loading: boolean;
  offline: boolean;
  error: string | null;
  lang: Language;
  sessionToken: string | null;
  conversationId: string | null;
  conversationState: ConversationState | null;
  messages: ApiMessage[];
  lastSequence: string;
  inputValue: string;
};

type PersistedSession = {
  sessionToken: string;
  conversationId: string;
  lastSequence: string;
  lang: Language;
  expiresAt: string;
};

const COPY = {
  th: {
    open: "เปิดแชท",
    close: "ปิด",
    placeholder: "พิมพ์ข้อความ…",
    send: "ส่ง",
    retry: "ลองใหม่",
    loading: "กำลังเชื่อมต่อ...",
    offline: "เชื่อมต่อไม่ได้ กรุณาลองใหม่อีกครั้ง",
    awaiting: "กำลังรอทีมงานตอบกลับ",
    adminActive: "กำลังสนทนากับทีมงาน",
    botHandling: "บอตกำลังดูแลการสนทนา",
    returnToBot: "กลับไปยังเมนูบอต",
    restart: "เริ่มใหม่",
    leaveDetails: "ฝากข้อมูล",
    name: "ชื่อ",
    phone: "เบอร์โทรศัพท์",
    email: "อีเมล",
    submit: "ส่งข้อมูล",
    disabled: "ขณะนี้แชทยังไม่เปิดใช้งาน กรุณาติดต่อทีมงานตามช่องทางด้านล่าง",
    noFlow: "ยังไม่มี Flow ที่เผยแพร่ กรุณาติดต่อทีมงานตามช่องทางด้านล่าง"
  },
  en: {
    open: "Open chat",
    close: "Close",
    placeholder: "Type a message...",
    send: "Send",
    retry: "Retry",
    loading: "Connecting...",
    offline: "Connection failed. Try again.",
    awaiting: "Waiting for an admin reply",
    adminActive: "Chatting with admin",
    botHandling: "Bot is handling this chat",
    returnToBot: "Return to bot menu",
    restart: "Restart",
    leaveDetails: "Leave details",
    name: "Name",
    phone: "Phone",
    email: "Email",
    submit: "Submit",
    disabled: "Chat is not available right now. Please contact the team below.",
    noFlow: "No published flow is available yet. Please contact the team below."
  }
} as const;

export function mountFlowBotWidget(config: FlowBotWidgetConfig): HTMLElement {
  const widget = new FlowBotWidget(config);
  return widget.mount();
}

export function storageKey(botKey: string): string {
  return `flowbot:${botKey}:session`;
}

export function configStorageKey(botKey: string): string {
  return `flowbot:${botKey}:config`;
}

export function normalizeApiBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export function resolveThemeAccent(config: PublicConfig | null): string {
  return config?.theme.color ?? config?.theme.themeColor ?? "#0E7C6B";
}

class FlowBotWidget {
  private readonly apiBaseUrl: string;
  private readonly host: HTMLElement;
  private readonly shadow: ShadowRoot;
  private readonly storage: Storage | null;
  private readonly state: WidgetState;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private eventSource: EventSource | null = null;

  constructor(private readonly options: FlowBotWidgetConfig) {
    this.apiBaseUrl = normalizeApiBaseUrl(options.apiBaseUrl);
    this.storage = options.storage ?? safeStorage();
    this.host = document.createElement("div");
    this.host.setAttribute("data-flowbot-widget", options.botKey);
    this.shadow = this.host.attachShadow({ mode: "open" });
    this.state = {
      config: null,
      opened: Boolean(options.openOnLoad),
      loading: true,
      offline: false,
      error: null,
      lang: options.initialLang ?? "th",
      sessionToken: null,
      conversationId: null,
      conversationState: null,
      messages: [],
      lastSequence: "0",
      inputValue: ""
    };
  }

  mount(): HTMLElement {
    const target = this.options.mountTarget ?? document.body;
    target.append(this.host);
    this.render();
    void this.bootstrap();
    return this.host;
  }

  private async bootstrap(): Promise<void> {
    const cachedConfig = this.readCachedConfig();
    if (cachedConfig) {
      this.state.config = cachedConfig;
      this.state.lang = this.options.initialLang ?? cachedConfig.defaultLang;
      this.state.opened = this.state.opened || Boolean(cachedConfig.theme.openOnLoad);
      this.render();
    }

    try {
      const publicConfig = await this.request<PublicConfig>(`/api/w/${this.options.botKey}/config`);
      this.state.config = publicConfig;
      this.state.lang = this.options.initialLang ?? this.readPersistedSession()?.lang ?? publicConfig.defaultLang;
      this.state.opened = this.state.opened || Boolean(publicConfig.theme.openOnLoad);
      this.cacheConfig(publicConfig);
    } catch {
      this.state.offline = true;
      this.state.error = this.state.config ? null : COPY[this.state.lang].offline;
    } finally {
      this.state.loading = false;
      this.render();
    }

    if (this.state.opened) await this.ensureSession();
    this.startSync();
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  private onVisibilityChange = (): void => {
    if (document.visibilityState === "visible") void this.sync();
  };

  private startSync(): void {
    if (this.syncTimer) return;
    this.syncTimer = setInterval(() => {
      if (document.visibilityState !== "hidden") void this.sync();
    }, 30000);
  }

  private async ensureSession(): Promise<void> {
    if (this.state.sessionToken) return;
    if (this.state.config && (!this.state.config.enabled || !this.state.config.hasPublishedFlow)) return;

    const persisted = this.readPersistedSession();
    try {
      this.state.loading = true;
      this.render();
      const response = await this.request<SessionResponse>(`/api/w/${this.options.botKey}/session`, {
        method: "POST",
        body: JSON.stringify({
          sessionToken: persisted?.sessionToken,
          lang: this.state.lang,
          afterSequence: persisted?.lastSequence
        })
      });
      this.applySession(response);
      this.state.offline = false;
      this.state.error = null;
      if (response.state.status !== "bot") void this.openStream();
    } catch {
      this.state.offline = true;
      this.state.error = COPY[this.state.lang].offline;
    } finally {
      this.state.loading = false;
      this.render();
    }
  }

  private async sendText(): Promise<void> {
    const text = this.state.inputValue.trim();
    if (!text) return;
    this.state.inputValue = "";
    this.render();
    await this.sendInput({ type: "text", payload: { text } });
  }

  private async sendOption(optionId: string): Promise<void> {
    await this.sendInput({ type: "option", payload: { optionId } });
  }

  private async sendAction(action: "restart" | "return_to_bot"): Promise<void> {
    if (this.state.conversationState?.status === "admin_active") return;
    await this.sendInput({ type: "action", payload: { action } });
  }

  private async submitForm(nodeId: string, form: HTMLFormElement): Promise<void> {
    const formData = new FormData(form);
    const data: Record<string, string> = {};
    for (const [key, value] of formData.entries()) data[key] = String(value);
    await this.sendInput({ type: "form", payload: { nodeId, data } });
  }

  private async sendInput(input: Record<string, unknown>): Promise<void> {
    await this.ensureSession();
    if (!this.state.sessionToken) return;
    try {
      this.state.loading = true;
      this.render();
      const response = await this.request<{
        messages: ApiMessage[];
        state: ConversationState;
        lastSequence: string;
      }>(`/api/w/${this.options.botKey}/message`, {
        method: "POST",
        body: JSON.stringify({
          sessionToken: this.state.sessionToken,
          inputId: crypto.randomUUID(),
          lang: this.state.lang,
          input
        })
      });
      this.mergeMessages(response.messages);
      this.state.conversationState = response.state;
      this.state.lastSequence = response.lastSequence;
      this.persistSession();
      this.state.offline = false;
      this.state.error = null;
      if (response.state.status !== "bot") void this.openStream();
    } catch {
      this.state.offline = true;
      this.state.error = COPY[this.state.lang].offline;
    } finally {
      this.state.loading = false;
      this.render();
    }
  }

  private async sync(): Promise<void> {
    if (!this.state.sessionToken || !this.state.opened) return;
    try {
      const response = await this.request<{
        messages: ApiMessage[];
        state: ConversationState;
        lastSequence: string;
      }>(`/api/w/${this.options.botKey}/sync`, {
        method: "POST",
        body: JSON.stringify({
          sessionToken: this.state.sessionToken,
          afterSequence: this.state.lastSequence
        })
      });
      this.mergeMessages(response.messages);
      this.state.conversationState = response.state;
      this.state.lastSequence = response.lastSequence;
      this.persistSession();
      this.state.offline = false;
      this.state.error = null;
      if (response.state.status === "bot") this.closeStream();
      else void this.openStream();
      this.render();
    } catch {
      this.state.offline = true;
      this.state.error = COPY[this.state.lang].offline;
      this.render();
    }
  }

  private async openStream(): Promise<void> {
    if (!this.state.sessionToken || this.eventSource) return;
    if (this.state.conversationState?.status === "bot") return;

    try {
      const response = await this.request<{ streamToken: string }>(`/api/w/${this.options.botKey}/stream-token`, {
        method: "POST",
        body: JSON.stringify({ sessionToken: this.state.sessionToken })
      });
      const streamUrl = `${this.apiBaseUrl}/api/w/${encodeURIComponent(this.options.botKey)}/stream?token=${encodeURIComponent(response.streamToken)}`;
      const source = new EventSource(streamUrl);
      this.eventSource = source;
      source.addEventListener("message", (event) => {
        this.mergeMessages([JSON.parse((event as MessageEvent).data) as ApiMessage]);
        this.persistSession();
        this.render();
      });
      source.addEventListener("state", (event) => {
        this.state.conversationState = JSON.parse((event as MessageEvent).data) as ConversationState;
        if (this.state.conversationState.status === "bot") this.closeStream();
        this.persistSession();
        this.render();
      });
      source.onerror = () => {
        this.closeStream();
        void this.sync();
      };
    } catch {
      this.closeStream();
    }
  }

  private closeStream(): void {
    this.eventSource?.close();
    this.eventSource = null;
  }

  private applySession(response: SessionResponse): void {
    this.state.sessionToken = response.sessionToken;
    this.state.conversationId = response.conversationId;
    this.state.conversationState = response.state;
    this.state.lang = response.state.lang;
    this.mergeMessages(response.messages);
    this.state.lastSequence = response.lastSequence;
    this.persistSession(response.expiresAt);
  }

  private mergeMessages(messages: ApiMessage[]): void {
    const byId = new Map(this.state.messages.map((message) => [message.id, message]));
    for (const message of messages) byId.set(message.id, message);
    this.state.messages = [...byId.values()].sort((a, b) => Number(a.sequence) - Number(b.sequence));
    const last = this.state.messages.at(-1);
    if (last) this.state.lastSequence = last.sequence;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init?.headers ?? {})
      }
    });
    if (!response.ok) throw new Error(`FlowBot API request failed: ${response.status}`);
    return (await response.json()) as T;
  }

  private render(): void {
    const config = this.state.config;
    const position = config?.theme.position === "bl" ? "left" : "right";
    const accent = resolveThemeAccent(config);
    const copy = COPY[this.state.lang];

    this.shadow.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = css(position, accent);
    this.shadow.append(style);

    const root = document.createElement("div");
    root.className = "flowbot";
    const launcher = document.createElement("button");
    launcher.className = "launcher";
    launcher.type = "button";
    launcher.setAttribute("aria-label", copy.open);
    launcher.textContent = this.state.opened ? "×" : "FlowBot";
    launcher.addEventListener("click", () => {
      this.state.opened = !this.state.opened;
      this.render();
      if (this.state.opened) void this.ensureSession();
    });
    root.append(launcher);

    if (this.state.opened) root.append(this.renderPanel(copy));
    this.shadow.append(root);
  }

  private renderPanel(copy: typeof COPY[Language]): HTMLElement {
    const panel = document.createElement("section");
    panel.className = "panel";
    panel.setAttribute("aria-label", this.state.config?.botName ?? "FlowBot");

    const header = document.createElement("header");
    header.className = "header";
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = this.state.config?.botName ?? "FlowBot";
    header.append(title);

    if (this.state.config?.langToggle) {
      const toggle = document.createElement("button");
      toggle.className = "lang";
      toggle.type = "button";
      toggle.textContent = this.state.lang === "th" ? "EN" : "TH";
      toggle.setAttribute("aria-label", this.state.lang === "th" ? "เปลี่ยนเป็นภาษาอังกฤษ" : "Switch to Thai");
      toggle.addEventListener("click", () => {
        this.state.lang = this.state.lang === "th" ? "en" : "th";
        this.persistSession();
        this.render();
      });
      header.append(toggle);
    }

    const close = document.createElement("button");
    close.className = "icon";
    close.type = "button";
    close.setAttribute("aria-label", copy.close);
    close.textContent = "×";
    close.addEventListener("click", () => {
      this.state.opened = false;
      this.render();
    });
    header.append(close);
    panel.append(header);

    if (this.state.error || this.state.offline) panel.append(this.renderBanner(this.state.error ?? copy.offline, "error"));
    if (this.state.loading) panel.append(this.renderBanner(copy.loading, "loading"));
    const stateBanner = this.renderStateBanner(copy);
    if (stateBanner) panel.append(stateBanner);

    const body = document.createElement("div");
    body.className = "messages";
    if (this.state.config && !this.state.config.enabled) {
      body.append(this.renderContactOnly(copy.disabled));
    } else if (this.state.config && !this.state.config.hasPublishedFlow) {
      body.append(this.renderContactOnly(copy.noFlow));
    } else if (this.state.messages.length === 0 && this.state.config) {
      body.append(this.renderBotText(this.state.config.greeting[this.state.lang]));
    } else {
      for (const message of this.state.messages) body.append(this.renderMessage(message, copy));
    }
    panel.append(body);

    if (!this.state.config || (this.state.config.enabled && this.state.config.hasPublishedFlow)) {
      panel.append(this.renderComposer(copy));
    }
    return panel;
  }

  private renderStateBanner(copy: typeof COPY[Language]): HTMLElement | null {
    const status = this.state.conversationState?.status;
    if (!status || status === "bot") return null;
    if (status === "awaiting_admin") return this.renderBanner(copy.awaiting, "warn");
    if (status === "admin_active") return this.renderBanner(copy.adminActive, "active");
    return null;
  }

  private renderBanner(text: string, kind: string): HTMLElement {
    const banner = document.createElement("div");
    banner.className = `banner ${kind}`;
    banner.textContent = text;
    if (kind === "error") {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = COPY[this.state.lang].retry;
      retry.addEventListener("click", () => {
        if (this.state.sessionToken) void this.sync();
        else void this.bootstrap();
      });
      banner.append(retry);
    }
    return banner;
  }

  private renderContactOnly(text: string): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "empty";
    wrap.textContent = text;
    wrap.append(this.renderChannels(this.state.config?.contactChannels ?? []));
    return wrap;
  }

  private renderMessage(message: ApiMessage, copy: typeof COPY[Language]): HTMLElement {
    if (message.type === "options") return this.renderOptionsMessage(message);
    if (message.type === "form") return this.renderFormMessage(message, copy);
    if (message.type === "cta") return this.renderCtaMessage(message);

    const bubble = document.createElement("div");
    bubble.className = `bubble ${message.sender}`;
    bubble.textContent = String(message.content.text ?? message.content.action ?? "");
    return bubble;
  }

  private renderBotText(text: string): HTMLElement {
    const bubble = document.createElement("div");
    bubble.className = "bubble bot";
    bubble.textContent = text;
    return bubble;
  }

  private renderOptionsMessage(message: ApiMessage): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "bubble bot options-bubble";
    const text = document.createElement("p");
    text.textContent = String(message.content.text ?? "");
    wrap.append(text);
    const options = document.createElement("div");
    options.className = "options";
    const disabled = this.state.conversationState?.status !== "bot" || this.hasNewerVisitorInput(message.sequence);
    for (const option of ((message.content.options as Record<string, unknown>[] | undefined) ?? [])) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = String(option.label ?? "");
      button.disabled = disabled;
      button.addEventListener("click", () => void this.sendOption(String(option.id)));
      options.append(button);
    }
    wrap.append(options);
    return wrap;
  }

  private renderFormMessage(message: ApiMessage, copy: typeof COPY[Language]): HTMLElement {
    const form = document.createElement("form");
    form.className = "bubble bot form-card";
    const disabled = this.state.conversationState?.status !== "bot" || this.hasNewerVisitorInput(message.sequence);
    const text = document.createElement("p");
    text.textContent = String(message.content.text ?? copy.leaveDetails);
    form.append(text);
    const nodeId = String(message.content.nodeId ?? message.nodeId ?? "");
    const fields = (message.content.fields as { name: string; label?: string; required?: boolean }[] | undefined) ?? [
      { name: "name", label: copy.name, required: true },
      { name: "phone", label: copy.phone, required: true },
      { name: "email", label: copy.email, required: false }
    ];
    for (const field of fields) {
      const label = document.createElement("label");
      label.textContent = field.label ?? field.name;
      const input = document.createElement("input");
      input.name = field.name;
      input.required = Boolean(field.required);
      input.type = field.name === "email" ? "email" : "text";
      input.disabled = disabled;
      label.append(input);
      form.append(label);
    }
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = copy.submit;
    submit.disabled = disabled;
    form.append(submit);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.submitForm(nodeId, form);
    });
    return form;
  }

  private renderCtaMessage(message: ApiMessage): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "bubble bot cta";
    const text = document.createElement("p");
    text.textContent = String(message.content.text ?? "");
    wrap.append(text);
    if (Array.isArray(message.content.channels)) {
      wrap.append(this.renderChannels(message.content.channels as ContactChannel[]));
    }
    if (typeof message.content.url === "string" && message.content.url) {
      const link = document.createElement("a");
      link.className = "cta-link";
      link.href = message.content.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = String(message.content.label ?? message.content.url);
      wrap.append(link);
    }
    return wrap;
  }

  private renderChannels(channels: ContactChannel[]): HTMLElement {
    const list = document.createElement("div");
    list.className = "channels";
    for (const channel of channels) {
      const item = document.createElement("a");
      item.textContent = `${channel.label}: ${channel.value}`;
      item.href = channelHref(channel);
      item.target = "_blank";
      item.rel = "noopener noreferrer";
      list.append(item);
    }
    return list;
  }

  private renderComposer(copy: typeof COPY[Language]): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "composer";
    const actions = document.createElement("div");
    actions.className = "quick-actions";
    if (this.state.conversationState?.status !== "admin_active") {
      const restart = document.createElement("button");
      restart.type = "button";
      restart.textContent = this.state.conversationState?.status === "awaiting_admin" ? copy.returnToBot : copy.restart;
      restart.addEventListener("click", () => void this.sendAction(this.state.conversationState?.status === "awaiting_admin" ? "return_to_bot" : "restart"));
      actions.append(restart);
    }
    wrap.append(actions);

    const row = document.createElement("div");
    row.className = "composer-row";
    const input = document.createElement("textarea");
    input.rows = 1;
    input.placeholder = copy.placeholder;
    input.value = this.state.inputValue;
    input.addEventListener("input", () => {
      this.state.inputValue = input.value;
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void this.sendText();
      }
    });
    const send = document.createElement("button");
    send.type = "button";
    send.textContent = copy.send;
    send.addEventListener("click", () => void this.sendText());
    row.append(input, send);
    wrap.append(row);
    return wrap;
  }

  private hasNewerVisitorInput(sequence: string): boolean {
    return this.state.messages.some(
      (message) => message.sender === "visitor" && Number(message.sequence) > Number(sequence)
    );
  }

  private persistSession(expiresAt?: string): void {
    if (!this.storage || !this.state.sessionToken || !this.state.conversationId) return;
    const payload: PersistedSession = {
      sessionToken: this.state.sessionToken,
      conversationId: this.state.conversationId,
      lastSequence: this.state.lastSequence,
      lang: this.state.lang,
      expiresAt: expiresAt ?? this.readPersistedSession()?.expiresAt ?? new Date(Date.now() + 86400000).toISOString()
    };
    this.storage.setItem(storageKey(this.options.botKey), JSON.stringify(payload));
  }

  private readPersistedSession(): PersistedSession | null {
    if (!this.storage) return null;
    try {
      const raw = this.storage.getItem(storageKey(this.options.botKey));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PersistedSession;
      if (new Date(parsed.expiresAt).getTime() <= Date.now()) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private cacheConfig(config: PublicConfig): void {
    this.storage?.setItem(configStorageKey(this.options.botKey), JSON.stringify(config));
  }

  private readCachedConfig(): PublicConfig | null {
    if (!this.storage) return null;
    try {
      const raw = this.storage.getItem(configStorageKey(this.options.botKey));
      return raw ? JSON.parse(raw) as PublicConfig : null;
    } catch {
      return null;
    }
  }
}

function channelHref(channel: ContactChannel): string {
  if (channel.type === "email") return `mailto:${channel.value}`;
  if (channel.type === "phone") return `tel:${channel.value}`;
  if (channel.type === "url") return channel.value;
  return channel.value.startsWith("http") ? channel.value : `https://${channel.value}`;
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function css(position: "left" | "right", accent: string): string {
  return `
    :host { all: initial; font-family: "Noto Sans Thai", "Leelawadee UI", Tahoma, ui-sans-serif, system-ui, sans-serif; color: #122A2E; line-height: 1.55; }
    .flowbot { position: fixed; ${position}: 20px; bottom: 20px; z-index: 2147483000; }
    .launcher { min-width: 60px; min-height: 60px; border: 0; border-radius: 999px; background: ${accent}; color: #fff; font-weight: 700; box-shadow: 0 14px 40px rgba(18,42,46,.25); cursor: pointer; }
    .panel { position: absolute; ${position}: 0; bottom: 76px; width: min(390px, calc(100vw - 32px)); height: min(620px, calc(100vh - 112px)); background: #fff; border: 1px solid #E2E8E6; border-radius: 18px; box-shadow: 0 24px 70px rgba(18,42,46,.24); display: flex; flex-direction: column; overflow: hidden; }
    .header { display: flex; align-items: center; gap: 8px; padding: 14px 14px; background: #122A2E; color: #fff; }
    .title { flex: 1; font-weight: 700; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .icon, .lang { border: 1px solid rgba(255,255,255,.28); background: transparent; color: #fff; border-radius: 8px; min-width: 36px; min-height: 36px; cursor: pointer; }
    .banner { margin: 10px 12px 0; padding: 9px 10px; border-radius: 8px; font: 13px/1.4 inherit; display: flex; justify-content: space-between; gap: 8px; align-items: center; }
    .banner.error { background: #FDECEC; color: #A62D31; }
    .banner.warn { background: #FFF4DD; color: #7A4B00; }
    .banner.active { background: #E3F2EE; color: #0E7C6B; }
    .banner.loading { background: #F5F7F6; color: #5E7370; }
    .banner button { border: 0; background: transparent; color: inherit; font-weight: 700; cursor: pointer; }
    .messages { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 14px 12px; display: flex; flex-direction: column; gap: 10px; background: #F5F7F6; }
    .bubble { max-width: 86%; padding: 10px 12px; border-radius: 14px; font: 14px/1.45 inherit; overflow-wrap: anywhere; }
    .bubble.visitor { align-self: flex-end; background: #fff; border: 1px solid #E2E8E6; }
    .bubble.bot, .bubble.admin { align-self: flex-start; background: #E3F2EE; }
    .bubble.system { align-self: center; color: #5E7370; background: transparent; }
    .bubble p { margin: 0 0 8px; }
    .options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .options button, .composer button, .form-card button { min-height: 40px; border-radius: 8px; border: 1px solid #B8D7D0; background: #fff; color: #122A2E; cursor: pointer; font: 13px/1.2 inherit; white-space: normal; }
    .options button:disabled { opacity: .48; cursor: not-allowed; }
    .form-card { display: grid; gap: 8px; }
    .form-card label { display: grid; gap: 4px; font-size: 12px; color: #5E7370; }
    .form-card input { min-height: 38px; border: 1px solid #E2E8E6; border-radius: 8px; padding: 0 10px; font: 14px/1.2 inherit; }
    .channels { display: grid; gap: 6px; margin-top: 8px; }
    .channels a { color: ${accent}; text-decoration: none; font-weight: 700; }
    .cta-link { display: inline-flex; align-items: center; justify-content: center; min-height: 36px; padding: 0 12px; border-radius: 8px; background: ${accent}; color: #fff; text-decoration: none; font-weight: 700; }
    .empty { padding: 12px; background: #fff; border: 1px solid #E2E8E6; border-radius: 10px; font: 14px/1.45 inherit; }
    .composer { border-top: 1px solid #E2E8E6; background: #fff; padding: 10px; display: grid; gap: 8px; }
    .quick-actions { display: flex; justify-content: flex-end; gap: 8px; }
    .quick-actions:empty { display: none; }
    .quick-actions button { min-height: 32px; padding: 0 10px; }
    .composer-row { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
    textarea { min-height: 42px; max-height: 96px; resize: vertical; border: 1px solid #E2E8E6; border-radius: 10px; padding: 10px; font: 14px/1.3 inherit; }
    .composer-row button, .form-card button[type="submit"] { border: 0; background: ${accent}; color: #fff; font-weight: 700; padding: 0 14px; }
    button:focus-visible, textarea:focus-visible, input:focus-visible, a:focus-visible { outline: 3px solid rgba(14,124,107,.32); outline-offset: 2px; }
    @media (min-width: 420px) { .options { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    @media (max-width: 340px) { .options { grid-template-columns: 1fr; } }
    @media (max-width: 480px) {
      .flowbot { left: 0; right: 0; bottom: 0; }
      .launcher { position: fixed; right: 16px; bottom: 16px; }
      .panel { position: fixed; inset: 0; width: 100vw; height: 100vh; border-radius: 0; border: 0; }
    }
  `;
}
