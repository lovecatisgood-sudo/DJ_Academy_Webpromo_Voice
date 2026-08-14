import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./styles.css";
import { LocaleBoundary } from "./LocaleBoundary";

export const metadata: Metadata = {
  title: "DJBOT | FlowBot, TextBot และ VoiceBot สำหรับทีมขาย",
  description: "รวมระบบอัตโนมัติ การสนทนาด้วย AI และผู้ช่วยเสียงไว้ในเวิร์กสเปซเดียว เพื่อช่วยธุรกิจดูแลผู้สนใจได้ทันเวลา",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const initialLocale = cookieStore.get("djay-locale")?.value === "en" ? "en" : "th";
  return (
    <html lang={initialLocale}>
      <body><LocaleBoundary initialLocale={initialLocale}>{children}</LocaleBoundary></body>
    </html>
  );
}
