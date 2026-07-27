(function () {
  const script = document.currentScript;
  const apiBase = (script && script.dataset.apiBase) || new URL(script.src).origin;
  const mode = (script && script.dataset.mode) || "floating";
  const realtimeUrl = "https://api.openai.com/v1/realtime/calls";
  const controllers = [];

  const COPY = {
    th: {
      regionLabel: "ผู้ช่วยฝ่ายขายด้วยเสียงของ DJAI",
      title: "คุยกับ DJAI",
      readyVoice: "พร้อมเริ่มสนทนา",
      readyChat: "พร้อมแชต",
      start: "เริ่มคุยด้วยเสียง",
      mute: "ปิดไมโครโฟน",
      unmute: "เปิดไมโครโฟน",
      end: "จบการสนทนา",
      booking: "เลือกเวลานัดปรึกษา",
      chatMode: "แชตบอต",
      voiceMode: "บอตเสียง",
      placeholder: "พิมพ์ข้อความ…",
      send: "ส่ง",
      connectingChat: "กำลังเชื่อมต่อแชตบอต…",
      chatbotUnavailable: "ขณะนี้แชตบอตไม่พร้อมใช้งาน",
      endVoiceBeforeChat: "กรุณาจบการสนทนาด้วยเสียงก่อนเปลี่ยนเป็นแชตบอต",
      fallbackGreeting: "สวัสดี เราคือ DJ จาก DJAI Academy วันนี้อยากพัฒนาหรือแก้ปัญหาส่วนไหนของธุรกิจ",
      fallbackReply: "ช่วยเล่ารายละเอียดเพิ่มเติมอีกนิดได้ไหม",
      chatFailed: "ส่งข้อความไม่สำเร็จ กรุณาลองใหม่",
      you: "คุณ",
      tool: "ระบบบันทึกข้อมูล",
      system: "ระบบ",
      bookingReady: "ปุ่มเลือกเวลานัดปรึกษาพร้อมแล้ว",
      callEnded: "จบการสนทนาแล้ว",
      connecting: "กำลังเชื่อมต่อ",
      listening: "กำลังฟัง",
      speaking: "กำลังตอบ",
      muted: "ปิดไมโครโฟนแล้ว",
      callClosing: "การเชื่อมต่อกำลังจะปิด",
      callClosed: "การเชื่อมต่อสิ้นสุดแล้ว",
      callInterrupted: "การสนทนาขัดข้อง กรุณาลองใหม่",
      connectionInterrupted: "การเชื่อมต่อขัดข้อง",
      audioInterrupted: "การเชื่อมต่อเสียงขัดข้อง",
      microphoneUnsupported: "เบราว์เซอร์นี้ไม่รองรับการรับเสียงจากไมโครโฟน",
      microphoneBlocked: "ไม่สามารถใช้ไมโครโฟนได้ กรุณาอนุญาตการเข้าถึงไมโครโฟนในการตั้งค่าเบราว์เซอร์",
      voiceUnavailable: "ขณะนี้บอตเสียงไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง",
      voiceOffline: "ขณะนี้บอตเสียงปิดให้บริการ",
      detailsSent: "ส่งข้อมูลให้ทีม DJAI เรียบร้อยแล้ว ทีมงานจะติดต่อกลับ",
      detailsFailed: "ยังบันทึกข้อมูลไม่ได้ กรุณาแจ้งช่องทางติดต่ออีกครั้ง",
      invalidDetails: "ระบบอ่านข้อมูลได้ไม่ครบ กรุณาแจ้งช่องทางติดต่ออีกครั้ง",
      visitor: "ผู้สนใจ",
      contactProvided: "มีช่องทางติดต่อ",
      needCaptured: "บันทึกความต้องการแล้ว",
    },
    en: {
      regionLabel: "DJAI voice sales agent", title: "Talk to DJAI", readyVoice: "Ready to talk", readyChat: "Ready to chat",
      start: "Start voice call", mute: "Mute", unmute: "Unmute", end: "End", booking: "Book consultation",
      chatMode: "Chatbot", voiceMode: "Voicebot", placeholder: "Type your message...", send: "Send",
      connectingChat: "Connecting chatbot...", chatbotUnavailable: "Chatbot unavailable",
      endVoiceBeforeChat: "Please end the voice call before switching back to chatbot.",
      fallbackGreeting: "Hi, I am DJ from DJAI Academy. What kind of business are you running?",
      fallbackReply: "Could you tell me a little more?", chatFailed: "Chat message failed.", you: "You", tool: "Tool", system: "System",
      bookingReady: "A booking button is ready if you want to choose a consultation time.", callEnded: "Call ended",
      connecting: "Connecting", listening: "Listening", speaking: "Speaking", muted: "Muted", callClosing: "Call connection closing",
      callClosed: "Call connection closed", callInterrupted: "Call interrupted. Please try again.", connectionInterrupted: "Call connection interrupted",
      audioInterrupted: "Audio connection interrupted", microphoneUnsupported: "Audio input is not supported in this browser.",
      microphoneBlocked: "Microphone permission was blocked.", voiceUnavailable: "Voice agent is unavailable. Please try again shortly.",
      voiceOffline: "Voice agent is offline", detailsSent: "Your details were sent to DJAI for follow-up.",
      detailsFailed: "DJAI could not save those details yet. Please repeat the contact information.",
      invalidDetails: "DJAI could not read those details clearly. Please repeat the contact information.",
      visitor: "visitor", contactProvided: "contact provided", needCaptured: "need captured",
    },
  };

  function ensureDualModeStyles() {
    if (document.getElementById("djai-dual-mode-styles")) return;
    const style = document.createElement("style");
    style.id = "djai-dual-mode-styles";
    style.textContent = `
      .djai-mode-toggle {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
        margin: 0 14px 12px;
        border-radius: 12px;
        background: rgba(15, 23, 42, 0.38);
        padding: 4px;
      }
      .djai-mode-toggle button {
        min-height: 36px;
        border-radius: 9px;
        background: transparent;
        color: #b9c6d8;
      }
      .djai-mode-toggle button[aria-pressed="true"] {
        background: linear-gradient(135deg, #22d3ee, #2563eb);
        color: #fff;
      }
      .voice-agent-card.mode-chat .voice-agent-body,
      .voice-agent-card.mode-chat .voice-agent-actions,
      .voice-agent-card.mode-chat .voice-agent-timer,
      .voice-agent-card.mode-chat .ai-privacy-note {
        display: none;
      }
      .voice-agent-card.mode-voice .djai-chat-panel {
        display: none;
      }
      .djai-chat-panel {
        display: flex;
        min-height: 0;
        flex-direction: column;
        border-top: 1px solid rgba(148, 163, 184, 0.16);
        padding: 12px 14px 14px;
      }
      .voice-agent-card.mode-chat .djai-chat-panel {
        flex: 1;
        padding: 14px 8px 8px;
      }
      .djai-chat-messages {
        display: flex;
        flex: 1;
        max-height: 300px;
        min-height: 220px;
        flex-direction: column;
        gap: 8px;
        overflow: auto;
        padding-right: 2px;
      }
      .voice-agent-card.mode-chat .djai-chat-messages {
        max-height: none;
        min-height: 0;
        padding: 4px 0 12px;
      }
      .djai-chat-message {
        max-width: 86%;
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 12px;
        padding: 9px 10px;
        color: #eaf2ff;
        font-size: 13px;
        line-height: 1.45;
        white-space: pre-wrap;
      }
      .djai-chat-message.assistant {
        margin-right: auto;
        background: rgba(255, 255, 255, 0.07);
      }
      .djai-chat-message.user {
        margin-left: auto;
        border-color: rgba(34, 211, 238, 0.32);
        background: rgba(34, 211, 238, 0.14);
      }
      .djai-chat-message.system {
        margin-inline: auto;
        max-width: 100%;
        color: #aeb8ca;
        background: rgba(255, 255, 255, 0.04);
      }
      .djai-chat-form {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: end;
        gap: 8px;
        margin-top: 12px;
      }
      .voice-agent-card.mode-chat .djai-chat-form {
        margin-top: auto;
        padding-top: 10px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
      }
      .djai-chat-form textarea {
        min-height: 42px;
        max-height: 110px;
        resize: vertical;
        border: 1px solid rgba(148, 163, 184, 0.24);
        border-radius: 12px;
        background: rgba(3, 7, 18, 0.46);
        color: #f8fbff;
        font: inherit;
        font-size: 13px;
        padding: 10px 11px;
      }
      .djai-chat-form textarea:focus {
        border-color: rgba(34, 211, 238, 0.48);
        outline: none;
        box-shadow: 0 0 0 3px rgba(34, 211, 238, 0.08);
      }
      .djai-chat-form textarea::placeholder {
        color: #8fa0b8;
      }
      .djai-chat-form button {
        min-width: 72px;
        background: linear-gradient(135deg, #22d3ee, #2563eb);
      }
    `;
    document.head.appendChild(style);
  }

  function createFloatingContainer() {
    const copy = getCopy();
    const root = document.createElement("div");
    root.id = "djai-voice-agent";
    root.innerHTML = `
      <style>
        #djai-voice-agent {
          position: fixed;
          right: 18px;
          bottom: 18px;
          z-index: 2147483000;
          width: min(342px, calc(100vw - 32px));
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: #f8fbff;
        }
        #djai-voice-agent .djai-floating-card {
          border: 1px solid rgba(148, 163, 184, 0.22);
          border-radius: 16px;
          background: linear-gradient(180deg, rgba(10, 17, 40, 0.97), rgba(5, 11, 29, 0.98));
          box-shadow: 0 20px 70px rgba(0, 0, 0, 0.42);
          overflow: hidden;
        }
        #djai-voice-agent .djai-floating-top {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px;
        }
        #djai-voice-agent .djai-floating-mark {
          display: grid;
          width: 42px;
          height: 42px;
          place-items: center;
          border-radius: 12px;
          background: linear-gradient(135deg, #22d3ee, #2563eb);
          color: #fff;
          font-weight: 800;
        }
        #djai-voice-agent .djai-floating-title {
          margin: 0;
          font-size: 14px;
          font-weight: 800;
        }
        #djai-voice-agent .djai-floating-status {
          margin-top: 3px;
          color: #aeb8ca;
          font-size: 12px;
        }
        #djai-voice-agent .djai-floating-actions {
          display: grid;
          grid-template-columns: 1fr auto auto;
          gap: 8px;
          padding: 0 14px 14px;
        }
        #djai-voice-agent button {
          min-height: 42px;
          border: 0;
          border-radius: 12px;
          color: #fff;
          cursor: pointer;
          font: inherit;
          font-size: 13px;
          font-weight: 800;
        }
        #djai-voice-agent button[hidden] {
          display: none;
        }
        #djai-voice-agent [data-djai-start] {
          background: linear-gradient(135deg, #22d3ee, #2563eb);
        }
        #djai-voice-agent [data-djai-mute] {
          padding: 0 12px;
          background: rgba(255, 255, 255, 0.08);
        }
        #djai-voice-agent [data-djai-end] {
          padding: 0 12px;
          background: rgba(239, 68, 68, 0.18);
          color: #fecaca;
        }
        #djai-voice-agent .djai-floating-log {
          max-height: 160px;
          overflow: auto;
          border-top: 1px solid rgba(148, 163, 184, 0.14);
          padding: 12px 14px 14px;
          color: #dbe5f6;
          font-size: 12px;
          line-height: 1.5;
        }
        #djai-voice-agent .djai-floating-log:empty {
          display: none;
        }
        #djai-voice-agent .djai-booking-cta {
          display: block;
          margin: 0 14px 14px;
          border-radius: 12px;
          background: linear-gradient(135deg, #22d3ee, #2563eb);
          padding: 11px 14px;
          color: #fff;
          font-size: 13px;
          font-weight: 800;
          text-align: center;
          text-decoration: none;
        }
        #djai-voice-agent .djai-booking-cta[hidden] {
          display: none;
        }
        #djai-voice-agent.mode-chat .djai-floating-actions,
        #djai-voice-agent.mode-chat .djai-floating-log {
          display: none;
        }
        #djai-voice-agent.mode-voice .djai-chat-panel {
          display: none;
        }
      </style>
      <div class="djai-floating-card" role="region" aria-label="${copy.regionLabel}">
        <div class="djai-floating-top">
          <div class="djai-floating-mark" aria-hidden="true">DJ</div>
          <div>
            <p class="djai-floating-title">${copy.title}</p>
            <div class="djai-floating-status" data-djai-status>${copy.readyVoice}</div>
          </div>
        </div>
        <div class="djai-floating-actions">
          <button type="button" data-djai-start>${copy.start}</button>
          <button type="button" data-djai-mute hidden>${copy.mute}</button>
          <button type="button" data-djai-end hidden>${copy.end}</button>
        </div>
        <a class="djai-booking-cta" data-djai-booking hidden target="_blank" rel="noopener">${copy.booking}</a>
        <div class="djai-floating-log" data-djai-transcript></div>
      </div>
    `;
    document.body.appendChild(root);
    return root;
  }

  function getClientSecret(data) {
    return (
      data?.clientSecret?.value ||
      data?.clientSecret?.client_secret?.value ||
      data?.clientSecret?.client_secret ||
      data?.value ||
      data?.client_secret?.value
    );
  }

  function inferLanguage(transcript) {
    const joined = transcript.map((item) => item.text).join(" ");
    const hasThai = /[\u0E00-\u0E7F]/.test(joined);
    const hasLatin = /[A-Za-z]/.test(joined);
    if (hasThai && hasLatin) return "mixed";
    if (hasThai) return "th";
    if (hasLatin) return "en";
    return "mixed";
  }

  function getSelectedLanguage() {
    const queryLanguage = new URLSearchParams(window.location.search).get("lang");
    if (queryLanguage === "th" || queryLanguage === "en") return queryLanguage;

    try {
      const storedLanguage = window.localStorage.getItem("djai-language");
      if (storedLanguage === "th" || storedLanguage === "en") return storedLanguage;
    } catch {
    }

    const documentLanguage = document.documentElement.lang?.slice(0, 2).toLowerCase();
    return documentLanguage === "en" ? "en" : "th";
  }

  function getCopy() {
    return COPY[getSelectedLanguage()] || COPY.th;
  }

  class VoiceController {
    constructor(container) {
      ensureDualModeStyles();
      this.container = container;
      this.copy = getCopy();
      this.card = container;
      this.installDualModeUi();
      this.statusEl = container.querySelector("[data-djai-status]");
      this.stateEl = container.querySelector("[data-djai-state]") || this.statusEl;
      this.timerEl = container.querySelector("[data-djai-timer]");
      this.startButton = container.querySelector("[data-djai-start]");
      this.muteButton = container.querySelector("[data-djai-mute]");
      this.endButton = container.querySelector("[data-djai-end]");
      this.bookingLink = container.querySelector("[data-djai-booking]");
      this.transcriptEl = container.querySelector("[data-djai-transcript]");
      this.pc = null;
      this.dc = null;
      this.ws = null;
      this.localStream = null;
      this.audioEl = null;
      this.inputAudioContext = null;
      this.inputAudioSource = null;
      this.inputAudioProcessor = null;
      this.playbackAudioContext = null;
      this.playbackCursor = 0;
      this.geminiAudioSources = new Set();
      this.sessionContext = null;
      this.startedAt = 0;
      this.transcript = [];
      this.functionArgs = new Map();
      this.processedToolCalls = new Set();
      this.closed = true;
      this.muted = false;
      this.timer = 0;
      this.maxCallTimer = 0;
      this.mode = "voice";
      this.chatSessionContext = null;
      this.chatStarted = false;
      this.chatStarting = null;
      this.chatBusy = false;
      this.chatHasUserMessages = false;

      this.startButton?.addEventListener("click", () => this.startCall());
      this.muteButton?.addEventListener("click", () => this.toggleMute());
      this.endButton?.addEventListener("click", () => this.endCall(this.copy.callEnded));
      window.addEventListener("pagehide", () => {
        if (!this.closed && this.sessionContext) {
          this.saveConversation();
        }
        if (this.chatSessionContext) {
          this.endChat({ beacon: true });
        }
      });
      this.modeButtons.forEach((button) => {
        button.addEventListener("click", () => this.switchMode(button.dataset.djaiMode));
      });
      this.chatForm?.addEventListener("submit", (event) => {
        event.preventDefault();
        this.sendChatMessage();
      });
      this.chatInput?.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          this.sendChatMessage();
        }
      });
      this.switchMode("voice", { silent: true });
      this.checkStatus();
    }

    installDualModeUi() {
      if (!this.card.querySelector("[data-djai-mode-toggle]")) {
        const toggle = document.createElement("div");
        toggle.className = "djai-mode-toggle";
        toggle.dataset.djaiModeToggle = "true";
        toggle.innerHTML = `
          <button type="button" data-djai-mode="chat" aria-pressed="false">${this.copy.chatMode}</button>
          <button type="button" data-djai-mode="voice" aria-pressed="true">${this.copy.voiceMode}</button>
        `;
        const header = this.card.querySelector(".voice-agent-header, .djai-floating-top, .ai-chat-header");
        if (header?.after) header.after(toggle);
        else this.card.prepend(toggle);
      }

      if (!this.card.querySelector("[data-djai-chat-panel]")) {
        const panel = document.createElement("div");
        panel.className = "djai-chat-panel";
        panel.dataset.djaiChatPanel = "true";
        panel.innerHTML = `
          <div class="djai-chat-messages" data-djai-chat-messages></div>
          <form class="djai-chat-form" data-djai-chat-form>
            <textarea data-djai-chat-input rows="1" placeholder="${this.copy.placeholder}"></textarea>
            <button type="submit" data-djai-chat-send>${this.copy.send}</button>
          </form>
        `;
        const toggle = this.card.querySelector("[data-djai-mode-toggle]");
        if (toggle?.after) toggle.after(panel);
        else this.card.appendChild(panel);
      }

      this.modeButtons = Array.from(this.card.querySelectorAll("[data-djai-mode]"));
      this.chatPanel = this.card.querySelector("[data-djai-chat-panel]");
      this.chatMessages = this.card.querySelector("[data-djai-chat-messages]");
      this.chatForm = this.card.querySelector("[data-djai-chat-form]");
      this.chatInput = this.card.querySelector("[data-djai-chat-input]");
      this.chatSend = this.card.querySelector("[data-djai-chat-send]");
    }

    switchMode(mode, options = {}) {
      const nextMode = mode === "voice" ? "voice" : "chat";
      if (nextMode === "chat" && !this.closed) {
        if (!options.silent) {
          window.alert(this.copy.endVoiceBeforeChat);
        }
        return;
      }

      this.mode = nextMode;
      this.card.classList.toggle("mode-chat", nextMode === "chat");
      this.card.classList.toggle("mode-voice", nextMode === "voice");
      this.modeButtons.forEach((button) => {
        button.setAttribute("aria-pressed", button.dataset.djaiMode === nextMode ? "true" : "false");
      });

      if (nextMode === "chat") {
        if (this.statusEl) this.statusEl.textContent = this.copy.readyChat;
        this.startChatIfNeeded();
      } else if (this.statusEl && this.closed) {
        this.statusEl.textContent = this.copy.readyVoice;
      }
    }

    addChatMessage(role, text) {
      const clean = String(text || "").trim();
      if (!clean || !this.chatMessages) return;
      const row = document.createElement("div");
      row.className = `djai-chat-message ${role}`;
      row.textContent = clean;
      this.chatMessages.appendChild(row);
      this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    setChatBusy(busy) {
      this.chatBusy = busy;
      if (this.chatSend) {
        this.chatSend.disabled = busy;
        this.chatSend.textContent = busy ? "…" : this.copy.send;
      }
    }

    async startChatIfNeeded() {
      if (this.chatSessionContext) return;
      if (this.chatStarting) return this.chatStarting;
      if (this.chatStarted) return;
      this.chatStarted = true;
      if (this.mode === "chat" && this.statusEl) this.statusEl.textContent = this.copy.connectingChat;
      this.chatStarting = (async () => {
        const response = await fetch(`${apiBase}/api/chat/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pageUrl: window.location.href, preferredLanguage: getSelectedLanguage() }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(this.copy.chatbotUnavailable);
        this.chatSessionContext = data.sessionContext;
        if (!this.chatHasUserMessages) {
          this.addChatMessage("assistant", data.greeting || this.copy.fallbackGreeting);
        }
        if (this.mode === "chat" && this.statusEl) this.statusEl.textContent = this.copy.readyChat;
      })();

      try {
        await this.chatStarting;
      } catch (error) {
        this.chatStarted = false;
        this.chatSessionContext = null;
        if (this.mode === "chat" && this.statusEl) this.statusEl.textContent = this.copy.chatbotUnavailable;
        this.addChatMessage("system", this.copy.chatbotUnavailable);
      } finally {
        this.chatStarting = null;
      }
    }

    async sendChatMessage() {
      if (this.chatBusy || !this.chatInput) return;
      const message = this.chatInput.value.trim();
      if (!message) return;
      this.chatHasUserMessages = true;
      this.chatInput.value = "";
      this.addChatMessage("user", message);
      this.setChatBusy(true);
      await this.startChatIfNeeded();
      if (!this.chatSessionContext) {
        this.setChatBusy(false);
        this.chatInput?.focus();
        return;
      }

      try {
        const response = await fetch(`${apiBase}/api/chat/message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionContext: this.chatSessionContext,
            message,
            pageUrl: window.location.href,
            preferredLanguage: getSelectedLanguage(),
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(this.copy.chatFailed);
        this.addChatMessage("assistant", data.reply || this.copy.fallbackReply);
        this.showBookingCta(data.booking);
      } catch (error) {
        this.addChatMessage("system", this.copy.chatFailed);
      } finally {
        this.setChatBusy(false);
        this.chatInput?.focus();
      }
    }

    endChat(options = {}) {
      if (!this.chatSessionContext) return;
      const body = { sessionContext: this.chatSessionContext };
      if (options.beacon) {
        const blob = new Blob([JSON.stringify(body)], { type: "text/plain" });
        navigator.sendBeacon?.(`${apiBase}/api/chat/end`, blob);
        return;
      }
      return fetch(`${apiBase}/api/chat/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(() => {});
    }

    setVisualState(state, label) {
      this.card.classList.remove("is-idle", "is-connecting", "is-listening", "is-speaking", "is-ended", "is-error");
      this.card.classList.add(`is-${state}`);
      if (this.statusEl) this.statusEl.textContent = label;
      if (this.stateEl && this.stateEl !== this.statusEl) this.stateEl.textContent = label;
    }

    addTranscript(role, text) {
      const clean = String(text || "").trim();
      if (!clean) return;
      this.transcript.push({ role, text: clean, t: Date.now() });
      if (!this.transcriptEl) return;
      const row = document.createElement("div");
      row.className = "voice-agent-line";
      const label = role === "user" ? this.copy.you : role === "assistant" ? "DJAI" : role === "tool" ? this.copy.tool : this.copy.system;
      row.innerHTML = `<strong>${label}</strong><br>${this.escape(clean)}`;
      this.transcriptEl.appendChild(row);
      this.transcriptEl.scrollTop = this.transcriptEl.scrollHeight;
    }

    escape(value) {
      return value.replace(/[&<>"']/g, (char) => {
        const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
        return entities[char];
      });
    }

    setActiveControls(active) {
      if (this.startButton) {
        this.startButton.disabled = active;
        this.startButton.hidden = active;
      }
      if (this.muteButton) this.muteButton.hidden = !active;
      if (this.endButton) this.endButton.hidden = !active;
    }

    showBookingCta(booking) {
      if (!this.bookingLink || !booking || !booking.available || !booking.url) return;
      const bookingUrl = new URL(booking.url, window.location.href);
      bookingUrl.searchParams.set("lang", getSelectedLanguage());
      this.bookingLink.href = bookingUrl.toString();
      this.bookingLink.hidden = false;
      this.bookingLink.textContent = this.copy.booking;
      this.addTranscript("system", this.copy.bookingReady);
    }

    startTimer(maxSeconds) {
      window.clearInterval(this.timer);
      window.clearTimeout(this.maxCallTimer);
      const render = () => {
        if (!this.timerEl || !this.startedAt) return;
        const seconds = Math.max(0, Math.round((Date.now() - this.startedAt) / 1000));
        const minutes = Math.floor(seconds / 60);
        const remainder = seconds % 60;
        this.timerEl.textContent = `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
      };
      render();
      this.timer = window.setInterval(render, 1000);
      if (maxSeconds > 0) {
        this.maxCallTimer = window.setTimeout(() => this.endCall(this.copy.callEnded), maxSeconds * 1000);
      }
    }

    sendEvent(event) {
      if (this.dc && this.dc.readyState === "open") {
        this.dc.send(JSON.stringify(event));
      }
    }

    sendGeminiEvent(event) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(event));
      }
    }

    async parseGeminiEventData(data) {
      if (typeof data === "string") {
        return JSON.parse(data);
      }

      if (data instanceof Blob) {
        return JSON.parse(await data.text());
      }

      if (data instanceof ArrayBuffer) {
        return JSON.parse(new TextDecoder().decode(data));
      }

      if (ArrayBuffer.isView(data)) {
        return JSON.parse(new TextDecoder().decode(data));
      }

      throw new Error("Unsupported Gemini message format.");
    }

    sendToolOutput(callId, output) {
      if (!callId) return;
      this.sendEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify(output),
        },
      });
      this.sendEvent({ type: "response.create" });
    }

    async postLead(callId, args) {
      this.addTranscript(
        "tool",
        `capture_lead: ${args.name || this.copy.visitor} | ${args.contact || this.copy.contactProvided} | ${args.need || this.copy.needCaptured}`,
      );

      try {
        const response = await fetch(`${apiBase}/api/lead`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionContext: this.sessionContext, lead: args }),
        });
        const result = await response.json().catch(() => ({}));

        this.sendToolOutput(callId, {
          ok: response.ok,
          leadId: result.leadId || null,
          bookingAvailable: Boolean(result.booking?.available),
          error: response.ok ? null : result.error || "Lead capture failed.",
        });

        if (response.ok) {
          this.showBookingCta(result.booking);
          this.addTranscript("system", this.copy.detailsSent);
          return;
        }

        this.addTranscript("system", this.copy.detailsFailed);
      } catch {
        this.sendToolOutput(callId, { ok: false, leadId: null, error: "Lead capture request failed." });
        this.addTranscript("system", this.copy.detailsFailed);
      }
    }

    async postGeminiLead(callId, name, args) {
      this.addTranscript(
        "tool",
        `capture_lead: ${args.name || this.copy.visitor} | ${args.contact || this.copy.contactProvided} | ${args.need || this.copy.needCaptured}`,
      );

      let output = { ok: false, leadId: null, error: "Lead capture failed." };

      try {
        const response = await fetch(`${apiBase}/api/lead`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionContext: this.sessionContext, lead: args }),
        });
        const result = await response.json().catch(() => ({}));
        output = {
          ok: response.ok,
          leadId: result.leadId || null,
          bookingAvailable: Boolean(result.booking?.available),
          error: response.ok ? null : result.error || "Lead capture failed.",
        };

        if (response.ok) {
          this.showBookingCta(result.booking);
          this.addTranscript("system", this.copy.detailsSent);
        } else {
          this.addTranscript("system", this.copy.detailsFailed);
        }
      } catch {
        output = { ok: false, leadId: null, error: "Lead capture request failed." };
        this.addTranscript("system", this.copy.detailsFailed);
      }

      this.sendGeminiEvent({
        toolResponse: {
          functionResponses: [
            {
              id: callId,
              name,
              response: output,
            },
          ],
        },
      });
    }

    handleToolCall(callId, argumentText) {
      if (!callId || this.processedToolCalls.has(callId)) {
        return;
      }

      this.processedToolCalls.add(callId);

      let args = {};
      try {
        args = JSON.parse(argumentText || "{}");
      } catch {
        this.sendToolOutput(callId, { ok: false, leadId: null, error: "Invalid lead arguments." });
        this.addTranscript("system", this.copy.invalidDetails);
        return;
      }

      this.postLead(callId, args);
    }

    handleGeminiToolCall(functionCall) {
      const callId = functionCall.id || `${functionCall.name || "capture_lead"}-${Date.now()}`;
      const name = functionCall.name || "capture_lead";

      if (name !== "capture_lead" || this.processedToolCalls.has(callId)) {
        return;
      }

      this.processedToolCalls.add(callId);
      this.postGeminiLead(callId, name, functionCall.args || {});
    }

    maybeHandleToolCall(event) {
      if (event.type === "response.function_call_arguments.delta" && event.call_id) {
        this.functionArgs.set(event.call_id, (this.functionArgs.get(event.call_id) || "") + (event.delta || ""));
        return;
      }

      if (event.type === "response.function_call_arguments.done" && event.call_id) {
        this.functionArgs.set(event.call_id, event.arguments || this.functionArgs.get(event.call_id) || "{}");
        this.handleToolCall(event.call_id, this.functionArgs.get(event.call_id) || "{}");
        return;
      }

      const output = Array.isArray(event.response?.output) ? event.response.output : [];
      const item = event.item || output.find((candidate) => candidate.type === "function_call");
      if (item && item.type === "function_call" && item.name === "capture_lead") {
        const callId = item.call_id || item.id;
        this.handleToolCall(callId, item.arguments || this.functionArgs.get(callId) || "{}");
      }
    }

    handleServerEvent(event) {
      if (event.type === "error") {
        this.addTranscript("system", this.copy.callInterrupted);
        this.endCall(this.copy.callInterrupted);
        return;
      }

      if (event.type === "input_audio_buffer.speech_started") {
        this.setVisualState("listening", this.copy.listening);
      }

      if (event.type === "response.output_audio.delta" || event.type === "response.audio.delta") {
        this.setVisualState("speaking", this.copy.speaking);
      }

      if (event.type === "response.done") {
        this.setVisualState("listening", this.copy.listening);
      }

      if (event.type === "conversation.item.input_audio_transcription.completed") {
        this.addTranscript("user", event.transcript);
      }

      if (event.type === "response.output_audio_transcript.done" || event.type === "response.audio_transcript.done") {
        this.addTranscript("assistant", event.transcript);
      }

      this.maybeHandleToolCall(event);
    }

    base64FromArrayBuffer(buffer) {
      const bytes = new Uint8Array(buffer);
      let binary = "";
      const chunkSize = 0x8000;

      for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunkSize));
      }

      return btoa(binary);
    }

    downsampleTo16Khz(input, inputRate) {
      if (inputRate === 16000) {
        return input;
      }

      const ratio = inputRate / 16000;
      const outputLength = Math.floor(input.length / ratio);
      const output = new Float32Array(outputLength);

      for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
        const start = Math.floor(outputIndex * ratio);
        const end = Math.min(Math.floor((outputIndex + 1) * ratio), input.length);
        let sum = 0;
        let count = 0;

        for (let inputIndex = start; inputIndex < end; inputIndex += 1) {
          sum += input[inputIndex];
          count += 1;
        }

        output[outputIndex] = count ? sum / count : input[start] || 0;
      }

      return output;
    }

    pcm16FromFloat32(input) {
      const buffer = new ArrayBuffer(input.length * 2);
      const view = new DataView(buffer);

      for (let index = 0; index < input.length; index += 1) {
        const sample = Math.max(-1, Math.min(1, input[index]));
        view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      }

      return buffer;
    }

    stopGeminiPlayback() {
      this.geminiAudioSources.forEach((source) => {
        try {
          source.stop();
        } catch {
        }
      });
      this.geminiAudioSources.clear();

      if (this.playbackAudioContext) {
        this.playbackCursor = this.playbackAudioContext.currentTime;
      } else {
        this.playbackCursor = 0;
      }
    }

    playGeminiAudio(base64Audio) {
      if (!base64Audio) return;

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      if (!this.playbackAudioContext) {
        this.playbackAudioContext = new AudioContextClass({ sampleRate: 24000 });
        this.playbackCursor = this.playbackAudioContext.currentTime;
      }

      const binary = atob(base64Audio);
      const pcm = new Int16Array(binary.length / 2);

      for (let index = 0; index < pcm.length; index += 1) {
        const low = binary.charCodeAt(index * 2);
        const high = binary.charCodeAt(index * 2 + 1);
        const value = (high << 8) | low;
        pcm[index] = value >= 0x8000 ? value - 0x10000 : value;
      }

      const audioBuffer = this.playbackAudioContext.createBuffer(1, pcm.length, 24000);
      const channel = audioBuffer.getChannelData(0);

      for (let index = 0; index < pcm.length; index += 1) {
        channel[index] = pcm[index] / 0x8000;
      }

      const source = this.playbackAudioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.playbackAudioContext.destination);
      this.geminiAudioSources.add(source);
      source.onended = () => {
        this.geminiAudioSources.delete(source);
      };

      const startAt = Math.max(this.playbackCursor, this.playbackAudioContext.currentTime + 0.02);
      source.start(startAt);
      this.playbackCursor = startAt + audioBuffer.duration;
    }

    handleGeminiMessage(message) {
      if (message.setupComplete) {
        this.setVisualState("listening", this.copy.listening);
        this.setActiveControls(true);
        this.startGeminiAudioInput();
        this.sendGeminiEvent({
          clientContent: {
            turns: [
              {
                role: "user",
                parts: [{ text: "Start the conversation now with the configured greeting. Keep it short." }],
              },
            ],
            turnComplete: true,
          },
        });
        return;
      }

      if (message.serverContent) {
        const content = message.serverContent;

        if (content.interrupted) {
          this.stopGeminiPlayback();
        }

        if (content.inputTranscription?.text) {
          this.addTranscript("user", content.inputTranscription.text);
        }

        if (content.outputTranscription?.text) {
          this.addTranscript("assistant", content.outputTranscription.text);
        }

        const parts = Array.isArray(content.modelTurn?.parts) ? content.modelTurn.parts : [];
        parts.forEach((part) => {
          const inlineData = part.inlineData || part.inline_data;
          if (inlineData?.data && String(inlineData.mimeType || inlineData.mime_type || "").includes("audio")) {
            this.setVisualState("speaking", this.copy.speaking);
            this.playGeminiAudio(inlineData.data);
          }
        });

        if (content.turnComplete) {
          this.setVisualState("listening", this.copy.listening);
        }
      }

      if (message.toolCall?.functionCalls) {
        message.toolCall.functionCalls.forEach((functionCall) => this.handleGeminiToolCall(functionCall));
      }

      if (message.goAway) {
        this.addTranscript("system", this.copy.callClosing);
        this.endCall(this.copy.callClosing);
      }
    }

    startGeminiAudioInput() {
      if (!this.localStream || this.inputAudioProcessor) return;

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error(this.copy.microphoneUnsupported);
      }

      this.inputAudioContext = new AudioContextClass();
      this.inputAudioSource = this.inputAudioContext.createMediaStreamSource(this.localStream);
      this.inputAudioProcessor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);
      this.inputAudioProcessor.onaudioprocess = (event) => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.muted) return;

        const input = event.inputBuffer.getChannelData(0);
        const downsampled = this.downsampleTo16Khz(input, this.inputAudioContext.sampleRate);
        const pcm = this.pcm16FromFloat32(downsampled);

        this.sendGeminiEvent({
          realtimeInput: {
            audio: {
              data: this.base64FromArrayBuffer(pcm),
              mimeType: "audio/pcm;rate=16000",
            },
          },
        });
      };
      this.inputAudioSource.connect(this.inputAudioProcessor);
      this.inputAudioProcessor.connect(this.inputAudioContext.destination);
    }

    async startGeminiSession(tokenData) {
      if (!tokenData.gemini?.websocketUrl) {
        throw new Error(this.copy.voiceUnavailable);
      }

      await new Promise((resolve, reject) => {
        let settled = false;
        const timeout = window.setTimeout(() => {
          if (!settled) {
            settled = true;
            reject(new Error(this.copy.voiceUnavailable));
          }
        }, 10000);

        this.ws = new WebSocket(tokenData.gemini.websocketUrl);
        this.ws.addEventListener("open", () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          const modelId = tokenData.modelId || "gemini-3.1-flash-live-preview";
          this.sendGeminiEvent({
            setup: {
              model: modelId.startsWith("models/") ? modelId : `models/${modelId}`,
            },
          });
          resolve();
        });
        this.ws.addEventListener("message", async (event) => {
          try {
            this.handleGeminiMessage(await this.parseGeminiEventData(event.data));
          } catch {
            this.addTranscript("system", this.copy.callInterrupted);
            this.endCall(this.copy.callInterrupted);
          }
        });
        this.ws.addEventListener("close", () => {
          if (!this.closed) {
            this.addTranscript("system", this.copy.callClosed);
            this.endCall(this.copy.callClosed);
          }
        });
        this.ws.addEventListener("error", () => {
          if (!settled) {
            settled = true;
            window.clearTimeout(timeout);
            reject(new Error(this.copy.voiceUnavailable));
            return;
          }

          if (!this.closed) {
            this.addTranscript("system", this.copy.connectionInterrupted);
            this.endCall(this.copy.connectionInterrupted);
          }
        });
      });
    }

    async startCall() {
      if (this.pc || this.ws || !this.startButton) return;

      this.closed = false;
      this.transcript = [];
      this.functionArgs = new Map();
      this.processedToolCalls = new Set();
      if (this.bookingLink) {
        this.bookingLink.hidden = true;
        this.bookingLink.removeAttribute("href");
      }
      if (this.transcriptEl) this.transcriptEl.innerHTML = "";
      this.setVisualState("connecting", this.copy.connecting);
      this.startButton.disabled = true;

      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });

        const tokenResponse = await fetch(`${apiBase}/api/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pageUrl: window.location.href, preferredLanguage: getSelectedLanguage() }),
        });
        const tokenData = await tokenResponse.json().catch(() => ({}));

        if (!tokenResponse.ok) {
          throw new Error(this.copy.voiceUnavailable);
        }

        this.sessionContext = tokenData.sessionContext;
        this.startedAt = Date.now();

        if (tokenData.provider === "gemini") {
          await this.startGeminiSession(tokenData);
          this.startTimer(Number(tokenData.maxCallSeconds || 0));
          return;
        }

        const token = getClientSecret(tokenData);
        if (!token) {
          throw new Error(this.copy.voiceUnavailable);
        }

        this.pc = new RTCPeerConnection();
        this.audioEl = document.createElement("audio");
        this.audioEl.autoplay = true;
        this.audioEl.playsInline = true;
        this.audioEl.setAttribute("aria-hidden", "true");
        this.audioEl.style.position = "fixed";
        this.audioEl.style.width = "1px";
        this.audioEl.style.height = "1px";
        this.audioEl.style.opacity = "0";
        this.audioEl.style.pointerEvents = "none";
        document.body.appendChild(this.audioEl);
        this.pc.ontrack = (event) => {
          this.audioEl.srcObject = event.streams[0];
          this.audioEl.play().catch(() => {});
        };
        this.pc.addEventListener("connectionstatechange", () => {
          const state = this.pc?.connectionState;
          if (!this.closed && (state === "failed" || state === "disconnected" || state === "closed")) {
            this.addTranscript("system", this.copy.audioInterrupted);
            this.endCall(this.copy.audioInterrupted);
          }
        });

        this.pc.addTrack(this.localStream.getTracks()[0], this.localStream);
        this.dc = this.pc.createDataChannel("oai-events");
        this.dc.addEventListener("open", () => {
          this.setVisualState("listening", this.copy.listening);
          this.setActiveControls(true);
          this.sendEvent({ type: "response.create" });
        });
        this.dc.addEventListener("message", (message) => {
          try {
            this.handleServerEvent(JSON.parse(message.data));
          } catch {
            this.addTranscript("system", this.copy.callInterrupted);
            this.endCall(this.copy.callInterrupted);
          }
        });
        this.dc.addEventListener("close", () => {
          if (!this.closed) {
            this.addTranscript("system", this.copy.callClosed);
            this.endCall(this.copy.callClosed);
          }
        });
        this.dc.addEventListener("error", () => {
          if (!this.closed) {
            this.addTranscript("system", this.copy.connectionInterrupted);
            this.endCall(this.copy.connectionInterrupted);
          }
        });

        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);

        const sdpResponse = await fetch(realtimeUrl, {
          method: "POST",
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/sdp",
          },
        });

        if (!sdpResponse.ok) {
          throw new Error(this.copy.voiceUnavailable);
        }

        await this.pc.setRemoteDescription({
          type: "answer",
          sdp: await sdpResponse.text(),
        });
        this.startTimer(Number(tokenData.maxCallSeconds || 0));
      } catch (error) {
        const message = error instanceof DOMException && error.name === "NotAllowedError"
          ? this.copy.microphoneBlocked
          : error instanceof Error
            ? error.message
            : this.copy.voiceUnavailable;
        this.addTranscript("system", message);
        await this.endCall(this.copy.voiceUnavailable, { save: false });
      } finally {
        if (this.startButton && !this.pc && !this.ws) {
          this.startButton.disabled = false;
          this.startButton.hidden = false;
        }
      }
    }

    async checkStatus() {
      try {
        const response = await fetch(`${apiBase}/api/session`, {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok && data.agentEnabled === false) {
          this.setVisualState("ended", this.copy.voiceOffline);
          if (this.startButton) this.startButton.disabled = true;
        }
      } catch {
        this.setVisualState("idle", this.copy.readyVoice);
      }
    }

    toggleMute() {
      if (!this.localStream) return;
      this.muted = !this.muted;
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !this.muted;
      });
      if (this.muteButton) this.muteButton.textContent = this.muted ? this.copy.unmute : this.copy.mute;
      this.setVisualState("listening", this.muted ? this.copy.muted : this.copy.listening);
    }

    async saveConversation() {
      if (!this.sessionContext) return;
      const body = {
        sessionContext: this.sessionContext,
        duration_seconds: this.startedAt ? Math.round((Date.now() - this.startedAt) / 1000) : 0,
        language: inferLanguage(this.transcript),
        page_url: window.location.href,
        transcript: this.transcript,
      };

      const blob = new Blob([JSON.stringify(body)], { type: "text/plain" });
      if (!navigator.sendBeacon || !navigator.sendBeacon(`${apiBase}/api/conversation`, blob)) {
        await fetch(`${apiBase}/api/conversation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          keepalive: true,
        }).catch(() => {});
      }
    }

    async endCall(label = this.copy.callEnded, options = {}) {
      if (this.closed) return;
      this.closed = true;
      window.clearInterval(this.timer);
      window.clearTimeout(this.maxCallTimer);
      this.setVisualState(label === this.copy.voiceUnavailable ? "error" : "ended", label);
      this.setActiveControls(false);

      if (this.localStream) {
        this.localStream.getTracks().forEach((track) => track.stop());
      }
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendGeminiEvent({ realtimeInput: { audioStreamEnd: true } });
      }
      if (this.dc) this.dc.close();
      if (this.pc) this.pc.close();
      if (this.ws) this.ws.close();
      if (this.inputAudioProcessor) this.inputAudioProcessor.disconnect();
      if (this.inputAudioSource) this.inputAudioSource.disconnect();
      if (this.inputAudioContext) await this.inputAudioContext.close().catch(() => {});
      this.stopGeminiPlayback();
      if (this.playbackAudioContext) await this.playbackAudioContext.close().catch(() => {});
      if (this.audioEl) this.audioEl.remove();

      this.pc = null;
      this.dc = null;
      this.ws = null;
      this.localStream = null;
      this.audioEl = null;
      this.inputAudioContext = null;
      this.inputAudioSource = null;
      this.inputAudioProcessor = null;
      this.playbackAudioContext = null;
      this.playbackCursor = 0;
      this.geminiAudioSources.clear();
      this.muted = false;
      if (this.muteButton) this.muteButton.textContent = this.copy.mute;
      if (this.startButton) {
        this.startButton.disabled = false;
        this.startButton.hidden = false;
      }

      if (options.save !== false) {
        await this.saveConversation();
      }
    }
  }

  function mount() {
    const inlineTargets = Array.from(document.querySelectorAll("[data-djai-voice-inline]"));
    inlineTargets.forEach((target) => {
      if (!target.dataset.djAiMounted) {
        target.dataset.djAiMounted = "true";
        controllers.push(new VoiceController(target));
      }
    });

    if (mode !== "inline" && !document.getElementById("djai-voice-agent")) {
      controllers.push(new VoiceController(createFloatingContainer()));
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }

  window.DJAIVoiceAgent = {
    mount,
    controllers,
  };
})();
