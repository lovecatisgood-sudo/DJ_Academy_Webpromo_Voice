import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";

const appRoot = resolve("apps/public-site/app");
const sourceFiles = [];
const allowedEnglishPhrases = new Set([
  "AI Chat",
  "DJAY BOT",
  "DJAY Bot",
  "DJBOT",
  "LINE Official Account",
  "Facebook Messenger",
  "WhatsApp",
  "Instagram",
  "FlowBot",
  "TextBot",
  "VoiceBot",
  "Unified Workspace",
  "Thai / English",
]);

function collect(directory) {
  for (const entry of readdirSync(directory)) {
    if (entry === ".next" || entry === "node_modules") continue;
    const path = resolve(directory, entry);
    if (statSync(path).isDirectory()) collect(path);
    else if (/\.(tsx|ts)$/.test(entry)) sourceFiles.push(path);
  }
}

function hasThai(value) {
  return /[\u0E00-\u0E7F]/.test(value);
}

function isEnglishProse(value) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized || hasThai(normalized) || allowedEnglishPhrases.has(normalized)) return false;
  if (!/[A-Za-z]/.test(normalized) || !/\s/.test(normalized) || normalized.length < 10) return false;
  if (/^(GET|POST|PATCH|DELETE)\s/.test(normalized)) return false;
  if (/^https?:\/\//.test(normalized) || normalized.startsWith("/") || normalized.includes("@")) return false;
  if (/^[a-z0-9._/-]+$/i.test(normalized)) return false;
  if (/^[.#\]\[():%0-9 -]+$/.test(normalized)) return false;
  if (/^[a-z][a-z0-9:-]*(\s+[a-z][a-z0-9:-]*)+$/i.test(normalized) && /[-:]/.test(normalized)) return false;
  return true;
}

function isImportOrExportLiteral(node) {
  return ts.isImportDeclaration(node.parent)
    || ts.isExportDeclaration(node.parent)
    || ts.isExternalModuleReference(node.parent);
}

function isNonCopyLiteral(node) {
  if (node.text === "use client") return true;
  if (node.text === "[placeholder], [aria-label], [title]") return true;
  if (/^\d+\s+\d+px\s+\d+px\s+rgba\([0-9,.]+\)$/.test(node.text)) return true;
  const parent = node.parent;
  if (ts.isJsxAttribute(parent)) {
    const name = parent.name.getText();
    return !["aria-label", "title", "placeholder"].includes(name);
  }
  if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name) && parent.name.text === "className") return true;
  return false;
}

function sourcePosition(source, node) {
  const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
  return `${relative(process.cwd(), source.fileName)}:${line + 1}:${character + 1}`;
}

collect(appRoot);

const failures = [];
let thaiSources = 0;

for (const file of sourceFiles) {
  const text = readFileSync(file, "utf8");
  if (hasThai(text)) thaiSources += 1;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

  function visit(node) {
    if (ts.isJsxText(node) && isEnglishProse(node.getText(source))) {
      failures.push(`${sourcePosition(source, node)} visible JSX text: ${node.getText(source).replace(/\s+/g, " ").trim()}`);
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !isImportOrExportLiteral(node) && !isNonCopyLiteral(node) && isEnglishProse(node.text)) {
      failures.push(`${sourcePosition(source, node)} string literal: ${node.text}`);
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
}

if (!thaiSources || failures.length) {
  console.error("Public-site source must not ship English prose as Thai-default user-visible copy.");
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
