type CsvRow = Record<string, unknown>;

function cellValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function escapeFormula(value: string) {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value: unknown) {
  const text = escapeFormula(cellValue(value));
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(rows: CsvRow[], headers: string[], labels: Record<string, string> = {}) {
  return `\uFEFF${[
    headers.map((header) => csvCell(labels[header] || header)).join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
  ].join("\n")}`;
}
