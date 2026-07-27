import type { Metadata } from "next";
import "./styles.css";
import { LocaleBoundary } from "./LocaleBoundary";

export const metadata: Metadata = {
  title: "เข้าสู่ระบบเวิร์กสเปซ | DJAY Bot",
  description: "จัดการ FlowBot, TextBot และ VoiceBot สำหรับธุรกิจของคุณ",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="th"><body><LocaleBoundary>{children}</LocaleBoundary></body></html>;
}
