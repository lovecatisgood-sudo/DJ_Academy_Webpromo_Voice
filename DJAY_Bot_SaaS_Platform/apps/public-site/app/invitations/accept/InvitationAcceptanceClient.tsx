"use client";

import { useState, type FormEvent } from "react";
import { safeMutationFetch } from "@djay/shared";

export function InvitationAcceptanceClient({
  token,
  tenantLoginUrl,
}: Readonly<{ token: string; tenantLoginUrl: string }>) {
  const [status, setStatus] = useState<"idle" | "submitting" | "accepted" | "error" | "sign_in">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await safeMutationFetch("/public/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          name: data.get("name") || undefined,
          password: data.get("password") || undefined,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (result.status === "sign_in_required") {
        setStatus("sign_in");
        setMessage("This email already has an account. Sign in, then open this invitation again.");
        return;
      }
      if (!response.ok) throw new Error(response.status >= 500 ? "Invitation acceptance is temporarily unavailable. Try again." : "This invitation is invalid or has expired.");
      setStatus("accepted");
      setMessage("Your team access is ready. Sign in to continue.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "This invitation could not be accepted.");
    }
  }

  return (
    <section className="verification-panel" aria-labelledby="invitation-title">
      <div className="brand-lockup verification-brand"><span className="brand-mark">D</span><span>DJAY BOT</span></div>
      <p className="step-label">Team invitation</p>
      <h1 id="invitation-title">Join your workspace</h1>
      {status === "accepted" || status === "sign_in" ? (
        <>
          <p className="verification-copy" role="status">{message}</p>
          <a className="primary-link" href={tenantLoginUrl}>Sign in</a>
        </>
      ) : (
        <>
          <p className="verification-copy">Set your account details to accept this invitation.</p>
          <form onSubmit={submit}>
            <label>Your name<input className="field" name="name" autoComplete="name" minLength={2} required /></label>
            <label>Password<input className="field" type="password" name="password" autoComplete="new-password" minLength={12} required /></label>
            <button type="submit" disabled={!token || status === "submitting"}>
              {status === "submitting" ? "Joining..." : "Accept invitation"}
            </button>
          </form>
          {message ? <p className="form-message error" role="alert">{message}</p> : null}
          <p className="sign-in">Already registered? <a href={tenantLoginUrl}>Sign in first</a></p>
        </>
      )}
    </section>
  );
}
