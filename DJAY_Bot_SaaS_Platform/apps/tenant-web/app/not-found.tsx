export default function NotFound() {
  return (
    <main className="recovery-page">
      <header className="recovery-header"><span className="recovery-mark" aria-hidden="true">D</span><strong>DJAY BOT</strong><span className="recovery-realm">Workspace</span></header>
      <section className="recovery-content" aria-labelledby="not-found-title">
        <p className="recovery-kicker">Page not found</p>
        <h1 id="not-found-title">This workspace page does not exist.</h1>
        <p className="recovery-copy">The link may be outdated or unavailable for this address. No customer or workspace record has been changed.</p>
        <div className="recovery-actions"><a className="recovery-primary" href="/workspace">Return to workspace</a><a className="recovery-secondary" href="/">Return to sign in</a></div>
      </section>
    </main>
  );
}
