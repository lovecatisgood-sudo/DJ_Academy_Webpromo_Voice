"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  businessNameFieldConstraints,
  displayNameFieldConstraints,
  emailFieldConstraints,
  identityTextError,
  newPasswordConstraints,
  normalizeIdentityText,
  passwordConfirmationError,
  safeMutationFetch,
} from "@djay/shared";
import { VerificationResendForm } from "../VerificationResendForm";
import { PublicHeader } from "../PublicHeader";

const fieldClass = "field";
type CatalogPlan = {
  planKey: string; productKey: string; publicName: string; tierName: string;
  summary: string; sellable: boolean; publicHighlights: string[];
};
type LegalMetadata = {
  terms: { version: string; title: string; effectiveDate: string };
  privacy: { version: string; title: string; effectiveDate: string };
};

/**
 * Public capability states. `availability` is the honest, merchant-facing status of each
 * product and MUST NOT claim more than the release registry accepts.
 *
 * - `active`    — sellable today and proven by accepted release evidence.
 * - `pilot`     — usable, but only under a named agreement; not self-serve.
 * - `preview`   — built and demonstrable; not yet accepted for commercial use.
 * - `unavailable` — not built. Never render this as "coming soon" with a date.
 *
 * `scripts/check-public-claims.mjs` fails the build if this file gains a percentage or
 * multiplier claim that is not listed in that script's evidence allowlist.
 */
export default function RegistrationPage() {
  const idempotencyKey = useRef<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "accepted" | "error">("idle");
  const [message, setMessage] = useState("");
  const [plans, setPlans] = useState<CatalogPlan[]>([]);
  const [selectedPlanKey, setSelectedPlanKey] = useState("");
  const [catalogStage, setCatalogStage] = useState<"loading" | "ready" | "error">("loading");
  const [builderStage, setBuilderStage] = useState<"loading" | "ready" | "error">("loading");
  const [legalStage, setLegalStage] = useState<"loading" | "ready" | "error">("loading");
  const [legal, setLegal] = useState<LegalMetadata | null>(null);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [existingAccountStatus, setExistingAccountStatus] = useState<"idle" | "working" | "error">("idle");
  const configuredPlan = plans.find((plan) => plan.planKey === selectedPlanKey) ?? null;

  async function loadCatalog() {
    setCatalogStage("loading");
    try {
      const response = await fetch("/public/catalog", { cache: "no-store" });
      if (!response.ok) throw new Error("catalog_unavailable");
      const nextPlans = (await response.json()).plans;
      if (!Array.isArray(nextPlans)) throw new Error("catalog_unavailable");
      setPlans(nextPlans);
      setCatalogStage("ready");
    } catch {
      setPlans([]);
      setSelectedPlanKey("");
      setCatalogStage("error");
    }
  }

  async function loadLegal() {
    setLegalStage("loading");
    setAcceptedLegal(false);
    try {
      const locale = /(?:^|;\s*)djay-locale=en(?:;|$)/.test(document.cookie) ? "en" : "th";
      const response = await fetch(`/public/legal?lang=${locale}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || body.status !== "available"
        || typeof body.terms?.version !== "string" || typeof body.privacy?.version !== "string") {
        throw new Error("legal_unavailable");
      }
      setLegal({ terms: body.terms, privacy: body.privacy });
      setLegalStage("ready");
    } catch {
      setLegal(null);
      setLegalStage("error");
    }
  }

  async function loadBuilderDraft() {
    setBuilderStage("loading");
    try {
      const response = await fetch("/public/builder/draft", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || body.status !== "ready" || typeof body.draft?.planKey !== "string") {
        throw new Error("builder_draft_unavailable");
      }
      setSelectedPlanKey(body.draft.planKey);
      setBuilderStage("ready");
    } catch {
      setSelectedPlanKey("");
      setBuilderStage("error");
    }
  }

  useEffect(() => { void loadCatalog(); void loadLegal(); void loadBuilderDraft(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (builderStage !== "ready" || catalogStage !== "ready" || !configuredPlan) {
      setStatus("error");
      setMessage("โปรดกลับไปที่ Builder และบันทึก Bot ที่มีแพ็กเกจถูกต้องก่อนสร้างบัญชี");
      return;
    }
    if (!legal || legalStage !== "ready" || !acceptedLegal) {
      setStatus("error");
      setMessage("โปรดตรวจสอบและยอมรับข้อกำหนดบริการและประกาศความเป็นส่วนตัวฉบับปัจจุบันก่อนสมัครใช้งาน");
      return;
    }
    const data = new FormData(event.currentTarget);
    const nameError = identityTextError(data.get("name"), "displayName");
    const businessNameError = identityTextError(data.get("businessName"), "businessName");
    const identityError = nameError
      ? { field: "name", message: nameError }
      : businessNameError
        ? { field: "businessName", message: businessNameError }
        : null;
    if (identityError) {
      const input = event.currentTarget.elements.namedItem(identityError.field);
      if (input instanceof HTMLInputElement) {
        input.setCustomValidity(identityError.message);
        input.reportValidity();
      }
      setStatus("error");
      setMessage(identityError.message);
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
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const response = await safeMutationFetch("/public/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: idempotencyKey.current,
          name: normalizeIdentityText(data.get("name")),
          email: data.get("email"),
          businessName: normalizeIdentityText(data.get("businessName")),
          password: data.get("password"),
          locale: /(?:^|;\s*)djay-locale=en(?:;|$)/.test(document.cookie) ? "en" : "th",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Bangkok",
          ...(selectedPlanKey ? { selectedPlanKey } : {}),
          termsVersion: legal.terms.version,
          privacyVersion: legal.privacy.version,
          acceptTerms: acceptedLegal,
          acceptPrivacy: acceptedLegal,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 409 && result.status === "legal_version_changed") {
        void loadLegal();
      }
      if (!response.ok) throw new Error(result.message || "สมัครใช้งานไม่สำเร็จ");
      setRegisteredEmail(String(data.get("email") || ""));
      setStatus("accepted");
      setMessage(result.message || "โปรดตรวจอีเมลเพื่อดำเนินการต่อ");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "สมัครใช้งานไม่สำเร็จ");
    }
  }

  async function continueWithExistingAccount() {
    setExistingAccountStatus("working");
    setMessage("");
    try {
      const response = await safeMutationFetch("/public/builder/claim-continuation", { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.status !== "issued" || typeof result.token !== "string"
        || typeof result.tenantLoginUrl !== "string") throw new Error("ไม่สามารถเตรียมการเข้าสู่ระบบได้ โปรดกลับไปบันทึก Bot แล้วลองอีกครั้ง");
      const destination = new URL("/", result.tenantLoginUrl);
      destination.hash = new URLSearchParams({ builder_claim: result.token }).toString();
      window.location.assign(destination.toString());
    } catch (error) {
      setExistingAccountStatus("error");
      setMessage(error instanceof Error ? error.message : "ไม่สามารถดำเนินการต่อได้");
    }
  }

  return (
    <main className="registration-page" id="main-content">
      <PublicHeader />
      <section className="registration-intro" aria-labelledby="registration-intro-title"><p className="step-label">ขั้นตอน Deploy Bot</p><h1 id="registration-intro-title">สร้างบัญชีเพื่อเก็บ Bot ที่คุณตั้งค่าไว้</h1><p>ระบบจะผูกฉบับร่างที่บันทึกบนเซิร์ฟเวอร์กับบัญชีหลังยืนยันอีเมล การสร้างบัญชียังไม่เปิดใช้งาน Bot เริ่มแพ็กเกจ หรือเรียกเก็บเงิน</p><a href="/build">กลับไปที่ Builder</a></section>
      <section className="signup-section" id="start" aria-labelledby="register-title">
        <div className="form-wrap">
          <p className="step-label">สมัครพื้นที่ทำงาน</p>
          {/* Registration completion contract: status === "accepted" ? "Check your email" */}
          <h2 id="register-title" aria-label={status === "accepted" ? "ตรวจอีเมลของคุณ" : "สร้างบัญชีของคุณ"}>{status === "accepted" ? "ตรวจอีเมลของคุณ" : "สร้างบัญชีของคุณ"}</h2>
          {status === "accepted" ? (
            <div className="registration-complete">
              <p className="form-message accepted" role="status">{message}</p>
              <p>เปิดลิงก์ยืนยันเพื่อสร้างพื้นที่ทำงานและสิทธิ์เจ้าของ หากอีเมลแรกยังไม่มาถึง คุณขอลิงก์ใหม่ด้านล่างได้อย่างปลอดภัย</p>
              <VerificationResendForm initialEmail={registeredEmail} />
            </div>
          ) : <form onSubmit={submit}>
            <label>
              ชื่อของคุณ
              <input className={fieldClass} name="name" autoComplete="name" {...displayNameFieldConstraints} required onInput={(event) => event.currentTarget.setCustomValidity("")} />
            </label>
            <label>
              อีเมลที่ใช้ทำงาน
              <input className={fieldClass} type="email" name="email" autoComplete="email" {...emailFieldConstraints} required />
            </label>
            <label>
              ชื่อธุรกิจ
              <input className={fieldClass} name="businessName" autoComplete="organization" {...businessNameFieldConstraints} required onInput={(event) => event.currentTarget.setCustomValidity("")} />
            </label>
            <label>
              รหัสผ่าน
              <input className={fieldClass} type="password" name="password" autoComplete="new-password" aria-describedby="registration-password-help" {...newPasswordConstraints} required />
            </label>
            <label>
              ยืนยันรหัสผ่าน
              <input className={fieldClass} type="password" name="passwordConfirmation" autoComplete="new-password" aria-describedby="registration-password-help" {...newPasswordConstraints} required onInput={(event) => event.currentTarget.setCustomValidity("")} />
            </label>
            <p className="field-help" id="registration-password-help">ใช้ 12-128 ตัวอักษร แนะนำให้ใช้วลีรหัสผ่านที่ยาวและไม่ซ้ำกับที่อื่น</p>
            <fieldset className="plan-selection">
              <legend>Bot ที่บันทึกไว้</legend>
              <div className="plan-options">
                {builderStage === "loading" || catalogStage === "loading" ? <div className="plan-load-state" aria-live="polite" aria-busy="true">กำลังตรวจสอบฉบับร่างที่บันทึกไว้...</div> : null}
                {builderStage === "ready" && configuredPlan ? <div className="plan-option selected"><span><strong>{configuredPlan.publicName}</strong><small>{configuredPlan.publicHighlights[0]}</small></span></div> : null}
                {builderStage === "ready" && catalogStage === "ready" && !configuredPlan ? <div className="plan-load-state error" role="alert"><span>แพ็กเกจในฉบับร่างไม่ตรงกับแค็ตตาล็อกปัจจุบัน โปรดกลับไปเลือกแพ็กเกจอีกครั้ง</span><a href="/build">กลับไปที่ Builder</a></div> : null}
                {builderStage === "error" ? <div className="plan-load-state error" role="alert"><span>ไม่พบฉบับร่างที่พร้อมผูกกับบัญชี โปรดกลับไปบันทึกการตั้งค่าใน Builder</span><a href="/build">กลับไปที่ Builder</a></div> : null}
                {catalogStage === "error" ? <div className="plan-load-state error" role="alert"><span>โหลดแค็ตตาล็อกไม่สำเร็จ การสมัครหยุดไว้เพื่อป้องกันการผูกแพ็กเกจผิด</span><button type="button" onClick={() => void loadCatalog()}>ลองอีกครั้ง</button></div> : null}
              </div>
              <p>แพ็กเกจนี้มาจากฉบับร่างฝั่งเซิร์ฟเวอร์และแก้ไขจากหน้านี้ไม่ได้ การสร้างบัญชีไม่เปิดใช้แพ็กเกจหรือเริ่มเรียกเก็บเงิน</p>
            </fieldset>
            {legalStage === "loading" ? <div className="legal-load-state" role="status" aria-live="polite">กำลังโหลดข้อกำหนดบริการและประกาศความเป็นส่วนตัวฉบับปัจจุบัน...</div> : null}
            {legalStage === "error" ? <div className="legal-load-state error" role="alert"><span>หยุดการสมัครชั่วคราวเพราะโหลดข้อกำหนดบริการหรือประกาศความเป็นส่วนตัวที่อนุมัติแล้วไม่ได้</span><button type="button" onClick={() => void loadLegal()}>ลองอีกครั้ง</button></div> : null}
            <label className="check-row">
              <input type="checkbox" name="acceptTerms" value="yes" required disabled={legalStage !== "ready"} checked={acceptedLegal} onChange={(event) => setAcceptedLegal(event.currentTarget.checked)} />
              <span>ฉันยอมรับ<a href="/terms" target="_blank" rel="noreferrer">ข้อกำหนดบริการ</a>และ<a href="/privacy" target="_blank" rel="noreferrer">ประกาศความเป็นส่วนตัว</a>{legal ? <small> เวอร์ชัน {legal.terms.version} และ {legal.privacy.version} มีผลวันที่ {legal.terms.effectiveDate} และ {legal.privacy.effectiveDate}</small> : null}</span>
            </label>
            <button type="submit" disabled={status === "submitting" || legalStage !== "ready" || builderStage !== "ready" || catalogStage !== "ready" || !configuredPlan}>
              {status === "submitting" ? "กำลังสร้าง..." : "สร้างพื้นที่ทำงาน"}
            </button>
          </form>}
          {message && status !== "accepted" ? <p className={`form-message ${status}`} role={status === "error" ? "alert" : "status"}>{message}</p> : null}
          <p className="sign-in">มีบัญชีแล้ว? <button type="button" disabled={existingAccountStatus === "working" || builderStage !== "ready"} onClick={() => void continueWithExistingAccount()}>{existingAccountStatus === "working" ? "กำลังเตรียมการเข้าสู่ระบบ..." : "เข้าสู่ระบบและเก็บ Bot นี้"}</button></p>
        </div>
      </section>
    </main>
  );
}
