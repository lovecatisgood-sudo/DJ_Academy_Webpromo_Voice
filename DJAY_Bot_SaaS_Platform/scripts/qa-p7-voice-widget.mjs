import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const widgetSource = readFileSync(resolve(import.meta.dirname, "../packages/voice-widget/dist/djay-voice-widget.js"), "utf8");
const restricted = /\b(openai|anthropic|claude|gemini|gpt-[0-9]|provider[_ -]?(?:key|name|id)|model[_ -]?id)\b/i;
const browser = await chromium.launch({ headless: true });
const failures = [];
const tenantUrl = process.env.P7_TENANT_QA_URL;

async function installBrowserFakes(page, microphoneDenied = false) {
  await page.addInitScript(({ denied }) => {
    const track = { enabled: true, stopped: false, stop() { this.stopped = true; } };
    Object.defineProperty(window, "__voiceTrack", { value: track });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { async getUserMedia() {
        if (denied) throw new DOMException("Denied", "NotAllowedError");
        return { getTracks: () => [track], getAudioTracks: () => [track] };
      } },
    });
    class FakeAudioContext {
      constructor(options = {}) { this.sampleRate = options.sampleRate || 48000; this.currentTime = 0; this.destination = {}; }
      createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
      createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
      createScriptProcessor() {
        const processor = { onaudioprocess: null, connect() {}, disconnect() {} };
        Object.defineProperty(window, "__voiceProcessor", { configurable: true, value: processor });
        return processor;
      }
      createBuffer(channels, length, sampleRate) {
        const data = new Float32Array(length);
        return { duration: length / sampleRate, getChannelData: () => data };
      }
      createBufferSource() {
        return { buffer: null, onended: null, connect() {}, start() { setTimeout(() => this.onended?.(), 0); }, stop() {} };
      }
      async resume() {} async close() {}
    }
    class FakeWebSocket {
      static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
      readyState = 0; binaryType = "blob"; onopen = null; onmessage = null; onerror = null; onclose = null;
      constructor(url, protocol) {
        this.url = url; this.protocol = protocol;
        setTimeout(() => { this.readyState = 1; this.onopen?.({}); }, 0);
      }
      send(raw) {
        const message = JSON.parse(raw);
        (window.__voiceFrames ||= []).push(message);
        const emit = (value) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(value) }), 0);
        if (message.type === "session.connect") emit({
          type: "session.connected", messageId: crypto.randomUUID(), sessionId: message.sessionId,
          resumed: message.reconnectAttempt > 0, outputAudioEncoding: "pcm_s16le_24000",
        });
        if (message.type === "session.ready") {
          setTimeout(() => window.__voiceProcessor?.onaudioprocess?.({
            inputBuffer: { getChannelData: () => new Float32Array(4096).fill(0.1) },
          }), 0);
          emit({ type: "transcript.delta", messageId: crypto.randomUUID(), speaker: "agent", text: "Hello, how can I help?" });
          emit({ type: "assistant.speech.started", messageId: crypto.randomUUID() });
          setTimeout(() => emit({ type: "assistant.speech.ended", messageId: crypto.randomUUID() }), 20);
        }
        if (message.type === "session.end") {
          emit({ type: "session.ended", messageId: crypto.randomUUID(), reason: "completed" });
          setTimeout(() => this.close(1000, "session_ended"), 20);
        }
      }
      close(code = 1000, reason = "") {
        if (this.readyState >= 2) return;
        this.readyState = 3; setTimeout(() => this.onclose?.({ code, reason }), 0);
      }
    }
    Object.defineProperty(window, "AudioContext", { configurable: true, value: FakeAudioContext });
    Object.defineProperty(window, "WebSocket", { configurable: true, value: FakeWebSocket });
    window.fetch = async (url) => {
      if (!String(url).endsWith("/public/voice/session")) return new Response("", { status: 404 });
      return new Response(JSON.stringify({ status: "issued", grant: {
        sessionId: "10000000-0000-4000-8000-000000000001",
        sessionGrant: `djay_voice_grant_${"a".repeat(48)}`,
        gatewayUrl: "wss://voice.example.test/v1/connect", protocolVersion: "djay.voice.v1",
        capabilityProfile: "voice_gen1", publicLabel: "First-Generation Voice Engine",
        expiresAt: new Date(Date.now() + 60_000).toISOString(), maxCallSeconds: 900,
        locale: "en", greeting: "Hello, how can I help?",
        reconnectPolicy: { maxAttempts: 3, backoffMs: 100, resumeWindowSeconds: 30 },
        automatedAgentDisclosure: { required: true, text: "This is our automated voice assistant." },
        recording: { enabled: false, disclosure: null },
      } }), { status: 201, headers: { "content-type": "application/json" } });
    };
  }, { denied: microphoneDenied });
}

async function openFixture(page, language = "en") {
  await page.route("https://merchant.example/", (route) => route.fulfill({
    status: 200, contentType: "text/html",
    body: `<!doctype html><html><meta name="viewport" content="width=device-width"><body><main><h1>Merchant storefront</h1></main><script src="https://widget.example/voice.js"></script><script>DJAYVoice.mountVoiceWidget({deploymentKey:"djay_voice_deploy_abcdefghijklmnopqrstuvwxyz123456",apiBaseUrl:"https://api.example",openOnLoad:true,language:"${language}"})</script></body></html>`,
  }));
  await page.route("https://widget.example/voice.js", (route) => route.fulfill({
    status: 200, contentType: "text/javascript", headers: { "Access-Control-Allow-Origin": "*" }, body: widgetSource,
  }));
  await page.goto("https://merchant.example/", { waitUntil: "networkidle" });
  return page.locator("[data-djay-voice]");
}

async function inspectHappyPath(viewport, label) {
  const context = await browser.newContext({ viewport }); const page = await context.newPage();
  page.on("pageerror", (error) => failures.push(`${label}: page error ${error.message}`));
  page.on("console", (entry) => { if (entry.type() === "error") failures.push(`${label}: console ${entry.text()}`); });
  await installBrowserFakes(page);
  const host = await openFixture(page); await host.waitFor({ state: "attached" });
  await host.getByRole("button", { name: "Start voice conversation" }).click();
  await host.getByText("Listening", { exact: true }).waitFor();
  await host.getByText("Hello, how can I help?", { exact: false }).waitFor();
  await page.screenshot({ path: `/tmp/djay-p7-voice-${label}-active.png`, fullPage: true });
  await host.locator("button.launcher").click();
  await host.getByText("End the active voice conversation?", { exact: true }).waitFor();
  await host.getByRole("button", { name: "Keep talking" }).click();
  await host.getByRole("button", { name: "Mute microphone" }).click();
  await host.getByRole("button", { name: "End conversation" }).click();
  await host.getByText("End the active voice conversation?", { exact: true }).waitFor();
  await host.getByRole("button", { name: "End conversation" }).click();
  await host.getByText("Conversation ended", { exact: true }).waitFor();
  const result = await page.evaluate(() => {
    const host = document.querySelector("[data-djay-voice]"); const root = host?.shadowRoot;
    return {
      text: root?.textContent ?? "", width: document.documentElement.scrollWidth, viewport: innerWidth,
      unnamedButtons: [...(root?.querySelectorAll("button") ?? [])].filter((button) => !button.getAttribute("aria-label")).length,
      trackStopped: Boolean(window.__voiceTrack?.stopped),
      connectEncoding: window.__voiceFrames?.find((frame) => frame.type === "session.connect")?.inputAudioEncoding,
      audioChunks: window.__voiceFrames?.filter((frame) => frame.type === "audio.chunk").length || 0,
    };
  });
  if (result.width > result.viewport + 1) failures.push(`${label}: horizontal overflow ${result.width}/${result.viewport}`);
  if (result.unnamedButtons) failures.push(`${label}: ${result.unnamedButtons} unnamed buttons`);
  if (!result.trackStopped) failures.push(`${label}: microphone track was not stopped`);
  if (result.connectEncoding !== "pcm_s16le_16000") failures.push(`${label}: unexpected input encoding ${result.connectEncoding}`);
  if (!result.audioChunks) failures.push(`${label}: no PCM microphone frame reached the gateway`);
  if (restricted.test(result.text)) failures.push(`${label}: restricted routing identity visible`);
  await page.screenshot({ path: `/tmp/djay-p7-voice-${label}.png`, fullPage: true });
  await context.close();
}

async function inspectPermissionDenied() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await context.newPage();
  await installBrowserFakes(page, true); const host = await openFixture(page); await host.waitFor({ state: "attached" });
  await host.getByRole("button", { name: "Start voice conversation" }).click();
  await host.getByText("Microphone permission was not granted.", { exact: true }).waitFor();
  if (!(await host.getByRole("button", { name: "Try again" }).isVisible())) failures.push("permission: retry control missing");
  await context.close();
}

async function inspectThai() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await context.newPage();
  await installBrowserFakes(page); const host = await openFixture(page, "th"); await host.waitFor({ state: "attached" });
  await host.getByRole("button", { name: "เริ่มสนทนาด้วยเสียง" }).waitFor();
  await host.getByText("พร้อมเมื่อคุณพร้อม", { exact: true }).waitFor();
  await page.screenshot({ path: "/tmp/djay-p7-voice-thai.png", fullPage: true });
  await context.close();
}

async function inspectTenantWorkspace() {
  if (!tenantUrl) return;
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } }); const page = await context.newPage();
  let createCalls = 0; let revokeCalls = 0;
  const workspace = { tenantId: "20000000-0000-4000-8000-000000000001", slug: "voice-studio", businessName: "Voice Studio", role: "tenant_master_admin" };
  const deployment = { id: "30000000-0000-4000-8000-000000000001", name: "Main website", agentName: "Mali", businessName: "Merchant Store", keyPrefix: "djay_voice_deploy_ab", allowedOrigins: ["https://merchant.example"], defaultLocale: "en", maxCallSeconds: 900, reconnectWindowSeconds: 30, status: "active" };
  await page.route("**/tenant/**", async (route) => {
    const path = new URL(route.request().url()).pathname; const method = route.request().method();
    const respond = (value, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    if (path === "/tenant/session") return respond({ user: { id: "owner", displayName: "Voice Owner" }, workspaces: [workspace], selectedTenantId: workspace.tenantId, mfaVerifiedAt: new Date().toISOString() });
    if (path === "/tenant/support-access") return respond({ grants: [] });
    if (path === "/tenant/voice/deployments" && method === "GET") return respond({ capability: { enabled: true, publicLabel: "First-Generation Voice Engine" }, deployments: [deployment] });
    if (path === "/tenant/voice/deployments" && method === "POST") {
      createCalls += 1;
      return respond({ status: "created", deploymentId: crypto.randomUUID(), deploymentKey: `djay_voice_deploy_${"a".repeat(48)}` }, 201);
    }
    if (path.endsWith(`/${deployment.id}`) && method === "PATCH") { if (route.request().postDataJSON().action === "revoke") revokeCalls += 1; return respond({ status: "updated", deploymentStatus: "revoked" }); }
    return respond({ status: "not_found" }, 404);
  });
  await page.goto(`${tenantUrl}/workspace/voice`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Voice Agent Basic" }).waitFor();
  await page.getByLabel("Deployment name").fill("Storefront voice");
  await page.getByLabel("Business name").fill("Merchant Store");
  await page.getByLabel("Voice agent name").fill("Mali");
  await page.getByLabel("Allowed website origin").fill("https://merchant.example/path");
  await page.getByRole("button", { name: "Create deployment" }).click();
  await page.getByText("Enter an exact HTTPS origin", { exact: false }).waitFor();
  if (createCalls !== 0) failures.push("tenant: invalid path origin reached the API");
  await page.getByLabel("Allowed website origin").fill("https://merchant.example");
  await page.getByRole("button", { name: "Create deployment" }).click();
  await page.getByText("One-time Voice deployment key", { exact: true }).waitFor();
  if (createCalls !== 1) failures.push(`tenant: expected one create call, received ${createCalls}`);
  const snippet = await page.locator(".deployment-secret pre").innerText();
  if (!snippet.includes("mountVoiceWidget") || !snippet.includes("cdn.djaybot.com/voice/v1/index.js")) failures.push("tenant: install snippet is incomplete");
  page.once("dialog", (dialog) => void dialog.dismiss());
  await page.getByRole("button", { name: "Revoke" }).click();
  await page.waitForTimeout(50); if (revokeCalls !== 0) failures.push("tenant: dismissed revocation still reached the API");
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Revoke" }).click();
  await page.getByText("Deployment revoke request completed.", { exact: true }).waitFor();
  if (revokeCalls !== 1) failures.push(`tenant: expected one confirmed revocation, received ${revokeCalls}`);
  const dimensions = await page.evaluate(() => ({ text: document.body.innerText, width: document.documentElement.scrollWidth, viewport: innerWidth }));
  if (dimensions.width > dimensions.viewport + 1) failures.push(`tenant: horizontal overflow ${dimensions.width}/${dimensions.viewport}`);
  if (restricted.test(dimensions.text)) failures.push("tenant: restricted routing identity visible");
  await page.screenshot({ path: "/tmp/djay-p7-voice-tenant.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Voice Agent Basic" }).waitFor();
  const mobile = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }));
  if (mobile.width > mobile.viewport + 1) failures.push(`tenant-mobile: horizontal overflow ${mobile.width}/${mobile.viewport}`);
  await page.screenshot({ path: "/tmp/djay-p7-voice-tenant-mobile.png", fullPage: true });
  await context.close();
}

await inspectHappyPath({ width: 1365, height: 900 }, "desktop");
await inspectHappyPath({ width: 390, height: 844 }, "mobile");
await inspectPermissionDenied();
await inspectThai();
await inspectTenantWorkspace();
await browser.close();
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.info(`P7 Voice widget passed desktop/mobile lifecycle, consent, active-call confirmation, microphone cleanup, Thai rendering, overflow, accessibility-label, and confidentiality checks${tenantUrl ? "; tenant deployment UX also passed exact-origin, install, revocation-confirmation, and responsive checks" : ""}.`);
