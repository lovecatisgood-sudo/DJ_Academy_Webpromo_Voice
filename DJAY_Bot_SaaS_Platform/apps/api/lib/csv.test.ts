import { describe, expect, it } from "vitest";
import { csvCell, csvResponse } from "./csv";

describe("safe CSV exports", () => {
  it("quotes delimiters and neutralizes spreadsheet formulas, including leading whitespace", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("=HYPERLINK(\"https://invalid\")")).toBe('"\'=HYPERLINK(""https://invalid"")"');
    expect(csvCell("  +1")).toBe('"\'  +1"');
  });

  it("emits a Thai-compatible, non-cacheable attachment and rejects unsafe filenames", async () => {
    const response = csvResponse("djay-customers.csv", [["ชื่อ", "value"], ["ร้าน", 1]]);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="djay-customers.csv"');
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect([...new Uint8Array(await response.arrayBuffer()).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(() => csvResponse("../unsafe.csv", [])).toThrow("invalid_csv_filename");
  });
});
