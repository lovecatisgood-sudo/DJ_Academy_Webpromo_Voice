"use client";

import { useEffect, useState } from "react";
import { PublicInfoHeader } from "../PublicInfoHeader";

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
  const [plans, setPlans] = useState<Plan[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  async function load() {
    setState("loading");
    try { const response = await fetch("/public/catalog", { cache: "no-store" }); if (!response.ok) throw new Error(); setPlans((await response.json()).plans || []); setState("ready"); }
    catch { setPlans([]); setState("error"); }
  }
  useEffect(() => { void load(); }, []);
  return <main className="info-page" id="main-content"><PublicInfoHeader />
    <section className="info-hero"><p>แพ็กเกจและสถานะพร้อมใช้</p><h1>เลือกจากเส้นทางลูกค้า ไม่ใช่ศัพท์เทคนิค</h1><span>สถานะแพ็กเกจมาจากแคตตาล็อกการค้าโดยตรง ระบบชำระเงินจะยังไม่เปิดจนกว่าหลักฐานการเปิดให้บริการจะได้รับอนุมัติ</span></section>
    <section className="info-content">
      {state === "loading" ? <div className="info-state">กำลังโหลดแพ็กเกจปัจจุบัน…</div> : state === "error" ? <div className="info-state error" role="alert">แพ็กเกจไม่พร้อมใช้งานชั่วคราว <button onClick={() => void load()}>ลองใหม่</button></div> :
        <div className="pricing-grid">{plans.map((plan) => <article key={plan.planKey}><span className={plan.sellable ? "available" : "preview"}>{plan.sellable ? "พร้อมใช้" : "ยังไม่เปิดให้ซื้อด้วยตนเอง"}</span><p>{plan.publicName}</p><h2>{plan.tierName}</h2><div className="plan-price"><strong>{thb(plan.firstTermAmountMinor)}</strong><span>สำหรับ 12 เดือนแรก</span><small>ต่ออายุ {thb(plan.renewalAmountMinor)} ต่อปี</small></div><p className="price-tax-note">{plan.planKey === "flowbot_basic" ? "จำนวนเงินรวมภาษีตามนโยบาย Flow Bot Starter" : "จำนวนเงินตามแคตตาล็อก ภาษีและเอกสารยืนยันในรายการชำระเงินที่ได้รับอนุมัติ"}</p><p>{plan.summary}</p><ul>{plan.publicHighlights.map((item) => <li key={item}>{item}</li>)}</ul><a href={plan.sellable ? "/#start" : "/help"}>{plan.sellable ? "เลือกแพ็กเกจ" : "อ่านสถานะการเปิดใช้"}</a></article>)}</div>}
    </section>
  </main>;
}
