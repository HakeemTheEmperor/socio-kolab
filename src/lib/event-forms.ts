import { z } from "zod";

/**
 * Custom event registration forms — the single source of truth for form-schema
 * validation (used by the builder's save action) and response validation (used
 * by the public submit action). Keeping both here means the two can never drift:
 * a field the builder saves is a field the submitter knows how to validate.
 *
 * See EVENT-FORMS.md §1.3.
 */

export const FIELD_TYPES = ["text", "textarea", "select", "checkbox", "number"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const MAX_FIELDS = 20;
export const MAX_OPTIONS = 20;
export const LABEL_MAX = 100;
export const OPTION_MAX = 100;
export const TEXT_MAX = 500;
export const TEXTAREA_MAX = 5000;

/** Response inputs are named `custom_{fieldId}` in the rendered form. */
export const FIELD_PREFIX = "custom_";

/* --------------------------------------------------------------------------
 * Form schema (the builder's output)
 * ------------------------------------------------------------------------- */

// Ids are generated client-side with nanoid and NEVER change after creation —
// responses are keyed by id so a renamed or deleted field keeps its history
// readable. Validate the shape, not a specific nanoid length.
const idSchema = z
  .string()
  .trim()
  .min(1, "Field id is required.")
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Field id has invalid characters.");

const optionSchema = z.string().trim().min(1, "An option cannot be empty.").max(OPTION_MAX);

export const FormFieldSchema = z
  .object({
    id: idSchema,
    type: z.enum(FIELD_TYPES),
    label: z.string().trim().min(1, "A field label is required.").max(LABEL_MAX),
    required: z.boolean(),
    options: z.array(optionSchema).min(1).max(MAX_OPTIONS).optional(),
  })
  .superRefine((field, ctx) => {
    if (field.type === "select") {
      if (!field.options || field.options.length === 0) {
        ctx.addIssue({
          code: "custom",
          message: "A dropdown needs at least one option.",
          path: ["options"],
        });
      }
    } else if (field.options !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Only dropdown fields can have options.",
        path: ["options"],
      });
    }
  });

/** A validated form field. Mirrors the type documented in EVENT-FORMS.md §1.1. */
export type FormField = z.infer<typeof FormFieldSchema>;

export const FormSchemaSchema = z
  .array(FormFieldSchema)
  .max(MAX_FIELDS, `A form can have at most ${MAX_FIELDS} fields.`)
  .superRefine((fields, ctx) => {
    const seen = new Set<string>();
    fields.forEach((field, i) => {
      if (seen.has(field.id)) {
        ctx.addIssue({ code: "custom", message: "Duplicate field id.", path: [i, "id"] });
      }
      seen.add(field.id);
    });
  });

/**
 * Safe-parse a `formSchema` value read from the database (or a hidden form
 * input). Anything malformed degrades to an empty form rather than throwing —
 * a hand-corrupted JSONB blob must not 500 the register page.
 */
export function parseFormSchema(value: unknown): FormField[] {
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return [];
    }
  }
  const result = FormSchemaSchema.safeParse(candidate);
  return result.success ? result.data : [];
}

/* --------------------------------------------------------------------------
 * Core registrant (Name + Email) — hardcoded, never part of formSchema
 * ------------------------------------------------------------------------- */

export const coreRegistrantSchema = z.object({
  name: z.string().trim().min(1, "Your name is required.").max(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address.")
    .max(254),
});

export type CoreRegistrant = z.infer<typeof coreRegistrantSchema>;

/* --------------------------------------------------------------------------
 * Response validator (built per event from its formSchema)
 * ------------------------------------------------------------------------- */

// Blank submissions of an optional field collapse to `undefined` so the field
// is omitted from the stored object rather than stored as an empty string.
const blankToUndefined = (v: unknown) =>
  v === "" || v === null || v === undefined ? undefined : v;

// A checkbox is answered by its presence: any non-empty value → true.
const presenceToBoolean = (v: unknown) =>
  v === true ||
  (typeof v === "string" && v.length > 0 && v !== "false") ||
  (typeof v === "number" && v !== 0);

function fieldValidator(field: FormField): z.ZodTypeAny {
  const required = field.required;
  switch (field.type) {
    case "text":
    case "textarea": {
      const max = field.type === "textarea" ? TEXTAREA_MAX : TEXT_MAX;
      const base = z.string().trim().max(max);
      return required
        ? base.min(1, "This field is required.")
        : z.preprocess(blankToUndefined, base.optional());
    }
    case "number": {
      const base = z.coerce.number().refine(Number.isFinite, "Enter a valid number.");
      return required
        ? base
        : z.preprocess(blankToUndefined, base.optional());
    }
    case "select": {
      const opts = field.options ?? [];
      if (opts.length === 0) {
        // Malformed field: accept nothing rather than storing a junk value.
        return required ? z.never() : z.undefined();
      }
      const base = z.enum(opts as [string, ...string[]]);
      return required
        ? base
        : z.preprocess(blankToUndefined, base.optional());
    }
    case "checkbox": {
      const bool = z.preprocess(presenceToBoolean, z.boolean());
      return required
        ? z.preprocess(presenceToBoolean, z.literal(true, { message: "This box must be checked." }))
        : bool;
    }
  }
}

/**
 * Build a Zod schema that validates a registrant's custom-field answers against
 * a specific event's `formSchema`.
 *
 * Input: an object of `custom_{id}` keys (as read from the submitted FormData).
 * Output: a responses object keyed by field **id** — ready to store in
 * `Attendance.formResponses`.
 *
 * Strict: any `custom_*` key not in the schema is rejected, so nothing outside
 * the configured form is ever persisted. Select values outside the configured
 * options are rejected, not stored. Optional fields left blank are omitted.
 */
export function buildResponseValidator(formSchema: FormField[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of formSchema) {
    shape[`${FIELD_PREFIX}${field.id}`] = fieldValidator(field);
  }
  return z.strictObject(shape).transform((parsed) => {
    const responses: Record<string, string | number | boolean> = {};
    for (const field of formSchema) {
      const value = parsed[`${FIELD_PREFIX}${field.id}`];
      if (value === undefined) continue; // optional + blank → omit
      responses[field.id] = value as string | number | boolean;
    }
    return responses;
  });
}

export type FormResponses = Record<string, string | number | boolean>;
