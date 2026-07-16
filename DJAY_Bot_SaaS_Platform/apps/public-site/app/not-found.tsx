export default function NotFound() {
  return (
    <main className="recovery-page">
      <header className="recovery-header"><span className="recovery-mark" aria-hidden="true">D</span><strong>DJAY BOT</strong><span className="recovery-realm">Website</span></header>
      <section className="recovery-content" aria-labelledby="not-found-title">
        <p className="recovery-kicker">Page not found</p>
        <h1 id="not-found-title">This page is not here.</h1>
        <p className="recovery-copy">The address may have changed or the link may be incomplete. Your account and workspace data have not been changed.</p>
        <div className="recovery-actions"><a className="recovery-primary" href="/">Create or view an account</a><a className="recovery-secondary" href="/status">Check service status</a></div>
      </section>
    </main>
  );
}
