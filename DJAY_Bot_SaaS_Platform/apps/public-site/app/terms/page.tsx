import type { Metadata } from "next";
import { LegalDocumentClient } from "../LegalDocumentClient";

export const metadata: Metadata = {
  title: "ข้อกำหนดบริการ | DJAY Bot",
  description: "ข้อกำหนดบริการฉบับอนุมัติปัจจุบันของ DJAY Bot",
};

export default function TermsPage() {
  return <LegalDocumentClient kind="terms" />;
}
