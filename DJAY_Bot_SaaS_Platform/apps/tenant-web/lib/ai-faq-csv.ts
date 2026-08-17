import { aiPlaybookFieldLimits, type AiPlaybook } from "@djay/sales-core";

export type ImportedFaq = AiPlaybook["approvedFaqs"][number];

function parseRows(input: string): string[][] {
  const result: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]!;
    if (quoted && character === '"' && input[index + 1] === '"') { field += '"'; index += 1; continue; }
    if (character === '"') { quoted = !quoted; continue; }
    if (!quoted && character === ",") { row.push(field); field = ""; continue; }
    if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      row.push(field); if (row.some((value) => value.trim())) result.push(row); row = []; field = ""; continue;
    }
    field += character;
  }
  if (quoted) throw new Error("csv_unclosed_quote");
  row.push(field); if (row.some((value) => value.trim())) result.push(row);
  return result;
}

export function parseAiFaqCsv(input: string): ImportedFaq[] {
  const rows = parseRows(input.replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new Error("csv_requires_header_and_faq");
  const headers = rows[0]!.map((value) => value.trim().toLowerCase());
  const required = ["question_th", "question_en", "answer_th", "answer_en"];
  for (const header of required) if (!headers.includes(header)) throw new Error(`csv_missing_${header}`);
  const at = (row: string[], key: string) => row[headers.indexOf(key)]?.trim() ?? "";
  const faqs = rows.slice(1).map((row, index): ImportedFaq => {
    const rowNumber = index + 2;
    const faq = { question: { th: at(row, "question_th"), en: at(row, "question_en") }, answer: { th: at(row, "answer_th"), en: at(row, "answer_en") } };
    if (!faq.question.th || !faq.question.en || !faq.answer.th || !faq.answer.en) throw new Error(`csv_incomplete_faq_row_${rowNumber}`);
    if (faq.question.th.length > aiPlaybookFieldLimits.faqQuestion.maxLength || faq.question.en.length > aiPlaybookFieldLimits.faqQuestion.maxLength) throw new Error(`csv_question_too_long_row_${rowNumber}`);
    if (faq.answer.th.length > aiPlaybookFieldLimits.faqAnswer.maxLength || faq.answer.en.length > aiPlaybookFieldLimits.faqAnswer.maxLength) throw new Error(`csv_answer_too_long_row_${rowNumber}`);
    return faq;
  });
  if (faqs.length > aiPlaybookFieldLimits.faqQuestion.maxItems) throw new Error("csv_too_many_faqs");
  const identities = faqs.map((faq) => `${faq.question.th.toLocaleLowerCase()}\u0000${faq.question.en.toLocaleLowerCase()}`);
  if (new Set(identities).size !== identities.length) throw new Error("csv_duplicate_faq");
  return faqs;
}
