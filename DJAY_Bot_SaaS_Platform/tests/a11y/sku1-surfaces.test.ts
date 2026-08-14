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
 * own base URL.
 *
 *   AXE_PUBLIC_BASE_URL=http://127.0.0.1:3010 npx vitest run tests/a11y
 *   AXE_TENANT_BASE_URL=http://127.0.0.1:3011 AXE_SESSION_COOKIE=name=value npx vitest run tests/a11y
 *
 * ## Two modes, and why AXE_REQUIRE exists
 *
 * In **development mode** (default) a surface whose base URL or session cookie is absent
 * skips, so a developer can scan just the public app without standing up the whole stack.
 *
 * That convenience was a defect when treated as a gate: with no env vars at all the suite
 * exited 0 having run nothing, so `pnpm test:a11y` reported success with zero assertions.
 * A gate that passes when the thing under test is absent is worse than no gate, because it
 * manufactures false assurance.
 *
 * In **release mode** (`AXE_REQUIRE=true`) every prerequisite becomes mandatory: a missing
 * base URL, a missing session cookie, or any skipped surface is a hard failure. Release mode
 * additionally gates on `moderate` findings, per the disposition policy below.
 *
 * `scripts/check-a11y-gate.test.mjs` asserts that release mode with no servers running exits
 * non-zero — that is the test of this test.
 */

const publicBaseUrl = process.env.AXE_PUBLIC_BASE_URL;
const tenantBaseUrl = process.env.AXE_TENANT_BASE_URL;
const sessionCookie = process.env.AXE_SESSION_COOKIE;

/** Release mode: prerequisites are mandatory and skips are failures. */
const required = process.env.AXE_REQUIRE === "true";
const enabled = required || Boolean(publicBaseUrl || tenantBaseUrl);

/**
 * Disposition policy for axe impact levels.
 *
 * - `critical`, `serious` — always fail. These are genuine barriers.
 * - `moderate` — fails in release mode only, unless the rule id appears in
 *   `ACCEPTED_MODERATE` with a written reason. Moderate findings are real accessibility
 *   defects; they are merely ones we allow a developer to iterate past mid-change.
 * - `minor` — reported, never gates.
 *
 * To accept a moderate finding, add the rule id here with the reason and the surface it
 * applies to. An empty allowlist means every moderate finding blocks the release.
 */
const ACCEPTED_MODERATE: ReadonlyArray<{ ruleId: string; reason: string }> = [
  // { ruleId: "…", reason: "…" },
];

const GATING_IMPACTS = new Set(
  required ? ["serious", "critical", "moderate"] : ["serious", "critical"],
);

type Surface = Readonly<{ name: string; path: string; app: "public" | "tenant"; authenticated: boolean }>;

// Routes verified by listing each app's page.tsx files — not assumed.
const surfaces: readonly Surface[] = [
  { name: "public landing", path: "/", app: "public", authenticated: false },
  { name: "public registration", path: "/register", app: "public", authenticated: false },
  // public-site /login is intentionally absent: it is a bare server-side redirect to
  // tenantAppUrl (app/login/page.tsx calls redirect()), so it renders no markup to scan.
  // The tenant app's own entry is covered by the workspace surfaces below.
  { name: "privacy notice", path: "/privacy", app: "public", authenticated: false },
  { name: "terms", path: "/terms", app: "public", authenticated: false },
  { name: "email verification", path: "/verify-email", app: "public", authenticated: false },
  { name: "workspace overview", path: "/workspace", app: "tenant", authenticated: true },
  { name: "FlowBot studio", path: "/workspace/flowbot", app: "tenant", authenticated: true },
  // The canvas is the PRD's primary authoring surface, so it must be in the gate. A graph
  // editor is the single most likely place to ship a pointer-only interaction.
  { name: "FlowBot canvas", path: "/workspace/flowbot/canvas", app: "tenant", authenticated: true },
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
  // In release mode the prerequisites are part of what is being verified, so assert them as
  // real tests. Without this, absent configuration produces zero assertions and exit 0.
  if (required) {
    it("release mode: every prerequisite is configured", () => {
      const missing: string[] = [];
      if (!publicBaseUrl) missing.push("AXE_PUBLIC_BASE_URL");
      if (!tenantBaseUrl) missing.push("AXE_TENANT_BASE_URL");
      if (!sessionCookie) missing.push("AXE_SESSION_COOKIE");
      expect(
        missing,
        `AXE_REQUIRE=true but ${missing.join(", ")} not set. Release mode must never skip: `
        + "start the apps, mint a tenant session, and pass all three.",
      ).toEqual([]);
    });

    it("release mode: browser launched", () => {
      expect(browser, "chromium failed to launch — the gate cannot pass without a real browser").not.toBeNull();
    });
  }

  for (const surface of surfaces) {
    const missingBase = !baseFor(surface.app);
    const missingSession = surface.authenticated && !sessionCookie;
    // Release mode never skips. A surface that cannot be reached is a failure, not an
    // absence — the prerequisite tests above name the specific missing configuration.
    const skip = !required && (missingBase || missingSession);

    it.skipIf(skip)(`${surface.name} (${surface.path}) has no gating axe violations`, async () => {
      if (required && (missingBase || missingSession)) {
        throw new Error(
          `${surface.path} is unreachable in release mode: `
          + [missingBase && "base URL missing", missingSession && "session cookie missing"]
            .filter(Boolean).join(" and "),
        );
      }
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

      const accepted = new Set(ACCEPTED_MODERATE.map((entry) => entry.ruleId));
      const gating = violations.filter((v) => {
        if (!GATING_IMPACTS.has(v.impact ?? "")) return false;
        // Only moderate findings are eligible for disposition. Serious and critical never are.
        return !(v.impact === "moderate" && accepted.has(v.id));
      });
      expect(gating.map((v) => `${v.impact}:${v.id}`)).toEqual([]);
    }, 60_000);
  }
});
