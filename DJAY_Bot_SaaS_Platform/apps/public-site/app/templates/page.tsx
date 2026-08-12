import { PublicInfoHeader } from "../PublicInfoHeader";

const templates = [
  ["ต้อนรับและนำทาง", "ทักทายผู้เยี่ยมชมแล้วส่งไปยังทีมหรือเส้นทางคำตอบที่เหมาะสม", "เริ่มต้น"],
  ["เก็บข้อมูลผู้สนใจ", "เก็บข้อมูลติดต่อพร้อมความยินยอม และจบด้วยขั้นตอนถัดไปที่ชัดเจน", "เริ่มต้น"],
  ["ขอนัดหมาย", "สอบถามบริการ เวลาที่สะดวก และข้อมูลติดต่อเพื่อให้ทีมติดตาม", "เริ่มต้น"],
  ["คำถามที่พบบ่อยพร้อมส่งต่อคน", "ตอบคำถามทั่วไปจากเมนูและเสนอแบบฟอร์มติดต่อเมื่อจำเป็น", "เริ่มต้น"],
] as const;

export default function TemplatesPage() {
  return <main className="info-page" id="main-content"><PublicInfoHeader />
    <section className="info-hero"><p>เทมเพลต FlowBot</p><h1>เริ่มจากโครงสร้างบทสนทนาที่เข้าใจง่าย</h1><span>เทมเพลตสร้างฉบับร่างที่แก้ไขได้ ตรวจข้อความ เชื่อมขั้นตอนถัดไป ดูตัวอย่าง และเผยแพร่เมื่อศูนย์ทดสอบผ่านเท่านั้น</span></section>
    <section className="info-content"><div className="template-grid">{templates.map(([title, copy, level], index) => <article key={title}><span>0{index + 1} · {level}</span><h2>{title}</h2><p>{copy}</p><a href="/#start">ใช้หลังสมัคร</a></article>)}</div></section>
  </main>;
}
