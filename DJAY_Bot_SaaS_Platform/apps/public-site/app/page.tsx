"use client";

import Image from "next/image";
import { localeText, usePublicLocale } from "./LocaleBoundary";
import { PublicFooter } from "./PublicFooter";
import { PublicHeader } from "./PublicHeader";

const availabilityLabels: Record<string, { th: string; en: string }> = { preview: { th: "พรีวิว", en: "Preview" } };
const productPillars = [
  { key: "flow", title: "Flow Bot", availability: "preview", th: "วางเส้นทางคำถาม คำตอบ และแบบฟอร์มให้ลูกค้าไปถึงจุดหมายที่คุณกำหนด", en: "Guide customers through approved questions, answers and forms toward a destination you define.", benefitTh: "เหมาะกับ FAQ การเก็บข้อมูล และขั้นตอนที่ต้องการความแน่นอน", benefitEn: "Best for FAQs, data capture and journeys that need predictable control." },
  { key: "text", title: "AI Text Bot", availability: "preview", th: "ตอบคำถามจากข้อมูลธุรกิจที่อนุมัติ พร้อมช่วยคัดกรองว่าลูกค้าต้องการอะไร", en: "Answer from approved business knowledge while identifying what each customer needs.", benefitTh: "ทีมได้รับบริบทที่พร้อมใช้ต่อ แทนการเริ่มถามข้อมูลเดิมใหม่", benefitEn: "Give your team useful context instead of making them restart every conversation." },
  { key: "voice", title: "AI Voice Bot", availability: "preview", th: "เปิดทางให้ลูกค้าพูดคุย ขอให้โทรกลับ หรือแจ้งความต้องการผ่านเสียงบนเว็บไซต์", en: "Let customers speak, request a callback or explain what they need by voice on your website.", benefitTh: "เพิ่มทางเลือกให้ผู้ที่สะดวกพูดมากกว่าพิมพ์ โดยทีมยังตรวจสอบสรุปบทสนทนาได้", benefitEn: "Support customers who prefer speaking while keeping a reviewable conversation summary." },
];

const benefits = [
  { titleTh: "ตอบได้เร็วขึ้น", copyTh: "ลูกค้าที่กำลังสนใจไม่ต้องรอจนหมดความตั้งใจ", titleEn: "Respond sooner", copyEn: "Keep interested customers moving while their intent is still fresh" },
  { titleTh: "คัดกรองก่อนส่งต่อ", copyTh: "ทีมใช้เวลากับโอกาสที่มีข้อมูลและขั้นตอนถัดไปชัดเจนกว่า", titleEn: "Qualify before handoff", copyEn: "Help your team focus on opportunities with context and a clear next step" },
  { titleTh: "เก็บบริบทไว้ด้วยกัน", copyTh: "การติดตามต่อไม่ต้องเริ่มถามลูกค้าใหม่ตั้งแต่ต้น", titleEn: "Keep context together", copyEn: "Continue follow-up without asking customers to repeat themselves" },
  { titleTh: "ควบคุมคำตอบได้", copyTh: "ธุรกิจรักษามาตรฐานข้อมูลและเลือกได้ว่าเมื่อใดควรให้คนรับช่วง", titleEn: "Stay in control", copyEn: "Keep information consistent and decide when a person should take over" },
] as const;

export default function HomePage() {
  const { locale } = usePublicLocale();
  const t = (th: string, en: string) => localeText(locale, th, en);
  return <main className="landing-page" id="main-content">
    <PublicHeader variant="landing" />
    <section className="landing-hero" aria-labelledby="hero-title">
      <div className="hero-copy">
        <p className="eyebrow">{t("DJBOT สำหรับธุรกิจขนาดเล็ก", "DJBOT FOR SMALL BUSINESSES")}</p>
        <h1 id="hero-title">{t("เปลี่ยนทุกบทสนทนาให้เป็นโอกาสขาย", "Turn every conversation into a sales opportunity")}</h1>
        <p className="supporting-copy">{t("ช่วยตอบคำถาม คัดกรองลูกค้า เก็บลีด นัดหมาย และส่งต่อให้ทีม ผ่านแชตและเสียงบนเว็บไซต์", "Answer questions, qualify customers, capture leads, arrange appointments and hand off to your team through web chat and voice.")}</p>
        <div className="hero-actions"><a className="primary-link" href="/pricing">{t("ดูแพ็กเกจ", "View packages")}</a><a className="secondary-link" href="#solutions">{t("ดูว่า DJBOT ช่วยอะไรได้บ้าง", "See how DJBOT helps")}</a></div>
        <p className="availability-note">{t("ผลิตภัณฑ์อยู่ในสถานะพรีวิว แพ็กเกจจะเปิดขายเมื่อผ่านเกณฑ์การให้บริการ", "Products are currently in preview. Packages open only after service readiness is approved.")}</p>
      </div>
      <figure className="hero-visual"><Image src="/images/djay-merchant-automation-hero.png" width={1584} height={992} priority sizes="(max-width: 900px) 100vw, 48vw" alt={t("เจ้าของธุรกิจใช้ DJBOT ดูแลบทสนทนาจากเว็บไซต์", "A business owner using DJBOT to manage website conversations")} /></figure>
    </section>

    <section className="problem-section section-shell" aria-labelledby="problem-title">
      <div className="section-intro"><p className="step-label">{t("เมื่อลูกค้าสนใจ เวลามีความหมาย", "WHEN INTEREST IS HIGH, TIMING MATTERS")}</p><h2 id="problem-title">{t("ยอดขายอาจหายไปก่อนที่ทีมจะได้เริ่มคุย", "A sale can disappear before your team gets to the conversation")}</h2></div>
      <div className="problem-copy"><p>{t("ลูกค้าถามหลังเวลาทำการ พนักงานตอบคำถามเดิมซ้ำ และข้อมูลติดต่อกระจายอยู่หลายที่ เมื่อกลับมาติดตาม ลูกค้าอาจเปลี่ยนใจไปแล้ว", "Customers ask after hours, staff repeat the same answers and contact details become scattered. By the time someone follows up, the customer may have moved on.")}</p><p>{t("DJBOT ช่วยรับช่วงงานเบื้องต้นในจังหวะที่ลูกค้ากำลังสนใจ แล้วส่งข้อมูลที่จำเป็นให้ทีมดำเนินการต่อ", "DJBOT handles the first part of the journey while intent is active, then gives your team the information needed to continue.")}</p></div>
    </section>

    <section className="solutions-section section-shell" id="solutions" aria-labelledby="solutions-title">
      <div className="section-intro"><p className="step-label">{t("สามวิธีสนทนา หนึ่งพื้นที่ทำงาน", "THREE CONVERSATION MODES, ONE WORKSPACE")}</p><h2 id="solutions-title">{t("เลือก Bot ตามงานที่ธุรกิจต้องการทำ", "Choose the bot that matches the job")}</h2><p>{t("เริ่มจากเส้นทางที่ควบคุมได้ เพิ่ม AI เมื่อต้องการสนทนาที่ยืดหยุ่น และใช้เสียงเมื่อลูกค้าสะดวกพูด", "Start with controlled journeys, add AI for flexible conversations and offer voice when speaking is easier for customers.")}</p></div>
      <div className="solution-list">{productPillars.map((solution, index) => { const label = availabilityLabels[solution.availability]!; return <article className={`solution-row solution-${solution.key}`} key={solution.title}><div className="solution-index">0{index + 1}</div><div><p className="solution-type">{solution.title}</p><h3>{t(solution.th, solution.en)}</h3><p>{t(solution.benefitTh, solution.benefitEn)}</p></div><span className={`availability-badge availability-${solution.availability}`}>{t(label.th, label.en)}</span></article>; })}</div>
    </section>

    <section className="journey-section" aria-labelledby="journey-title"><div className="section-shell"><div className="section-intro light"><p className="step-label">{t("จากคำถาม ไปสู่ขั้นตอนถัดไป", "FROM QUESTION TO NEXT STEP")}</p><h2 id="journey-title">{t("ทุกบทสนทนาควรพาลูกค้าไปข้างหน้า", "Every conversation should move the customer forward")}</h2></div><ol className="journey-flow"><li><span>01</span><strong>{t("รับคำถาม", "Receive enquiry")}</strong><small>{t("ลูกค้าเริ่มแชตหรือเสียง", "Customer starts by chat or voice")}</small></li><li><span>02</span><strong>{t("เข้าใจความต้องการ", "Understand intent")}</strong><small>{t("ถามข้อมูลที่จำเป็น", "Ask for the information that matters")}</small></li><li><span>03</span><strong>{t("เก็บลีด", "Capture the lead")}</strong><small>{t("บันทึกข้อมูลติดต่อและบริบท", "Save contact details and context")}</small></li><li><span>04</span><strong>{t("พาไปต่อ", "Drive the next step")}</strong><small>{t("นัดหมาย ขอให้โทรกลับ หรือส่งต่อทีม", "Book, request a callback or hand off")}</small></li></ol></div></section>

    <section className="benefit-section section-shell" id="benefits" aria-labelledby="benefits-title"><div className="section-intro"><p className="step-label">{t("ประโยชน์ที่ไปไกลกว่าการตอบอัตโนมัติ", "MORE THAN AUTOMATED ANSWERS")}</p><h2 id="benefits-title">{t("ช่วยทีมขายทำงานต่อได้ง่ายขึ้น", "Make the next sales action easier for your team")}</h2></div><div className="benefit-grid">{benefits.map((benefit) => <article key={benefit.titleTh}><h3>{t(benefit.titleTh, benefit.titleEn)}</h3><p>{t(benefit.copyTh, benefit.copyEn)}</p></article>)}</div></section>

    <section className="use-case-preview section-shell" aria-labelledby="use-cases-title"><div className="section-intro"><p className="step-label">{t("เริ่มจากเป้าหมายธุรกิจ", "START WITH A BUSINESS GOAL")}</p><h2 id="use-cases-title">{t("ไม่ต้องเริ่มจากหน้าว่าง", "Do not start from a blank screen")}</h2></div><div className="use-case-columns"><article><span>{t("ธุรกิจบริการ", "Service businesses")}</span><h3>{t("คัดกรองก่อนให้ทีมโทรกลับ", "Qualify before your team calls back")}</h3><p>{t("เก็บบริการที่สนใจ งบประมาณ ช่วงเวลา และข้อมูลติดต่อ", "Capture service interest, budget, timing and contact details.")}</p></article><article><span>{t("ธุรกิจนัดหมาย", "Appointment businesses")}</span><h3>{t("พาลูกค้าไปสู่การนัดหมาย", "Guide customers toward an appointment")}</h3><p>{t("ตอบคำถามเบื้องต้น เก็บเวลาที่สะดวก และส่งต่อให้ทีมยืนยัน", "Answer initial questions, collect preferred times and send details for confirmation.")}</p></article><article><span>{t("ร้านค้าและธุรกิจท้องถิ่น", "Retail and local businesses")}</span><h3>{t("ตอบคำถามซ้ำอย่างสม่ำเสมอ", "Answer repetitive questions consistently")}</h3><p>{t("ช่วยเรื่องสินค้า บริการ เวลาเปิด และเสนอช่องทางติดต่อคนเมื่อจำเป็น", "Help with products, services and opening hours, with human contact when needed.")}</p></article></div><a className="text-link" href="/templates">{t("ดูตัวอย่างการใช้งานทั้งหมด", "Explore all use cases")} <span aria-hidden="true">→</span></a></section>

    <section className="how-section section-shell" id="how-it-works" aria-labelledby="how-title"><div className="section-intro"><p className="step-label">{t("เริ่มใช้งานอย่างมีระบบ", "A CONTROLLED WAY TO LAUNCH")}</p><h2 id="how-title">{t("จากเป้าหมายธุรกิจถึง Bot บนเว็บไซต์", "From business goal to a bot on your website")}</h2></div><ol className="how-list"><li><strong>{t("เลือกเป้าหมาย", "Choose a goal")}</strong><span>{t("กำหนดว่าต้องการตอบคำถาม เก็บลีด หรือนัดหมาย", "Decide whether to answer questions, capture leads or arrange appointments.")}</span></li><li><strong>{t("เพิ่มข้อมูลที่อนุมัติ", "Add approved knowledge")}</strong><span>{t("ให้ Bot ใช้เฉพาะข้อมูลและเส้นทางที่ธุรกิจควบคุม", "Keep the bot grounded in information and journeys your business controls.")}</span></li><li><strong>{t("ทดสอบก่อนเผยแพร่", "Test before publishing")}</strong><span>{t("ตรวจคำตอบ การเก็บข้อมูล การส่งต่อ และปลายทางเว็บไซต์", "Check answers, data capture, handoff and website destination.")}</span></li><li><strong>{t("ติดตามงานในที่เดียว", "Follow up in one place")}</strong><span>{t("ดูผู้ติดต่อ ลีด บทสนทนา นัดหมาย และงานที่ทีมต้องทำต่อ", "Review contacts, leads, conversations, appointments and team follow-up.")}</span></li></ol></section>

    <section className="control-section"><div className="section-shell"><p className="step-label">{t("ธุรกิจยังเป็นผู้ควบคุม", "YOUR BUSINESS STAYS IN CONTROL")}</p><div><h2>{t("ระบบช่วยเริ่มบทสนทนา ทีมของคุณเป็นผู้ตัดสินใจ", "The system starts the conversation. Your team makes the decisions.")}</h2><p>{t("กำหนดข้อมูลที่ใช้ ตรวจประวัติสนทนา จัดสิทธิ์ทีม และตั้งเงื่อนไขส่งต่อคนได้จากพื้นที่ทำงานเดียว", "Control approved knowledge, review conversation history, manage team access and define human handoff from one workspace.")}</p></div></div></section>

    <section className="package-cta section-shell"><div><p className="step-label">{t("เลือกให้เหมาะกับวิธีขายของคุณ", "MATCH THE WAY YOU SELL")}</p><h2>{t("ดูแพ็กเกจ Flow Bot, AI Text Bot และ AI Voice Bot", "Compare Flow Bot, AI Text Bot and AI Voice Bot packages")}</h2><p>{t("เปรียบเทียบความสามารถ ราคา และสถานะการเปิดใช้ก่อนตัดสินใจสร้างบัญชี", "Compare capabilities, prices and availability before deciding to create an account.")}</p></div><a className="primary-link" href="/pricing">{t("ดูแพ็กเกจทั้งหมด", "View all packages")}</a></section>
    <PublicFooter />
  </main>;
}
