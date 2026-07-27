"use client";

import { useEffect, useState, type ReactNode } from "react";
import { translateThaiUi } from "../lib/thai-ui";

function selectedLocale(): "th" | "en" {
  const query = new URLSearchParams(window.location.search).get("lang");
  if (query === "en" || query === "th") return query;
  return localStorage.getItem("flowbot-locale") === "en" ? "en" : "th";
}

export function LocaleBoundary({ children }: Readonly<{ children: ReactNode }>) {
  const [locale, setLocale] = useState<"th" | "en">("th");
  useEffect(() => {
    const selected = selectedLocale();
    setLocale(selected);
    localStorage.setItem("flowbot-locale", selected);
    document.cookie = `flowbot-locale=${selected}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = selected;
    const localizeText = (node: Node) => {
      if (!(node instanceof Text) || !node.parentElement || node.parentElement.closest("[data-no-localize],script,style,code,pre,textarea,input,select,option")) return;
      const translated = translateThaiUi(node.nodeValue || "");
      if (translated !== node.nodeValue) node.nodeValue = translated;
    };
    const localize = (root: Node) => {
      if (selected !== "th" || !(root instanceof Element) || root.closest("[data-no-localize]")) return;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent || parent.closest("[data-no-localize],script,style,code,pre,textarea,input,select,option")) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      let node: Node | null;
      while ((node = walker.nextNode())) localizeText(node);
      for (const element of [root, ...root.querySelectorAll("[placeholder],[aria-label],[title]")]) {
        if (element.closest("[data-no-localize]")) continue;
        for (const attr of ["placeholder", "aria-label", "title"]) if (element.hasAttribute(attr)) {
          const value = element.getAttribute(attr) || "";
          const translated = translateThaiUi(value);
          if (translated !== value) element.setAttribute(attr, translated);
        }
      }
    };
    localize(document.body);
    if (selected !== "th") return;
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "characterData") {
          localizeText(record.target);
          continue;
        }
        for (const node of record.addedNodes) {
          if (node instanceof Text) localizeText(node);
          else localize(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  const change = (locale: "th" | "en") => { localStorage.setItem("flowbot-locale", locale); const url = new URL(location.href); url.searchParams.set("lang", locale); location.href = url.toString(); };
  return <><div>{children}</div><div data-no-localize className="locale-switch" aria-label="เลือกภาษา / Select language"><button type="button" aria-pressed={locale === "th"} onClick={() => change("th")}>ไทย</button><button type="button" aria-pressed={locale === "en"} onClick={() => change("en")}>English</button></div></>;
}
