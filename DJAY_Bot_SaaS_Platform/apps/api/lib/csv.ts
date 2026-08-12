export type CsvCell = string | number | boolean | null | undefined;

export function csvCell(value: CsvCell): string {
  const text = value === null || value === undefined ? "" : String(value);
  const safe = /^[\s]*[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function csvResponse(filename: string, rows: readonly (readonly CsvCell[])[]): Response {
  if (!/^[a-z0-9][a-z0-9._-]*\.csv$/i.test(filename)) throw new Error("invalid_csv_filename");
  const body = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new Response(`\uFEFF${body}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
