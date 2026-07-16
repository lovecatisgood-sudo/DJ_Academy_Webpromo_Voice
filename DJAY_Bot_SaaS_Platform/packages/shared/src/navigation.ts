const navigationSentinel = "https://navigation.invalid";
const ambiguousEncoding = /%(?:00|0a|0d|2f|5c)/i;
const controlCharacter = /[\u0000-\u001f\u007f]/;

export function safeSameOriginPath(value: string | null | undefined, fallback = "/"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")
    || value.includes("\\") || controlCharacter.test(value) || ambiguousEncoding.test(value)) return fallback;
  try {
    const resolved = new URL(value, navigationSentinel);
    if (resolved.origin !== navigationSentinel || resolved.username || resolved.password) return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}

export function resolveApplicationOrigin(input: Readonly<{
  name: string;
  configured: string | undefined;
  fallback: string;
  production: boolean;
}>): string {
  try {
    const candidate = input.configured?.trim() || input.fallback;
    const resolved = new URL(candidate);
    const secure = resolved.protocol === "https:";
    const localDevelopment = !input.production && resolved.protocol === "http:"
      && ["localhost", "127.0.0.1", "[::1]"].includes(resolved.hostname);
    if ((!secure && !localDevelopment) || resolved.origin !== candidate
      || resolved.username || resolved.password || resolved.pathname !== "/"
      || resolved.search || resolved.hash) throw new Error("invalid");
    return resolved.origin;
  } catch {
    throw new Error(`${input.name}_invalid`);
  }
}
