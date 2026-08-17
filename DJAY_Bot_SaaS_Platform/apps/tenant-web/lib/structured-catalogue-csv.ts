export type CatalogueCsvItem = Readonly<{
  itemKind: "product" | "service";
  externalKey: string;
  categoryKey: string | null;
  localizedName: Readonly<{ th: string; en: string }>;
  localizedDescription: Readonly<{ th: string; en: string }>;
  priceMinor: number | null;
  currency: string | null;
  localizedPriceText: Readonly<{ th: string; en: string }>;
  availability: "available" | "unavailable" | "seasonal" | "contact";
  options: readonly Record<string, unknown>[];
  actionReference: Readonly<{ kind: "booking" | "quotation" | "checkout" | "contact" | "link"; value: string }> | null;
  attributes: Record<string, unknown>;
}>;

const requiredHeaders = ["external_key", "item_kind", "name_th", "name_en", "description_th", "description_en"] as const;

function rows(input: string) {
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

function jsonObject(value: string, rowNumber: number) {
  if (!value.trim()) return {};
  const parsed: unknown = JSON.parse(value);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error(`csv_invalid_attributes_row_${rowNumber}`);
  return parsed as Record<string, unknown>;
}

function jsonOptions(value: string, rowNumber: number) {
  if (!value.trim()) return [];
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some((item) => !item || Array.isArray(item) || typeof item !== "object")) {
    throw new Error(`csv_invalid_options_row_${rowNumber}`);
  }
  return parsed as Record<string, unknown>[];
}

export function parseStructuredCatalogueCsv(input: string): CatalogueCsvItem[] {
  const parsedRows = rows(input.replace(/^\uFEFF/, ""));
  if (parsedRows.length < 2) throw new Error("csv_requires_header_and_item");
  const headers = parsedRows[0]!.map((value) => value.trim().toLowerCase());
  for (const header of requiredHeaders) if (!headers.includes(header)) throw new Error(`csv_missing_${header}`);
  const at = (row: string[], key: string) => row[headers.indexOf(key)]?.trim() ?? "";
  const items = parsedRows.slice(1).map((row, index): CatalogueCsvItem => {
    const rowNumber = index + 2;
    const itemKind = at(row, "item_kind");
    if (itemKind !== "product" && itemKind !== "service") throw new Error(`csv_invalid_item_kind_row_${rowNumber}`);
    const availability = at(row, "availability") || "available";
    if (!["available", "unavailable", "seasonal", "contact"].includes(availability)) throw new Error(`csv_invalid_availability_row_${rowNumber}`);
    const price = at(row, "price_minor"); const currency = at(row, "currency");
    if ((price === "") !== (currency === "")) throw new Error(`csv_price_currency_pair_row_${rowNumber}`);
    const priceMinor = price === "" ? null : Number(price);
    if (priceMinor !== null && (!Number.isSafeInteger(priceMinor) || priceMinor < 0)) throw new Error(`csv_invalid_price_row_${rowNumber}`);
    const actionKind = at(row, "action_kind"); const actionValue = at(row, "action_value");
    if ((actionKind === "") !== (actionValue === "")) throw new Error(`csv_action_pair_row_${rowNumber}`);
    if (actionKind && !["booking", "quotation", "checkout", "contact", "link"].includes(actionKind)) throw new Error(`csv_invalid_action_row_${rowNumber}`);
    return {
      itemKind, externalKey: at(row, "external_key"), categoryKey: at(row, "category_key") || null,
      localizedName: { th: at(row, "name_th"), en: at(row, "name_en") },
      localizedDescription: { th: at(row, "description_th"), en: at(row, "description_en") },
      priceMinor, currency: currency || null,
      localizedPriceText: { th: at(row, "price_text_th"), en: at(row, "price_text_en") },
      availability: availability as CatalogueCsvItem["availability"],
      options: jsonOptions(at(row, "options_json"), rowNumber),
      actionReference: actionKind ? { kind: actionKind as NonNullable<CatalogueCsvItem["actionReference"]>["kind"], value: actionValue } : null,
      attributes: jsonObject(at(row, "attributes_json"), rowNumber),
    };
  });
  if (items.length > 200) throw new Error("csv_maximum_200_items");
  if (new Set(items.map((item) => item.externalKey)).size !== items.length) throw new Error("csv_duplicate_external_key");
  return items;
}
