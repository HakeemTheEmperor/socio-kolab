/**
 * Club slugs (see MULTI-CLUB.md §1). Clubs are addressed in URLs by slug
 * (`/adrian-tech/dashboard`), so a slug must never collide with a top-level
 * route segment — hence the reserved list.
 */

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 30;

/** Top-level route segments a club slug must never shadow. */
export const RESERVED_SLUGS = [
  "login",
  "register",
  "clubs",
  "admin",
  "api",
  "settings",
  "profile",
  "dashboard",
  "about",
  "new",
] as const;

// Lowercase alphanumeric groups joined by single hyphens: this single pattern
// enforces the charset and rules out leading, trailing, and doubled hyphens.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type SlugValidation = { ok: true } | { ok: false; error: string };

/** Validate a user-supplied slug for format and reserved words. */
export function validateSlug(slug: string): SlugValidation {
  if (!slug) {
    return { ok: false, error: "A slug is required." };
  }
  if (slug.length < SLUG_MIN_LENGTH || slug.length > SLUG_MAX_LENGTH) {
    return {
      ok: false,
      error: `Slug must be between ${SLUG_MIN_LENGTH} and ${SLUG_MAX_LENGTH} characters.`,
    };
  }
  if (!SLUG_PATTERN.test(slug)) {
    return {
      ok: false,
      error:
        "Slug may only contain lowercase letters, numbers, and single hyphens between them.",
    };
  }
  if ((RESERVED_SLUGS as readonly string[]).includes(slug)) {
    return { ok: false, error: `"${slug}" is reserved. Please choose another.` };
  }
  return { ok: true };
}

/**
 * Derive a candidate slug from a club name — used to prefill the slug field.
 * The result is a suggestion only; it still has to pass `validateSlug`.
 */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "") // drop the combining marks NFKD split off
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, ""); // the slice may have left a trailing hyphen
}
