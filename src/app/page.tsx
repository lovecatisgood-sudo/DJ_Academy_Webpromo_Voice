import Script from "next/script";

export default function Home() {
  return (
    <>
      <main id="app" />
      <Script src="/assets/js/promo.js" strategy="afterInteractive" />
      <Script src="/djai-voice-widget.js" strategy="afterInteractive" data-mode="inline" />
    </>
  );
}
