"use client";

import { useEffect, useState, type FormEvent } from "react";
import { clearBrowserOneTimeValues, retainBrowserOneTimeValues, safeMutationFetch } from "@djay/shared";

const recoveryStorage = "djay.recovery";

export function RecoveryCompleteClient({ token: initialToken }: Readonly<{ token: string }>) {
  const [token, setToken] = useState(initialToken);
  const [status, setStatus] = useState<"idle" | "working" | "completed" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const retained = retainBrowserOneTimeValues({
      initialValues: { token: initialToken }, storagePrefix: recoveryStorage, cleanPath: "/recovery/complete",
    });
    setToken(retained.token || "");
  }, [initialToken]);

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
    if (response.ok && result.status === "completed") {
      clearBrowserOneTimeValues(recoveryStorage, ["token"]);
      setToken("");
      setStatus("completed");
    } else {
      if (response.status < 500) {
        clearBrowserOneTimeValues(recoveryStorage, ["token"]);
        setToken("");
      }
      setStatus("error");
      setErrorMessage(response.status >= 500 ? "Password recovery is temporarily unavailable. Try again." : "This recovery link is invalid or expired.");
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
      {status === "error" || !token ? <p className="message error" role="alert">{errorMessage || "This recovery link is invalid or expired."}</p> : null}
    </>
  );
}
