import contract from "./widget-install-contract.json";

export type WidgetProduct = "flowbot" | "ai-chat" | "voice";
export type AiSocialChannel = "line" | "whatsapp" | "messenger";

export type WidgetInstallEnvironment = Readonly<{
  apiOrigin: string;
  cdnOrigin: string;
}>;

type WidgetInstallEnvironmentInput = {
  apiOrigin?: string | undefined;
  cdnOrigin?: string | undefined;
  production?: boolean | undefined;
};

const productKeyPatterns: Record<WidgetProduct, RegExp> = {
  flowbot: /^djay_flow_[A-Za-z0-9_-]{32,}$/,
  "ai-chat": /^djay_ai_[A-Za-z0-9_-]{32,}$/,
  voice: /^djay_voice_deploy_[A-Za-z0-9_-]{32,}$/,
};

function normalizePublicOrigin(value: string, name: "api" | "cdn", production: boolean) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("widget_install_" + name + "_origin_invalid");
  }
  const exactOrigin = value.replace(/\/+$/, "");
  if (!value || !["http:", "https:"].includes(parsed.protocol) || parsed.origin !== exactOrigin) {
    throw new Error("widget_install_" + name + "_origin_invalid");
  }
  if (production && parsed.protocol !== "https:") {
    throw new Error("widget_install_" + name + "_origin_insecure");
  }
  return parsed.origin;
}

function assertDeploymentKey(product: WidgetProduct, deploymentKey: string) {
  if (deploymentKey.length > 220 || !productKeyPatterns[product].test(deploymentKey)) {
    throw new Error("widget_install_deployment_key_invalid");
  }
}

function scriptString(value: string) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

export const widgetInstallContract = Object.freeze({
  defaultApiOrigin: contract.defaultApiOrigin,
  defaultCdnOrigin: contract.defaultCdnOrigin,
  products: Object.freeze({
    flowbot: Object.freeze({ ...contract.products.flowbot }),
    "ai-chat": Object.freeze({ ...contract.products["ai-chat"] }),
    voice: Object.freeze({ ...contract.products.voice }),
  }),
});

export function resolveWidgetInstallEnvironment(input: WidgetInstallEnvironmentInput = {}): WidgetInstallEnvironment {
  const production = input.production ?? false;
  return Object.freeze({
    apiOrigin: normalizePublicOrigin(input.apiOrigin ?? widgetInstallContract.defaultApiOrigin, "api", production),
    cdnOrigin: normalizePublicOrigin(input.cdnOrigin ?? widgetInstallContract.defaultCdnOrigin, "cdn", production),
  });
}

export function createWidgetInstallSnippet(
  product: WidgetProduct,
  deploymentKey: string,
  environment: WidgetInstallEnvironment,
) {
  assertDeploymentKey(product, deploymentKey);
  const resolved = resolveWidgetInstallEnvironment({
    apiOrigin: environment.apiOrigin,
    cdnOrigin: environment.cdnOrigin,
    production: environment.apiOrigin.startsWith("https:") && environment.cdnOrigin.startsWith("https:"),
  });
  const productContract = widgetInstallContract.products[product];
  const moduleUrl = resolved.cdnOrigin + productContract.publicPath;
  return "<script type=\"module\">\n  import { " + productContract.mountFunction + " } from " + scriptString(moduleUrl)
    + ";\n  " + productContract.mountFunction + "({ deploymentKey: " + scriptString(deploymentKey)
    + ", apiBaseUrl: " + scriptString(resolved.apiOrigin) + " });\n</script>";
}

export function createSocialCallbackUrl(
  channel: AiSocialChannel,
  webhookKey: string,
  environment: WidgetInstallEnvironment,
) {
  if (!/^djay_social_[A-Za-z0-9_-]{32,}$/.test(webhookKey) || webhookKey.length > 220) {
    throw new Error("social_callback_key_invalid");
  }
  const resolved = resolveWidgetInstallEnvironment({
    apiOrigin: environment.apiOrigin,
    cdnOrigin: environment.cdnOrigin,
    production: environment.apiOrigin.startsWith("https:") && environment.cdnOrigin.startsWith("https:"),
  });
  return resolved.apiOrigin + "/public/ai-chat/social/" + channel + "/" + encodeURIComponent(webhookKey);
}
