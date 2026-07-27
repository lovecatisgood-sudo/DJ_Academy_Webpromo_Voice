"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { translateThaiUi } from "@djay/shared";

type Locale = "th" | "en";

export function LocaleBoundary({ children }: Readonly<{ children: React.ReactNode }>) {
  const root = useRef<HTMLDivElement>(null);
  const [locale, setLocale] = useState<Locale>("th");

  useLayoutEffect(() => {
    const query = new URLSearchParams(window.location.search).get("lang");
    const selected: Locale = query === "en" || (query !== "th" && localStorage.getItem("djay-ui-locale") === "en") ? "en" : "th";
    setLocale(selected);
    document.documentElement.lang = selected;
    document.cookie = `djay-locale=${selected}; path=/; max-age=31536000; samesite=lax`;
    const localize = (scope: HTMLElement) => {
      if (scope.closest("[data-no-localize]")) return;
      const localizeText = (node: Text) => {
        if (!node.parentElement || node.parentElement.closest("[data-no-localize],script,style,code,pre,textarea,input,select,option")) return;
        const translated = translateThaiUi(node.nodeValue || "");
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
          if (value) element.setAttribute(attribute, translateThaiUi(value));
        }
      }
    };
    if (selected === "th" && root.current) localize(root.current);
    if (selected !== "th" || !root.current) return;
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "characterData" && record.target instanceof Text) {
          if (!record.target.parentElement || record.target.parentElement.closest("[data-no-localize],script,style,code,pre,textarea,input,select,option")) continue;
          const translated = translateThaiUi(record.target.nodeValue || "");
          if (translated !== record.target.nodeValue) record.target.nodeValue = translated;
          continue;
        }
        for (const node of record.addedNodes) {
          if (node instanceof Text) {
            if (!node.parentElement || node.parentElement.closest("[data-no-localize],script,style,code,pre,textarea,input,select,option")) continue;
            const translated = translateThaiUi(node.nodeValue || "");
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

  return <div ref={root}>
    <div className="locale-switch" style={{ position: "fixed", right: 16, bottom: 16, zIndex: 1000, display: "flex", gap: 4, padding: 4, borderRadius: 999, background: "#fff", boxShadow: "0 8px 30px rgba(0,0,0,.18)" }} aria-label="เลือกภาษา / Select language">
      <button type="button" onClick={() => choose("th")} style={{ border: 0, borderRadius: 999, padding: "8px 12px", background: locale === "th" ? "#0e7c86" : "transparent", color: locale === "th" ? "#fff" : "#334155" }}>ไทย</button>
      <button type="button" onClick={() => choose("en")} style={{ border: 0, borderRadius: 999, padding: "8px 12px", background: locale === "en" ? "#0e7c86" : "transparent", color: locale === "en" ? "#fff" : "#334155" }}>English</button>
    </div>
    {children}
  </div>;
}
