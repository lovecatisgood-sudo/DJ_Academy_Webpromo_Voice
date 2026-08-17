import { describe, expect, it } from "vitest";
import { parseAiFaqCsv } from "./ai-faq-csv";

describe("AI FAQ CSV", () => {
  it("parses quoted bilingual FAQ rows", () => {
    const [faq] = parseAiFaqCsv([
      "question_th,question_en,answer_th,answer_en",
      '"เปิดกี่โมง","When are you open?","จันทร์-ศุกร์, 9:00-17:00","Monday-Friday, 9:00-17:00"',
    ].join("\n"));
    expect(faq).toEqual({ question: { th: "เปิดกี่โมง", en: "When are you open?" }, answer: { th: "จันทร์-ศุกร์, 9:00-17:00", en: "Monday-Friday, 9:00-17:00" } });
  });

  it("rejects incomplete and duplicate rows atomically", () => {
    const header = "question_th,question_en,answer_th,answer_en";
    expect(() => parseAiFaqCsv(`${header}\nถาม,Question,,Answer`)).toThrow("csv_incomplete_faq_row_2");
    expect(() => parseAiFaqCsv(`${header}\nถาม,Question,ตอบ,Answer\nถาม,Question,ตอบใหม่,Another`)).toThrow("csv_duplicate_faq");
  });
});
