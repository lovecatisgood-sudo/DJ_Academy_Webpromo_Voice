import "./styles.css";

export const metadata = {
  title: "DJAY Bot API",
  description: "DJAY Bot service endpoint and health surface.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
