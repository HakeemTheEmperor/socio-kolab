import { z } from "zod";

import { optionalText, toLagosDate } from "@/lib/validations/shared";

/**
 * Election validation schemas (ELECTIONS.md). The four window datetimes must
 * form a valid timeline; cross-field `.refine`s below anchor each error on the
 * offending field so the form can surface it inline.
 */

const windowDate = (message: string) => z.preprocess(toLagosDate, z.coerce.date({ message }));

export const electionSchema = z
  .object({
    title: z.string().trim().min(2, "Title is required.").max(200),
    description: optionalText(2000),
    positions: z
      .array(
        z.object({
          title: z.string().trim().min(2, "Position title is required.").max(100),
        }),
      )
      .min(1, "Add at least one position.")
      .max(20, "That's a lot of positions — 20 max."),
    applicationsStartAt: windowDate("Applications start is required."),
    applicationsEndAt: windowDate("Applications end is required."),
    votingStartAt: windowDate("Voting start is required."),
    votingEndAt: windowDate("Voting end is required."),
  })
  .refine(
    (d) => {
      const seen = new Set<string>();
      for (const p of d.positions) {
        const key = p.title.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
      }
      return true;
    },
    { message: "Position titles must be unique.", path: ["positions"] },
  )
  .refine((d) => d.applicationsStartAt < d.applicationsEndAt, {
    message: "Applications must end after they start.",
    path: ["applicationsEndAt"],
  })
  .refine((d) => d.applicationsEndAt <= d.votingStartAt, {
    message: "Voting cannot start before applications close.",
    path: ["votingStartAt"],
  })
  .refine((d) => d.votingStartAt < d.votingEndAt, {
    message: "Voting must end after it starts.",
    path: ["votingEndAt"],
  });

export const applicationSchema = z.object({
  statement: z
    .string()
    .trim()
    .min(20, "Tell members a bit more — at least 20 characters.")
    .max(5000),
});

export const reviewDecisionSchema = z.enum(["APPROVED", "REJECTED"]);

export type ElectionInput = z.input<typeof electionSchema>;
export type ApplicationInput = z.input<typeof applicationSchema>;
export type ReviewDecision = z.infer<typeof reviewDecisionSchema>;
