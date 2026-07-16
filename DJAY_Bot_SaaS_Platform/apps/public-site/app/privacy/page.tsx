import type { Metadata } from "next";
import { LegalDocumentClient } from "../LegalDocumentClient";

export const metadata: Metadata = {
  title: "Privacy Notice | DJAY Bot",
  description: "Current approved DJAY Bot privacy notice.",
};

export default function PrivacyPage() {
  return <LegalDocumentClient kind="privacy" />;
}
