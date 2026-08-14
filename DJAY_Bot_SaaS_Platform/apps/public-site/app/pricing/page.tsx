"use client";

import { useEffect, useState } from "react";
import { PublicInfoHeader } from "../PublicInfoHeader";
import { PublicFooter } from "../PublicFooter";
import { localeText, usePublicLocale } from "../LocaleBoundary";

type Plan = {
  planKey: string; publicName: string; tierName: string; summary: string; sellable: boolean;
  currency: "THB"; firstTermAmountMinor: number; renewalAmountMinor: number;
  billingInterval: "year"; billingIntervalCount: number; publicHighlights: string[];
};

function thb(amountMinor: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency", currency: "THB", minimumFractionDigits: 0, maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

export default function PricingPage() {
  const { locale } = usePublicLocale();
  const t = (th: string, en: string) => localeText(locale, th, en);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  async function load() {
    setState("loading");
    try { const response = await fetch("/public/catalog", { cache: "no-store" }); if (!response.ok) throw new Error(); setPlans((await response.json()).plans || []); setState("ready"); }
    catch { setPlans([]); setState("error"); }
  }
  useEffect(() => { void load(); }, []);
  const families = [["flowbot", "Flow Bot", t("เส้นทางสนทนาที่ควบคุมได้", "Controlled conversation journeys")], ["ai_chat", "AI Text Bot", t("สนทนาและคัดกรองด้วยข้อมูลที่อนุมัติ", "Conversations and qualification grounded in approved knowledge")], ["voice", "AI Voice Bot", t("รับความต้องการผ่านเสียงบนเว็บไซต์", "Capture customer needs through voice on your website")]] as const;
  return <main className="info-page" id="main-content"><PublicInfoHeader />
    <section className="info-hero pricing-hero"><p>{t("แพ็กเกจ DJBOT", "DJBOT PACKAGES")}</p><h1>{t("เลือกจากงานที่ต้องการให้ Bot ช่วย", "Choose by the job you want the bot to handle")}</h1><span>{t("เปรียบเทียบผลิตภัณฑ์ ความสามารถ ราคา และสถานะการเปิดใช้ จากนั้นจึงสร้างบัญชีเมื่อเลือกแพ็กเกจที่เปิดขายแล้ว", "Compare products, capabilities, pricing and availability. Create an account only after choosing an available package.")}</span></section>
    <section className="info-content pricing-content">
      <div className="release-notice"><strong>{t("สถานะการเปิดขาย", "SALES AVAILABILITY")}</strong><p>{t("ทุกแพ็กเกจยังอยู่ในสถานะพรีวิว ระบบจะแสดงปุ่มสร้างบัญชีเฉพาะแพ็กเกจที่ผ่านเกณฑ์การให้บริการและเปิดขายจากแคตตาล็อกแล้วเท่านั้น", "All packages are currently in preview. Account creation is shown only for packages approved for service and enabled in the commerce catalog.")}</p></div>
      {state === "loading" ? <div className="info-state">{t("กำลังโหลดแพ็กเกจปัจจุบัน...", "Loading current packages...")}</div> : state === "error" ? <div className="info-state error" role="alert">{t("แพ็กเกจไม่พร้อมใช้งานชั่วคราว", "Packages are temporarily unavailable")} <button onClick={() => void load()}>{t("ลองใหม่", "Try again")}</button></div> :
        <div className="pricing-families">{families.map(([key, name, description]) => { const familyPlans = plans.filter((plan) => plan.planKey.startsWith(key)); return <section className="pricing-family" key={key}><div className="pricing-family-intro"><p>{name}</p><h2>{description}</h2></div><div className="pricing-plan-list">{familyPlans.map((plan) => <article key={plan.planKey}><div className="plan-heading"><div><p>{plan.publicName}</p><h3>{plan.tierName}</h3></div><span className={plan.sellable ? "available" : "preview"}>{plan.sellable ? t("พร้อมใช้", "Available") : t("พรีวิว", "Preview")}</span></div><p className="plan-summary">{plan.summary}</p><div className="plan-price"><strong>{thb(plan.firstTermAmountMinor)}</strong><span>{t("สำหรับ 12 เดือนแรก", "for the first 12 months")}</span><small>{t("ต่ออายุ", "Renews at")} {thb(plan.renewalAmountMinor)} {t("ต่อปี", "per year")}</small></div><p className="price-tax-note">{plan.planKey === "flowbot_basic" ? t("จำนวนเงินรวมภาษีตามนโยบาย Flow Bot Starter", "Amount includes tax under the Flow Bot Starter policy") : t("ภาษีและเอกสารจะแสดงในรายการชำระเงินที่ได้รับอนุมัติ", "Tax and documentation appear in the approved payment record")}</p><ul>{plan.publicHighlights.map((item) => <li key={item}>{item}</li>)}</ul><a className={plan.sellable ? "plan-action active" : "plan-action disabled"} href={plan.sellable ? `/register?plan=${encodeURIComponent(plan.planKey)}` : "/help"}>{plan.sellable ? t("เลือกแพ็กเกจและสร้างบัญชี", "Choose package and create account") : t("ดูสถานะการเปิดใช้", "View availability status")}</a></article>)}</div></section>; })}</div>}
      <section className="pricing-help"><h2>{t("ยังไม่แน่ใจว่าควรเริ่มจาก Bot แบบไหน", "Not sure which bot to start with?")}</h2><p>{t("เลือกจากวิธีที่ลูกค้าติดต่อและระดับการควบคุมบทสนทนาที่ธุรกิจต้องการ", "Choose based on how customers contact you and how much control the conversation requires.")}</p><a href="/templates">{t("ดูตัวอย่างการใช้งาน", "Explore use cases")} <span aria-hidden="true">→</span></a></section>
    </section><PublicFooter />
  </main>;
}
