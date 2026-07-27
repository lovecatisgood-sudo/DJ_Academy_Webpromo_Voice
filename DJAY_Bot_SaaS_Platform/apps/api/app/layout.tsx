import "./styles.css";

export const metadata = {
  title: "DJAY Bot API",
  description: "จุดให้บริการ API และหน้าสถานะของ DJAY Bot",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="th"><body>{children}</body></html>;
}
