import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const failures = [];

const shared = read("packages/shared/src/conversation-message-fields.ts");
for (const marker of [
  "minLength: 1, maxLength: 20_000",
  "conversationMessageTextSchema",
  ".trim()",
  "conversationMessageTextError",
  "at least one visible character",
]) if (!shared.includes(marker)) failures.push(`Shared conversation message contract is missing ${marker}`);

const domain = read("packages/domain/src/index.ts");
if (!domain.includes("text: conversationMessageTextSchema")) failures.push("Domain messages do not use the shared normalized text contract");

const store = read("packages/db/src/shared-domain-store.ts");
for (const marker of ["messageInputSchema.parse(input)", "sql.json({ text: parsed.text })"]) {
  if (!store.includes(marker)) failures.push(`Shared-domain repository is missing ${marker}`);
}

const inbox = read("apps/tenant-web/app/workspace/inbox/page.tsx");
for (const marker of [
  "conversationMessageTextError",
  "normalizeConversationMessageText",
  "conversationMessageFieldConstraints",
  "reportValidity()",
  "Reply sent.",
  'role={noticeTone === "error" ? "alert" : "status"}',
]) if (!inbox.includes(marker)) failures.push(`Inbox reply journey is missing ${marker}`);

const browser = read("scripts/qa-p3-ui.mjs");
for (const marker of [
  "inbox-reply-boundary",
  "whitespace-only reply reached the API",
  "corrected reply did not send one normalized message",
  "failed reply did not preserve one exact retryable draft",
]) if (!browser.includes(marker)) failures.push(`P3 browser gate is missing ${marker}`);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.info("Inbox replies match the shared normalized message contract and accessible recovery journey.");
