"use client";

import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState } from "react";
import { translateEnglishUi, translateThaiUi } from "@djay/shared";

type Locale = "th" | "en";

type LocaleContextValue = Readonly<{
  locale: Locale;
  chooseLocale: (locale: Locale) => void;
}>;

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleBoundary({ children }: Readonly<{ children: React.ReactNode }>) {
  const root = useRef<HTMLDivElement>(null);
  const [locale, setLocale] = useState<Locale>("th");

  useLayoutEffect(() => {
    const query = new URLSearchParams(window.location.search).get("lang");
    const selected: Locale = query === "en" || (query !== "th" && localStorage.getItem("djay-ui-locale") === "en") ? "en" : "th";
    setLocale(selected);
    document.documentElement.lang = selected;
    document.cookie = `djay-locale=${selected}; path=/; max-age=31536000; samesite=lax`;
    const translate = selected === "th" ? translateThaiUi : translateEnglishUi;
    const localize = (scope: HTMLElement) => {
      if (scope.closest("[data-no-localize]")) return;
      const localizeText = (node: Text) => {
        if (!node.parentElement || node.parentElement.closest("[data-no-localize],script,style,code,pre,textarea,input,select,option")) return;
        const translated = translate(node.nodeValue || "");
        if (translated !== node.nodeValue) node.nodeValue = translated;
      };
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent || parent.closest("[data-no-localize],script,style,code,pre,textarea,input,select,option")) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      const nodes: Text[] = [];
      while (walker.nextNode()) nodes.push(walker.currentNode as Text);
      for (const node of nodes) localizeText(node);
      for (const element of scope.querySelectorAll<HTMLElement>("[placeholder], [aria-label], [title]")) {
        if (element.closest("[data-no-localize]")) continue;
        for (const attribute of ["placeholder", "aria-label", "title"]) {
          const value = element.getAttribute(attribute);
          if (value) element.setAttribute(attribute, translate(value));
        }
      }
    };
    if (!root.current) return;
    localize(root.current);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "characterData" && record.target instanceof Text) {
          if (!record.target.parentElement || record.target.parentElement.closest("[data-no-localize],script,style,code,pre,textarea,input,select,option")) continue;
          const translated = translate(record.target.nodeValue || "");
          if (translated !== record.target.nodeValue) record.target.nodeValue = translated;
          continue;
        }
        for (const node of record.addedNodes) {
          if (node instanceof Text) {
            if (!node.parentElement || node.parentElement.closest("[data-no-localize],script,style,code,pre,textarea,input,select,option")) continue;
            const translated = translate(node.nodeValue || "");
            if (translated !== node.nodeValue) node.nodeValue = translated;
          } else if (node instanceof HTMLElement) {
            localize(node);
          }
        }
      }
    });
    observer.observe(root.current, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  function choose(next: Locale) {
    localStorage.setItem("djay-ui-locale", next);
    document.cookie = `djay-locale=${next}; path=/; max-age=31536000; samesite=lax`;
    location.reload();
  }

  const value = useMemo(() => ({ locale, chooseLocale: choose }), [locale]);
  return <LocaleContext.Provider value={value}><div ref={root}>{children}</div></LocaleContext.Provider>;
}

export function useTenantLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("missing_tenant_locale_context");
  return value;
}
