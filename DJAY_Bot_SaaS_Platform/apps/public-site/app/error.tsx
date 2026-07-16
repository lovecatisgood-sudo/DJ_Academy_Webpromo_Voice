"use client";

export default function ErrorPage({ reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return (
    <main className="recovery-page">
      <header className="recovery-header"><span className="recovery-mark" aria-hidden="true">D</span><strong>DJAY BOT</strong><span className="recovery-realm">Website</span></header>
      <section className="recovery-content" aria-labelledby="error-title" role="alert">
        <p className="recovery-kicker">Page unavailable</p>
        <h1 id="error-title">We could not finish loading this page.</h1>
        <p className="recovery-copy">Try the page again. If it still does not load, return to the website or check current service status.</p>
        <div className="recovery-actions"><button type="button" onClick={reset}>Try again</button><a className="recovery-secondary" href="/">Return home</a><a className="recovery-secondary" href="/status">Service status</a></div>
      </section>
    </main>
  );
}
