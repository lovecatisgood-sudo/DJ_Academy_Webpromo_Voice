export function normalizeInput(value: string): string {
  return value
    .normalize("NFC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, "")
    .replace(/\s+/g, " ");
}

export function canSubstringMatch(keyword: string, lang: "th" | "en"): boolean {
  const normalized = normalizeInput(keyword);
  if (lang === "th") {
    return Array.from(normalized).length >= 2;
  }
  return normalized.length >= 3;
}
