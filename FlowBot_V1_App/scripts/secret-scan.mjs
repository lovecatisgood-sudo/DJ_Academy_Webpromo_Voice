import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const ignoredDirs = new Set(["node_modules", ".next", "dist", ".turbo", ".pnpm-store", ".node", ".git"]);
const ignoredFiles = new Set([".env.local", ".env", ".env.example", "pnpm-lock.yaml"]);
const patterns = [
  { name: "OpenAI key", regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { name: "Google API key", regex: /\bAIza[0-9A-Za-z_-]{20,}\b/g },
  { name: "Postgres URL", regex: /\bpostgres(?:ql)?:\/\/[^\s"'`<>]+/gi },
  { name: "Private key", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { name: "JWT-like token", regex: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g }
];

const findings = [];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(path);
      continue;
    }
    if (!entry.isFile() || ignoredFiles.has(entry.name)) continue;
    await scanFile(path);
  }
}

async function scanFile(path) {
  const rel = relative(root, path);
  if (rel.startsWith("apps/dashboard/.env") || rel.startsWith(".env")) return;
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return;
  }
  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0;
    for (const match of text.matchAll(pattern.regex)) {
      const before = text.slice(0, match.index ?? 0);
      const line = before.split("\n").length;
      findings.push({ file: rel, line, type: pattern.name });
    }
  }
}

await walk(root);

if (findings.length) {
  console.error("Potential secrets found:");
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.type}`);
  }
  process.exit(1);
}

console.log("Secret scan passed.");
