export const djayWidgetBaseStyles = `
:host {
  all: initial;
  --djay-widget-ink: #171a1f;
  --djay-widget-forest: #173f35;
  --djay-widget-green: #126149;
  --djay-widget-green-hover: #0d4d3a;
  --djay-widget-green-soft: #dceee7;
  --djay-widget-accent: #f2c14e;
  --djay-widget-canvas: #f4f6f5;
  --djay-widget-surface: #ffffff;
  --djay-widget-border: #d9dfdc;
  --djay-widget-muted: #626b67;
  --djay-widget-danger: #b43832;
  --djay-widget-danger-soft: #fff1f0;
  --djay-widget-warning-soft: #fff8e6;
  --djay-widget-focus: #79c9ae;
  position: fixed;
  right: max(16px, env(safe-area-inset-right));
  bottom: max(16px, env(safe-area-inset-bottom));
  z-index: 2147483000;
  color: var(--djay-widget-ink);
  color-scheme: light;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
*, *::before, *::after { box-sizing: border-box; }
button, input, textarea, select { font: inherit; }
button { touch-action: manipulation; }
.shell { display: grid; justify-items: end; gap: 12px; }
.launcher {
  width: 58px;
  height: 58px;
  border: 0;
  border-radius: 50%;
  background: var(--djay-widget-green);
  color: #fff;
  box-shadow: 0 14px 38px #10231d45;
  cursor: pointer;
  font-size: 16px;
  font-weight: 900;
  letter-spacing: -.02em;
}
.launcher:hover { background: var(--djay-widget-green-hover); }
.panel {
  width: min(390px, calc(100vw - 32px));
  max-height: min(680px, calc(100vh - 108px));
  max-height: min(680px, calc(100dvh - 108px));
  overflow: hidden;
  border: 1px solid var(--djay-widget-border);
  border-radius: 22px;
  background: var(--djay-widget-surface);
  color: var(--djay-widget-ink);
  box-shadow: 0 24px 75px #10231d38;
}
.header {
  min-height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px 10px 14px;
  background: var(--djay-widget-forest);
  color: #fff;
}
.identity { min-width: 0; display: flex; align-items: center; gap: 10px; }
.mark {
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  background: var(--djay-widget-accent);
  color: var(--djay-widget-ink);
  font-weight: 900;
}
.identity-copy { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.title { overflow: hidden; font-size: 15px; font-weight: 850; text-overflow: ellipsis; white-space: nowrap; }
.product-label { overflow: hidden; color: #dceee7; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.icon {
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #fff;
  cursor: pointer;
  font-size: 26px;
  line-height: 1;
}
.icon:hover { background: #ffffff18; }
.brand {
  min-height: 30px;
  display: grid;
  place-items: center;
  border-top: 1px solid #edf0ef;
  color: var(--djay-widget-muted);
  font-size: 10px;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}
:where(button, input, textarea, select):focus-visible {
  outline: 3px solid var(--djay-widget-focus);
  outline-offset: 2px;
}
button:disabled, input:disabled, textarea:disabled, select:disabled { cursor: not-allowed; opacity: .58; }
@media (max-width: 520px) {
  :host {
    right: max(8px, env(safe-area-inset-right));
    bottom: max(8px, env(safe-area-inset-bottom));
  }
  .panel {
    width: calc(100vw - max(16px, calc(env(safe-area-inset-left) + env(safe-area-inset-right))));
    max-height: calc(100vh - 82px - env(safe-area-inset-bottom));
    max-height: calc(100dvh - 82px - env(safe-area-inset-bottom));
    border-radius: 16px;
  }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
}
@media (forced-colors: active) {
  .launcher, .mark, .icon { border: 1px solid ButtonText; }
}
`;

export function normalizeWidgetApiOrigin(value: string) {
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== value.replace(/\/+$/, "")) {
    throw new Error("widget_api_origin_invalid");
  }
  return parsed.origin;
}

export async function widgetFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 15_000,
) {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), timeoutMs);
  const externalSignal = init.signal;
  const abortFromExternal = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortFromExternal();
  else externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    globalThis.clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromExternal);
  }
}
