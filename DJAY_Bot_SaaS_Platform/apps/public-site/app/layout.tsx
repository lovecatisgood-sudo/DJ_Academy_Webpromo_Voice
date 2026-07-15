import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Create workspace | DJAY Bot",
  description: "Create and secure your DJAY Bot business workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

