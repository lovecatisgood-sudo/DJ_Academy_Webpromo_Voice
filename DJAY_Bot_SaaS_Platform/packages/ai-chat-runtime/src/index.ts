import { assertProviderNeutralCustomerText, ProviderGatewayError, type TextProviderGateway } from "@djay/provider-gateway";
import {
  aiPlaybookSchema, buildSalesCorePolicy, countVisibleWords, salesCoreOutputBaseSchema, salesCoreOutputSchema, selectRelevantFaqs, selectRelevantKnowledge,
  type SalesCoreOutput,
} from "@djay/sales-core";
import { z } from "zod";

const historySchema = z.array(z.object({
  sequence: z.number().int().positive(), role: z.enum(["user", "assistant"]), content: z.string().max(5000),
}).strict()).max(19);
const chunkSchema = z.array(z.object({
  sourceRevisionId: z.uuid(), chunkId: z.uuid(), content: z.string().max(5000),
}).strict()).max(1000);
const authoritySchema = z.object({
  entitlements: z.record(z.string(), z.union([z.boolean(), z.string(), z.number(), z.null()])),
  limits: z.record(z.string(), z.number().nullable()),
}).strict();

type GatewayRequest = Parameters<TextProviderGateway["generate"]>[0];
type GatewayResult = Awaited<ReturnType<TextProviderGateway["generate"]>>;

function responseInvariant(value: SalesCoreOutput) {
  return JSON.stringify({
    schemaVersion: value.schemaVersion,
    stage: value.stage,
    intent: value.intent,
    confidence: value.confidence,
    safety: value.safety,
    facts: value.facts,
    knowledgeCitations: value.knowledgeCitations,
    responseGoal: value.responseGoal,
    proposedActions: value.proposedActions,
    handover: value.handover,
    channelResponse: value.channelResponse,
  });
}

const explicitConversationExit = /\b(?:stop (?:selling|messaging|contacting|the (?:chat|conversation|call))|unsubscribe|do not contact|don't contact|no (?:more )?follow[- ]?up|leave me alone|end (?:this |the )?(?:chat|conversation|call)|goodbye|hang up)\b|(?:หยุดขาย|หยุดคุย|จบการสนทนา|วางสาย|ยกเลิกการติดต่อ|ไม่ต้องติดต่อ|อย่าติดต่อ|ไม่ต้องตาม)/iu;
const objectionSignal = /\b(?:no|nope|nah|no thanks|not interested|do not|don't|will not|won't|cannot|can't|what if|still|risk|value|worth|workflow|already use|expensive|price|cost|budget|afford|later|not now|need (?:more )?time|need to think|not sure|doesn['’]?t fit|won['’]?t work|concern|worried|trust|risky|complicated|too much|already have|happy with|good enough|not convinced|too unusual|reject|business case|finance|learn another|hate bots?|customers? may leave|human[ -]?only|switching|wrong information)\b|(?:ไม่|ไม่เอา|ไม่สนใจ|แพง|ราคา|งบ|ไว้ก่อน|ยังไม่พร้อม|ขอคิด|ไม่แน่ใจ|ไม่เหมาะ|ไม่คุ้ม|กังวล|ไม่ไว้ใจ|เสี่ยง|ซับซ้อน|มีอยู่แล้ว|ฝ่ายการเงิน|ผู้จัดการ|ไม่ชอบบอท|มนุษย์เท่านั้น)/iu;
const prematureFarewell = /\b(?:no problem|if you need anything|if anything changes|let me know|feel free to (?:reach out|contact)|here if you need|maybe later)\b|(?:ไม่มีปัญหา|หากต้องการ|ถ้าต้องการ|ติดต่อได้|ไว้คราวหน้า)/iu;
const continuationSignal = /[?？]|\b(?:which|what|would it help|can i|is the main|compare|concern)\b|(?:ไหม|หรือ|ประเด็น|ให้ช่วย|เปรียบเทียบ|กังวล)/iu;

function activeSalesObjection(role: "support" | "sales" | "booking", request: GatewayRequest) {
  return role === "sales"
    && !explicitConversationExit.test(request.customerMessage)
    && objectionSignal.test(request.customerMessage);
}

function objectionResponseInvalid(output: z.infer<typeof salesCoreOutputBaseSchema>) {
  return output.stage !== "S5_OBJECTION"
    || prematureFarewell.test(output.customerResponse)
    || !continuationSignal.test(output.customerResponse);
}

function objectionFallback(output: z.infer<typeof salesCoreOutputBaseSchema>, locale: "th" | "en", customerMessage: string) {
  const switchingConcern = /\b(?:switch|switching|change from|move from)\b|(?:เปลี่ยนระบบ|ย้ายระบบ)/iu.test(customerMessage);
  const price = !switchingConcern
    && /\b(?:expensive|price|cost|budget|afford|too much|value|worth|money)\b|(?:แพง|ราคา|งบ|ไม่คุ้ม|คุณค่า)/iu.test(customerMessage);
  const timing = /\b(?:later|not now|time|need to think|ready|busy|workload|another project)\b|(?:ไว้ก่อน|ยังไม่พร้อม|ขอคิด|เวลา|งานล้น)/iu.test(customerMessage);
  const trust = /\b(?:trust|risk|risky|worried|proof|guarantee|wrong information|accuracy|privacy|data handling)\b|(?:กังวล|ไม่ไว้ใจ|เสี่ยง|หลักฐาน|รับประกัน|ข้อมูลผิด|ความเป็นส่วนตัว)/iu.test(customerMessage);
  const fit = /\b(?:fit|work|workflow|unusual|staff work|complicated|already have|already use|happy with|existing provider|current tool|good enough|switching|switch)\b|(?:เหมาะ|ซับซ้อน|มีอยู่แล้ว)/iu.test(customerMessage);
  const unusualWorkflow = /\b(?:workflow|unusual|non[ -]?standard)\b|(?:ขั้นตอน|รูปแบบเฉพาะ|ไม่ปกติ)/iu.test(customerMessage);
  const staffWorkflow = /\b(?:staff|team).*(?:work|process)|(?:work|process).*(?:staff|team)\b|(?:พนักงาน|ทีม).*(?:ทำงาน|ขั้นตอน)/iu.test(customerMessage);
  const existingTool = /\b(?:existing|current) (?:provider|tool|system)|already (?:have|use)|good enough|switch(?:ing)?\b|(?:ระบบ|ผู้ให้บริการ).*(?:เดิม|ปัจจุบัน)|มีอยู่แล้ว/iu.test(customerMessage);
  const noReasonToChange = /\b(?:do not|don['’]?t) see (?:a )?reason|no reason to (?:change|switch)\b|(?:ไม่เห็นเหตุผล.*เปลี่ยน)/iu.test(customerMessage);
  const currentGoodEnough = /\bgood enough\b|(?:ดีพอ|เพียงพอแล้ว)/iu.test(customerMessage);
  const approval = /\b(?:manager|finance|business case|internal approval|reject)\b|(?:ผู้จัดการ|ฝ่ายการเงิน|อนุมัติ|กรณีธุรกิจ)/iu.test(customerMessage);
  const complexity = /\b(?:complicated|learn another|technical people|maintain|maintenance)\b|(?:ซับซ้อน|เรียนรู้ระบบ|ฝ่ายเทคนิค|บำรุงรักษา)/iu.test(customerMessage);
  const humanPreference = /\b(?:hate bots?|customers? may leave|human[ -]?only|human approach|realise it is automated)\b|(?:ไม่ชอบบอท|ลูกค้า.*ออก|มนุษย์เท่านั้น)/iu.test(customerMessage);
  const automationMayLoseCustomer = /\b(?:customers? may leave|realise it is automated|leave if|automated.*leave)\b|(?:ลูกค้า.*ออก|รู้ว่า.*อัตโนมัติ)/iu.test(customerMessage);
  const wrongInformation = /\b(?:wrong information|accuracy|inaccurate|errors?)\b|(?:ข้อมูลผิด|ความถูกต้อง|ข้อผิดพลาด)/iu.test(customerMessage);
  const proof = /\b(?:proof|evidence)\b|(?:หลักฐาน)/iu.test(customerMessage);
  const longDelay = /\b(?:months|quarter|several)\b|(?:หลายเดือน|ไตรมาส)/iu.test(customerMessage);
  const noCapacity = /\b(?:workload|another project|cannot add|can't add)\b|(?:งานล้น|เพิ่มโครงการ)/iu.test(customerMessage);
  const privacyConcern = /\b(?:privacy|data handling|customer data)\b|(?:ความเป็นส่วนตัว|การจัดการข้อมูล|ข้อมูลลูกค้า)/iu.test(customerMessage);
  const stillConcerned = /\b(?:still|remains?|unresolved)\b|(?:ยัง|ยังคง)/iu.test(customerMessage);
  const weakValue = /\b(?:not (?:see|enough)|don['’]?t see|value.*justify|justify.*value)\b|(?:ยังไม่เห็น|คุณค่า.*ไม่คุ้ม)/iu.test(customerMessage);
  const smallerNotWorth = /\b(?:smaller|not worth|worth the money)\b|(?:ตัวเลือกเล็ก|ไม่คุ้ม)/iu.test(customerMessage);
  const customerResponse = locale === "th"
    ? price
      ? weakValue
        ? "เข้าใจครับ ผลลัพธ์ใดจากการจัดการ enquiry ที่จะทำให้คุณเห็นคุณค่าชัดขึ้น? ผมจะเทียบผลลัพธ์นั้นกับขอบเขตที่ได้รับอนุมัติ"
        : smallerNotWorth
          ? "เข้าใจครับ ผลลัพธ์เฉพาะข้อใดจะทำให้ตัวเลือกขนาดเล็กคุ้มค่าที่จะพิจารณา?"
          : "เข้าใจครับ ประเด็นหลักคืองบที่มีอยู่หรือยังไม่เห็นว่าคุณค่าคุ้มกับราคาครับ? ผมช่วยเทียบขอบเขตที่ได้รับอนุมัติกับผลลัพธ์ที่คุณต้องการได้"
      : timing
        ? longDelay
          ? "เข้าใจครับ เหตุการณ์หรือช่วงเวลาใดจะบอกว่าทีมพร้อมประเมินเรื่องนี้อีกครั้ง? ผมจะช่วยระบุข้อมูลที่ควรเตรียมไว้โดยไม่เร่งให้เริ่มตอนนี้"
          : noCapacity
            ? "เข้าใจครับ ถ้ายังไม่เริ่มโครงการใหม่ ตอนนี้มีข้อกำหนดข้อใดที่ควรตรวจสอบไว้ก่อนเพียงข้อเดียว?"
            : "เข้าใจครับ ส่วนใดของการเริ่มใช้งานที่กังวลว่าจะใช้เวลามากที่สุด? ผมจะตอบเฉพาะจุดนั้นจากข้อมูลที่มี"
        : approval
          ? /(?:finance|business case|ฝ่ายการเงิน|กรณีธุรกิจ)/iu.test(customerMessage)
            ? "เข้าใจครับ ฝ่ายการเงินต้องการตัวชี้วัดหรือหลักฐานประเภทใดเพื่อประเมินกรณีธุรกิจนี้?"
            : "เข้าใจครับ คุณคิดว่าผู้อนุมัติจะกังวลเรื่องงบ ผลลัพธ์ ความเสี่ยง หรือเวลาเป็นหลัก?"
        : humanPreference
          ? /(?:human[ -]?only|มนุษย์เท่านั้น)/iu.test(customerMessage)
            ? "เข้าใจครับ งานสนทนาประเภทใดที่คุณต้องการให้มนุษย์ดูแลเสมอ? ผมจะไม่สมมติว่าทุกส่วนควรเป็นอัตโนมัติ"
            : automationMayLoseCustomer
              ? "เข้าใจครับ คุณคิดว่าส่วนใดทำให้ลูกค้าออกมากที่สุด—การเปิดเผยว่าเป็นระบบอัตโนมัติ คุณภาพคำตอบ หรือการเข้าถึงพนักงาน?"
              : "เข้าใจครับ ประสบการณ์แบบใดจากบอทที่ทำให้คุณหรือลูกค้าไม่พอใจมากที่สุด?"
        : complexity
          ? /(?:technical|maintain|maintenance|ฝ่ายเทคนิค|บำรุงรักษา)/iu.test(customerMessage)
            ? "เข้าใจครับ คุณคาดหวังให้ใครรับผิดชอบงานดูแลส่วนใดบ้าง? ผมจะตรวจสอบความคาดหวังนั้นกับข้อมูลที่ยืนยันแล้ว"
            : /(?:learn another|เรียนรู้ระบบ)/iu.test(customerMessage)
              ? "เข้าใจครับ งานประจำวันข้อใดที่พนักงานไม่ควรต้องเรียนรู้ใหม่?"
              : "เข้าใจครับ ขั้นตอนใดของการตั้งค่าที่ดูซับซ้อนที่สุด? ผมจะตอบเฉพาะขั้นตอนนั้น"
      : trust
          ? wrongInformation
            ? "เป็นข้อกังวลที่สมเหตุสมผลครับ คำถามหรือข้อมูลประเภทใดที่ต้องถูกต้องที่สุดสำหรับลูกค้าของคุณ?"
            : proof
              ? "เข้าใจครับ หลักฐานประเภทใดจะช่วยประเมินความเสี่ยงนี้ได้—นโยบาย กระบวนการควบคุม หรือผลการทดสอบ?"
              : privacyConcern
                ? "เข้าใจครับ ข้อกำหนดด้านข้อมูลข้อใดสำคัญที่สุด—การเก็บข้อมูล การเข้าถึง ระยะเวลาเก็บรักษา หรือการลบ?"
                : stillConcerned
                  ? "เข้าใจครับ ประเด็นใดยังไม่ได้รับคำตอบ—ความถูกต้อง การควบคุม ความเป็นส่วนตัว หรือประสบการณ์ลูกค้า?"
              : "เป็นข้อกังวลที่สมเหตุสมผลครับ ความเสี่ยงหลักคือความถูกต้อง การควบคุม ความเป็นส่วนตัว หรือประสบการณ์ลูกค้าครับ?"
          : fit
            ? unusualWorkflow
              ? "เข้าใจครับ ขั้นตอนใดใน workflow ที่แตกต่างที่สุด—การตอบ FAQ การคัดกรองลูกค้า หรือคำขอนัดหมาย? ผมจะตรวจสอบเฉพาะขั้นตอนนั้นจากข้อมูลที่มี"
              : staffWorkflow
                ? "เข้าใจครับ งานส่วนใดของพนักงานที่จำเป็นต้องคงรูปแบบเดิมไว้? ผมจะเทียบข้อกำหนดนั้นกับขอบเขตที่ได้รับอนุมัติ"
                : existingTool
                  ? noReasonToChange
                    ? "เข้าใจครับ อะไรต้องดีขึ้นอย่างวัดผลได้จึงจะคุ้มค่าที่จะประเมินการเปลี่ยนแปลง?"
                    : switchingConcern
                      ? "เข้าใจครับ ส่วนใดของการเปลี่ยนระบบที่ดูยุ่งยากที่สุด—ข้อมูล การตั้งค่า การฝึกทีม หรืออย่างอื่น?"
                      : currentGoodEnough
                      ? "เข้าใจครับ ส่วนใดของระบบปัจจุบันทำงานได้ดีที่สุดและจำเป็นต้องรักษาไว้?"
                      : "เข้าใจครับ ระบบปัจจุบันขาดความสามารถข้อใดอยู่หรือไม่มีข้อใดที่ต้องปรับปรุง? ผมจะเทียบเฉพาะจุดนั้นโดยไม่สมมติว่าคุณต้องเปลี่ยนระบบ"
                  : "เข้าใจครับ ข้อกำหนดส่วนไหนที่ดูไม่ตรงกับความต้องการมากที่สุด? ผมช่วยตรวจสอบข้อนั้นอย่างตรงไปตรงมาและชี้ข้อจำกัดหรือตัวเลือกอื่นได้"
            : "เข้าใจครับ เหตุผลหลักคือเรื่องงบ เวลา ความเหมาะสม หรือความมั่นใจครับ? ผมจะตอบเฉพาะประเด็นนั้นโดยไม่พูดข้อเสนอเดิมซ้ำ"
    : price
      ? weakValue
        ? "I understand the value is not clear yet. Which result from handling enquiries would make the value easier to judge? I can compare that result with the approved scope."
        : smallerNotWorth
          ? "I understand. Which specific result would make even a smaller option worth considering?"
          : "I understand. Is the main concern the available budget, or whether the expected value justifies the cost? I can compare the approved scope with the outcome you need."
      : timing
        ? longDelay
          ? "That makes sense. What milestone or date would tell you the team is ready to evaluate this again? I can help identify what information to prepare without pushing you to start now."
          : noCapacity
            ? "That makes sense. Without starting another project, which single requirement would still be useful to evaluate now?"
            : "That makes sense. Which part of getting started seems most time-consuming? I can focus only on that point using the approved information."
        : approval
          ? /(?:finance|business case)/iu.test(customerMessage)
            ? "I understand. Which metric or evidence would finance need to evaluate the business case?"
            : "I understand. Is the likely approval concern budget, expected outcome, risk, or timing?"
        : humanPreference
          ? /human[ -]?only/iu.test(customerMessage)
            ? "I understand. Which conversation types must always remain human-led? I will not assume every interaction should be automated."
            : automationMayLoseCustomer
              ? "I understand. Which part do you think would make customers leave: disclosure that it is automated, answer quality, or difficulty reaching a person?"
              : "I understand. Which bot behavior has frustrated you or your customers most?"
        : complexity
          ? /\b(?:technical|maintain|maintenance)\b/iu.test(customerMessage)
            ? "I understand. Which maintenance responsibility do you need a non-technical team to avoid? I can check that expectation against approved information."
            : /learn another/iu.test(customerMessage)
              ? "I understand. Which daily task should your staff not have to relearn?"
              : "I understand. Which setup step seems most complicated? I can focus only on that step."
        : trust
          ? wrongInformation
            ? "That is a fair concern. Which question or information type must be most accurate for your customers?"
            : proof
              ? "I understand. Which evidence would help you assess the risk: a policy, a control process, or test results?"
              : privacyConcern
                ? "I understand. Which data-handling requirement matters most: collection, access, retention, or deletion?"
                : stillConcerned
                  ? "I understand. Which part remains unresolved: accuracy, control, privacy, or customer experience?"
              : "That is a fair concern. Is the main risk accuracy, control, privacy, or customer experience?"
          : fit
            ? unusualWorkflow
              ? "Understood. Which workflow step is most unusual: FAQ answers, lead qualification, or appointment requests? I can check only that step against the approved information."
              : staffWorkflow
                ? "Understood. Which staff task must remain unchanged? I can compare that requirement with the approved scope."
                : existingTool
                  ? noReasonToChange
                    ? "Understood. What would have to be measurably better before a change would be worth evaluating?"
                    : switchingConcern
                      ? "Understood. Which part of switching seems most troublesome: data, setup, team training, or something else?"
                      : currentGoodEnough
                      ? "Understood. What works best in your current provider and must be preserved?"
                      : "Understood. Which capability is missing from your current tool, if any? I can compare only that point without assuming you need to switch."
                  : "Understood. Which requirement seems least aligned with your needs? I can check that requirement honestly and point out any limitation or relevant alternative."
            : "Understood. What is the main reason: budget, timing, fit, or trust? I can address only that point without repeating the same pitch.";
  return salesCoreOutputSchema.parse({
    ...output,
    stage: "S5_OBJECTION",
    intent: "handle_objection",
    responseGoal: "understand and address the customer's current concern",
    proposedActions: [],
    handover: null,
    customerResponse,
    channelResponse: { format: "text", quickReplies: [] },
  });
}

const unavailableActionOffer = /\b(?:(?:i|we)\s+(?:can|could|will|'ll|would)\s+(?:send|email|schedule|book|register|follow[ -]?up|contact)|check back|speak(?:ing)? with someone|talk(?:ing)? (?:with|to) someone)\b|(?:ส่ง(?:ให้|อีเมล)|นัดหมาย|จอง|ลงทะเบียน|ติดต่อกลับ)(?:ให้|ได้|ครับ|ค่ะ)/iu;
const groundingRules = [
  {
    claim: /\b(?:no[ -]?code|no coding|without coding|non[ -]?technical)\b/iu,
    evidence: /\b(?:no[ -]?code|no coding|without coding|non[ -]?technical)\b/iu,
  },
  {
    claim: /\b(?:works? (?:with|alongside)|complements?|compatible with|integrates? with|without replacing)\b/iu,
    evidence: /\b(?:works? (?:with|alongside)|complements?|compatible with|integrates? with|without replacing|integration)\b/iu,
  },
  {
    claim: /\b(?:easy|simple|simply|straightforward|minimal effort|little hands[ -]?on|very little hands[ -]?on|our team handles?|we handle (?:the )?(?:setup|configuration)|easy management)\b/iu,
    evidence: /\b(?:easy|simple|simply|straightforward|minimal effort|little hands[ -]?on|our team handles?|we handle (?:the )?(?:setup|configuration)|easy management)\b/iu,
  },
  {
    claim: /\b(?:capture more|reduce missed|save (?:you |your team )?time|increase (?:leads|sales|conversions)|improve (?:leads|sales|conversions)|without (?:adding|extra) staff)\b/iu,
    evidence: /\b(?:capture more|reduce missed|save (?:you |your team )?time|increase (?:leads|sales|conversions)|improve (?:leads|sales|conversions)|without (?:adding|extra) staff)\b/iu,
  },
  {
    claim: /\b(?:take(?:s)? over|without pulling (?:your|the) team in|so (?:your|the) team (?:can )?stay(?:s)? focused|handle(?:s)? (?:the )?.* so (?:your|the) team|built specifically|on top of basic chat)\b/iu,
    evidence: /\b(?:take(?:s)? over|without pulling (?:your|the) team in|so (?:your|the) team (?:can )?stay(?:s)? focused|handle(?:s)? (?:the )?.* so (?:your|the) team|built specifically|on top of basic chat)\b/iu,
  },
  {
    claim: /\b(?:answers? (?:come|comes) (?:directly )?from|only (?:uses|answers|responds)|keep(?:s| it)? accurate|reduce(?:s|d)? (?:manual )?(?:reply )?errors?|feel(?:s)? helpful and natural)\b/iu,
    evidence: /\b(?:answers? (?:come|comes) (?:directly )?from|only (?:uses|answers|responds)|keep(?:s| it)? accurate|reduce(?:s|d)? (?:manual )?(?:reply )?errors?|feel(?:s)? helpful and natural)\b/iu,
  },
  {
    claim: /\b(?:when (?:your|the) team is unavailable|outside (?:your )?(?:opening )?hours|after[ -]?hours|only when (?:your|the) team is unavailable)\b/iu,
    evidence: /\b(?:when (?:your|the) team is unavailable|outside (?:your )?(?:opening )?hours|after[ -]?hours|only when (?:your|the) team is unavailable)\b/iu,
  },
  {
    claim: /(?:แบบเรียลไทม์|ช่วยลดภาระการตอบ|ไม่ยุ่งยาก|ออกแบบมาเพื่อธุรกิจ|ตอบได้เมื่อทีมไม่อยู่|นอกเวลาทำการ)/iu,
    evidence: /(?:แบบเรียลไทม์|ช่วยลดภาระการตอบ|ไม่ยุ่งยาก|ออกแบบมาเพื่อธุรกิจ|ตอบได้เมื่อทีมไม่อยู่|นอกเวลาทำการ)/iu,
  },
  {
    claim: /\b(?:secure|data is safe|protects? (?:customer )?data|privacy[ -]?(?:safe|compliant)|encrypted|encryption)\b/iu,
    evidence: /\b(?:secure|data is safe|protects? (?:customer )?data|privacy[ -]?(?:safe|compliant)|encrypted|encryption)\b/iu,
  },
  {
    claim: /\b(?:limit(?:s|ing)? (?:any )?data exposure|reduce(?:s|d)? data exposure|public FAQ configuration|lower(?:s|ed)? (?:the )?(?:privacy )?risk)\b/iu,
    evidence: /\b(?:limit(?:s|ing)? (?:any )?data exposure|reduce(?:s|d)? data exposure|public FAQ configuration|lower(?:s|ed)? (?:the )?(?:privacy )?risk)\b/iu,
  },
  {
    claim: /\b(?:tailor(?:ed|ing)?|custom fit|customized|customised)\b/iu,
    evidence: /\b(?:tailor(?:ed|ing)?|custom fit|customized|customised)\b/iu,
  },
  {
    claim: /\b(?:not intrusive|non[ -]?intrusive)\b/iu,
    evidence: /\b(?:not intrusive|non[ -]?intrusive)\b/iu,
  },
  {
    claim: /\b(?:designed for|suitable for|ideal for)\s+(?:a |an )?(?:specialist )?(?:clinic|hospital|law firm|restaurant|hotel|school|university|real estate|financial|medical|healthcare)\b/iu,
    evidence: /\b(?:clinic|hospital|law firm|restaurant|hotel|school|university|real estate|financial|medical|healthcare)\b/iu,
  },
] as const;

const unlistedVertical = /\b(?:specialist )?(?:clinic|hospital|law firm|restaurant|hotel|school|university|real estate|financial|medical|healthcare)\b/iu;

function groundingResponseInvalid(
  output: z.infer<typeof salesCoreOutputBaseSchema>,
  groundingText: string,
  customerMessage: string,
) {
  if (!output.proposedActions.length && unavailableActionOffer.test(output.customerResponse)) return true;
  const declarativeText = output.customerResponse
    .split(/(?<=[.!?？])\s+|\n+/u)
    .filter((part) => !/[?？]\s*$/u.test(part))
    .join(" ");
  const requestedVertical = customerMessage.match(unlistedVertical)?.[0];
  if (requestedVertical && !groundingText.toLocaleLowerCase().includes(requestedVertical.toLocaleLowerCase())
    && /^(?:yes|certainly|absolutely)\b|\b(?:(?:can|could|may|might) (?:handle|support)|suitable for|designed for|built for)\b/iu.test(declarativeText)) return true;
  if (/^(?:can|could|does|do|is|are|will|would)\b/iu.test(customerMessage.trim())
    && /^(?:yes|certainly|absolutely)\b/iu.test(declarativeText.trim())) {
    const requestedTerms = responseTerms(customerMessage);
    const groundedTerms = responseTerms(groundingText);
    if (![...requestedTerms].some((term) => groundedTerms.has(term))) return true;
  }
  return groundingRules.some(({ claim, evidence }) => claim.test(declarativeText) && !evidence.test(groundingText));
}

const repetitionStopWords = new Set([
  "about", "after", "again", "also", "been", "being", "business", "could", "customer", "does", "from", "have",
  "into", "most", "that", "their", "there", "these", "they", "this", "understand", "website", "what", "when", "which",
  "with", "would", "your", "คุณ", "ครับ", "เข้าใจ", "ธุรกิจ", "เว็บไซต์",
]);

function responseTerms(value: string) {
  return new Set((value.toLocaleLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []).filter((term) => !repetitionStopWords.has(term)));
}

function repetitionResponseInvalid(output: z.infer<typeof salesCoreOutputBaseSchema>, messages: GatewayRequest["messages"]) {
  const current = responseTerms(output.customerResponse);
  if (current.size < 8) return false;
  return messages.filter((message) => message.role === "assistant").slice(-2).some((message) => {
    const previous = responseTerms(message.content);
    if (previous.size < 8) return false;
    const shared = [...current].filter((term) => previous.has(term)).length;
    return shared >= 7 && shared / Math.min(current.size, previous.size) >= 0.58;
  });
}

function groundingFallback(output: z.infer<typeof salesCoreOutputBaseSchema>, locale: "th" | "en") {
  const customerResponse = locale === "th"
    ? "รายละเอียดนั้นยังไม่ได้รับการยืนยันในข้อมูลธุรกิจที่อนุมัติครับ ข้อกำหนดหรือผลลัพธ์ส่วนไหนสำคัญที่สุด? ผมจะเทียบกับข้อมูลที่มีอยู่ให้ตรงประเด็น"
    : "That detail is not confirmed in the approved business information. Which requirement or outcome matters most? I can compare it with the information that is available.";
  return salesCoreOutputSchema.parse({
    ...output,
    proposedActions: [],
    handover: null,
    customerResponse,
    channelResponse: { format: "text", quickReplies: [] },
  });
}

function variationFallback(output: z.infer<typeof salesCoreOutputBaseSchema>, locale: "th" | "en") {
  const customerResponse = locale === "th"
    ? "เข้าใจข้อกังวลนี้ครับ ข้อกำหนดข้อเดียวที่สำคัญที่สุดต่อการตัดสินใจตอนนี้คืออะไร? ผมจะตอบเฉพาะจุดนั้นจากข้อมูลที่ได้รับอนุมัติ"
    : "I understand that concern. Which single requirement matters most in your decision now? I can focus on that point using the approved information.";
  return salesCoreOutputSchema.parse({
    ...output,
    proposedActions: [],
    handover: null,
    customerResponse,
    channelResponse: { format: "text", quickReplies: [] },
  });
}

function combinedUsage(first: GatewayResult["nativeUsage"], second: GatewayResult["nativeUsage"]): GatewayResult["nativeUsage"] {
  return {
    inputUnits: first.inputUnits + second.inputUnits,
    outputUnits: first.outputUnits + second.outputUnits,
    cachedUnits: (first.cachedUnits ?? 0) + (second.cachedUnits ?? 0),
  };
}

async function parseOrRepairStructuredOutput(
  gateway: TextProviderGateway,
  request: GatewayRequest,
  generated: GatewayResult,
): Promise<{ candidate: z.infer<typeof salesCoreOutputBaseSchema>; nativeUsage: GatewayResult["nativeUsage"] }> {
  const baseParsed = salesCoreOutputBaseSchema.safeParse(generated.output);
  if (baseParsed.success && countVisibleWords(baseParsed.data.customerResponse, request.locale) > 200) {
    return { candidate: baseParsed.data, nativeUsage: generated.nativeUsage };
  }
  const parsed = salesCoreOutputSchema.safeParse(generated.output);
  if (parsed.success) return { candidate: parsed.data, nativeUsage: generated.nativeUsage };
  let repaired: GatewayResult;
  try {
    repaired = await gateway.generate({
      ...request,
      correlationId: `${request.correlationId}:schema-repair`,
      systemPolicy: `${request.systemPolicy}\nThe previous output did not satisfy the required sales-core.v1 JSON schema. Return exactly one valid sales-core.v1 object. Repair structure and cross-field consistency only. Preserve the original customer intent and approved evidence. Do not add a fact, citation, action, handover, promise, or claim merely to satisfy the schema.`,
      messages: [],
      customerMessage: JSON.stringify({
        originalCustomerMessage: request.customerMessage,
        invalidCandidate: generated.output,
        validationIssues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })),
      }).slice(0, 12_000),
    });
  } catch (error) {
    throw new AiTextRuntimeError("structured_output_invalid", { cause: error }, generated.nativeUsage);
  }
  const repairedParsed = salesCoreOutputBaseSchema.safeParse(repaired.output);
  if (!repairedParsed.success) {
    throw new AiTextRuntimeError(
      "structured_output_invalid",
      { cause: repairedParsed.error },
      combinedUsage(generated.nativeUsage, repaired.nativeUsage),
    );
  }
  if (countVisibleWords(repairedParsed.data.customerResponse, request.locale) <= 200) {
    const fullyParsed = salesCoreOutputSchema.safeParse(repairedParsed.data);
    if (!fullyParsed.success) {
      const safelyDeactivated = salesCoreOutputSchema.safeParse({
        ...repairedParsed.data,
        proposedActions: [],
        handover: null,
      });
      if (!safelyDeactivated.success) {
        throw new AiTextRuntimeError("structured_output_invalid", { cause: fullyParsed.error });
      }
      return { candidate: safelyDeactivated.data, nativeUsage: combinedUsage(generated.nativeUsage, repaired.nativeUsage) };
    }
    return { candidate: fullyParsed.data, nativeUsage: combinedUsage(generated.nativeUsage, repaired.nativeUsage) };
  }
  return { candidate: repairedParsed.data, nativeUsage: combinedUsage(generated.nativeUsage, repaired.nativeUsage) };
}

async function generateConciseOutput(
  gateway: TextProviderGateway,
  request: GatewayRequest,
  agentRole: "support" | "sales" | "booking",
  groundingText: string,
): Promise<{
  output: SalesCoreOutput;
  nativeUsage: GatewayResult["nativeUsage"];
}> {
  const generated = await gateway.generate(request);
  const structured = await parseOrRepairStructuredOutput(gateway, request, generated);
  const candidate = structured.candidate;
  const oversized = countVisibleWords(candidate.customerResponse, request.locale) > 200;
  const hasActiveObjection = activeSalesObjection(agentRole, request);
  if (hasActiveObjection) {
    return {
      output: objectionFallback(candidate, request.locale, request.customerMessage),
      nativeUsage: structured.nativeUsage,
    };
  }
  const repairObjection = hasActiveObjection && objectionResponseInvalid(candidate);
  const repairGrounding = groundingResponseInvalid(candidate, groundingText, request.customerMessage);
  const repairRepetition = repetitionResponseInvalid(candidate, request.messages);
  if (!oversized && !repairObjection && !repairGrounding && !repairRepetition) {
    return { output: salesCoreOutputSchema.parse(candidate), nativeUsage: structured.nativeUsage };
  }
  let repaired: GatewayResult;
  try {
    const repairKind = oversized ? "concise-repair" : repairGrounding ? "grounding-repair" : repairObjection ? "objection-repair" : "variation-repair";
    repaired = await gateway.generate({
      ...request,
      correlationId: `${request.correlationId}:${repairKind}`,
      systemPolicy: oversized
        ? `${request.systemPolicy}\nThe previous structured candidate exceeded 200 words. Return the same object with only customerResponse rewritten concisely. Preserve stage, intent, facts, citations, responseGoal, proposed actions, handover, and quick replies exactly. Never cut a sentence or remove a required fact merely to stop at a boundary.`
        : repairGrounding
        ? `${request.systemPolicy}\nThe previous candidate used a sales claim or offered an action that is not supported by the approved information. Original customer message: ${JSON.stringify(request.customerMessage)}. Rewrite customerResponse using only direct conservative paraphrases of approved grounding. Explicitly say when a requested detail is not confirmed. Keep the next step inside this conversation unless an allowed structured action exists. Do not imply compatibility, ease, results, privacy, security, industry fit, or an action from generic product language. If this is an objection, keep stage S5_OBJECTION and intent handle_objection, address the specific concern, and ask one focused low-pressure question. Preserve every other structured field exactly; never add a fact or citation.`
        : repairObjection
        ? `${request.systemPolicy}\nThe previous candidate wrongly gave up on the customer's current objection. The objection count never authorizes closing. Original customer objection: ${JSON.stringify(request.customerMessage)}. Return stage S5_OBJECTION and intent handle_objection. Acknowledge this specific concern, change strategy instead of repeating the prior pitch, address it only with approved facts when possible, then ask one focused low-pressure question or offer one genuinely relevant comparison. Do not use a farewell, create an action, capture a lead, book, close, or hand over. Preserve facts and citations; never invent a claim.`
        : repairRepetition
          ? `${request.systemPolicy}\nThe previous candidate repeats too much wording, the same feature list, or the same question from recent assistant turns. Rewrite customerResponse to respond only to the newest customer message with a different useful angle. Do not repeat a catalogue of features. Use at most one directly relevant approved capability, then ask one new focused question. Preserve every structured field exactly and do not add a claim, citation, action, or handover.`
          : request.systemPolicy,
      messages: [],
      customerMessage: JSON.stringify(candidate),
    });
  } catch (error) {
    if (oversized) {
      throw new AiTextRuntimeError("structured_output_invalid", { cause: error }, structured.nativeUsage);
    }
    return {
      output: repairObjection
        ? objectionFallback(candidate, request.locale, request.customerMessage)
        : repairGrounding
          ? groundingFallback(candidate, request.locale)
          : hasActiveObjection
            ? objectionFallback(candidate, request.locale, request.customerMessage)
            : variationFallback(candidate, request.locale),
      nativeUsage: structured.nativeUsage,
    };
  }
  const repairedUsage = combinedUsage(structured.nativeUsage, repaired.nativeUsage);
  try {
    const repairedOutput = salesCoreOutputSchema.parse(repaired.output);
    if (oversized) {
      const evidencePreserved = responseInvariant(repairedOutput) === responseInvariant(candidate as SalesCoreOutput);
      if (!evidencePreserved
        || (repairObjection && objectionResponseInvalid(repairedOutput))
        || (repairGrounding && groundingResponseInvalid(repairedOutput, groundingText, request.customerMessage))
        || (repairRepetition && repetitionResponseInvalid(repairedOutput, request.messages))) {
        throw new AiTextRuntimeError("structured_output_invalid", undefined, repairedUsage);
      }
      return { output: repairedOutput, nativeUsage: repairedUsage };
    }
    if (repairObjection || repairGrounding || repairRepetition) {
      const evidencePreserved = JSON.stringify([repairedOutput.facts, repairedOutput.knowledgeCitations, repairedOutput.safety])
        === JSON.stringify([candidate.facts, candidate.knowledgeCitations, candidate.safety]);
      const invalidObjection = repairObjection && objectionResponseInvalid(repairedOutput);
      if (!evidencePreserved || repairedOutput.proposedActions.length || repairedOutput.handover
        || invalidObjection || groundingResponseInvalid(repairedOutput, groundingText, request.customerMessage)
        || repetitionResponseInvalid(repairedOutput, request.messages)) {
        return {
          output: repairObjection
            ? objectionFallback(candidate, request.locale, request.customerMessage)
            : repairGrounding
              ? groundingFallback(candidate, request.locale)
              : hasActiveObjection
                ? objectionFallback(candidate, request.locale, request.customerMessage)
                : variationFallback(candidate, request.locale),
          nativeUsage: structured.nativeUsage,
        };
      }
    }
    return {
      output: repairedOutput,
      nativeUsage: repairedUsage,
    };
  } catch (error) {
    if (oversized) {
      if (error instanceof AiTextRuntimeError) throw error;
      throw new AiTextRuntimeError("structured_output_invalid", { cause: error }, repairedUsage);
    }
    return {
      output: repairObjection
        ? objectionFallback(candidate, request.locale, request.customerMessage)
        : repairGrounding
          ? groundingFallback(candidate, request.locale)
          : hasActiveObjection
            ? objectionFallback(candidate, request.locale, request.customerMessage)
            : variationFallback(candidate, request.locale),
      nativeUsage: structured.nativeUsage,
    };
  }
}

export type AiPublicResponse = Readonly<{
  status: "completed" | "handover";
  inputId: string;
  text: string;
  quickReplies: readonly string[];
  actions?: readonly Readonly<{ type: "booking" | "quotation" | "checkout" | "call" | "line" | "website"; label: string; url: string }>[];
  nextTurnSequence: number;
}>;

export type AiTurnContext = Readonly<{
  sessionId: string;
  tenantId: string;
  conversationId: string;
  playbook: unknown | null;
  language: "th" | "en";
  authority: unknown | null;
  turnSequence: number;
  recentMessages: unknown;
  knowledgeChunks: unknown;
  replayResponse: AiPublicResponse | null;
}>;

export interface AiTurnRepository {
  begin(input: Readonly<{ deploymentKey: string; sessionToken: string; origin: string; inputId: string; message: string }>): Promise<AiTurnContext>;
  commit(input: Readonly<{
    deploymentKey: string; sessionToken: string; origin: string; inputId: string; output: SalesCoreOutput;
    publicResponse: AiPublicResponse; nativeUsage: { inputUnits: number; outputUnits: number; cachedUnits?: number };
  }>): Promise<AiPublicResponse | Readonly<{ status: "handover" }>>;
  fail(input: Readonly<{ deploymentKey: string; sessionToken: string; origin: string; inputId: string; errorCode: string }>): Promise<void>;
}

export class AiTextRuntimeError extends Error {
  constructor(
    readonly code: "turn_busy" | "structured_output_invalid" | "action_not_entitled" | "grounding_invalid" | "generation_failed",
    options?: ErrorOptions,
    readonly nativeUsage?: GatewayResult["nativeUsage"],
  ) {
    super(code, options);
  }
}

export async function generateAiTurn(input: Readonly<{
  gateway: TextProviderGateway;
  inputId: string;
  message: string;
  context: AiTurnContext;
}>) {
  if (!input.context.playbook || !input.context.authority || input.context.turnSequence < 1) {
    throw new AiTextRuntimeError("turn_busy");
  }
  const playbook = aiPlaybookSchema.parse(input.context.playbook);
  const history = historySchema.parse(input.context.recentMessages);
  const allChunks = chunkSchema.parse(input.context.knowledgeChunks);
  const selectedChunks = selectRelevantKnowledge(allChunks, input.message, 6);
  const selectedFaqs = selectRelevantFaqs(playbook.approvedFaqs, input.message, input.context.language);
  const matchedClaimCount = countRelevantClaims(playbook.approvedClaims, input.message, input.context.language);
  const approvedEvidence = [...playbook.approvedClaims, ...selectedFaqs.map((faq) =>
    `FAQ: ${faq.question[input.context.language]} Answer: ${faq.answer[input.context.language]}`)];
  const recentMessages = history.at(-1)?.role === "user" ? history.slice(0, -1) : history;
  const systemPolicy = buildSalesCorePolicy({
    locale: input.context.language, agentRole: playbook.agentRole, businessName: playbook.businessName, agentName: playbook.agentName,
    tone: playbook.tone, salesGoal: playbook.salesGoal,
    behaviorInstructions: playbook.behaviorInstructions, behaviorBoundaries: playbook.behaviorBoundaries,
    approvedClaims: approvedEvidence,
    prohibitedClaims: playbook.prohibitedClaims, discoveryQuestions: playbook.discoveryQuestions,
    ctaPolicy: playbook.ctaPolicy, customerMessages: playbook.customerMessages, knowledge: selectedChunks, recentMessages,
    customerMessage: input.message,
  });
  const generated = await generateConciseOutput(input.gateway, {
    correlationId: input.inputId, locale: input.context.language, systemPolicy,
    messages: recentMessages, customerMessage: input.message,
    structuredOutputSchemaVersion: "sales-core.v1",
  }, playbook.agentRole, [approvedEvidence.join("\n"), ...selectedChunks.map((chunk) => chunk.content)].join("\n"));
  let output = generated.output;
  assertProviderNeutralCustomerText(output.customerResponse);
  validateCitations(output, selectedChunks, generated.nativeUsage);
  const confidence = responseConfidence(output, selectedChunks.length, matchedClaimCount + selectedFaqs.length);
  output = salesCoreOutputSchema.parse({ ...output, confidence });
  if (confidence < playbook.confidenceThreshold && !output.handover) {
    const reason = `confidence_below_threshold:${confidence.toFixed(2)}`;
    output = salesCoreOutputSchema.parse({ ...output,
      proposedActions: [...output.proposedActions, { type: "handover.request", reason, summary: output.customerResponse }],
      handover: { reason, department: playbook.routingTeamKey ?? "general", summary: output.customerResponse },
    });
  }
  validateActionAuthority(output, input.context.authority, generated.nativeUsage);
  const publicResponse: AiPublicResponse = {
    status: output.handover ? "handover" : "completed", inputId: input.inputId,
    text: output.customerResponse, quickReplies: output.channelResponse.quickReplies,
    actions: playbook.publicActions.map((action) => ({ type: action.type, label: action.label[input.context.language], url: action.url })),
    nextTurnSequence: input.context.turnSequence + 1,
  };
  return {
    output,
    publicResponse,
    nativeUsage: {
      inputUnits: generated.nativeUsage.inputUnits,
      outputUnits: generated.nativeUsage.outputUnits,
      cachedUnits: generated.nativeUsage.cachedUnits ?? 0,
    },
  };
}

function responseConfidence(output: SalesCoreOutput, selectedChunkCount: number, approvedEvidenceCount: number) {
  const discoveryOnly = ["S0_GREETING", "S1_INTENT", "S2_DISCOVERY"].includes(output.stage)
    && output.facts.every((fact) => fact.source === "customer")
    && !output.proposedActions.some((action) => ["appointment.request", "merchant_email.send"].includes(action.type));
  const citationConfidence = output.knowledgeCitations.length > 0 ? 0.9
    : discoveryOnly ? 0.8 : approvedEvidenceCount > 0 ? 0.8 : selectedChunkCount > 0 ? 0.45 : 0.35;
  const factConfidence = output.facts.length ? Math.min(...output.facts.map((fact) => fact.confidence)) : 1;
  return Math.min(citationConfidence, factConfidence);
}

function countRelevantClaims(claims: readonly string[], query: string, locale: "th" | "en") {
  const terms = [...new Intl.Segmenter(locale, { granularity: "word" }).segment(query.toLocaleLowerCase())]
    .filter((segment) => segment.isWordLike && segment.segment.trim().length >= 2)
    .map((segment) => segment.segment.trim());
  return claims.filter((claim) => terms.some((term) => claim.toLocaleLowerCase().includes(term))).length;
}

function validateActionAuthority(output: SalesCoreOutput, authorityValue: unknown, nativeUsage?: GatewayResult["nativeUsage"]) {
  const authority = authoritySchema.parse(authorityValue);
  const required: Partial<Record<SalesCoreOutput["proposedActions"][number]["type"], string>> = {
    "lead.capture": "lead_capture.enabled",
    "sales_fact.record": "lead_capture.enabled",
    "appointment.request": "appointment_request.enabled",
    "follow_up.create": "lead_capture.enabled",
    "handover.request": "human_handover.enabled",
    "merchant_email.send": "sales_email_action.enabled",
  };
  if (output.proposedActions.some((action) => authority.entitlements[required[action.type]!] !== true)) {
    throw new AiTextRuntimeError("action_not_entitled", undefined, nativeUsage);
  }
}

function validateCitations(
  output: SalesCoreOutput,
  chunks: readonly { sourceRevisionId: string; chunkId: string }[],
  nativeUsage?: GatewayResult["nativeUsage"],
) {
  const allowed = new Set(chunks.map((chunk) => `${chunk.sourceRevisionId}:${chunk.chunkId}`));
  if (output.knowledgeCitations.some((citation) => !allowed.has(`${citation.sourceRevisionId}:${citation.chunkId}`))) {
    throw new AiTextRuntimeError("grounding_invalid", undefined, nativeUsage);
  }
}

function restrictPreviewCitations(output: SalesCoreOutput, chunks: readonly { sourceRevisionId: string; chunkId: string }[]) {
  const allowed = new Set(chunks.map((chunk) => `${chunk.sourceRevisionId}:${chunk.chunkId}`));
  return salesCoreOutputSchema.parse({
    ...output,
    knowledgeCitations: output.knowledgeCitations.filter((citation) => allowed.has(`${citation.sourceRevisionId}:${citation.chunkId}`)),
  });
}

function errorCode(error: unknown) {
  if (error instanceof AiTextRuntimeError) return error.code;
  if (error instanceof ProviderGatewayError) return error.code;
  if (error instanceof z.ZodError) return "structured_output_invalid";
  return "generation_failed";
}

function safeFallbackTurn(context: AiTurnContext, inputId: string, failureCode: string) {
  const playbook = aiPlaybookSchema.parse(context.playbook);
  const customerResponse = playbook.customerMessages.fallback[context.language];
  const output = salesCoreOutputSchema.parse({
    schemaVersion: "sales-core.v1",
    stage: "S2_DISCOVERY",
    intent: `safe_fallback.${failureCode}`.slice(0, 100),
    facts: [],
    knowledgeCitations: [],
    responseGoal: "Provide the merchant-approved safe fallback without making a claim or action.",
    proposedActions: [],
    handover: null,
    customerResponse,
    channelResponse: { format: "text", quickReplies: [] },
  });
  const publicResponse: AiPublicResponse = {
    status: "completed",
    inputId,
    text: customerResponse,
    quickReplies: [],
    actions: [],
    nextTurnSequence: context.turnSequence + 1,
  };
  return { output, publicResponse };
}

export class AiTextRuntime {
  constructor(private readonly repository: AiTurnRepository, private readonly gateway: TextProviderGateway) {}

  async turn(input: Readonly<{ deploymentKey: string; sessionToken: string; origin: string; inputId: string; message: string }>) {
    let began = false;
    let context: AiTurnContext | null = null;
    try {
      context = await this.repository.begin(input);
      if (context.replayResponse) return context.replayResponse;
      began = true;
      const generated = await generateAiTurn({ gateway: this.gateway, inputId: input.inputId, message: input.message, context });
      const committed = await this.repository.commit({
        deploymentKey: input.deploymentKey, sessionToken: input.sessionToken,
        origin: input.origin, inputId: input.inputId,
        output: generated.output, publicResponse: generated.publicResponse, nativeUsage: generated.nativeUsage,
      });
      return committed.status === "handover" && !("text" in committed)
        ? { ...generated.publicResponse, status: "handover" as const, text: "" }
        : committed;
    } catch (error) {
      const failureCode = errorCode(error);
      if (began && context && failureCode !== "turn_busy") {
        try {
          const fallback = safeFallbackTurn(context, input.inputId, failureCode);
          const nativeUsage = error instanceof AiTextRuntimeError && error.nativeUsage
            ? { ...error.nativeUsage, cachedUnits: error.nativeUsage.cachedUnits ?? 0 }
            : { inputUnits: 0, outputUnits: 0, cachedUnits: 0 };
          const committed = await this.repository.commit({
            deploymentKey: input.deploymentKey,
            sessionToken: input.sessionToken,
            origin: input.origin,
            inputId: input.inputId,
            output: fallback.output,
            publicResponse: fallback.publicResponse,
            nativeUsage,
          });
          return committed.status === "handover" && !("text" in committed)
            ? { ...fallback.publicResponse, status: "handover" as const, text: "" }
            : committed;
        } catch {
          // The reserved turn must be released when even the durable fallback cannot be committed.
        }
      }
      if (began) await this.repository.fail({
        deploymentKey: input.deploymentKey, sessionToken: input.sessionToken,
        origin: input.origin, inputId: input.inputId,
        errorCode: failureCode,
      }).catch(() => undefined);
      if (error instanceof AiTextRuntimeError) throw error;
      if (error instanceof ProviderGatewayError || error instanceof z.ZodError) {
        throw new AiTextRuntimeError(
          errorCode(error) === "structured_output_invalid" ? "structured_output_invalid" : "generation_failed",
          { cause: error },
        );
      }
      throw new AiTextRuntimeError("generation_failed", { cause: error });
    }
  }
}

export async function runAiTextPreview(input: Readonly<{
  gateway: TextProviderGateway;
  inputId: string;
  playbook: unknown;
  language: "th" | "en";
  knowledgeChunks: unknown;
  recentMessages?: unknown;
  message: string;
}>) {
  const playbook = aiPlaybookSchema.parse(input.playbook);
  const allChunks = chunkSchema.parse(input.knowledgeChunks);
  const history = historySchema.parse(input.recentMessages ?? []);
  const recentMessages = history.map(({ role, content }) => ({ role, content }));
  const selectedChunks = selectRelevantKnowledge(allChunks, input.message, 6);
  const selectedFaqs = selectRelevantFaqs(playbook.approvedFaqs, input.message, input.language);
  const approvedEvidence = [...playbook.approvedClaims, ...selectedFaqs.map((faq) =>
    `FAQ: ${faq.question[input.language]} Answer: ${faq.answer[input.language]}`)];
  const systemPolicy = buildSalesCorePolicy({
    locale: input.language,
    agentRole: playbook.agentRole,
    businessName: playbook.businessName,
    agentName: playbook.agentName,
    tone: playbook.tone,
    salesGoal: playbook.salesGoal,
    behaviorInstructions: playbook.behaviorInstructions,
    behaviorBoundaries: playbook.behaviorBoundaries,
    approvedClaims: approvedEvidence,
    prohibitedClaims: playbook.prohibitedClaims,
    discoveryQuestions: playbook.discoveryQuestions,
    ctaPolicy: playbook.ctaPolicy,
    customerMessages: playbook.customerMessages,
    knowledge: selectedChunks,
    recentMessages,
    customerMessage: input.message,
  });
  const gatewayRequest: GatewayRequest = {
    correlationId: input.inputId,
    locale: input.language,
    systemPolicy,
    messages: recentMessages,
    customerMessage: input.message,
    structuredOutputSchemaVersion: "sales-core.v1",
  };
  let generated: Awaited<ReturnType<typeof generateConciseOutput>>;
  try {
    generated = await generateConciseOutput(
      input.gateway,
      gatewayRequest,
      playbook.agentRole,
      [approvedEvidence.join("\n"), ...selectedChunks.map((chunk) => chunk.content)].join("\n"),
    );
  } catch (error) {
    if (!(error instanceof AiTextRuntimeError) || error.code !== "structured_output_invalid") throw error;
    const base = salesCoreOutputBaseSchema.parse({
      schemaVersion: "sales-core.v1",
      stage: "S2_DISCOVERY",
      intent: "discover_need",
      facts: [],
      knowledgeCitations: [],
      responseGoal: "clarify the customer's current requirement",
      proposedActions: [],
      handover: null,
      customerResponse: playbook.customerMessages.fallback[input.language],
      channelResponse: { format: "text", quickReplies: [] },
    });
    const output = activeSalesObjection(playbook.agentRole, gatewayRequest)
      ? objectionFallback(base, input.language, input.message)
      : salesCoreOutputSchema.parse(base);
    return Object.freeze({
      status: "completed" as const,
      stage: output.stage,
      text: output.customerResponse,
      quickReplies: [],
      proposedActionTypes: [],
      citationCount: 0,
      handover: false,
      fallbackApplied: true,
      actions: playbook.publicActions.map((action) => ({ type: action.type, label: action.label[input.language], url: action.url })),
    });
  }
  const output = restrictPreviewCitations(generated.output, selectedChunks);
  assertProviderNeutralCustomerText(output.customerResponse);
  validateCitations(output, selectedChunks);
  return Object.freeze({
    status: "completed" as const,
    stage: output.stage,
    text: output.customerResponse,
    quickReplies: output.channelResponse.quickReplies,
    proposedActionTypes: output.proposedActions.map((action) => action.type),
    citationCount: output.knowledgeCitations.length,
    handover: Boolean(output.handover),
    fallbackApplied: false,
    actions: playbook.publicActions.map((action) => ({ type: action.type, label: action.label[input.language], url: action.url })),
  });
}
