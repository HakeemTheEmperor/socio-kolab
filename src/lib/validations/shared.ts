import { z } from "zod";

/**
 * Validation helpers shared across feature schemas. Kept here so the events and
 * elections schemas apply identical empty-string and timezone handling.
 */

/** Trim, cap length, and collapse empty strings to null (for optional text). */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null));

// Africa/Lagos is a fixed UTC+01:00 (no DST). Interpret timezone-less
// datetime-local strings ("YYYY-MM-DDTHH:mm") as Lagos wall-clock time so
// storage is correct regardless of the server's timezone (e.g. UTC on Vercel).
const LAGOS_OFFSET = "+01:00";
export function toLagosDate(v: unknown): unknown {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v)) {
    const withSeconds = v.length === 16 ? `${v}:00` : v;
    return new Date(`${withSeconds}${LAGOS_OFFSET}`);
  }
  return v;
}
