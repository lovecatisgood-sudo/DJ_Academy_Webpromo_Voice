import type { Metadata } from "next";
import { LegalDocumentClient } from "../LegalDocumentClient";

export const metadata: Metadata = {
  title: "Service Terms | DJAY Bot",
  description: "Current approved DJAY Bot service terms.",
};

export default function TermsPage() {
  return <LegalDocumentClient kind="terms" />;
}
