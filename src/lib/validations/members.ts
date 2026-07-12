import { z } from "zod";

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
