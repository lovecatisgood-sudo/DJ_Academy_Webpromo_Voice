const placeholderPatterns = [
  /(?:^|[^a-z])change[-_ ]?me(?:[^a-z]|$)/i,
  /(?:^|[^a-z])replace[-_ ]?with(?:[^a-z]|$)/i,
  /(?:^|[^a-z])base64[-_ ]?encoded(?:[^a-z]|$)/i,
  /(?:^|[^a-z])placeholder(?:[^a-z]|$)/i,
  /(?:^|[^a-z])not[-_ ]?used(?:[^a-z]|$)/i,
  /(?:^|[^a-z])local[-_ ]?unreleased(?:[^a-z]|$)/i,
  /\.(?:test|invalid|example)(?=[:/]|$)/i,
] as const;

export function assertNoProductionPlaceholders(
  environment: "development" | "test" | "production",
  configuration: Readonly<Record<string, unknown>>,
) {
  if (environment !== "production") return;

  for (const [name, value] of Object.entries(configuration)) {
    if (typeof value !== "string" || value.length === 0) continue;
    if (placeholderPatterns.some((pattern) => pattern.test(value))) {
      throw new Error(`${name} contains an example value and must be replaced before production startup.`);
    }
  }
}
