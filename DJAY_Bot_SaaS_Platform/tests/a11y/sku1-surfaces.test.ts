import AxeBuilder from "@axe-core/playwright";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * G7 accessibility gate — unmocked axe scan of the SKU1 surfaces.
 *
 * The gate has been in the release plan since Phase 0.5 while being impossible to
 * satisfy: `playwright` and `@axe-core/playwright` were installed, but there was no
 * config, no spec, and no script to run them. This closes that.
 *
 * Deliberately vitest + the plain `playwright` library, NOT `@playwright/test`: the test
 * runner package is not a dependency here and vitest already is the repo's runner. This
 * adds no dependency.
 *
 * `public-site` and `tenant-web` are separate apps on separate origins, so each has its
 * own base URL. Env-gated in the same idiom as the DB integration suites — a surface
 * whose base URL is absent skips rather than silently passing.
 *
 *   AXE_PUBLIC_BASE_URL=http://127.0.0.1:3010 npx vitest run tests/a11y
 *   AXE_TENANT_BASE_URL=http://127.0.0.1:3011 AXE_SESSION_COOKIE=name=value npx vitest run tests/a11y
 *
 * Authenticated workspace surfaces additionally require AXE_SESSION_COOKIE. Without it
 * they skip, because scanning a login redirect would report a false pass.
 */

const publicBaseUrl = process.env.AXE_PUBLIC_BASE_URL;
const tenantBaseUrl = process.env.AXE_TENANT_BASE_URL;
const sessionCookie = process.env.AXE_SESSION_COOKIE;
const enabled = Boolean(publicBaseUrl || tenantBaseUrl);

/** Gate on genuine barriers. Minor/moderate findings are logged but do not fail. */
const GATING_IMPACTS = new Set(["serious", "critical"]);

type Surface = Readonly<{ name: string; path: string; app: "public" | "tenant"; authenticated: boolean }>;

// Routes verified by listing each app's page.tsx files — not assumed.
const surfaces: readonly Surface[] = [
  { name: "public landing", path: "/", app: "public", authenticated: false },
  // public-site /login is intentionally absent: it is a bare server-side redirect to
  // tenantAppUrl (app/login/page.tsx calls redirect()), so it renders no markup to scan.
  // The tenant app's own entry is covered by the workspace surfaces below.
  { name: "privacy notice", path: "/privacy", app: "public", authenticated: false },
  { name: "terms", path: "/terms", app: "public", authenticated: false },
  { name: "email verification", path: "/verify-email", app: "public", authenticated: false },
  { name: "workspace overview", path: "/workspace", app: "tenant", authenticated: true },
  { name: "FlowBot studio", path: "/workspace/flowbot", app: "tenant", authenticated: true },
  { name: "LINE guided connect", path: "/workspace/flowbot/connect/line", app: "tenant", authenticated: true },
  { name: "inbox", path: "/workspace/inbox", app: "tenant", authenticated: true },
  { name: "leads", path: "/workspace/leads", app: "tenant", authenticated: true },
];

let browser: Browser | null = null;

beforeAll(async () => {
  if (!enabled) return;
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

function baseFor(app: Surface["app"]) {
  return app === "public" ? publicBaseUrl : tenantBaseUrl;
}

async function scan(surface: Surface) {
  const base = baseFor(surface.app)!;
  const context = await browser!.newContext();
  if (sessionCookie && surface.authenticated) {
    const url = new URL(base);
    const separator = sessionCookie.indexOf("=");
    if (separator > 0) {
      await context.addCookies([{
        name: sessionCookie.slice(0, separator),
        value: sessionCookie.slice(separator + 1),
        domain: url.hostname,
        path: "/",
        httpOnly: true,
        secure: url.protocol === "https:",
        sameSite: "Lax",
      }]);
    }
  }
  const page = await context.newPage();
  try {
    const response = await page.goto(new URL(surface.path, base).toString(), { waitUntil: "domcontentloaded" });
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    return { status: response?.status() ?? 0, finalUrl: page.url(), violations: results.violations };
  } finally {
    await context.close();
  }
}

describe.skipIf(!enabled)("G7 accessibility — SKU1 surfaces", () => {
  for (const surface of surfaces) {
    const missingBase = !baseFor(surface.app);
    const missingSession = surface.authenticated && !sessionCookie;
    const skip = missingBase || missingSession;

    it.skipIf(skip)(`${surface.name} (${surface.path}) has no serious or critical axe violations`, async () => {
      const { status, finalUrl, violations } = await scan(surface);

      expect(status, `${surface.path} should render, not error`).toBeLessThan(400);
      // A redirect to login would otherwise scan the login page and report a false pass.
      if (surface.authenticated) {
        expect(new URL(finalUrl).pathname, `${surface.path} redirected — session cookie rejected?`)
          .toBe(surface.path);
      }

      if (violations.length) {
        console.info(`axe findings for ${surface.path}:\n${violations
          .map((v) => `  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))`)
          .join("\n")}`);
      }

      const gating = violations.filter((v) => GATING_IMPACTS.has(v.impact ?? ""));
      expect(gating.map((v) => `${v.impact}:${v.id}`)).toEqual([]);
    }, 60_000);
  }
});
