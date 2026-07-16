import type { Metadata } from "next";
import StatusPageClient from "./StatusPageClient";

export const metadata: Metadata = {
  title: "Service status | DJAY Bot",
  description: "Current provider-neutral availability for DJAY Bot customer services.",
};

export default function StatusPage() {
  return <StatusPageClient />;
}
