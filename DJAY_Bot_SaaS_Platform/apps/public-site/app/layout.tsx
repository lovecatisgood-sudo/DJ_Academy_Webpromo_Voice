import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "DJBOT | FlowBot, TextBot, and VoiceBot for sales teams",
  description: "DJBOT gives businesses three AI bot products: FlowBot automation, TextBot conversations, and VoiceBot call handling to convert more leads before they go cold.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
