"use client";

import { useEffect, useState } from "react";
import { clearBrowserOneTimeValues, retainBrowserOneTimeValues, safeMutationFetch } from "@djay/shared";
import { VerificationResendForm } from "../VerificationResendForm";
import { BrandLockup } from "../PublicHeader";

const verificationStorage = "djay.verification";

export function VerifyEmailClient({ token: initialToken, tenantLoginUrl }: Readonly<{ token: string; tenantLoginUrl: string }>) {
  const [token, setToken] = useState(initialToken);
  const [status, setStatus] = useState<"idle" | "working" | "verified" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [retryable, setRetryable] = useState(false);

  useEffect(() => {
    const retained = retainBrowserOneTimeValues({
      initialValues: { token: initialToken }, storagePrefix: verificationStorage, cleanPath: "/verify-email",
    });
    setToken(retained.token || "");
  }, [initialToken]);

  async function verify() {
    setStatus("working");
    setErrorMessage("");
    setRetryable(false);
    const response = await safeMutationFetch("/public/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, locale: /(?:^|;\s*)djay-locale=en(?:;|$)/.test(document.cookie) ? "en" : "th" }),
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok && ["verified", "already_verified"].includes(result.status)) {
      clearBrowserOneTimeValues(verificationStorage, ["token"]);
      setToken("");
      setStatus("verified");
    }
    else {
      setStatus("error");
      setRetryable(response.status >= 500);
      if (response.status < 500) {
        clearBrowserOneTimeValues(verificationStorage, ["token"]);
        setToken("");
      }
      setErrorMessage(response.status >= 500 ? "การยืนยันอีเมลไม่พร้อมใช้งานชั่วคราว โปรดลองอีกครั้ง" : "ลิงก์นี้ไม่ถูกต้องหรือหมดอายุแล้ว");
    }
  }

  const showResend = status === "error" || !token;
  const showConfirm = Boolean(token) && (status !== "error" || retryable);

  return (
    <section className="verification-panel" aria-labelledby="verification-title">
      <div className="verification-brand"><BrandLockup /></div>
      <p className="step-label">ยืนยันอีเมล</p>
      <h1 id="verification-title">ยืนยันบัญชีเจ้าของของคุณ</h1>
      {status === "verified" ? (
        <>
          <p className="verification-copy">พื้นที่ทำงานของคุณพร้อมแล้ว เข้าสู่ระบบด้วยรหัสผ่านที่คุณสร้างไว้</p>
          <a className="primary-link" href={tenantLoginUrl}>ไปหน้าเข้าสู่ระบบ</a>
        </>
      ) : (
        <>
          <p className="verification-copy">{showResend && !retryable
            ? "ขอลิงก์ยืนยันใหม่ด้านล่างเพื่อดำเนินการสร้างพื้นที่ทำงานธุรกิจต่อ"
            : retryable
            ? "ติดต่อบริการยืนยันไม่ได้ โปรดลองลิงก์นี้อีกครั้งหรือขอลิงก์ใหม่"
            : "ยืนยันอีเมลนี้เพื่อสร้างพื้นที่ทำงานธุรกิจและบัญชี Tenant Master Admin"}</p>
          {showConfirm ? <button type="button" onClick={verify} disabled={status === "working"}>
            {status === "working" ? "กำลังยืนยัน..." : "ยืนยันอีเมล"}
          </button> : null}
          {showResend ? <p className="form-message error" role="alert">{errorMessage || "ลิงก์นี้ไม่ถูกต้องหรือหมดอายุแล้ว"}</p> : null}
          {showResend ? <VerificationResendForm /> : null}
        </>
      )}
    </section>
  );
}
