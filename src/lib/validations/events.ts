import { z } from "zod";

import { FormSchemaSchema } from "@/lib/event-forms";
import { optionalText, toLagosDate } from "@/lib/validations/shared";

export const eventSchema = z
  .object({
    title: z.string().trim().min(2, "Title is required.").max(200),
    description: optionalText(2000),
    location: optionalText(200),
    startsAt: z.preprocess(
      toLagosDate,
      z.coerce.date({ message: "Start date/time is required." }),
    ),
    endsAt: z.preprocess(
      (v) => (v === "" || v == null ? null : toLagosDate(v)),
      z.coerce.date().nullable(),
    ),
    // The custom registration form is saved atomically with the event — no
    // separate save flow. `acceptingResponses` is deliberately NOT here: it is
    // toggled instantly through its own action (EVENT-FORMS.md §2.3, §2.4).
    formSchema: FormSchemaSchema.default([]),
  })
  .refine((d) => !d.endsAt || d.endsAt >= d.startsAt, {
    message: "End must be after the start.",
    path: ["endsAt"],
  });

export const rsvpSchema = z.enum(["GOING", "NOT_GOING", "MAYBE"]);

export type EventInput = z.input<typeof eventSchema>;
export type RsvpInput = z.infer<typeof rsvpSchema>;
