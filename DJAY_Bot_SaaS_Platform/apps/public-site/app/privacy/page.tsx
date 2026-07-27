import type { Metadata } from "next";
import { LegalDocumentClient } from "../LegalDocumentClient";

export const metadata: Metadata = {
  title: "ประกาศความเป็นส่วนตัว | DJAY Bot",
  description: "ประกาศความเป็นส่วนตัวฉบับอนุมัติปัจจุบันของ DJAY Bot",
};

export default function PrivacyPage() {
  return <LegalDocumentClient kind="privacy" />;
}
