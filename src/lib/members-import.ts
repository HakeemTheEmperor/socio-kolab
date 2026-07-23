/**
 * Bulk member-import parsing (BULKUPLOAD.MD §3.1). One parser feeds both the
 * exec upload UI (file + paste) and the CLI importer, so a CSV file and pasted
 * rows can never be interpreted differently.
 *
 * Pure and dependency-free — safe to import from a client component (the upload
 * dialog parses for its preview) and from a Node script alike.
 */

/** The column order imported rows are read in. Extra columns are ignored. */
export const IMPORT_COLUMNS = [
  "name",
  "email",
  "phone",
  "department",
  "level",
] as const;

export interface ParsedMemberRow {
  /** 1-based position among the non-empty rows of the input (header included) —
   *  the row the exec sees in the file, used to anchor error messages. */
  line: number;
  name: string;
  email: string;
  phone: string;
  department: string;
  level: string;
}

/**
 * Minimal RFC-4180-ish parser over a single delimiter (handles quoted fields,
 * escaped `""`, and CRLF/LF). Fully-blank rows are dropped. Shared by the CSV
 * path and the tab-separated paste path.
 */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Comma-delimited convenience wrapper (the CSV file path and the CLI importer). */
export function parseCsv(text: string): string[][] {
  return parseDelimited(text, ",");
}

/** True when a row is the `name,email,phone,department,level` header. */
function isHeaderRow(cells: string[]): boolean {
  const head = cells.map((c) => c.trim().toLowerCase());
  return head[0] === "name" && head[1] === "email";
}

/**
 * Parse a raw CSV or pasted blob into member rows.
 *
 * - Delimiter is auto-detected: a tab in the first non-empty line → tab-
 *   separated (the shape you get pasting from a spreadsheet), else comma.
 * - An optional header row (`name,email,…`) is detected and skipped.
 * - Cells are trimmed; missing trailing columns read as empty strings.
 *
 * Validation (email shape, required fields, dedupe) is the caller's job — this
 * only turns text into positioned rows.
 */
export function parseMemberRows(raw: string): ParsedMemberRow[] {
  const firstLine = raw.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  const delimiter = firstLine.includes("\t") ? "\t" : ",";

  const grid = parseDelimited(raw, delimiter);
  if (grid.length === 0) return [];

  const startsWithHeader = isHeaderRow(grid[0]);
  const result: ParsedMemberRow[] = [];
  for (let i = 0; i < grid.length; i++) {
    if (i === 0 && startsWithHeader) continue;
    const cells = grid[i].map((c) => c.trim());
    result.push({
      line: i + 1,
      name: cells[0] ?? "",
      email: cells[1] ?? "",
      phone: cells[2] ?? "",
      department: cells[3] ?? "",
      level: cells[4] ?? "",
    });
  }
  return result;
}

/**
 * Split rows into first-seen uniques and later duplicates, comparing on the
 * trimmed, lowercased email (BULKUPLOAD.MD §3.2). Blank emails are left in
 * `unique` for the validator to reject — they aren't "duplicates".
 */
export function dedupeByEmail(rows: ParsedMemberRow[]): {
  unique: ParsedMemberRow[];
  duplicates: ParsedMemberRow[];
} {
  const seen = new Set<string>();
  const unique: ParsedMemberRow[] = [];
  const duplicates: ParsedMemberRow[] = [];
  for (const row of rows) {
    const key = row.email.trim().toLowerCase();
    if (key !== "" && seen.has(key)) {
      duplicates.push(row);
    } else {
      if (key !== "") seen.add(key);
      unique.push(row);
    }
  }
  return { unique, duplicates };
}
