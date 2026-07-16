export default function NotFound() {
  return (
    <main className="recovery-page">
      <header className="recovery-header"><span className="recovery-mark" aria-hidden="true">D</span><strong>DJAY BOT</strong><span className="recovery-realm">Service endpoint</span></header>
      <section className="recovery-content" aria-labelledby="not-found-title">
        <p className="recovery-kicker">Endpoint not found</p>
        <h1 id="not-found-title">This API page does not exist.</h1>
        <p className="recovery-copy">Check the documented endpoint and request method. No account, workspace, or service record has been changed.</p>
        <div className="recovery-actions"><a className="recovery-primary" href="/">Return to API information</a></div>
      </section>
    </main>
  );
}
