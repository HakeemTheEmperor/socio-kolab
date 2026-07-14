import { z } from "zod";

import { validateSlug } from "@/lib/slug";

/**
 * Requesting a new club (MULTI-CLUB §4.1). The slug rules live in `lib/slug.ts`
 * so the live-validation action, this schema, and the create action can't drift —
 * and the reason a slug was rejected is the one `validateSlug` gives.
 */
export const newClubSchema = z.object({
  name: z.string().trim().min(2, "Club name must be at least 2 characters.").max(100),
  slug: z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      const result = validateSlug(value);
      if (!result.ok) {
        ctx.addIssue({ code: "custom", message: result.error });
      }
    }),
  description: z
    .string()
    .trim()
    .max(500, "Description must be 500 characters or fewer.")
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
});

export type NewClubInput = z.infer<typeof newClubSchema>;
