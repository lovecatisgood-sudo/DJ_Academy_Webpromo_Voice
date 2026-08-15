import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const packageDirectory = resolve(repositoryRoot, "docs/compliance/DEEJAI_DJBOT_COMPLETE_LEGAL_PACKAGE");
const sourcesDirectory = join(packageDirectory, "individual_documents_md");

const documents = readdirSync(sourcesDirectory)
  .filter((name) => /^\d{2}_.+\.md$/.test(name))
  .sort((left, right) => left.localeCompare(right));

if (documents.length !== 47) throw new Error(`Expected 47 legal source documents, found ${documents.length}.`);

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function inline(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>');
}

function cells(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((value) => value.trim());
}

function markdownToHtml(markdown) {
  const lines = markdown.split(/\r?\n/);
  const output = [];
  let index = 0;
  let paragraph = [];
  const flushParagraph = () => {
    if (paragraph.length) output.push(`<p>${inline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  while (index < lines.length) {
    const line = lines[index];
    const next = lines[index + 1] ?? "";
    if (!line.trim()) { flushParagraph(); index += 1; continue; }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      const level = Math.min(heading[1].length, 4);
      output.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }
    if (line.trim().startsWith("|") && /^\|?\s*:?-{3,}/.test(next.trim())) {
      flushParagraph();
      const headers = cells(line);
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        rows.push(cells(lines[index]));
        index += 1;
      }
      output.push(`<table><thead><tr>${headers.map((value) => `<th>${inline(value)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((value) => `<td>${inline(value)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      flushParagraph();
      const items = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^[-*]\s+/, ""));
        index += 1;
      }
      output.push(`<ul>${items.map((value) => `<li>${inline(value)}</li>`).join("")}</ul>`);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      flushParagraph();
      const items = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\d+\.\s+/, ""));
        index += 1;
      }
      output.push(`<ol>${items.map((value) => `<li>${inline(value)}</li>`).join("")}</ol>`);
      continue;
    }
    if (line.startsWith(">")) {
      flushParagraph();
      const quote = [];
      while (index < lines.length && (lines[index].startsWith(">") || !lines[index].trim())) {
        if (lines[index].startsWith(">")) quote.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      output.push(`<aside>${quote.filter(Boolean).map((value) => `<p>${inline(value)}</p>`).join("")}</aside>`);
      continue;
    }
    paragraph.push(line.trim());
    index += 1;
  }
  flushParagraph();
  return output.join("\n");
}

function packageHtml(selectedDocuments, title) {
  const body = selectedDocuments.map((name) => {
    const markdown = readFileSync(join(sourcesDirectory, name), "utf8");
    return `<section class="document">${markdownToHtml(markdown)}</section>`;
  }).join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    @page { size: A4; margin: 2.2cm 2cm; }
    body { font-family: Arial, "Noto Sans Thai", sans-serif; color: #171a1f; font-size: 10.5pt; line-height: 1.5; }
    .document { break-before: page; } .document:first-child { break-before: auto; }
    h1 { color: #0d4d3a; font-size: 23pt; margin: 0 0 16pt; }
    h2 { color: #126149; font-size: 15pt; margin: 18pt 0 8pt; }
    h3 { color: #173f35; font-size: 12pt; margin: 14pt 0 6pt; }
    p { margin: 0 0 8pt; } ul, ol { margin: 0 0 10pt 18pt; } li { margin-bottom: 3pt; }
    aside { background: #f4f6f5; border-left: 4px solid #f2c14e; padding: 8pt 10pt; margin: 0 0 14pt; }
    aside p { margin: 0 0 4pt; } table { border-collapse: collapse; width: 100%; margin: 8pt 0 14pt; font-size: 8.5pt; }
    th { background: #173f35; color: white; text-align: left; } th, td { border: 1px solid #aebbb6; padding: 5pt; vertical-align: top; }
    code { font-family: monospace; background: #f4f6f5; padding: 1pt 2pt; } a { color: #126149; }
  </style></head><body>${body}</body></html>`;
}

const packages = [
  { name: "00_Master_Complete_Legal_Package.docx", title: "DEEJAI LAB / DJBOT Complete Legal Package", documents },
  { name: "01_Public_Contracts_and_Notices.docx", title: "DJBOT Public Contracts and Notices", documents: documents.filter((name) => Number(name.slice(0, 2)) >= 6 && Number(name.slice(0, 2)) <= 30) },
  { name: "02_Internal_Privacy_AI_Governance.docx", title: "DJBOT Internal Privacy and AI Governance", documents: documents.filter((name) => Number(name.slice(0, 2)) <= 5 || Number(name.slice(0, 2)) >= 31) },
];

const temporaryDirectory = mkdtempSync(join(tmpdir(), "djay-legal-package-"));
try {
  for (const artifact of packages) {
    const stem = basename(artifact.name, ".docx");
    const htmlPath = join(temporaryDirectory, `${stem}.html`);
    writeFileSync(htmlPath, packageHtml(artifact.documents, artifact.title));
    execFileSync("libreoffice", [
      `-env:UserInstallation=file://${join(temporaryDirectory, "libreoffice-profile")}`,
      "--headless", "--convert-to", 'docx:Office Open XML Text', "--outdir", temporaryDirectory, htmlPath,
    ], { stdio: "inherit" });
    const generatedPath = join(temporaryDirectory, artifact.name);
    copyFileSync(generatedPath, join(packageDirectory, artifact.name));
  }
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

const manifestPath = join(packageDirectory, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.package_date = "2026-08-15";
manifest.document_count = documents.length;
manifest.files = [
  ...packages.map(({ name }) => name),
  "README.md",
  ...documents.map((name) => `individual_documents_md/${name}`),
].map((relativePath) => {
  const absolutePath = join(packageDirectory, relativePath);
  const bytes = readFileSync(absolutePath);
  return {
    path: relativePath,
    size_bytes: statSync(absolutePath).size,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
});
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Built ${packages.length} Word packages from ${documents.length} legal source documents.`);
