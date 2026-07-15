"use client";

import { useState } from "react";

export function VerifyEmailClient({ token, tenantLoginUrl }: Readonly<{ token: string; tenantLoginUrl: string }>) {
  const [status, setStatus] = useState<"idle" | "working" | "verified" | "error">("idle");

  async function verify() {
    setStatus("working");
    try {
      const response = await fetch("/public/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const result = await response.json().catch(() => ({}));
      setStatus(response.ok && ["verified", "already_verified"].includes(result.status) ? "verified" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <section className="verification-panel" aria-labelledby="verification-title">
      <div className="brand-lockup verification-brand"><span className="brand-mark">D</span><span>DJAY BOT</span></div>
      <p className="step-label">Email verification</p>
      <h1 id="verification-title">Confirm your owner account</h1>
      {status === "verified" ? (
        <>
          <p className="verification-copy">Your workspace is ready. Sign in with the password you created.</p>
          <a className="primary-link" href={tenantLoginUrl}>Continue to sign in</a>
        </>
      ) : (
        <>
          <p className="verification-copy">Confirm this email to create the business workspace and its Tenant Master Admin account.</p>
          <button type="button" onClick={verify} disabled={status === "working" || !token}>
            {status === "working" ? "Confirming..." : "Confirm email"}
          </button>
          {status === "error" || !token ? <p className="form-message error" role="alert">This link is invalid or expired.</p> : null}
        </>
      )}
    </section>
  );
}

