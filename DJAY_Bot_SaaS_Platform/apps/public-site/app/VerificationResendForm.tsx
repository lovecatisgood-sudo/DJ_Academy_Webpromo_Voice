"use client";

import { safeMutationFetch } from "@djay/shared";
import { useState, type FormEvent } from "react";

export function VerificationResendForm({ initialEmail = "" }: Readonly<{ initialEmail?: string }>) {
  const [status, setStatus] = useState<"idle" | "working" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("working");
    setMessage("");
    const data = new FormData(event.currentTarget);
    const response = await safeMutationFetch("/public/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: data.get("email") }),
    });
    if (response.ok) {
      setStatus("sent");
      setMessage("If a pending account matches that email, a new verification link has been sent.");
    } else {
      setStatus("error");
      setMessage(response.status >= 500
        ? "Verification email delivery is temporarily unavailable. Try again shortly."
        : "Enter a valid work email and try again.");
    }
  }

  return (
    <div className="verification-resend">
      <div>
        <strong>Need a new verification link?</strong>
        <span>For privacy, the result is the same whether or not an account exists.</span>
      </div>
      <form onSubmit={submit}>
        <label>
          Work email
          <input className="field" type="email" name="email" autoComplete="email" defaultValue={initialEmail} required />
        </label>
        <button type="submit" disabled={status === "working"}>
          {status === "working" ? "Sending..." : "Send new link"}
        </button>
      </form>
      {message ? <p className={`resend-message ${status}`} role={status === "error" ? "alert" : "status"}>{message}</p> : null}
    </div>
  );
}
