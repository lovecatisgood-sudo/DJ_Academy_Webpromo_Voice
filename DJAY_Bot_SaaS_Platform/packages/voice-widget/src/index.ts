import {
  type VoiceInputAudioEncoding,
  type VoiceServerMessage,
  type VoiceSessionGrant,
} from "@djay/voice-runtime";
import { djayWidgetBaseStyles, normalizeWidgetApiOrigin, widgetFetch } from "@djay/shared/widget-ui";
import { parseVoiceServerMessage, parseVoiceSessionGrant } from "./protocol";

const voiceProtocolVersion = "djay.voice.v1" as const;

export type VoiceWidgetOptions = Readonly<{
  deploymentKey: string;
  apiBaseUrl: string;
  mountTarget?: HTMLElement;
  language?: "th" | "en";
  openOnLoad?: boolean;
  webSocketFactory?: (url: string, protocol: string) => WebSocket;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
}>;

export type VoiceWidgetCallState =
  | "idle" | "requesting_permission" | "connecting" | "listening" | "speaking"
  | "reconnecting" | "ending" | "ended" | "error";

type TranscriptLine = { speaker: "customer" | "agent"; text: string };
type InputAudioSelection = Readonly<{ encoding: VoiceInputAudioEncoding; sampleRate: 16_000 }>;
type InputCapture = Readonly<{ stop(): void }>;

const pcmInputAudio = { encoding: "pcm_s16le_16000", sampleRate: 16_000 } as const satisfies InputAudioSelection;

const copy = {
  en: {
    open: "Open voice assistant", close: "Close voice assistant", title: "Voice assistant",
    ready: "Ready when you are", intro: "Talk naturally with our automated sales assistant.",
    start: "Start voice conversation", permission: "Allow microphone access to begin.",
    requesting: "Waiting for microphone permission…", connecting: "Connecting securely…",
    listening: "Listening", speaking: "Speaking", reconnecting: "Reconnecting…",
    ending: "Ending conversation…", ended: "Conversation ended", again: "Start another conversation",
    mute: "Mute microphone", unmute: "Unmute microphone", end: "End conversation",
    keep: "Keep talking", confirm: "End the active voice conversation?",
    permissionDenied: "Microphone permission was not granted.",
    unsupported: "Voice recording is not supported by this browser.",
    unavailable: "Voice is temporarily unavailable. Please try again.", retry: "Try again", connectionIssue: "Connection interrupted. Reconnecting safely…",
    disclosure: "Automated assistant disclosure", secure: "Your microphone starts only after you press Start. Recording is off.",
    powered: "Powered by DJAY Bot", customer: "You", agent: "Assistant",
  },
  th: {
    open: "เปิดผู้ช่วยเสียง", close: "ปิดผู้ช่วยเสียง", title: "ผู้ช่วยเสียง",
    ready: "พร้อมเมื่อคุณพร้อม", intro: "พูดคุยกับผู้ช่วยฝ่ายขายอัตโนมัติของเราได้อย่างเป็นธรรมชาติ",
    start: "เริ่มสนทนาด้วยเสียง", permission: "อนุญาตการใช้ไมโครโฟนเพื่อเริ่มต้น",
    requesting: "กำลังรอการอนุญาตไมโครโฟน…", connecting: "กำลังเชื่อมต่ออย่างปลอดภัย…",
    listening: "กำลังฟัง", speaking: "กำลังพูด", reconnecting: "กำลังเชื่อมต่อใหม่…",
    ending: "กำลังจบการสนทนา…", ended: "จบการสนทนาแล้ว", again: "เริ่มการสนทนาใหม่",
    mute: "ปิดเสียงไมโครโฟน", unmute: "เปิดเสียงไมโครโฟน", end: "จบการสนทนา",
    keep: "สนทนาต่อ", confirm: "ต้องการจบการสนทนาด้วยเสียงที่กำลังดำเนินอยู่หรือไม่?",
    permissionDenied: "ไม่ได้รับอนุญาตให้ใช้ไมโครโฟน",
    unsupported: "เบราว์เซอร์นี้ไม่รองรับการสนทนาด้วยเสียง",
    unavailable: "ระบบเสียงไม่พร้อมใช้งานชั่วคราว โปรดลองอีกครั้ง", retry: "ลองอีกครั้ง", connectionIssue: "การเชื่อมต่อขัดข้อง กำลังเชื่อมต่อใหม่อย่างปลอดภัย…",
    disclosure: "คำชี้แจงผู้ช่วยอัตโนมัติ", secure: "ไมโครโฟนจะเริ่มทำงานหลังจากคุณกดเริ่มเท่านั้น และไม่มีการบันทึกเสียง",
    powered: "ขับเคลื่อนโดย DJAY Bot", customer: "คุณ", agent: "ผู้ช่วย",
  },
} as const;

const voiceWidgetOverrides = `
.panel { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; }
.content { padding: 24px; overflow: auto; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 13px; background: var(--djay-widget-surface); }
.content h2 { margin: 0; color: var(--djay-widget-ink); font-size: 21px; line-height: 1.25; }
.intro, .microcopy, .timer { margin: 0; color: var(--djay-widget-muted); font-size: 13px; line-height: 1.5; }
.orb { width: 92px; height: 92px; border-radius: 50%; background: radial-gradient(circle at 36% 30%, #fff4bf, var(--djay-widget-accent) 45%, var(--djay-widget-green) 100%); box-shadow: 0 0 0 10px var(--djay-widget-green-soft), 0 18px 35px #12614933; }
.orb.listening { animation: pulse 2.1s ease-in-out infinite; }
.orb.speaking { animation: pulse 1.05s ease-in-out infinite; }
.orb.requesting_permission, .orb.connecting, .orb.reconnecting, .orb.ending { filter: saturate(.65); }
.error-orb { background: var(--djay-widget-danger); box-shadow: 0 0 0 10px var(--djay-widget-danger-soft); }
.ended-orb { background: #789088; box-shadow: 0 0 0 10px #edf1ef; }
.disclosure { width: 100%; padding: 12px 14px; border: 1px solid var(--djay-widget-border); border-radius: 12px; background: var(--djay-widget-green-soft); text-align: left; }
.disclosure strong { display: block; color: var(--djay-widget-green-hover); font-size: 12px; }
.disclosure p { margin: 4px 0 0; color: var(--djay-widget-muted); font-size: 12px; line-height: 1.45; }
.disclosure.compact { padding: 9px 11px; }
.primary, .secondary, .danger { min-height: 46px; border-radius: 6px; padding: 10px 16px; font-weight: 800; cursor: pointer; }
.primary { width: 100%; border: 0; background: var(--djay-widget-green); color: #fff; }
.primary:hover { background: var(--djay-widget-green-hover); }
.secondary { border: 1px solid var(--djay-widget-green); background: var(--djay-widget-surface); color: var(--djay-widget-green-hover); }
.danger { border: 1px solid #d9a198; background: var(--djay-widget-danger-soft); color: #812e29; }
.controls, .actions { width: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
.confirm { width: 100%; display: flex; flex-direction: column; gap: 17px; padding: 18px; border-radius: 12px; background: var(--djay-widget-warning-soft); }
.transcript { width: 100%; max-height: 160px; overflow: auto; text-align: left; display: flex; flex-direction: column; gap: 7px; }
.transcript p { margin: 0; padding: 9px 11px; border-radius: 10px; font-size: 12px; line-height: 1.45; }
.transcript .agent { background: var(--djay-widget-green-soft); }
.transcript .customer { background: var(--djay-widget-warning-soft); }
.brand { padding: 0; }
@keyframes pulse { 50% { transform: scale(1.045); box-shadow: 0 0 0 15px var(--djay-widget-green-soft), 0 18px 35px #12614944; } }
@media (forced-colors: active) { .orb { border: 2px solid ButtonText; } }
`;

export function normalizeVoiceApiBaseUrl(value: string) { return normalizeWidgetApiOrigin(value); }

export function selectVoiceInputAudioEncoding(audioContextAvailable: boolean): InputAudioSelection | null {
  return audioContextAvailable ? pcmInputAudio : null;
}

export function resampleVoiceInputToPcm16(samples: Float32Array, sourceSampleRate: number) {
  if (!Number.isFinite(sourceSampleRate) || sourceSampleRate < 16_000) throw new Error("voice_input_sample_rate_unsupported");
  const ratio = sourceSampleRate / 16_000;
  const output = new Int16Array(Math.max(0, Math.floor(samples.length / ratio)));
  for (let outputIndex = 0; outputIndex < output.length; outputIndex += 1) {
    const position = outputIndex * ratio;
    const leftIndex = Math.floor(position);
    const rightIndex = Math.min(leftIndex + 1, samples.length - 1);
    const fraction = position - leftIndex;
    const sample = Math.max(-1, Math.min(1, (samples[leftIndex] ?? 0) * (1 - fraction) + (samples[rightIndex] ?? 0) * fraction));
    output[outputIndex] = sample < 0 ? Math.round(sample * 32_768) : Math.round(sample * 32_767);
  }
  return output;
}

export function mountVoiceWidget(options: VoiceWidgetOptions) { return new VoiceWidget(options).mount(); }

let voiceWidgetSequence = 0;

class VoiceWidget {
  private readonly host = document.createElement("div");
  private readonly shadow = this.host.attachShadow({ mode: "open" });
  private readonly apiBaseUrl: string;
  private opened: boolean;
  private language: "th" | "en";
  private callState: VoiceWidgetCallState = "idle";
  private grant: VoiceSessionGrant | null = null;
  private socket: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private inputCapture: InputCapture | null = null;
  private outputAudioContext: AudioContext | null = null;
  private playbackCursor = 0;
  private playbackSources = new Set<AudioBufferSourceNode>();
  private inputAudio: InputAudioSelection | null = null;
  private inputSequence = 0;
  private reconnectAttempt = 0;
  private reconnectTimer: number | null = null;
  private callTimer: number | null = null;
  private callStartedAt = 0;
  private elapsedSeconds = 0;
  private muted = false;
  private terminal = false;
  private confirmEnd = false;
  private errorCode: "permission" | "unsupported" | "unavailable" | null = null;
  private statusDetail = "";
  private brandingRemoved = false;
  private transcript: TranscriptLine[] = [];
  private readonly panelId = `djay-voice-panel-${++voiceWidgetSequence}`;

  constructor(private readonly options: VoiceWidgetOptions) {
    this.apiBaseUrl = normalizeVoiceApiBaseUrl(options.apiBaseUrl);
    this.language = options.language ?? "en";
    this.opened = Boolean(options.openOnLoad);
    this.host.dataset.djayVoice = options.deploymentKey.slice(0, 20);
  }

  mount() {
    (this.options.mountTarget ?? document.body).append(this.host);
    this.render();
    void this.loadPublicConfig();
    window.addEventListener("pagehide", () => this.pageClosed(), { once: true });
    return this.host;
  }

  private async loadPublicConfig() {
    try {
      const response = await widgetFetch(`${this.apiBaseUrl}/public/voice/config`, {
        headers: { "x-djay-voice-key": this.options.deploymentKey },
      });
      if (!response.ok) return;
      const body = await response.json() as { status?: unknown; config?: { brandingRemoved?: unknown } };
      if (body.status === "available" && typeof body.config?.brandingRemoved === "boolean") {
        this.brandingRemoved = body.config.brandingRemoved;
        this.render();
      }
    } catch { /* Branding remains visible when public configuration cannot be verified. */ }
  }

  private active() {
    return ["requesting_permission", "connecting", "listening", "speaking", "reconnecting", "ending"].includes(this.callState);
  }

  private async startCall() {
    if (this.active()) return;
    this.terminal = false; this.errorCode = null; this.statusDetail = ""; this.confirmEnd = false;
    this.transcript = []; this.elapsedSeconds = 0; this.reconnectAttempt = 0; this.inputSequence = 0;
    this.callState = "requesting_permission"; this.render();
    const Context = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    this.inputAudio = selectVoiceInputAudioEncoding(Boolean(Context));
    if (!this.inputAudio) { this.fail("unsupported"); return; }
    try {
      const getUserMedia = this.options.getUserMedia ?? navigator.mediaDevices?.getUserMedia.bind(navigator.mediaDevices);
      if (!getUserMedia) { this.fail("unsupported"); return; }
      this.stream = await getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false,
      });
    } catch (error) {
      this.fail(error instanceof DOMException && ["NotAllowedError", "SecurityError"].includes(error.name) ? "permission" : "unavailable");
      return;
    }
    this.callState = "connecting"; this.render();
    try {
      const response = await widgetFetch(`${this.apiBaseUrl}/public/voice/session`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-djay-voice-key": this.options.deploymentKey },
        body: JSON.stringify({ locale: this.language }),
      });
      if (!response.ok) throw new Error("voice_session_unavailable");
      const body = await response.json() as { status?: unknown; grant?: unknown };
      if (body.status !== "issued") throw new Error("voice_session_unavailable");
      this.grant = parseVoiceSessionGrant(body.grant);
      this.language = this.options.language ?? this.grant.locale;
      this.connect();
    } catch { this.fail("unavailable"); }
  }

  private connect() {
    if (!this.grant || !this.inputAudio || this.terminal) return;
    const factory = this.options.webSocketFactory ?? ((url, protocol) => new WebSocket(url, protocol));
    const socket = factory(this.grant.gatewayUrl, voiceProtocolVersion);
    this.socket = socket; socket.binaryType = "arraybuffer";
    const connectionId = crypto.randomUUID();
    socket.onopen = () => {
      if (socket !== this.socket || !this.grant || !this.inputAudio) return;
      this.send({
        type: "session.connect", messageId: crypto.randomUUID(), sessionId: this.grant.sessionId,
        sessionGrant: this.grant.sessionGrant, connectionId, protocolVersion: voiceProtocolVersion,
        inputAudioEncoding: this.inputAudio.encoding, reconnectAttempt: this.reconnectAttempt,
      });
    };
    socket.onmessage = (event) => {
      try { this.handleServerMessage(parseVoiceServerMessage(JSON.parse(String(event.data)))); }
      catch { this.fail("unavailable"); }
    };
    socket.onerror = () => { /* close owns the provider-neutral retry path */ };
    socket.onclose = () => {
      if (socket !== this.socket || this.terminal) return;
      this.stopInputCapture();
      if (this.canReconnect()) this.scheduleReconnect(); else this.fail("unavailable");
    };
  }

  private handleServerMessage(message: VoiceServerMessage) {
    switch (message.type) {
      case "session.connected":
        this.reconnectAttempt = message.resumed ? this.reconnectAttempt : 0;
        this.inputSequence = 0;
        this.callState = "listening"; this.statusDetail = "";
        if (!this.callStartedAt) this.callStartedAt = Date.now();
        void this.startInputCapture(); this.startCallTimer();
        this.send({ type: "session.ready", messageId: crypto.randomUUID() });
        this.render(); break;
      case "audio.chunk": this.playPcm(message.audioBase64); break;
      case "assistant.speech.started": this.callState = "speaking"; this.render(); break;
      case "assistant.speech.ended": this.callState = "listening"; this.render(); break;
      case "assistant.speech.interrupted": this.stopPlayback(); this.callState = "listening"; this.render(); break;
      case "silence.warning": this.statusDetail = `${message.remainingSeconds}s`; this.render(); break;
      case "transcript.delta": this.appendTranscript(message.speaker, message.text); break;
      case "action.status": break;
      case "session.ended": this.complete(); break;
      case "error":
        this.statusDetail = copy[this.language].connectionIssue;
        if (!message.retryable) this.fail("unavailable");
        break;
    }
  }

  private async startInputCapture() {
    if (!this.stream || !this.inputAudio || this.inputCapture) return;
    try {
      this.inputCapture = await createPcmInputCapture(this.stream, (pcm) => {
        if (!pcm.byteLength || this.socket?.readyState !== 1 || this.muted) return;
        this.send({
          type: "audio.chunk", messageId: crypto.randomUUID(), sequence: this.inputSequence++,
          audioBase64: bytesToBase64(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)),
        });
      });
    } catch { this.fail("unsupported"); }
  }

  private stopInputCapture() {
    this.inputCapture?.stop(); this.inputCapture = null;
  }

  private playPcm(audioBase64: string) {
    try {
      const Context = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) return;
      this.outputAudioContext ??= new Context({ sampleRate: 24_000 });
      void this.outputAudioContext.resume();
      const bytes = base64ToBytes(audioBase64);
      const samples = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
      const buffer = this.outputAudioContext.createBuffer(1, samples.length, 24_000);
      const channel = buffer.getChannelData(0);
      for (let index = 0; index < samples.length; index += 1) channel[index] = samples[index]! / 32_768;
      const source = this.outputAudioContext.createBufferSource(); source.buffer = buffer; source.connect(this.outputAudioContext.destination);
      const startAt = Math.max(this.playbackCursor, this.outputAudioContext.currentTime + 0.015);
      this.playbackCursor = startAt + buffer.duration; this.playbackSources.add(source);
      source.onended = () => this.playbackSources.delete(source); source.start(startAt);
    } catch { this.statusDetail = copy[this.language].connectionIssue; this.render(); }
  }

  private stopPlayback() {
    for (const source of this.playbackSources) { try { source.stop(); } catch { /* already stopped */ } }
    this.playbackSources.clear(); this.playbackCursor = this.outputAudioContext?.currentTime ?? 0;
  }

  private appendTranscript(speaker: "customer" | "agent", delta: string) {
    const last = this.transcript.at(-1);
    const continued = last?.speaker === speaker;
    if (last && continued) last.text += delta;
    else this.transcript.push({ speaker, text: delta });
    this.transcript = this.transcript.slice(-20);
    const transcript = this.shadow.querySelector<HTMLElement>(".transcript");
    if (!transcript) { this.render(); return; }
    const line = this.transcript.at(-1);
    if (!line) return;
    const text = copy[this.language];
    const item = continued ? transcript.lastElementChild as HTMLElement | null : element("p", line.speaker);
    if (!item) { this.render(); return; }
    item.replaceChildren(element("strong", "", line.speaker === "customer" ? text.customer : text.agent), document.createTextNode(` ${line.text}`));
    if (!continued) transcript.append(item);
    while (transcript.childElementCount > 20) transcript.firstElementChild?.remove();
    transcript.scrollTo({ top: transcript.scrollHeight });
  }

  private canReconnect() {
    if (!this.grant || this.reconnectAttempt >= this.grant.reconnectPolicy.maxAttempts) return false;
    return !this.callStartedAt || Date.now() - this.callStartedAt < this.grant.maxCallSeconds * 1000;
  }

  private scheduleReconnect() {
    if (!this.grant) return;
    this.reconnectAttempt += 1; this.callState = "reconnecting"; this.render();
    const delay = Math.min(this.grant.reconnectPolicy.backoffMs * (2 ** (this.reconnectAttempt - 1)), 10_000);
    this.reconnectTimer = window.setTimeout(() => this.connect(), delay);
  }

  private send(message: Record<string, unknown>) {
    if (this.socket?.readyState === 1) this.socket.send(JSON.stringify(message));
  }

  private endCall() {
    if (!this.active()) return;
    this.confirmEnd = false; this.callState = "ending"; this.terminal = true; this.render();
    this.send({ type: "session.end", messageId: crypto.randomUUID(), reason: "customer_ended" });
    window.setTimeout(() => { if (this.callState === "ending") this.complete(); }, 3_000);
  }

  private complete() {
    this.terminal = true; this.cleanup(); this.callState = "ended"; this.render();
  }

  private fail(code: "permission" | "unsupported" | "unavailable") {
    this.terminal = true; this.errorCode = code; this.cleanup(); this.callState = "error"; this.render();
  }

  private cleanup() {
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    if (this.callTimer !== null) window.clearInterval(this.callTimer);
    this.reconnectTimer = null; this.callTimer = null; this.stopInputCapture(); this.stopPlayback();
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
    if (this.socket && this.socket.readyState < 2) this.socket.close(1000, "widget_cleanup");
    this.socket = null;
    if (this.outputAudioContext) void this.outputAudioContext.close().catch(() => undefined);
    this.outputAudioContext = null; this.callStartedAt = 0;
  }

  private pageClosed() {
    if (!this.active()) return;
    this.terminal = true;
    this.send({ type: "session.end", messageId: crypto.randomUUID(), reason: "page_closed" });
    this.cleanup();
  }

  private toggleMute() {
    this.muted = !this.muted;
    for (const track of this.stream?.getAudioTracks() ?? []) track.enabled = !this.muted;
    this.render();
    queueMicrotask(() => this.shadow.querySelector<HTMLButtonElement>(".controls .secondary")?.focus());
  }

  private focusPrimaryAction() {
    queueMicrotask(() => this.shadow.querySelector<HTMLButtonElement>(".content button:not(:disabled)")?.focus());
  }

  private setOpened(opened: boolean) {
    this.opened = opened; this.render();
    if (opened) this.focusPrimaryAction();
    else queueMicrotask(() => this.shadow.querySelector<HTMLButtonElement>(".launcher")?.focus());
  }

  private requestClose() {
    if (this.active()) { this.confirmEnd = true; this.render(); this.focusPrimaryAction(); }
    else this.setOpened(false);
  }

  private startCallTimer() {
    if (this.callTimer !== null) return;
    this.callTimer = window.setInterval(() => {
      if (this.callStartedAt) {
        this.elapsedSeconds = Math.floor((Date.now() - this.callStartedAt) / 1000);
        const timer = this.shadow.querySelector<HTMLElement>(".timer");
        if (timer) timer.textContent = `${formatDuration(this.elapsedSeconds)}${this.statusDetail ? ` · ${this.statusDetail}` : ""}`;
      }
    }, 1_000);
  }

  private render() {
    const text = copy[this.language];
    const focusedAction = this.shadow.activeElement instanceof HTMLButtonElement
      ? this.shadow.activeElement.getAttribute("aria-label") : null;
    this.shadow.replaceChildren();
    const style = document.createElement("style"); style.textContent = `${djayWidgetBaseStyles}\n${voiceWidgetOverrides}`; this.shadow.append(style);
    const shell = element("div", "shell");
    if (this.opened) {
      const panel = element("section", "panel"); panel.id = this.panelId; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "false"); panel.setAttribute("aria-label", text.title);
      panel.addEventListener("keydown", (event) => { if (event.key === "Escape") this.requestClose(); });
      const header = element("header", "header");
      const identity = element("div", "identity"); identity.append(element("span", "mark", "DJ"), element("div", "identity-copy"));
      identity.lastElementChild?.append(element("strong", "title", text.title), element("span", "product-label", this.grant?.publicLabel ?? "First-Generation Voice Engine"));
      const close = button("×", text.close, "icon"); close.addEventListener("click", () => this.requestClose());
      header.append(identity, close);
      const content = element("div", "content"); content.setAttribute("aria-busy", String(["requesting_permission", "connecting", "reconnecting", "ending"].includes(this.callState)));
      if (this.confirmEnd) {
        const confirm = element("div", "confirm"); confirm.setAttribute("role", "alertdialog"); confirm.setAttribute("aria-label", text.confirm); confirm.append(element("strong", "", text.confirm));
        const actions = element("div", "actions");
        const keep = button(text.keep, text.keep, "secondary"); keep.addEventListener("click", () => { this.confirmEnd = false; this.render(); });
        const end = button(text.end, text.end, "danger"); end.addEventListener("click", () => this.endCall());
        actions.append(keep, end); confirm.append(actions); content.append(confirm);
      } else if (this.callState === "idle") {
        content.append(element("div", "orb", ""), element("h2", "", text.ready), element("p", "intro", text.intro));
        const disclosure = element("div", "disclosure"); disclosure.append(element("strong", "", text.disclosure), element("p", "", this.grant?.automatedAgentDisclosure.text ?? text.secure));
        content.append(disclosure);
        const start = button(text.start, text.start, "primary"); start.addEventListener("click", () => void this.startCall()); content.append(start, element("p", "microcopy", text.permission));
      } else if (this.callState === "error") {
        const error = element("h2", "", this.errorCode === "permission" ? text.permissionDenied : this.errorCode === "unsupported" ? text.unsupported : text.unavailable); error.setAttribute("role", "alert");
        content.append(element("div", "orb error-orb"), error);
        const retry = button(text.retry, text.retry, "primary"); retry.addEventListener("click", () => void this.startCall()); content.append(retry);
      } else if (this.callState === "ended") {
        content.append(element("div", "orb ended-orb"), element("h2", "", text.ended));
        const again = button(text.again, text.again, "primary"); again.addEventListener("click", () => void this.startCall()); content.append(again);
      } else {
        const label = this.callState === "requesting_permission" ? text.requesting : this.callState === "connecting" ? text.connecting
          : this.callState === "listening" ? text.listening : this.callState === "speaking" ? text.speaking
            : this.callState === "reconnecting" ? text.reconnecting : text.ending;
        content.append(element("div", `orb ${this.callState}`), element("h2", "", label));
        const timer = element("p", "timer", formatDuration(this.elapsedSeconds)); if (this.statusDetail) timer.append(` · ${this.statusDetail}`); content.append(timer);
        if (this.grant) { const disclosure = element("div", "disclosure compact"); disclosure.append(element("strong", "", text.disclosure), element("p", "", this.grant.automatedAgentDisclosure.text)); content.append(disclosure); }
        if (this.transcript.length) {
          const transcript = element("div", "transcript"); transcript.setAttribute("aria-live", "polite"); transcript.setAttribute("aria-atomic", "false"); transcript.setAttribute("aria-relevant", "additions text");
          for (const line of this.transcript) { const item = element("p", line.speaker); item.append(element("strong", "", line.speaker === "customer" ? text.customer : text.agent), document.createTextNode(` ${line.text}`)); transcript.append(item); }
          content.append(transcript);
        }
        if (["listening", "speaking", "reconnecting"].includes(this.callState)) {
          const controls = element("div", "controls");
          const mute = button(this.muted ? text.unmute : text.mute, this.muted ? text.unmute : text.mute, "secondary"); mute.addEventListener("click", () => this.toggleMute());
          const end = button(text.end, text.end, "danger"); end.addEventListener("click", () => { this.confirmEnd = true; this.render(); });
          controls.append(mute, end); content.append(controls);
        }
      }
      panel.append(header, content);
      if (!this.brandingRemoved) panel.append(element("div", "brand", text.powered));
      shell.append(panel);
    }
    const launcher = button(this.opened ? "×" : "DJ", this.opened ? text.close : text.open, "launcher"); launcher.setAttribute("aria-expanded", String(this.opened)); launcher.setAttribute("aria-controls", this.panelId);
    launcher.addEventListener("click", () => {
      if (this.opened) { this.requestClose(); return; }
      this.setOpened(true);
    });
    shell.append(launcher); this.shadow.append(shell);
    if (focusedAction) queueMicrotask(() => {
      const target = [...this.shadow.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.getAttribute("aria-label") === focusedAction && !button.disabled);
      target?.focus();
    });
  }
}

async function createPcmInputCapture(stream: MediaStream, onChunk: (chunk: Int16Array) => void): Promise<InputCapture> {
  const Context = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) throw new Error("voice_input_unsupported");
  const context = new Context();
  if (context.sampleRate < 16_000) { await context.close(); throw new Error("voice_input_sample_rate_unsupported"); }
  const source = context.createMediaStreamSource(stream);
  const silent = context.createGain(); silent.gain.value = 0; silent.connect(context.destination);
  let processor: AudioWorkletNode | ScriptProcessorNode | null = null;
  let workletProcessor: AudioWorkletNode | null = null;
  let workletUrl: string | null = null;

  if (context.audioWorklet && typeof AudioWorkletNode !== "undefined") {
    const workletSource = `
      class DJAYPcmInputProcessor extends AudioWorkletProcessor {
        constructor() { super(); this.input = []; this.position = 0; this.output = []; }
        process(inputs) {
          const channel = inputs[0] && inputs[0][0];
          if (!channel || channel.length === 0) return true;
          for (let i = 0; i < channel.length; i += 1) this.input.push(channel[i]);
          const ratio = sampleRate / 16000;
          while (this.position + 1 < this.input.length) {
            const left = Math.floor(this.position); const fraction = this.position - left;
            const value = Math.max(-1, Math.min(1, this.input[left] * (1 - fraction) + this.input[left + 1] * fraction));
            this.output.push(value < 0 ? Math.round(value * 32768) : Math.round(value * 32767));
            this.position += ratio;
          }
          const consumed = Math.floor(this.position);
          if (consumed > 0) { this.input = this.input.slice(consumed); this.position -= consumed; }
          while (this.output.length >= 1600) {
            const chunk = Int16Array.from(this.output.splice(0, 1600));
            this.port.postMessage(chunk.buffer, [chunk.buffer]);
          }
          return true;
        }
      }
      registerProcessor("djay-pcm-input", DJAYPcmInputProcessor);
    `;
    workletUrl = URL.createObjectURL(new Blob([workletSource], { type: "text/javascript" }));
    try {
      await context.audioWorklet.addModule(workletUrl);
      const worklet = new AudioWorkletNode(context, "djay-pcm-input", {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
      });
      worklet.port.onmessage = (event: MessageEvent<ArrayBuffer>) => onChunk(new Int16Array(event.data));
      processor = worklet; workletProcessor = worklet;
    } catch {
      processor = null;
    } finally { URL.revokeObjectURL(workletUrl); workletUrl = null; }
  }
  if (!processor) {
    const fallback = context.createScriptProcessor(4096, 1, 1);
    fallback.onaudioprocess = (event) => onChunk(resampleVoiceInputToPcm16(event.inputBuffer.getChannelData(0), context.sampleRate));
    processor = fallback;
  }

  source.connect(processor); processor.connect(silent); await context.resume();
  let stopped = false;
  return {
    stop() {
      if (stopped) return; stopped = true;
      if (workletProcessor) workletProcessor.port.onmessage = null;
      else (processor as ScriptProcessorNode).onaudioprocess = null;
      try { source.disconnect(); } catch { /* already disconnected */ }
      try { processor.disconnect(); } catch { /* already disconnected */ }
      try { silent.disconnect(); } catch { /* already disconnected */ }
      void context.close().catch(() => undefined);
      if (workletUrl) URL.revokeObjectURL(workletUrl);
    },
  };
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string) {
  const result = document.createElement(tag); result.className = className;
  if (text !== undefined) result.textContent = text; return result;
}
function button(label: string, ariaLabel: string, className: string) {
  const result = document.createElement("button"); result.type = "button"; result.className = className;
  result.textContent = label; result.setAttribute("aria-label", ariaLabel); return result;
}
function formatDuration(seconds: number) { return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; }
function bytesToBase64(bytes: Uint8Array) {
  let binary = ""; for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]!);
  return btoa(binary);
}
function base64ToBytes(value: string) {
  const binary = atob(value); const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index); return bytes;
}
