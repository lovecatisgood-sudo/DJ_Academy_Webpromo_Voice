"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
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
import { VerificationResendForm } from "./VerificationResendForm";
import { PublicHeader } from "./PublicHeader";

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
const availabilityLabels = {
  active: "พร้อมใช้งาน",
  pilot: "นำร่อง - ตามข้อตกลง",
  preview: "พรีวิว - ยังไม่เปิดขาย",
  unavailable: "ยังไม่พร้อมใช้งาน",
} as const;

const productPillars = [
  {
    title: "Flow Bot",
    availability: "preview" as const,
    copy: "กำหนดเส้นทางสนทนา FAQ แบบฟอร์ม การเก็บข้อมูลผู้สนใจ และการส่งต่อบนเว็บไซต์ โดยทุกคำตอบเป็นไปตาม Flow ที่คุณอนุมัติ",
  },
  {
    title: "AI Text Bot",
    availability: "preview" as const,
    copy: "แชตบอต AI ฝ่ายขายที่ตอบคำถามจากคลังความรู้ธุรกิจที่คุณอนุมัติ และคัดกรองความตั้งใจซื้อบนเว็บไซต์",
  },
  {
    title: "AI Voice Bot",
    availability: "preview" as const,
    copy: "วิดเจ็ตเสียงบนเว็บไซต์สำหรับตอบคำถาม คัดกรองผู้สนใจ รับคำขอโทรกลับ เก็บ transcript และสรุปผล โดยไม่บันทึกเสียงเป็นค่าเริ่มต้น",
  },
  {
    title: "Unified Workspace",
    availability: "preview" as const,
    copy: "พื้นที่ทำงานเดียวสำหรับข้อมูลติดต่อ ผู้สนใจ กล่องข้อความ คลังความรู้ การใช้งาน บิล สิทธิ์ทีม และการตั้งค่า",
  },
];

/**
 * Outcome statements describe what the product does, not quantified business results.
 * Quantified claims require a defined metric, source, and baseline recorded in the release
 * evidence registry; none is accepted yet, so none is advertised.
 */
const outcomes = [
  "ตอบจาก Flow หรือข้อมูลที่คุณอนุมัติ",
  "เก็บผู้สนใจและคำขอนัดหมายในพื้นที่ทำงานเดียว",
  "ส่งต่อพร้อมประวัติสนทนาให้ทีมรับช่วง",
  "ตรวจการตั้งค่าและเว็บไซต์ก่อนเปิดใช้",
];

export default function RegistrationPage() {
  const idempotencyKey = useRef<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "accepted" | "error">("idle");
  const [message, setMessage] = useState("");
  const [plans, setPlans] = useState<CatalogPlan[]>([]);
  const [selectedPlanKey, setSelectedPlanKey] = useState("");
  const [catalogStage, setCatalogStage] = useState<"loading" | "ready" | "error">("loading");
  const [legalStage, setLegalStage] = useState<"loading" | "ready" | "error">("loading");
  const [legal, setLegal] = useState<LegalMetadata | null>(null);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");
  const selectablePlans = plans.filter((plan) => plan.sellable);

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

  useEffect(() => { void loadCatalog(); void loadLegal(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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

  return (
    <main className="landing-page" id="main-content">
      <PublicHeader variant="landing" />

      <section className="landing-hero" aria-labelledby="brand-title">
        <div className="hero-copy">
          <p className="eyebrow">Bot สำหรับเว็บไซต์ธุรกิจ</p>
          <h1 id="brand-title">ดูแลทุกบทสนทนาในที่เดียว</h1>
          <p className="supporting-copy">
            สร้าง ทดสอบ ติดตั้ง และดูแล Flow Bot, AI Text Bot และ AI Voice Bot โดยไม่ต้องตั้งค่าผู้ให้บริการเอง
          </p>
          <div className="hero-actions">
            <a className="primary-link" href="#start">สร้างพื้นที่ทำงาน</a>
            <a className="secondary-link" href="#features">ดูวิธีทำงาน</a>
          </div>
        </div>
        <figure className="hero-visual">
          <Image src="/images/djay-merchant-automation-hero.png" width={1584} height={992} priority sizes="(max-width: 820px) 100vw, 46vw" alt="เจ้าของธุรกิจไทยกำลังดูแลบทสนทนาจากเว็บไซต์ด้วยคอมพิวเตอร์" />
          <figcaption>เว็บไซต์รับบทสนทนา Bot ช่วยจัดการ และทีมรับช่วงได้เมื่อจำเป็น</figcaption>
        </figure>
      </section>

      <section className="outcome-band" id="benefits" aria-label="ผลลัพธ์ทางธุรกิจ">
        {outcomes.map((outcome) => <div key={outcome}>{outcome}</div>)}
      </section>

      <section className="feature-section" id="features" aria-labelledby="features-title">
        <div className="section-heading">
          <p className="step-label">Bot สามแบบในพื้นที่ทำงานเดียว</p>
          <h2 id="features-title">เลือกวิธีสนทนาที่เหมาะกับงานของคุณ</h2>
        </div>
        <div className="feature-grid">
          {productPillars.map((feature) => (
            <article className="feature-card" key={feature.title}>
              <h3>{feature.title}</h3>
              <p className={`availability-badge availability-${feature.availability}`}>
                {availabilityLabels[feature.availability]}
              </p>
              <p>{feature.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="conversion-section" aria-labelledby="conversion-title">
        <div>
          <p className="step-label">ตั้งค่าได้อย่างมั่นใจ</p>
          <h2 id="conversion-title">ระบบพาไปทีละงานและตรวจหลักฐานจริง</h2>
        </div>
        <div className="conversion-copy">
          <p>เริ่มจากเป้าหมายธุรกิจ เลือก Bot และใช้เทมเพลตที่แก้ไขได้ คุณออกจากการตั้งค่าแล้วกลับมาทำต่อได้โดยข้อมูลไม่หาย</p>
          <p>ศูนย์ทดสอบตรวจสิทธิ์ เวอร์ชันที่เผยแพร่ ต้นทางเว็บไซต์ และบทสนทนาที่สำเร็จจากข้อมูลบนเซิร์ฟเวอร์ จึงกดข้ามเพื่อให้ระบบแสดงว่าพร้อมไม่ได้</p>
        </div>
      </section>

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
              <legend>เริ่มจากผลิตภัณฑ์</legend>
              <div className="plan-options">
                {catalogStage === "loading" ? <div className="plan-load-state" aria-live="polite" aria-busy="true">กำลังโหลดผลิตภัณฑ์ที่พร้อมใช้งาน...</div> : null}
                {selectablePlans.map((plan) => (
                  <label className={selectedPlanKey === plan.planKey ? "plan-option selected" : "plan-option"} key={plan.planKey}>
                    <input
                      type="radio"
                      name="selectedPlanKey"
                      value={plan.planKey}
                      checked={selectedPlanKey === plan.planKey}
                      onChange={() => setSelectedPlanKey(plan.planKey)}
                    />
                    <span><strong>{plan.publicName}</strong><small>{plan.publicHighlights[0]}</small></span>
                  </label>
                ))}
                {catalogStage === "ready" && !selectablePlans.length ? <div className="plan-load-state" role="status">ยังไม่มีแพ็กเกจที่เปิดให้ซื้อด้วยตนเอง คุณสร้างบัญชีได้และเลือก Bot ตัวแรกในขั้นตอนถัดไป</div> : null}
                {catalogStage === "error" ? <div className="plan-load-state error" role="alert"><span>โหลดผลิตภัณฑ์ไม่สำเร็จ คุณดำเนินการต่อได้โดยไม่เลือกผลิตภัณฑ์</span><button type="button" onClick={() => void loadCatalog()}>ลองอีกครั้ง</button></div> : null}
              </div>
              <p>{selectablePlans.length ? "ระบบจะบันทึกแพ็กเกจที่เลือกไว้สำหรับขั้นตอนชำระเงิน" : "การสร้างบัญชีไม่เปิดใช้แพ็กเกจหรือเริ่มเรียกเก็บเงิน"}</p>
            </fieldset>
            {legalStage === "loading" ? <div className="legal-load-state" role="status" aria-live="polite">กำลังโหลดข้อกำหนดบริการและประกาศความเป็นส่วนตัวฉบับปัจจุบัน...</div> : null}
            {legalStage === "error" ? <div className="legal-load-state error" role="alert"><span>หยุดการสมัครชั่วคราวเพราะโหลดข้อกำหนดบริการหรือประกาศความเป็นส่วนตัวที่อนุมัติแล้วไม่ได้</span><button type="button" onClick={() => void loadLegal()}>ลองอีกครั้ง</button></div> : null}
            <label className="check-row">
              <input type="checkbox" name="acceptTerms" value="yes" required disabled={legalStage !== "ready"} checked={acceptedLegal} onChange={(event) => setAcceptedLegal(event.currentTarget.checked)} />
              <span>ฉันยอมรับ<a href="/terms" target="_blank" rel="noreferrer">ข้อกำหนดบริการ</a>และ<a href="/privacy" target="_blank" rel="noreferrer">ประกาศความเป็นส่วนตัว</a>{legal ? <small> เวอร์ชัน {legal.terms.version} และ {legal.privacy.version} มีผลวันที่ {legal.terms.effectiveDate} และ {legal.privacy.effectiveDate}</small> : null}</span>
            </label>
            <button type="submit" disabled={status === "submitting" || legalStage !== "ready"}>
              {status === "submitting" ? "กำลังสร้าง..." : "สร้างพื้นที่ทำงาน"}
            </button>
          </form>}
          {message && status !== "accepted" ? <p className={`form-message ${status}`} role={status === "error" ? "alert" : "status"}>{message}</p> : null}
          <p className="sign-in">สมัครแล้ว? <a href="/login">เข้าสู่ระบบ</a></p>
        </div>
      </section>
    </main>
  );
}
