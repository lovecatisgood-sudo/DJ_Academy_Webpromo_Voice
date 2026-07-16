"use client";

export default function ErrorPage({ reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return (
    <main className="recovery-page">
      <header className="recovery-header"><span className="recovery-mark" aria-hidden="true">D</span><strong>DJAY BOT</strong><span className="recovery-realm">Platform Master</span></header>
      <section className="recovery-content" aria-labelledby="error-title" role="alert">
        <p className="recovery-kicker">Platform page unavailable</p>
        <h1 id="error-title">The Platform console needs another try.</h1>
        <p className="recovery-copy">Do not assume an operational command completed. Try the page again or return to the console and verify current state before repeating it.</p>
        <div className="recovery-actions"><button type="button" onClick={reset}>Try again</button><a className="recovery-secondary" href="/">Return to Platform Master</a></div>
      </section>
    </main>
  );
}
