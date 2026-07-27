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
import { VerificationResendForm } from "./VerificationResendForm";

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
    title: "FlowBot",
    availability: "preview" as const,
    copy: "บอตอัตโนมัติแบบมีโครงสร้างสำหรับเส้นทางลูกค้า FAQ แบบฟอร์ม การเก็บข้อมูลผู้สนใจ และการส่งต่อ เชื่อมต่อกับ LINE Official Account และเว็บไซต์ของคุณ",
  },
  {
    title: "TextBot",
    availability: "preview" as const,
    copy: "แชตบอต AI ฝ่ายขายที่ตอบคำถามจากคลังความรู้ธุรกิจที่คุณอนุมัติ และคัดกรองความตั้งใจซื้อบนเว็บไซต์",
  },
  {
    title: "VoiceBot",
    availability: "pilot" as const,
    copy: "วิดเจ็ตเสียงบนเว็บไซต์สำหรับคัดกรองผู้สนใจด้วยการสนทนา รับคำขอโทรกลับ บันทึกบทสนทนา และสรุปผล",
  },
  {
    title: "Unified Workspace",
    availability: "preview" as const,
    copy: "พื้นที่ทำงานเดียวสำหรับข้อมูลติดต่อ ผู้สนใจ กล่องข้อความ คลังความรู้ การใช้งาน บิล สิทธิ์ทีม และการตั้งค่า",
  },
];

/**
 * Channel availability is stated per channel rather than as a single count, because the
 * previous "Channels 4" figure counted channels that have no merchant connection flow.
 */
const channelStates = [
  { title: "เว็บไซต์ของคุณ", availability: "preview" as const },
  { title: "LINE Official Account", availability: "preview" as const },
  { title: "Facebook Messenger", availability: "unavailable" as const },
  { title: "WhatsApp", availability: "unavailable" as const },
  { title: "Instagram", availability: "unavailable" as const },
];

/**
 * Outcome statements describe what the product does, not quantified business results.
 * Quantified claims require a defined metric, source, and baseline recorded in the release
 * evidence registry; none is accepted yet, so none is advertised.
 */
const outcomes = [
  "ตอบทุกคำถามทันทีที่ลูกค้าทักมา",
  "ไม่ปล่อยให้ผู้สนใจที่พร้อมซื้อเย็นลงข้ามคืน",
  "ส่งต่อบทสนทนาให้ทีมโดยไม่เสียประวัติ",
  "เก็บรายละเอียดผู้สนใจอัตโนมัติ ไม่ต้องพิมพ์ซ้ำ",
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
    <main className="landing-page">
      <header className="landing-nav" aria-label="เมนูหลัก">
        <a className="brand-lockup public-brand" href="/">
          <span className="brand-mark" aria-hidden="true">D</span>
          <span>DJBOT</span>
        </a>
        <nav>
          <a href="#features">ฟีเจอร์</a>
          <a href="#benefits">ประโยชน์</a>
          <a href="/login">เข้าสู่ระบบ</a>
          <a className="nav-cta" href="#start">เริ่มต้น</a>
        </nav>
      </header>

      <section className="landing-hero" aria-labelledby="brand-title">
        <div className="hero-copy">
          <p className="eyebrow">ระบบขายอัตโนมัติด้วย AI สำหรับธุรกิจยุคใหม่</p>
          <h1 id="brand-title">เปลี่ยนผู้สนใจให้เป็นลูกค้าก่อนที่โอกาสจะเย็นลง</h1>
          <p className="supporting-copy">
            DJBOT รวมบอตเพิ่มยอดขายสามแบบไว้ในพื้นที่ทำงาน SaaS เดียว: FlowBot สำหรับอัตโนมัติแบบมีเส้นทาง TextBot สำหรับแชต AI และ VoiceBot สำหรับสนทนาด้วยเสียงบนเว็บไซต์
          </p>
          <div className="hero-actions">
            <a className="primary-link" href="#start">สร้างพื้นที่ทำงาน</a>
            <a className="secondary-link" href="#features">ดูฟีเจอร์</a>
          </div>
        </div>
        <div className="hero-product" aria-label="ตัวอย่างพื้นที่ทำงานเพิ่มยอดขายของ DJBOT">
          <div className="product-topbar">
            <span>ศูนย์จัดการผู้สนใจ</span>
            <strong>สด</strong>
          </div>
          <div className="conversation-card priority">
            <small>คำถามจาก LINE</small>
            <strong>บอตตอบก่อน แล้วส่งต่อให้ทีม</strong>
            <p>FlowBot ถามคำถามคัดกรอง บันทึกรายละเอียดลูกค้าเป็นผู้สนใจ และส่งต่อบทสนทนาให้คนในทีมเมื่อจำเป็น</p>
          </div>
          {/* Descriptive labels only. This grid previously carried unevidenced metrics. */}
          <div className="conversation-grid">
            <div><span>การตอบกลับ</span><strong>อัตโนมัติ</strong></div>
            <div><span>ข้อมูลผู้สนใจ</span><strong>บันทึกแล้ว</strong></div>
            <div><span>การส่งต่อ</span><strong>ให้ทีมคุณ</strong></div>
            <div><span>ภาษา</span><strong>ไทย / English</strong></div>
          </div>
          <div className="flow-preview">
            <span>ผู้สนใจใหม่</span>
            <span>คัดกรอง</span>
            <span>นัดหมาย</span>
            <span>ปิดการขาย</span>
          </div>
        </div>
      </section>

      <section className="outcome-band" id="benefits" aria-label="ผลลัพธ์ทางธุรกิจ">
        {outcomes.map((outcome) => <div key={outcome}>{outcome}</div>)}
      </section>

      <section className="feature-section" id="features" aria-labelledby="features-title">
        <div className="section-heading">
          <p className="step-label">ผลิตภัณฑ์บอตสามแบบ</p>
          <h2 id="features-title">FlowBot, TextBot และ VoiceBot ทำงานร่วมกันเพื่อเปลี่ยนผู้สนใจให้เป็นลูกค้าเร็วขึ้น</h2>
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

      <section className="channel-section" aria-labelledby="channels-title">
        <div className="section-heading">
          <p className="step-label">ช่องทาง</p>
          <h2 id="channels-title">พื้นที่ที่บอตของคุณคุยกับลูกค้าได้</h2>
        </div>
        <ul className="channel-grid">
          {channelStates.map((channel) => (
            <li key={channel.title}>
              <strong>{channel.title}</strong>
              <span className={`availability-badge availability-${channel.availability}`}>
                {availabilityLabels[channel.availability]}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="conversion-section" aria-labelledby="conversion-title">
        <div>
          <p className="step-label">ทำไมจึงได้ผล</p>
          <h2 id="conversion-title">ความเร็วช่วยปิดช่องว่างระหว่างความสนใจและการซื้อ</h2>
        </div>
        <div className="conversion-copy">
          <p>ผู้สนใจส่วนใหญ่ไม่ได้หายไปเพราะไม่มีคุณภาพ แต่หายไปเพราะไม่มีใครตอบเร็วพอ ติดตามชัดพอ หรือจำบริบทได้เมื่อลูกค้ากลับมา</p>
          <p>DJBOT ทำให้บทสนทนาเดินหน้าตั้งแต่ข้อความแรกจนถึงการส่งต่อ: เส้นทาง FlowBot แบบมีโครงสร้าง คำตอบจาก TextBot ที่อ้างอิงคลังความรู้ธุรกิจของคุณ การเก็บข้อมูลผู้สนใจ และการรับช่วงโดยคนในกล่องข้อความร่วม</p>
        </div>
      </section>

      <section className="signup-section" id="start" aria-labelledby="register-title">
        <div className="form-wrap">
          <p className="step-label">สมัครพื้นที่ทำงาน</p>
          <h2 id="register-title">{status === "accepted" ? "ตรวจอีเมลของคุณ" : "สร้างบัญชีของคุณ"}</h2>
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
                {plans.map((plan) => (
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
                {catalogStage === "ready" && !plans.length ? <div className="plan-load-state" role="status">ปิดการเลือกผลิตภัณฑ์ใหม่ชั่วคราว คุณยังสร้างบัญชีเจ้าของได้</div> : null}
                {catalogStage === "error" ? <div className="plan-load-state error" role="alert"><span>โหลดผลิตภัณฑ์ไม่สำเร็จ คุณดำเนินการต่อได้โดยไม่เลือกผลิตภัณฑ์</span><button type="button" onClick={() => void loadCatalog()}>ลองอีกครั้ง</button></div> : null}
              </div>
              <p>ระบบจะบันทึกเป็นค่าตั้งต้นสำหรับการตั้งค่า และเปิดใช้งานแผนนี้หลังชำระเงิน</p>
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
