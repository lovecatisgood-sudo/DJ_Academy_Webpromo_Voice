export type ChromeLocale = "en" | "th";

const chrome = {
  en: {
    navSetup: "Setup",
    navOverview: "Overview",
    title: "Get live with Flow Bot",
    subtitle: "Follow these steps. Progress comes from server evidence after you refresh.",
    saveExit: "Save & exit to Overview",
    openStudio: "Open full FlowBot studio",
    refresh: "Refresh evidence",
    refreshing: "Checking evidence…",
    readOnly: "You can review setup progress. An administrator must complete authoring, publish, and deploy.",
    stepProfile: "Business profile",
    stepAccess: "Product access",
    stepConfigure: "Bot & publish",
    stepDeploy: "Website deploy",
    stepTest: "Live test",
    stepCelebrate: "Launch ready",
    profileHelp: "Confirm the business name, language, and timezone used across your workspace.",
    accessHelp: "Flow Bot needs active plan access before publish and deploy unlock.",
    accessCta: "Continue to payment",
    configureHelp: "Create a Flow Bot from a starter template, then publish the current version.",
    botName: "Bot name",
    defaultLanguage: "Default language",
    templateGreeting: "Greeting",
    templateLead: "Lead capture",
    createBot: "Create bot",
    applyPublish: "Apply template & publish",
    publishOnly: "Publish current draft",
    deployHelp: "Create one deployment with an exact HTTPS website origin. The deployment key is shown once.",
    installSnippet: "Install snippet",
    installCheck: "Request install check",
    testHelp: "Open your website with the snippet installed, complete one customer journey on the current published version, then refresh evidence here. Install checks and config calls do not mark launch ready by themselves.",
    celebrateTitle: "Flow Bot is launch-ready",
    celebrateBody: "Server evidence shows active access, a published version, an active deployment, and a current-version completed journey.",
    inviteTeam: "Invite a teammate",
    checkoutReturn: "Returned from checkout. Access updates only after payment confirmation settles.",
    checkoutReturnProcessingTitle: "Confirming payment",
    checkoutReturnProcessing: "Returned from checkout. Access updates only after payment confirmation settles. This page refreshes automatically.",
    checkoutReturnActiveTitle: "Payment confirmed",
    checkoutReturnActive: "Your plan access is active. You can continue setup or open billing documents anytime.",
    checkoutReturnActionTitle: "Payment needs attention",
    checkoutReturnAction: "We could not confirm a successful payment. Open billing to update your payment method, or contact support with your workspace name.",
    checkoutReturnExpiredTitle: "Checkout expired or canceled",
    checkoutReturnExpired: "That checkout is no longer valid. Start checkout again from Plans and usage when you are ready.",
    checkoutReturnUnavailableTitle: "Checkout unavailable",
    checkoutReturnUnavailable: "Self-serve checkout is not open for this product yet. Your plan preference stays saved.",
    working: "Working…",
    localeToggle: "Language",
  },
  th: {
    navSetup: "เริ่มใช้งาน",
    navOverview: "ภาพรวม",
    title: "เริ่มใช้ Flow Bot",
    subtitle: "ทำตามขั้นตอน ความคืบหน้ามาจากหลักฐานบนเซิร์ฟเวอร์หลังกดรีเฟรช",
    saveExit: "บันทึกแล้วกลับภาพรวม",
    openStudio: "เปิดสตูดิโอ FlowBot แบบเต็ม",
    refresh: "รีเฟรชหลักฐาน",
    refreshing: "กำลังตรวจสอบ…",
    readOnly: "คุณดูความคืบหน้าได้ ผู้ดูแลต้องเป็นผู้สร้าง เผยแพร่ และติดตั้ง",
    stepProfile: "โปรไฟล์ธุรกิจ",
    stepAccess: "สิทธิ์ใช้งานสินค้า",
    stepConfigure: "บอทและเผยแพร่",
    stepDeploy: "ติดตั้งบนเว็บไซต์",
    stepTest: "ทดสอบสด",
    stepCelebrate: "พร้อมเปิดใช้",
    profileHelp: "ยืนยันชื่อธุรกิจ ภาษา และเขตเวลาของเวิร์กสเปซ",
    accessHelp: "ต้องมีสิทธิ์ใช้งาน Flow Bot ก่อนจึงจะเผยแพร่และติดตั้งได้",
    accessCta: "ไปชำระเงิน",
    configureHelp: "สร้าง Flow Bot จากเทมเพลต แล้วเผยแพร่เวอร์ชันปัจจุบัน",
    botName: "ชื่อบอท",
    defaultLanguage: "ภาษาเริ่มต้น",
    templateGreeting: "ทักทาย",
    templateLead: "เก็บข้อมูลลูกค้า",
    createBot: "สร้างบอท",
    applyPublish: "ใช้เทมเพลตแล้วเผยแพร่",
    publishOnly: "เผยแพร่ฉบับร่างปัจจุบัน",
    deployHelp: "สร้างการติดตั้งด้วยต้นทาง HTTPS ที่ตรงเป๊ะ กุญแจจะแสดงเพียงครั้งเดียว",
    installSnippet: "โค้ดติดตั้ง",
    installCheck: "ขอตรวจการติดตั้ง",
    testHelp: "เปิดเว็บไซต์ที่มีสคริปต์ คุยจบหนึ่งรอบบนเวอร์ชันที่เผยแพร่แล้ว แล้วรีเฟรชหลักฐานที่นี่ การตรวจติดตั้งอย่างเดียวไม่ทำให้พร้อมเปิดใช้",
    celebrateTitle: "Flow Bot พร้อมเปิดใช้แล้ว",
    celebrateBody: "หลักฐานบนเซิร์ฟเวอร์ยืนยันสิทธิ์ใช้งาน เวอร์ชันที่เผยแพร่ การติดตั้งที่ใช้งาน และการสนทนาที่จบบนเวอร์ชันปัจจุบัน",
    inviteTeam: "เชิญเพื่อนร่วมงาน",
    checkoutReturn: "กลับจากหน้าชำระเงิน การเข้าถึงจะอัปเดตหลังการยืนยันการชำระเงินเท่านั้น",
    checkoutReturnProcessingTitle: "กำลังยืนยันการชำระเงิน",
    checkoutReturnProcessing: "กลับจากหน้าชำระเงินแล้ว การเข้าถึงจะอัปเดตหลังการยืนยันเท่านั้น หน้านี้จะรีเฟรชให้อัตโนมัติ",
    checkoutReturnActiveTitle: "ชำระเงินสำเร็จ",
    checkoutReturnActive: "สิทธิ์ใช้งานพร้อมแล้ว ไปต่อที่ขั้นตอนตั้งค่า หรือเปิดเอกสารการเรียกเก็บเงินได้ทุกเมื่อ",
    checkoutReturnActionTitle: "ต้องดำเนินการเกี่ยวกับการชำระเงิน",
    checkoutReturnAction: "ยังยืนยันการชำระเงินไม่สำเร็จ เปิดการจัดการบิลเพื่ออัปเดตวิธีชำระเงิน หรือติดต่อฝ่ายสนับสนุนพร้อมชื่อเวิร์กสเปซ",
    checkoutReturnExpiredTitle: "การชำระเงินหมดอายุหรือถูกยกเลิก",
    checkoutReturnExpired: "ลิงก์ชำระเงินนั้นใช้ไม่ได้แล้ว เริ่มชำระเงินใหม่จากหน้าแผนและการใช้งานเมื่อพร้อม",
    checkoutReturnUnavailableTitle: "ยังไม่เปิดให้ชำระเงินเอง",
    checkoutReturnUnavailable: "สินค้านี้ยังไม่เปิดเช็คเอาต์ด้วยตนเอง ความตั้งใจเลือกแผนยังถูกบันทึกไว้",
    working: "กำลังดำเนินการ…",
    localeToggle: "ภาษา",
  },
} as const;

export type SetupChromeKey = keyof typeof chrome.en;

export function setupChrome(locale: ChromeLocale): Readonly<Record<SetupChromeKey, string>> {
  return chrome[locale] ?? chrome.th;
}

/**
 * Thai is the platform default; English applies only when explicitly selected.
 *
 * The buyer is a Thai SME owner, so an unknown, missing or unsupported locale must land on Thai
 * rather than English. Written as an explicit `=== "en"` check so that adding a third locale later
 * cannot silently make English the fallback again.
 */
export function resolveChromeLocale(value: string | null | undefined): ChromeLocale {
  return value === "en" ? "en" : "th";
}
