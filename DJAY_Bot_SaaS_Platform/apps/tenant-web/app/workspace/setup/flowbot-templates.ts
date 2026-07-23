export function greetingTemplate() {
  const root = crypto.randomUUID();
  const end = crypto.randomUUID();
  const flowVersionId = crypto.randomUUID();
  return {
    schemaVersion: 1 as const,
    flowVersionId,
    rootNodeId: root,
    keywords: [] as string[],
    nodes: {
      [root]: {
        id: root,
        type: "message" as const,
        title: "Welcome",
        content: { th: "สวัสดีครับ ยินดีให้บริการ", en: "Welcome. How can we help?" },
        nextNodeId: end,
      },
      [end]: {
        id: end,
        type: "end" as const,
        title: "Complete",
        message: { th: "ขอบคุณครับ", en: "Thank you." },
      },
    },
  };
}

export function leadCaptureTemplate() {
  const root = crypto.randomUUID();
  const form = crypto.randomUUID();
  const end = crypto.randomUUID();
  const flowVersionId = crypto.randomUUID();
  return {
    schemaVersion: 1 as const,
    flowVersionId,
    rootNodeId: root,
    keywords: [] as string[],
    nodes: {
      [root]: {
        id: root,
        type: "message" as const,
        title: "Welcome",
        content: {
          th: "ฝากข้อมูลไว้ แล้วทีมงานจะติดต่อกลับ",
          en: "Leave your details and our team will contact you.",
        },
        nextNodeId: form,
      },
      [form]: {
        id: form,
        type: "form" as const,
        title: "Contact details",
        prompt: { th: "ข้อมูลติดต่อ", en: "Contact details" },
        fields: [
          { key: "name", label: { th: "ชื่อ", en: "Name" }, type: "text" as const, required: true },
          { key: "phone", label: { th: "เบอร์โทร", en: "Phone" }, type: "phone" as const, required: false },
          { key: "email", label: { th: "อีเมล", en: "Email" }, type: "email" as const, required: true },
        ],
        nextNodeId: end,
      },
      [end]: {
        id: end,
        type: "end" as const,
        title: "Complete",
        message: {
          th: "รับข้อมูลแล้ว ขอบคุณครับ",
          en: "Your details have been received. Thank you.",
        },
      },
    },
  };
}
