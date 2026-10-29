/**
 * Limits and names shared by the form builder (client), the public registration
 * form (client) and the validators in event-forms.ts (server).
 *
 * Deliberately has no imports: event-forms.ts pulls in zod, which is large, and a
 * client component that imported these constants from there would ship zod to the
 * browser just to read a few numbers.
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
