import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DJAI Academy | เว็บไซต์ แชตบอต AI และผู้ช่วยฝ่ายขายด้วยเสียง",
  description:
    "บริการออกแบบเว็บไซต์ วางโครงสร้าง SEO แชตบอต AI ผู้ช่วยฝ่ายขายด้วยเสียง และโฮสติ้งสำหรับธุรกิจไทย",
  keywords: [
    "DJAI Academy",
    "website packages",
    "landing page",
    "complete website",
    "AI chatbot",
    "AI voice agent",
    "SEO",
    "hosting",
    "รับทำเว็บไซต์",
    "แชตบอต AI",
    "ผู้ช่วยฝ่ายขาย AI",
  ],
  openGraph: {
    locale: "th_TH",
    alternateLocale: ["en_US"],
    type: "website",
    title: "DJAI Academy | เว็บไซต์และผู้ช่วยฝ่ายขาย AI สำหรับธุรกิจไทย",
    description: "ออกแบบเว็บไซต์ วางโครงสร้าง SEO พร้อมแชตบอตและผู้ช่วยฝ่ายขายด้วยเสียง",
  },
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
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Noto+Sans+Thai:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;700&display=swap"
          rel="stylesheet"
        />
        <link rel="stylesheet" href="/assets/css/styles.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
