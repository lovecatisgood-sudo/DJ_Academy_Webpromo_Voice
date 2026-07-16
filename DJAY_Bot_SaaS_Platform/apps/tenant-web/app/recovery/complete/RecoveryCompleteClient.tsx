"use client";

import { useState, type FormEvent } from "react";
import { safeMutationFetch } from "@djay/shared";

export function RecoveryCompleteClient({ token }: Readonly<{ token: string }>) {
  const [status, setStatus] = useState<"idle" | "working" | "completed" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("working");
    const data = new FormData(event.currentTarget);
    setErrorMessage("");
    const response = await safeMutationFetch("/public/auth/recovery/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword: data.get("newPassword") }),
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.status === "completed") setStatus("completed");
    else { setStatus("error"); setErrorMessage(response.status >= 500 ? "Password recovery is temporarily unavailable. Try again." : "This recovery link is invalid or expired."); }
  }

  if (status === "completed") {
    return <><p className="message">Password updated. All previous sessions were signed out.</p><nav><a href="/">Sign in</a></nav></>;
  }
  return (
    <>
      <form onSubmit={submit}>
        <label>New password<input type="password" name="newPassword" autoComplete="new-password" minLength={12} required /></label>
        <button type="submit" disabled={status === "working" || !token}>{status === "working" ? "Updating..." : "Update password"}</button>
      </form>
      {status === "error" || !token ? <p className="message error" role="alert">{errorMessage || "This recovery link is invalid or expired."}</p> : null}
    </>
  );
}
