"use client";

export default function ErrorPage({ reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return (
    <main className="recovery-page">
      <header className="recovery-header"><span className="recovery-mark" aria-hidden="true">D</span><strong>DJAY BOT</strong><span className="recovery-realm">Service endpoint</span></header>
      <section className="recovery-content" aria-labelledby="error-title" role="alert">
        <p className="recovery-kicker">Service page unavailable</p>
        <h1 id="error-title">The service page needs another try.</h1>
        <p className="recovery-copy">Retry this page or return to the API information surface. Client applications should follow the endpoint's documented error contract.</p>
        <div className="recovery-actions"><button type="button" onClick={reset}>Try again</button><a className="recovery-secondary" href="/">API information</a></div>
      </section>
    </main>
  );
}
