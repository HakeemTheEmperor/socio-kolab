import { z } from "zod";

import { optionalText } from "./shared";

/** Statuses an exec may set (PENDING is only reachable via registration). */
export const memberStatusSchema = z.enum(["ACTIVE", "INACTIVE", "ALUMNI"]);
export const roleSchema = z.enum(["PRESIDENT", "EXEC", "MEMBER"]);

export const committeeSchema = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

export type MemberStatusInput = z.infer<typeof memberStatusSchema>;
export type RoleInput = z.infer<typeof roleSchema>;

/**
 * Bulk import (BULKUPLOAD.MD §3.2). Name/email rules match the signup/register
 * fields (min-2 name, lowercased email); the profile fields collapse blanks to
 * null via the shared `optionalText`. The largest batch is capped so one upload
 * can't fan out into an unbounded number of DB writes + emails.
 */
export const importRowSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  phone: optionalText(30),
  department: optionalText(100),
  level: optionalText(50),
});

export const MAX_IMPORT_ROWS = 500;

export const bulkImportSchema = z
  .array(importRowSchema)
  .min(1, "Add at least one member.")
  .max(MAX_IMPORT_ROWS, `You can import at most ${MAX_IMPORT_ROWS} members at once.`);

export type ImportRowInput = z.input<typeof importRowSchema>;
export type ImportRow = z.infer<typeof importRowSchema>;
