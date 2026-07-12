(function () {
  const script = document.currentScript;
  const apiBase = (script && script.dataset.apiBase) || new URL(script.src).origin;
  const mode = (script && script.dataset.mode) || "floating";
  const realtimeUrl = "https://api.openai.com/v1/realtime/calls";
  const controllers = [];

  function createFloatingContainer() {
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
      </style>
      <div class="djai-floating-card" role="region" aria-label="DJAI voice sales agent">
        <div class="djai-floating-top">
          <div class="djai-floating-mark" aria-hidden="true">DJ</div>
          <div>
            <p class="djai-floating-title">Talk to DJAI</p>
            <div class="djai-floating-status" data-djai-status>Ready to talk</div>
          </div>
        </div>
        <div class="djai-floating-actions">
          <button type="button" data-djai-start>Start voice call</button>
          <button type="button" data-djai-mute hidden>Mute</button>
          <button type="button" data-djai-end hidden>End</button>
        </div>
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

  class VoiceController {
    constructor(container) {
      this.container = container;
      this.card = container;
      this.statusEl = container.querySelector("[data-djai-status]");
      this.stateEl = container.querySelector("[data-djai-state]") || this.statusEl;
      this.timerEl = container.querySelector("[data-djai-timer]");
      this.startButton = container.querySelector("[data-djai-start]");
      this.muteButton = container.querySelector("[data-djai-mute]");
      this.endButton = container.querySelector("[data-djai-end]");
      this.transcriptEl = container.querySelector("[data-djai-transcript]");
      this.pc = null;
      this.dc = null;
      this.localStream = null;
      this.audioEl = null;
      this.sessionContext = null;
      this.startedAt = 0;
      this.transcript = [];
      this.functionArgs = new Map();
      this.closed = true;
      this.muted = false;
      this.timer = 0;
      this.maxCallTimer = 0;

      this.startButton?.addEventListener("click", () => this.startCall());
      this.muteButton?.addEventListener("click", () => this.toggleMute());
      this.endButton?.addEventListener("click", () => this.endCall("Ended"));
      window.addEventListener("pagehide", () => {
        if (!this.closed && this.sessionContext) {
          this.saveConversation();
        }
      });
      this.checkStatus();
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
      const label = role === "user" ? "You" : role === "assistant" ? "DJAI" : "System";
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
        this.maxCallTimer = window.setTimeout(() => this.endCall("Call ended"), maxSeconds * 1000);
      }
    }

    sendEvent(event) {
      if (this.dc && this.dc.readyState === "open") {
        this.dc.send(JSON.stringify(event));
      }
    }

    async postLead(callId, args) {
      const response = await fetch(`${apiBase}/api/lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionContext: this.sessionContext, lead: args }),
      });
      const result = await response.json().catch(() => ({}));

      this.sendEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify({ ok: response.ok, leadId: result.leadId || null }),
        },
      });
      this.sendEvent({ type: "response.create" });

      if (response.ok) {
        this.addTranscript("system", "Your details were sent to DJAI for follow-up.");
      } else {
        this.addTranscript("system", "DJAI could not save those details yet. Please repeat the contact information.");
      }
    }

    maybeHandleToolCall(event) {
      if (event.type === "response.function_call_arguments.delta" && event.call_id) {
        this.functionArgs.set(event.call_id, (this.functionArgs.get(event.call_id) || "") + (event.delta || ""));
        return;
      }

      if (event.type === "response.function_call_arguments.done" && event.call_id) {
        this.functionArgs.set(event.call_id, event.arguments || this.functionArgs.get(event.call_id) || "{}");
        const args = JSON.parse(this.functionArgs.get(event.call_id) || "{}");
        this.postLead(event.call_id, args).catch(() => {
          this.addTranscript("system", "DJAI could not save those details yet. Please repeat the contact information.");
        });
        return;
      }

      const output = Array.isArray(event.response?.output) ? event.response.output : [];
      const item = event.item || output.find((candidate) => candidate.type === "function_call");
      if (item && item.type === "function_call" && item.name === "capture_lead") {
        const callId = item.call_id || item.id;
        const args = JSON.parse(item.arguments || this.functionArgs.get(callId) || "{}");
        this.postLead(callId, args).catch(() => {
          this.addTranscript("system", "DJAI could not save those details yet. Please repeat the contact information.");
        });
      }
    }

    handleServerEvent(event) {
      if (event.type === "error") {
        this.setVisualState("error", "Call interrupted. Please try again.");
        return;
      }

      if (event.type === "input_audio_buffer.speech_started") {
        this.setVisualState("listening", "Listening");
      }

      if (event.type === "response.output_audio.delta" || event.type === "response.audio.delta") {
        this.setVisualState("speaking", "Speaking");
      }

      if (event.type === "response.done") {
        this.setVisualState("listening", "Listening");
      }

      if (event.type === "conversation.item.input_audio_transcription.completed") {
        this.addTranscript("user", event.transcript);
      }

      if (event.type === "response.output_audio_transcript.done" || event.type === "response.audio_transcript.done") {
        this.addTranscript("assistant", event.transcript);
      }

      this.maybeHandleToolCall(event);
    }

    async startCall() {
      if (this.pc || !this.startButton) return;

      this.closed = false;
      this.transcript = [];
      this.functionArgs = new Map();
      if (this.transcriptEl) this.transcriptEl.innerHTML = "";
      this.setVisualState("connecting", "Connecting");
      this.startButton.disabled = true;

      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });

        const tokenResponse = await fetch(`${apiBase}/api/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pageUrl: window.location.href }),
        });
        const tokenData = await tokenResponse.json().catch(() => ({}));

        if (!tokenResponse.ok) {
          throw new Error(tokenData.error || "Voice agent is unavailable.");
        }

        const token = getClientSecret(tokenData);
        if (!token) {
          throw new Error("Voice agent is unavailable.");
        }

        this.sessionContext = tokenData.sessionContext;
        this.startedAt = Date.now();
        this.pc = new RTCPeerConnection();
        this.audioEl = document.createElement("audio");
        this.audioEl.autoplay = true;
        this.pc.ontrack = (event) => {
          this.audioEl.srcObject = event.streams[0];
        };

        this.pc.addTrack(this.localStream.getTracks()[0]);
        this.dc = this.pc.createDataChannel("oai-events");
        this.dc.addEventListener("open", () => {
          this.setVisualState("listening", "Listening");
          this.setActiveControls(true);
          this.sendEvent({ type: "response.create" });
        });
        this.dc.addEventListener("message", (message) => {
          try {
            this.handleServerEvent(JSON.parse(message.data));
          } catch {
            this.setVisualState("error", "Call interrupted. Please try again.");
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
          throw new Error("Voice agent is unavailable.");
        }

        await this.pc.setRemoteDescription({
          type: "answer",
          sdp: await sdpResponse.text(),
        });
        this.startTimer(Number(tokenData.maxCallSeconds || 0));
      } catch (error) {
        this.addTranscript("system", error instanceof Error ? error.message : "Voice agent is unavailable.");
        await this.endCall("Voice agent unavailable", { save: false });
      } finally {
        if (this.startButton && !this.pc) {
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
        if (!response.ok || data.agentEnabled === false) {
          this.setVisualState("ended", "Voice agent is offline");
          if (this.startButton) this.startButton.disabled = true;
        }
      } catch {
        this.setVisualState("ended", "Voice agent is offline");
        if (this.startButton) this.startButton.disabled = true;
      }
    }

    toggleMute() {
      if (!this.localStream) return;
      this.muted = !this.muted;
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !this.muted;
      });
      if (this.muteButton) this.muteButton.textContent = this.muted ? "Unmute" : "Mute";
      this.setVisualState(this.muted ? "listening" : "listening", this.muted ? "Muted" : "Listening");
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

    async endCall(label = "Ended", options = {}) {
      if (this.closed) return;
      this.closed = true;
      window.clearInterval(this.timer);
      window.clearTimeout(this.maxCallTimer);
      this.setVisualState(label === "Voice agent unavailable" ? "error" : "ended", label);
      this.setActiveControls(false);

      if (this.localStream) {
        this.localStream.getTracks().forEach((track) => track.stop());
      }
      if (this.dc) this.dc.close();
      if (this.pc) this.pc.close();

      this.pc = null;
      this.dc = null;
      this.localStream = null;
      this.audioEl = null;
      this.muted = false;
      if (this.muteButton) this.muteButton.textContent = "Mute";
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
