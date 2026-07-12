import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DJAI Academy | เว็บไซต์ AI และ Voice Sales Agent",
  description:
    "แพ็กเกจเว็บไซต์พร้อมดีไซน์มืออาชีพ SEO, AI chatbot, voice sales agent และโฮสติ้งสำหรับธุรกิจไทยและอังกฤษ",
  keywords: [
    "DJAI Academy",
    "website packages",
    "landing page",
    "complete website",
    "AI chatbot",
    "AI voice agent",
    "SEO",
    "hosting",
  ],
  icons: {
    icon: "/assets/icons/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;700&display=swap"
          rel="stylesheet"
        />
        <link rel="stylesheet" href="/assets/css/styles.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
