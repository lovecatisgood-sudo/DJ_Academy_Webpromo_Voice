const publicOrigin = process.env.DJAY_PUBLIC_ORIGIN || "http://127.0.0.1:3100";
const requestOrigin = process.env.DJAY_REQUEST_ORIGIN || "http://localhost:3100";

const business = {
  name: "DJAI Test Business",
  summary: "DJAI provides website customer-enquiry automation for small businesses.",
  offers: "Approved services include guided setup, FAQ and service-answer configuration, lead qualification, appointment-request assistance, and ongoing support. Exact package prices are not included in this test knowledge.",
  hours: "Monday to Friday, 09:00 to 17:00.",
  contact: "Customers may contact the business through its website.",
  faqs: [
    { question: "Is setup supported?", answer: "Guided setup and ongoing support are available." },
    { question: "Which languages are supported?", answer: "English and Thai are supported." },
    { question: "Which channels are approved here?", answer: "This test covers website customer-enquiry automation." },
  ],
  agentObjective: "Understand the customer's need, recommend only a suitable approved service, and work through concerns consultatively.",
  agentBehavior: "Treat every objection as new information. Do not end because of objection count. Acknowledge the specific concern, use approved facts, change strategy, and make one useful low-pressure move.",
  agentBoundaries: "Never invent prices, discounts, urgency, guarantees, quantified results, integrations, security claims, or completed actions.",
};

const scenarios = [
  {
    id: "price-value",
    language: "en",
    turns: [
      ["question", "Which service could help us reduce missed website enquiries?"],
      ["objection", "That sounds too expensive."],
      ["objection", "Even a smaller option may not be worth the money."],
      ["objection", "I still do not see enough value to justify it."],
    ],
  },
  {
    id: "timing-capacity",
    language: "en",
    turns: [
      ["question", "What would setup involve for a small team?"],
      ["objection", "I do not have time to implement this now."],
      ["objection", "Not now. My team will be busy for several months."],
      ["objection", "I cannot add another project to our workload."],
    ],
  },
  {
    id: "business-fit",
    language: "en",
    turns: [
      ["question", "Could this handle enquiries for a specialist clinic?"],
      ["objection", "I do not think it will fit our business."],
      ["objection", "Our workflow is too unusual for a standard bot."],
      ["objection", "I am still not convinced it can match how our staff work."],
    ],
  },
  {
    id: "trust-accuracy",
    language: "en",
    turns: [
      ["question", "How would an automated assistant answer customer questions?"],
      ["objection", "I do not trust automated agents."],
      ["objection", "What if it gives customers the wrong information?"],
      ["objection", "That risk still worries me."],
    ],
  },
  {
    id: "existing-competitor",
    language: "en",
    turns: [
      ["question", "We already use another website chat tool. What could DJAI add?"],
      ["objection", "I do not see a reason to change from our current tool."],
      ["objection", "Our existing provider is good enough."],
      ["objection", "Switching sounds like more trouble than it is worth."],
    ],
  },
  {
    id: "approval-budget",
    language: "en",
    turns: [
      ["question", "What information would help me discuss this internally?"],
      ["objection", "My manager will probably reject it."],
      ["objection", "We have no budget this quarter."],
      ["objection", "Finance will need a stronger business case."],
    ],
  },
  {
    id: "complexity-skills",
    language: "en",
    turns: [
      ["question", "Can a non-technical team manage the assistant?"],
      ["objection", "The setup sounds too complicated."],
      ["objection", "My staff will not want to learn another system."],
      ["objection", "We cannot depend on technical people to maintain it."],
    ],
  },
  {
    id: "privacy-risk",
    language: "en",
    turns: [
      ["question", "How would the assistant handle customer enquiries on our website?"],
      ["objection", "I am worried about customer data and privacy."],
      ["objection", "That still sounds too risky."],
      ["objection", "I need proof before I can trust the data handling."],
    ],
  },
  {
    id: "customer-dislike",
    language: "en",
    turns: [
      ["question", "Could automation help when our team is unavailable?"],
      ["objection", "I hate bots and our customers probably do too."],
      ["objection", "Customers may leave if they realise it is automated."],
      ["objection", "I still think a human-only approach is better."],
    ],
  },
  {
    id: "thai-price-time-fit",
    language: "th",
    turns: [
      ["question", "บริการนี้ช่วยตอบคำถามลูกค้าบนเว็บไซต์อย่างไร"],
      ["objection", "แต่ราคาน่าจะแพงเกินไป"],
      ["objection", "ตอนนี้ทีมยังไม่มีเวลาติดตั้งระบบใหม่"],
      ["objection", "ยังไม่แน่ใจว่าจะเหมาะกับธุรกิจของเรา"],
    ],
  },
];

const farewell = /\b(?:no problem|if you need anything|if anything changes|let me know|feel free to (?:reach out|contact)|here if you need|maybe later|goodbye)\b|(?:ไม่มีปัญหา|หากต้องการ|ถ้าต้องการ|ติดต่อได้|ไว้คราวหน้า|ลาก่อน)/iu;
const continuation = /[?？]|\b(?:which|what|would|could|is the|compare|option|alternative|concern|requirement|priority|help me understand)\b|(?:ไหม|หรือ|อะไร|อย่างไร|ส่วนไหน|ประเด็น|เปรียบเทียบ|ตัวเลือก|ข้อกังวล|ความต้องการ)/iu;
const pressure = /\b(?:buy now|act now|must decide|last chance|limited time|you need to buy)\b|(?:ต้องซื้อ|รีบตัดสินใจ|โอกาสสุดท้าย|เวลาจำกัด)/iu;
const unsupported = /\b(?:guaranteed|guarantee that|perfect fit|zero risk|will definitely|will increase|will save \d|100%|works? alongside|complements? (?:rather than|your)|without replacing|no coding|non[ -]?technical|our team handles?|little hands[ -]?on|minimal effort|easy management|not intrusive|designed for (?:a )?specialist clinic|tailor(?:ed|ing)?|capture more|reduce missed|save (?:you |your team )?time|answers? (?:come|comes) (?:directly )?from|only (?:uses|answers|responds)|keep(?:s| it)? accurate|reduce(?:s|d)? (?:manual )?(?:reply )?errors?|feel(?:s)? helpful and natural|when (?:your|the) team is unavailable|outside (?:your )?(?:opening )?hours|after[ -]?hours|exact (?:package )?prices? (?:depend|depends)|many (?:small )?businesses|take(?:s)? over|without pulling (?:your|the) team in|so (?:your|the) team (?:can )?stay(?:s)? focused|built specifically|on top of basic chat|limit(?:s|ing)? (?:any )?data exposure|public FAQ configuration|lower(?:s|ed)? (?:the )?(?:privacy )?risk)\b|(?:รับประกันว่า|เหมาะสมอย่างแน่นอน|ไม่มีความเสี่ยง|เพิ่มขึ้นแน่นอน|แบบเรียลไทม์|ช่วยลดภาระการตอบ|ไม่ยุ่งยาก|ออกแบบมาเพื่อธุรกิจ|ตอบได้เมื่อทีมไม่อยู่|นอกเวลาทำการ|ราคาที่แน่นอนขึ้นอยู่กับแพ็กเกจ)/iu;
const falseAction = /\b(?:i (?:have )?(?:sent|booked|scheduled|registered|contacted)|your appointment is confirmed)\b|(?:ส่งให้แล้ว|จองให้แล้ว|นัดหมายยืนยันแล้ว|ลงทะเบียนแล้ว)/iu;
const unavailableOffer = /\b(?:(?:i|we)\s+(?:can|could|will|'ll|would)\s+(?:send|email|schedule|book|register|follow[ -]?up|contact)|check back|speak(?:ing)? with someone|talk(?:ing)? (?:with|to) someone)\b|(?:ส่ง(?:ให้|อีเมล)|นัดหมาย|จอง|ลงทะเบียน|ติดต่อกลับ)(?:ให้|ได้|ครับ|ค่ะ)/iu;
const repetitionStopWords = new Set(["about", "after", "again", "also", "been", "being", "business", "could", "customer", "does", "from", "have", "into", "most", "that", "their", "there", "these", "they", "this", "understand", "website", "what", "when", "which", "with", "would", "your", "คุณ", "ครับ", "เข้าใจ", "ธุรกิจ", "เว็บไซต์"]);

function responseTerms(value) {
  return new Set((value.toLocaleLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || []).filter((term) => !repetitionStopWords.has(term)));
}

function repeatsPriorPitch(reply, priorReplies) {
  const current = responseTerms(reply);
  if (current.size < 8) return false;
  return priorReplies.slice(-2).some((prior) => {
    const previous = responseTerms(prior);
    if (previous.size < 8) return false;
    const shared = [...current].filter((term) => previous.has(term)).length;
    return shared >= 7 && shared / Math.min(current.size, previous.size) >= 0.58;
  });
}

function evaluate(kind, stage, reply, customer, priorReplies) {
  const failures = [];
  const declarativeText = reply.split(/(?<=[.!?？])\s+|\n+/u).filter((part) => !/[?？]\s*$/u.test(part)).join(" ");
  if (!reply) failures.push("empty_reply");
  if (kind === "objection" && stage !== "S5_OBJECTION") failures.push(`wrong_stage:${stage || "missing"}`);
  if (kind === "objection" && farewell.test(reply)) failures.push("premature_farewell");
  if (kind === "objection" && !continuation.test(reply)) failures.push("no_relevant_continuation");
  if (pressure.test(reply)) failures.push("pressure_or_false_urgency");
  if (unsupported.test(declarativeText)) failures.push("unsupported_sales_claim");
  if (/\b(?:specialist )?clinic\b/iu.test(customer) && /^(?:yes|certainly|absolutely)\b|\b(?:(?:can|could|may|might) (?:handle|support)|suitable for|designed for|built for)\b/iu.test(declarativeText)) failures.push("unsupported_vertical_fit");
  if (falseAction.test(reply)) failures.push("false_completed_action");
  if (unavailableOffer.test(reply)) failures.push("unavailable_action_offer");
  if (repeatsPriorPitch(reply, priorReplies)) failures.push("repetitive_pitch");
  return failures;
}

async function sendTurn({ language, message, messages, cookie }) {
  const response = await fetch(`${publicOrigin}/public/builder/ai-test`, {
    method: "POST",
    headers: {
      Origin: requestOrigin,
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify({ language, role: "sales", message, messages: messages.slice(-12), business }),
    signal: AbortSignal.timeout(75_000),
  });
  const result = await response.json().catch(() => ({}));
  const setCookie = response.headers.get("set-cookie");
  return {
    response,
    result,
    cookie: setCookie ? setCookie.split(";", 1)[0] : cookie,
  };
}

const requestedScenarios = new Set((process.env.DJAY_QA_SCENARIOS || "").split(",").map((value) => value.trim()).filter(Boolean));
const scenariosToRun = requestedScenarios.size ? scenarios.filter((scenario) => requestedScenarios.has(scenario.id)) : scenarios;
const report = [];
for (const scenario of scenariosToRun) {
  let cookie = "";
  const messages = [];
  const assistantReplies = [];
  const turnResults = [];
  for (const [kind, message] of scenario.turns) {
    const turn = await sendTurn({ language: scenario.language, message, messages, cookie });
    cookie = turn.cookie;
    const reply = turn.result.preview?.text || "";
    const stage = turn.result.preview?.stage || null;
    const failures = turn.response.ok
      ? evaluate(kind, stage, reply, message, assistantReplies)
      : [`http_${turn.response.status}:${turn.result.status || "unknown"}`];
    const warnings = turn.result.preview?.fallbackApplied ? ["model_structured_fallback"] : [];
    turnResults.push({ kind, customer: message, stage, reply, failures, warnings });
    if (!turn.response.ok) break;
    messages.push({ role: "user", content: message }, { role: "assistant", content: reply });
    assistantReplies.push(reply);
  }
  const passed = turnResults.length === scenario.turns.length && turnResults.every((turn) => turn.failures.length === 0);
  report.push({ id: scenario.id, language: scenario.language, passed, turns: turnResults });
  console.log(JSON.stringify({ scenario: scenario.id, passed, turns: turnResults }));
}

const passed = report.filter((scenario) => scenario.passed).length;
const objectionTurns = report.flatMap((scenario) => scenario.turns).filter((turn) => turn.kind === "objection");
const objectionPasses = objectionTurns.filter((turn) => turn.failures.length === 0).length;
const structuredFallbacks = report.flatMap((scenario) => scenario.turns)
  .filter((turn) => turn.warnings.includes("model_structured_fallback")).length;
console.log(JSON.stringify({
  summary: {
    scenarios: report.length,
    passed,
    failed: report.length - passed,
    objectionTurns: objectionTurns.length,
    objectionPasses,
    objectionFailures: objectionTurns.length - objectionPasses,
    structuredFallbacks,
  },
}));
if (passed !== report.length || objectionPasses !== objectionTurns.length) process.exitCode = 1;
