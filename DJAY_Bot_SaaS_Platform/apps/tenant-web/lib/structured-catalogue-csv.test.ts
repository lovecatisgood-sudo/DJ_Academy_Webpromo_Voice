import { describe, expect, it } from "vitest";
import { parseStructuredCatalogueCsv } from "./structured-catalogue-csv";

describe("structured catalogue CSV", () => {
  it("parses bilingual quoted data, price and typed action", () => {
    const [item] = parseStructuredCatalogueCsv([
      "external_key,item_kind,name_th,name_en,description_th,description_en,price_minor,currency,availability,action_kind,action_value",
      'consult-30,service,"ปรึกษา, 30 นาที",30-minute consultation,คำแนะนำธุรกิจ,Business advice,150000,THB,available,booking,consultation',
    ].join("\n"));
    expect(item).toMatchObject({ externalKey: "consult-30", itemKind: "service", priceMinor: 150000,
      localizedName: { th: "ปรึกษา, 30 นาที", en: "30-minute consultation" },
      actionReference: { kind: "booking", value: "consultation" } });
  });

  it("rejects partial price authority and duplicate identities", () => {
    const header = "external_key,item_kind,name_th,name_en,description_th,description_en,price_minor,currency";
    expect(() => parseStructuredCatalogueCsv(`${header}\na,product,กก,AA,คำ,Text,100,`)).toThrow("csv_price_currency_pair_row_2");
    expect(() => parseStructuredCatalogueCsv(`${header}\na,product,กก,AA,คำ,Text,,\na,service,ขข,BB,คำ,Text,,`)).toThrow("csv_duplicate_external_key");
  });
});
