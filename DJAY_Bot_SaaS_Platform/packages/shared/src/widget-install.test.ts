import { describe, expect, it } from "vitest";
import {
  createSocialCallbackUrl,
  createWidgetInstallSnippet,
  resolveWidgetInstallEnvironment,
  widgetInstallContract,
} from "./widget-install";

const environment = resolveWidgetInstallEnvironment({ production: true });
const flowKey = "djay_flow_" + "a".repeat(32);
const aiKey = "djay_ai_" + "b".repeat(32);
const voiceKey = "djay_voice_deploy_" + "c".repeat(32);

describe("customer widget install contract", () => {
  it("owns the versioned public paths and mount functions", () => {
    expect(widgetInstallContract.products).toEqual({
      flowbot: { publicPath: "/flowbot/v1/index.js", mountFunction: "mountFlowbotWidget" },
      "ai-chat": { publicPath: "/ai-chat/v1/index.js", mountFunction: "mountAiChatWidget" },
      voice: { publicPath: "/voice/v1/index.js", mountFunction: "mountVoiceWidget" },
    });
    expect(Object.isFrozen(widgetInstallContract)).toBe(true);
    expect(Object.isFrozen(widgetInstallContract.products)).toBe(true);
    expect(Object.isFrozen(widgetInstallContract.products.flowbot)).toBe(true);
  });

  it.each([
    ["flowbot", flowKey, "mountFlowbotWidget", "/flowbot/v1/index.js"],
    ["ai-chat", aiKey, "mountAiChatWidget", "/ai-chat/v1/index.js"],
    ["voice", voiceKey, "mountVoiceWidget", "/voice/v1/index.js"],
  ] as const)("creates the %s install snippet", (product, key, mountFunction, publicPath) => {
    const snippet = createWidgetInstallSnippet(product, key, environment);
    expect(snippet).toContain("import { " + mountFunction + " } from \"https://cdn.djaybot.com" + publicPath + "\"");
    expect(snippet).toContain(mountFunction + "({ deploymentKey: \"" + key + "\", apiBaseUrl: \"https://api.djaybot.com\" })");
    expect(snippet).toMatch(/^<script type="module">\n/);
    expect(snippet).toMatch(/\n<\/script>$/);
  });

  it("allows exact HTTP origins for local development", () => {
    expect(resolveWidgetInstallEnvironment({
      apiOrigin: "http://127.0.0.1:3103/",
      cdnOrigin: "http://localhost:4100///",
    })).toEqual({ apiOrigin: "http://127.0.0.1:3103", cdnOrigin: "http://localhost:4100" });
  });

  it.each([
    [{ apiOrigin: "http://api.example.test", production: true }, "widget_install_api_origin_insecure"],
    [{ cdnOrigin: "http://cdn.example.test", production: true }, "widget_install_cdn_origin_insecure"],
    [{ apiOrigin: "https://api.example.test/path" }, "widget_install_api_origin_invalid"],
    [{ cdnOrigin: "javascript:alert(1)" }, "widget_install_cdn_origin_invalid"],
  ] as const)("rejects an unsafe public environment", (input, message) => {
    expect(() => resolveWidgetInstallEnvironment(input)).toThrow(message);
  });

  it("rejects product-mismatched and malformed deployment keys", () => {
    expect(() => createWidgetInstallSnippet("voice", flowKey, environment)).toThrow("widget_install_deployment_key_invalid");
    expect(() => createWidgetInstallSnippet("flowbot", "djay_flow_" + "a".repeat(31) + "<", environment))
      .toThrow("widget_install_deployment_key_invalid");
  });

  it("creates only qualified social callback URLs", () => {
    const webhookKey = "djay_social_" + "d".repeat(32);
    expect(createSocialCallbackUrl("whatsapp", webhookKey, environment))
      .toBe("https://api.djaybot.com/public/ai-chat/social/whatsapp/" + webhookKey);
    expect(() => createSocialCallbackUrl("line", "</script>", environment)).toThrow("social_callback_key_invalid");
  });
});
