"use client";

import { useState, type FormEvent } from "react";

export default function RecoveryRequestPage() {
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/public/auth/recovery/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.get("email") }),
      });
      const result = await response.json().catch(() => ({}));
      setMessage(result.message || "If the account exists, a recovery email has been sent.");
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
          <label>Work email<input type="email" name="email" autoComplete="email" required /></label>
          <button type="submit" disabled={working}>{working ? "Sending..." : "Send recovery email"}</button>
        </form>
        {message ? <p className="message" role="status">{message}</p> : null}
        <nav><a href="/">Return to sign in</a></nav>
      </section>
    </main>
  );
}

