"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type PublicLocale = "th" | "en";

type LocaleContextValue = {
  locale: PublicLocale;
  chooseLocale: (locale: PublicLocale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function browserLocale(): PublicLocale {
  if (typeof window === "undefined") return "th";
  const query = new URLSearchParams(window.location.search).get("lang");
  if (query === "en" || query === "th") return query;
  return /(?:^|;\s*)djay-locale=en(?:;|$)/.test(document.cookie) ? "en" : "th";
}

export function LocaleBoundary({ children, initialLocale = "th" }: Readonly<{ children: React.ReactNode; initialLocale?: PublicLocale }>) {
  const [locale, setLocale] = useState<PublicLocale>(initialLocale);

  useEffect(() => {
    const selected = browserLocale();
    if (selected !== initialLocale) setLocale(selected);
    document.documentElement.lang = selected;
  }, [initialLocale]);

  function chooseLocale(next: PublicLocale) {
    localStorage.setItem("djay-ui-locale", next);
    document.cookie = `djay-locale=${next}; path=/; max-age=31536000; samesite=lax`;
    const url = new URL(window.location.href);
    url.searchParams.set("lang", next);
    window.location.assign(url.toString());
  }

  const value = useMemo(() => ({ locale, chooseLocale }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function usePublicLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("missing_locale_context");
  return value;
}

export function localeText(locale: PublicLocale, thai: string, english: string) {
  return locale === "th" ? thai : english;
}
