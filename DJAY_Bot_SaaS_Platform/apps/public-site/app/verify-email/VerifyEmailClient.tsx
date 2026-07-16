"use client";

import { useState } from "react";
import { safeMutationFetch } from "@djay/shared";
import { VerificationResendForm } from "../VerificationResendForm";

export function VerifyEmailClient({ token, tenantLoginUrl }: Readonly<{ token: string; tenantLoginUrl: string }>) {
  const [status, setStatus] = useState<"idle" | "working" | "verified" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [retryable, setRetryable] = useState(false);

  async function verify() {
    setStatus("working");
    setErrorMessage("");
    setRetryable(false);
    const response = await safeMutationFetch("/public/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok && ["verified", "already_verified"].includes(result.status)) setStatus("verified");
    else {
      setStatus("error");
      setRetryable(response.status >= 500);
      setErrorMessage(response.status >= 500 ? "Email verification is temporarily unavailable. Try again." : "This link is invalid or expired.");
    }
  }

  const showResend = status === "error" || !token;
  const showConfirm = Boolean(token) && (status !== "error" || retryable);

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
          <p className="verification-copy">{showResend && !retryable
            ? "Request a new verification link below to continue creating the business workspace."
            : retryable
            ? "The verification service could not be reached. Try this link again or request a new one."
            : "Confirm this email to create the business workspace and its Tenant Master Admin account."}</p>
          {showConfirm ? <button type="button" onClick={verify} disabled={status === "working"}>
            {status === "working" ? "Confirming..." : "Confirm email"}
          </button> : null}
          {showResend ? <p className="form-message error" role="alert">{errorMessage || "This link is invalid or expired."}</p> : null}
          {showResend ? <VerificationResendForm /> : null}
        </>
      )}
    </section>
  );
}
