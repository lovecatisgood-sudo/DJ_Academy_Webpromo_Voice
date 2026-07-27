"use client";

import { useState, type FormEvent } from "react";
import { emailFieldConstraints, safeMutationFetch } from "@djay/shared";

export default function RecoveryRequestPage() {
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    const data = new FormData(event.currentTarget);
    try {
      const response = await safeMutationFetch("/public/auth/recovery/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), locale: /(?:^|;\s*)djay-locale=en(?:;|$)/.test(document.cookie) ? "en" : "th" }),
      });
      const result = await response.json().catch(() => ({}));
      setMessage(response.ok ? result.message || "If the account exists, a recovery email has been sent." : response.status >= 500 ? "Recovery is temporarily unavailable. Try again shortly." : result.message || "The recovery request could not be submitted.");
    } catch {
      setMessage("Recovery is unavailable. Try again shortly.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <main>
      <header><span className="mark">D</span><strong>DJAY BOT</strong><span className="realm">Account recovery</span></header>
      <section aria-labelledby="recovery-title">
        <p>Account security</p>
        <h1 id="recovery-title">Reset your password</h1>
        <form onSubmit={submit}>
          <label>Work email<input type="email" name="email" autoComplete="email" {...emailFieldConstraints} required /></label>
          <button type="submit" disabled={working}>{working ? "Sending..." : "Send recovery email"}</button>
        </form>
        {message ? <p className="message" role="status">{message}</p> : null}
        <nav><a href="/">Return to sign in</a></nav>
      </section>
    </main>
  );
}
