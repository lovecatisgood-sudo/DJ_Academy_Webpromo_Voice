"use client";

import { useState, type FormEvent } from "react";

export function RecoveryCompleteClient({ token }: Readonly<{ token: string }>) {
  const [status, setStatus] = useState<"idle" | "working" | "completed" | "error">("idle");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("working");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/public/auth/recovery/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: data.get("newPassword") }),
      });
      const result = await response.json().catch(() => ({}));
      setStatus(response.ok && result.status === "completed" ? "completed" : "error");
    } catch {
      setStatus("error");
    }
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
      {status === "error" || !token ? <p className="message error" role="alert">This recovery link is invalid or expired.</p> : null}
    </>
  );
}

