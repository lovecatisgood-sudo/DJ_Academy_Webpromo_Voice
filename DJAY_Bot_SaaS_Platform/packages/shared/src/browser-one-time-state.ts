import { safeSameOriginPath } from "./navigation";

export type BrowserOneTimeValues = Readonly<Record<string, string>>;

export function retainBrowserOneTimeValues(input: Readonly<{
  initialValues: BrowserOneTimeValues;
  storagePrefix: string;
  cleanPath: string;
}>): BrowserOneTimeValues {
  if (typeof window === "undefined") return input.initialValues;
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const values: Record<string, string> = {};
  for (const [name, initialValue] of Object.entries(input.initialValues)) {
    let value = initialValue || fragment.get(name) || "";
    try {
      value ||= window.sessionStorage.getItem(`${input.storagePrefix}.${name}`) || "";
      if (value) window.sessionStorage.setItem(`${input.storagePrefix}.${name}`, value);
    } catch {}
    values[name] = value;
  }
  const cleanPath = safeSameOriginPath(input.cleanPath, "/");
  if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== cleanPath) {
    window.history.replaceState(window.history.state, "", cleanPath);
  }
  return Object.freeze(values);
}

export function clearBrowserOneTimeValues(storagePrefix: string, names: readonly string[]): void {
  if (typeof window === "undefined") return;
  try {
    for (const name of names) window.sessionStorage.removeItem(`${storagePrefix}.${name}`);
  } catch {}
}
