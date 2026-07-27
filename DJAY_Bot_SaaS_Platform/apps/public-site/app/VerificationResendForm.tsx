"use client";

import { emailFieldConstraints, safeMutationFetch } from "@djay/shared";
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
      body: JSON.stringify({ email: data.get("email"), locale: /(?:^|;\s*)djay-locale=en(?:;|$)/.test(document.cookie) ? "en" : "th" }),
    });
    if (response.ok) {
      setStatus("sent");
      setMessage("หากมีบัญชีที่รอดำเนินการตรงกับอีเมลนี้ ระบบได้ส่งลิงก์ยืนยันใหม่แล้ว");
    } else {
      setStatus("error");
      setMessage(response.status >= 500
        ? "การส่งอีเมลยืนยันไม่พร้อมใช้งานชั่วคราว โปรดลองอีกครั้งในภายหลัง"
        : "กรอกอีเมลที่ใช้ทำงานให้ถูกต้องแล้วลองอีกครั้ง");
    }
  }

  return (
    <div className="verification-resend">
      <div>
        <strong>ต้องการลิงก์ยืนยันใหม่หรือไม่?</strong>
        <span>เพื่อความเป็นส่วนตัว ผลลัพธ์จะแสดงเหมือนกันไม่ว่าจะมีบัญชีอยู่หรือไม่</span>
      </div>
      <form onSubmit={submit}>
        <label>
          อีเมลที่ใช้ทำงาน
          <input className="field" type="email" name="email" autoComplete="email" defaultValue={initialEmail} {...emailFieldConstraints} required />
        </label>
        <button type="submit" disabled={status === "working"}>
          {status === "working" ? "กำลังส่ง..." : "ส่งลิงก์ใหม่"}
        </button>
      </form>
      {message ? <p className={`resend-message ${status}`} role={status === "error" ? "alert" : "status"}>{message}</p> : null}
    </div>
  );
}
