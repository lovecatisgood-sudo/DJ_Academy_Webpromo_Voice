#!/usr/bin/env node
/**
 * Thai is the platform default language. English is secondary and only by explicit selection.
 *
 * This is a product requirement for a Thai SME market, and it is the kind of requirement that
 * erodes one line at a time: a `?? "en"` in a new widget, a `.default("en")` on a new schema, an
 * `ALTER TABLE ... SET DEFAULT 'en'` in a new migration. Each looks harmless in review and each
 * quietly makes the product English-first again.
 *
 * The check is deliberately narrow. It does NOT object to English copy, English test fixtures, or
 * `"en"` as a value in a union type — only to English being chosen as the DEFAULT or FALLBACK for
 * a user-facing locale.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const failures = [];

/** Directories that hold shipped source. Build output and dependencies are skipped. */
const roots = ["packages", "apps", "scripts"];
const skipDirectory = new Set(["node_modules", "dist", ".next", ".turbo", "coverage", ".node"]);

function* sourceFiles(directory) {
  for (const entry of readdirSync(directory)) {
    if (skipDirectory.has(entry)) continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      yield* sourceFiles(path);
    } else if (/\.(ts|tsx|mjs|sql)$/.test(path) && !/\.test\.(ts|tsx)$/.test(path)) {
      yield path;
    }
  }
}

/*
 * Each pattern describes one way English can become the default.
 *
 * `locale`/`language` are matched by name so that unrelated defaults (timezone, currency, plan)
 * are untouched. Test files are excluded above because a test may legitimately assert English
 * behaviour when English is explicitly requested.
 */
const patterns = [
  {
    // z.enum([...]).default("en") on a locale/language field
    regex: /(locale|language)\s*:[^\n]*\.default\(\s*["']en["']\s*\)/gi,
    detail: 'schema defaults a locale to English — use .default("th")',
  },
  {
    // this.language = options.language ?? "en"
    regex: /(locale|language)[^\n]*\?\?\s*["']en["']/gi,
    detail: 'falls back to English — use ?? "th"',
  },
  {
    // chrome[locale] ?? chrome.en  /  copy[lang] || copy.en
    regex: /\?\?\s*\w+\.en\b|\|\|\s*\w+\.en\b/g,
    detail: "falls back to an English copy table — fall back to the Thai one",
  },
  {
    // value === "th" ? "th" : "en"  — the inverted resolver
    regex: /===\s*["']th["']\s*\?\s*["']th["']\s*:\s*["']en["']/g,
    detail: 'resolves unknown locales to English — invert to `=== "en" ? "en" : "th"`',
  },
  {
    // locale text NOT NULL DEFAULT 'en'  /  ALTER COLUMN locale SET DEFAULT 'en'
    regex: /(locale|language)[^\n]*DEFAULT\s+'en'/gi,
    detail: "column defaults a locale to English — default it to 'th'",
  },
];

for (const directory of roots) {
  const absolute = resolve(root, directory);
  for (const path of sourceFiles(absolute)) {
    const source = readFileSync(path, "utf8");
    // This file necessarily contains every pattern it forbids.
    if (path.endsWith("check-thai-first-locale.mjs")) continue;
    for (const { regex, detail } of patterns) {
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(source)) !== null) {
        const line = source.slice(0, match.index).split("\n").length;
        failures.push(`${relative(root, path)}:${line} — ${detail}`);
      }
    }
  }
}

/*
 * Historical migrations are immutable and several of them legitimately created English defaults
 * before 0087 corrected them. Only the corrective migration and anything after it must comply,
 * so migrations below 0087 are reported as informational context rather than failures.
 */
const superseded = failures.filter((entry) => /packages\/db\/migrations\/00(0|1|2|3|4|5|6|7|8)\d_/.test(entry)
  && Number(entry.match(/migrations\/(\d{4})_/)?.[1]) < 87);
const blocking = failures.filter((entry) => !superseded.includes(entry));

if (blocking.length) {
  console.error(
    "Thai must be the default language; English is secondary and only by explicit selection.\n\n"
    + blocking.join("\n"),
  );
  process.exit(1);
}

console.info(
  `Thai-first locale defaults hold across ${roots.join(", ")}`
  + (superseded.length ? ` (${superseded.length} pre-0087 migration default(s) superseded by 0087)` : "")
  + ".",
);
