import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "DJBOT | AI chat, flow automation, and voice for sales teams",
  description: "DJBOT helps businesses respond faster, qualify leads, automate follow-up, and keep conversations warm across chat, social messaging, and voice.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
