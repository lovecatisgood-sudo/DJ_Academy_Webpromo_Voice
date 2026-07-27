export type UiLocale = "th" | "en";

export function currentUiLocale(): UiLocale {
  if (typeof document === "undefined") return "th";
  return /(?:^|;\s*)djay-locale=en(?:;|$)/.test(document.cookie) ? "en" : "th";
}

export function currentIntlLocale(): "th-TH" | "en-GB" {
  return currentUiLocale() === "en" ? "en-GB" : "th-TH";
}

export function uiCopy(thai: string, english: string): string {
  return currentUiLocale() === "en" ? english : thai;
}
