import type { Metadata } from "next";
import "./styles.css";
import { LocaleBoundary } from "./LocaleBoundary";

export const metadata: Metadata = { title: "ระบบจัดการแพลตฟอร์ม | DJAY Bot" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="th"><body><LocaleBoundary>{children}</LocaleBoundary></body></html>;
}
