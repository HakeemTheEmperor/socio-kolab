import { z } from "zod";

import { FormSchemaSchema } from "@/lib/event-forms";

const optionalText = (max: number) =>
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
function toLagosDate(v: unknown): unknown {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v)) {
    const withSeconds = v.length === 16 ? `${v}:00` : v;
    return new Date(`${withSeconds}${LAGOS_OFFSET}`);
  }
  return v;
}

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
