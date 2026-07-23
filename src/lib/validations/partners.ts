import { z } from "zod";

import { optionalText } from "./shared";

/**
 * Partner registry validation (PARTNERS.md §4). Email rules match the signup
 * fields (lowercased); optional text collapses blanks to null via the shared
 * helper. `liaisonId` is nullable — a partner can exist unassigned.
 */
export const partnerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  phone: optionalText(30),
  contactPerson: optionalText(100),
  liaisonId: optionalText(50),
});

export const partnerNoteSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write something first.")
    .max(2000, "Keep a log entry under 2,000 characters."),
});

export type PartnerInput = z.input<typeof partnerSchema>;
export type PartnerNoteInput = z.input<typeof partnerNoteSchema>;
