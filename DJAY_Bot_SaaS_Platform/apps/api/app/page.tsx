export default function ApiRoot() {
  return (
    <main className="api-page">
      <header className="api-header"><span className="api-mark" aria-hidden="true">D</span><strong>DJAY BOT</strong><span>Service endpoint</span></header>
      <section className="api-content" aria-labelledby="api-title">
        <p>Developer service</p>
        <h1 id="api-title">DJAY Bot API</h1>
        <p className="api-copy">This origin serves authenticated DJAY Bot applications and installed customer widgets. Account access and service updates are available on the main website.</p>
        <a className="api-link" href={process.env.PUBLIC_APP_URL || "https://djaybot.com"}>Go to DJAY Bot</a>
      </section>
    </main>
  );
}
