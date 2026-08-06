/* Shared helpers for the admin CSV export endpoints. */

/* escape a CSV cell (quote when it contains a comma, quote or newline) */
export function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/* The admin tables search one joined string per row (DataTable `searchable`).
   Exports reuse the exact same matching so a download contains precisely the
   rows the operator is looking at — filters *and* search box included. */
export function matchesQuery(haystack: string, q?: string | null): boolean {
  const needle = q?.trim().toLowerCase();
  if (!needle) return true;
  return haystack.toLowerCase().includes(needle);
}

/* `filters` become part of the filename so downloads taken with different
   selections don't overwrite each other in the browser's Downloads folder. */
export function csvFilename(base: string, filters: (string | undefined | null)[] = []) {
  const parts = filters
    .filter(Boolean)
    .map((f) => String(f).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""))
    .filter(Boolean);
  return [base, ...parts, new Date().toISOString().slice(0, 10)].join("-") + ".csv";
}

export function csvResponse(filename: string, header: string[], rows: unknown[][]): Response {
  const body = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
  /* BOM so Excel opens UTF-8 names (accents, emoji) correctly */
  return new Response("\uFEFF" + body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
