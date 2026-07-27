import type { Metadata } from "next";
import "./styles.css";
import { LocaleBoundary } from "./LocaleBoundary";

export const metadata: Metadata = {
  title: "ระบบจัดการ FlowBot",
  description: "แดชบอร์ดจัดการแชตบอตแบบกำหนดเส้นทาง"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body><LocaleBoundary>{children}</LocaleBoundary></body>
    </html>
  );
}
