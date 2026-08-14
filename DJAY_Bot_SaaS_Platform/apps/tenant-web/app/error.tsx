"use client";

import { BrandLockup, LocaleSwitch } from "./BrandChrome";

export default function ErrorPage({ reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return (
    <main className="recovery-page">
      <header className="recovery-header"><BrandLockup /><LocaleSwitch /><span className="recovery-realm">Workspace</span></header>
      <section className="recovery-content" aria-labelledby="error-title" role="alert">
        <p className="recovery-kicker">Workspace page unavailable</p>
        <h1 id="error-title">This workspace page needs another try.</h1>
        <p className="recovery-copy">Your last action may not have completed. Try again before repeating a change, or return to the workspace overview.</p>
        <div className="recovery-actions"><button type="button" onClick={reset}>Try again</button><a className="recovery-secondary" href="/workspace">Workspace overview</a><a className="recovery-secondary" href="/">Sign in</a></div>
      </section>
    </main>
  );
}
