"use client";

import { useEffect, useState, type FormEvent, type MouseEvent } from "react";
import { clearBrowserOneTimeValues, displayNameFieldConstraints, identityTextError, newPasswordConstraints, normalizeIdentityText, passwordConfirmationError, retainBrowserOneTimeValues, safeMutationFetch } from "@djay/shared";

const invitationStorage = "djay.invitation";

export function InvitationAcceptanceClient({
  token: initialToken,
  tenantLoginUrl,
}: Readonly<{ token: string; tenantLoginUrl: string }>) {
  const [token, setToken] = useState(initialToken);
  const [status, setStatus] = useState<"idle" | "submitting" | "accepted" | "error" | "sign_in">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const retained = retainBrowserOneTimeValues({
      initialValues: { token: initialToken }, storagePrefix: invitationStorage, cleanPath: "/invitations/accept",
    });
    setToken(retained.token || "");
  }, [initialToken]);

  const tenantInvitationUrl = new URL("/invitations/accept", tenantLoginUrl);
  if (token) tenantInvitationUrl.hash = new URLSearchParams({ token }).toString();
  const existingAccountUrl = tenantInvitationUrl.toString();

  function continueExistingAccount(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    window.location.replace(existingAccountUrl);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const nameError = identityTextError(data.get("name"), "displayName");
    if (nameError) {
      const name = event.currentTarget.elements.namedItem("name");
      if (name instanceof HTMLInputElement) {
        name.setCustomValidity(nameError);
        name.reportValidity();
      }
      setStatus("error");
      setMessage(nameError);
      return;
    }
    const confirmationError = passwordConfirmationError(data.get("password"), data.get("passwordConfirmation"));
    if (confirmationError) {
      const confirmation = event.currentTarget.elements.namedItem("passwordConfirmation");
      if (confirmation instanceof HTMLInputElement) {
        confirmation.setCustomValidity(confirmationError);
        confirmation.reportValidity();
      }
      setStatus("error");
      setMessage(confirmationError);
      return;
    }
    setStatus("submitting");
    setMessage("");
    try {
      const response = await safeMutationFetch("/public/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          name: normalizeIdentityText(data.get("name")) || undefined,
          password: data.get("password") || undefined,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (result.status === "sign_in_required") {
        setStatus("sign_in");
        setMessage("อีเมลนี้มีบัญชีอยู่แล้ว โปรดไปตามขั้นตอนเข้าสู่ระบบแบบปลอดภัยเพื่อยอมรับคำเชิญ");
        return;
      }
      if (!response.ok) {
        if (response.status < 500) {
          clearBrowserOneTimeValues(invitationStorage, ["token"]);
          setToken("");
        }
        throw new Error(response.status >= 500 ? "การยอมรับคำเชิญไม่พร้อมใช้งานชั่วคราว โปรดลองอีกครั้ง" : "คำเชิญนี้ไม่ถูกต้องหรือหมดอายุแล้ว");
      }
      clearBrowserOneTimeValues(invitationStorage, ["token"]);
      setToken("");
      setStatus("accepted");
      setMessage("สิทธิ์เข้าถึงทีมของคุณพร้อมแล้ว เข้าสู่ระบบเพื่อดำเนินการต่อ");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "ยอมรับคำเชิญนี้ไม่สำเร็จ");
    }
  }

  return (
    <section className="verification-panel" aria-labelledby="invitation-title">
      <div className="brand-lockup verification-brand"><span className="brand-mark">D</span><span>DJAY BOT</span></div>
      <p className="step-label">คำเชิญเข้าร่วมทีม</p>
      <h1 id="invitation-title">เข้าร่วมพื้นที่ทำงานของคุณ</h1>
      {status === "accepted" || status === "sign_in" ? (
        <>
          <p className="verification-copy" role="status">{message}</p>
          {status === "sign_in"
            ? <a className="primary-link" href={existingAccountUrl} onClick={continueExistingAccount}>ไปหน้าเข้าสู่ระบบ</a>
            : <a className="primary-link" href={tenantLoginUrl}>เข้าสู่ระบบ</a>}
        </>
      ) : (
        <>
          <p className="verification-copy">ตั้งค่ารายละเอียดบัญชีเพื่อยอมรับคำเชิญนี้</p>
          <form onSubmit={submit}>
            <label>ชื่อของคุณ<input className="field" name="name" autoComplete="name" {...displayNameFieldConstraints} required onInput={(event) => event.currentTarget.setCustomValidity("")} /></label>
            <label>รหัสผ่าน<input className="field" type="password" name="password" autoComplete="new-password" aria-describedby="invitation-password-help" {...newPasswordConstraints} required /></label>
            <label>ยืนยันรหัสผ่าน<input className="field" type="password" name="passwordConfirmation" autoComplete="new-password" aria-describedby="invitation-password-help" {...newPasswordConstraints} required onInput={(event) => event.currentTarget.setCustomValidity("")} /></label>
            <p className="field-help" id="invitation-password-help">ใช้ 12-128 ตัวอักษร แนะนำให้ใช้วลีรหัสผ่านที่ยาวและไม่ซ้ำกับที่อื่น</p>
            <button type="submit" disabled={!token || status === "submitting"}>
              {status === "submitting" ? "กำลังเข้าร่วม..." : "ยอมรับคำเชิญ"}
            </button>
          </form>
          {message ? <p className="form-message error" role="alert">{message}</p> : null}
          <p className="sign-in">มีบัญชีแล้ว? {token
            ? <a href={existingAccountUrl} onClick={continueExistingAccount}>เข้าสู่ระบบก่อน</a>
            : <span>กำลังโหลดลิงก์ปลอดภัย...</span>}</p>
        </>
      )}
    </section>
  );
}
