import type { FormField } from "./event-forms";

/**
 * Reporting helpers for event registration responses (EVENT-FORMS.md §5).
 * `deriveResponseColumns` is the single source of column order shared by the
 * exec Responses table and the CSV export, so their headers can never diverge.
 */

export type ResponseColumn = {
  /** Field id — the key into a row's `formResponses`. */
  id: string;
  label: string;
  /** True for a field no longer in the schema, surfaced as "(removed field)". */
  removed: boolean;
};

/**
 * Columns in current `formSchema` order, then any orphaned response keys (a field
 * deleted since someone answered it) appended last, each labelled
 * "(removed field)" — responses are retained, never dropped (no-hard-delete).
 */
export function deriveResponseColumns(
  formSchema: FormField[],
  responsesList: Record<string, unknown>[],
): ResponseColumn[] {
  const columns: ResponseColumn[] = formSchema.map((f) => ({
    id: f.id,
    label: f.label,
    removed: false,
  }));
  const known = new Set(formSchema.map((f) => f.id));
  const seenOrphans = new Set<string>();
  for (const responses of responsesList) {
    for (const key of Object.keys(responses)) {
      if (!known.has(key) && !seenOrphans.has(key)) {
        seenOrphans.add(key);
        columns.push({ id: key, label: "(removed field)", removed: true });
      }
    }
  }
  return columns;
}

/** On-screen cell: checkbox → Yes/—, anything blank → —. */
export function responseCellText(value: unknown): string {
  if (value === true) return "Yes";
  if (value === false) return "—";
  if (value === undefined || value === null || value === "") return "—";
  return String(value);
}

/** CSV cell value: checkbox → Yes/No, blank → empty (an em-dash isn't data). */
export function responseCellCsv(value: unknown): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (value === undefined || value === null) return "";
  return String(value);
}

/**
 * Escape one CSV field.
 * - Formula-injection guard: a value starting with `=`, `+`, `-`, or `@` is
 *   prefixed with `'` so Excel/Sheets treat it as text, not a formula. Responses
 *   are attacker-controlled and land in execs' spreadsheets.
 * - Then RFC-4180 quoting: wrap in quotes if it contains a quote, comma, or
 *   newline, doubling inner quotes.
 */
export function csvCell(value: string): string {
  let v = value;
  if (/^[=+\-@]/.test(v)) v = `'${v}`;
  if (/["\n\r,]/.test(v)) v = `"${v.replace(/"/g, '""')}"`;
  return v;
}

/** Serialise rows to CSV text (CRLF line endings, RFC 4180). */
export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
