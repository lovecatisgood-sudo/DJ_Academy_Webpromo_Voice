export type AppLocale = "th" | "en";

export function localeFromRequest(request: Request): AppLocale {
  const query = new URL(request.url).searchParams.get("lang");
  if (query === "en" || query === "th") return query;
  const cookie = request.headers.get("cookie") || "";
  return /(?:^|;\s*)djay-locale=en(?:;|$)/.test(cookie) ? "en" : "th";
}
