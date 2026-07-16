export default function NotFound() {
  return (
    <main className="recovery-page">
      <header className="recovery-header"><span className="recovery-mark" aria-hidden="true">D</span><strong>DJAY BOT</strong><span className="recovery-realm">Platform Master</span></header>
      <section className="recovery-content" aria-labelledby="not-found-title">
        <p className="recovery-kicker">Page not found</p>
        <h1 id="not-found-title">This Platform page does not exist.</h1>
        <p className="recovery-copy">The address is not part of the restricted Platform console. No tenant, routing, support, or release state has been changed.</p>
        <div className="recovery-actions"><a className="recovery-primary" href="/">Return to Platform Master</a></div>
      </section>
    </main>
  );
}
