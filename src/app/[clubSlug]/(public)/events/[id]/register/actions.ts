"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import {
  buildResponseValidator,
  coreRegistrantSchema,
  parseFormSchema,
  FIELD_PREFIX,
} from "@/lib/event-forms";
import type { ZodError } from "zod";

/**
 * Public event-registration submit action (EVENT-FORMS.md §4).
 *
 * The one deliberately session-less action: it still resolves and scopes by
 * slug, but requires no membership. Every step fails closed, and each security
 * decision (intake open, member-vs-guest, no duplicates) is made server-side —
 * the register page's UI is cosmetic; this is the actual boundary.
 */

export type RegistrationState = {
  ok?: boolean;
  /** A form-level message (resolution/intake/duplicate failures). */
  error?: string;
  /** Per-input messages, keyed by input name (`name`, `email`, `custom_{id}`). */
  fieldErrors?: Record<string, string>;
};

// Club/event resolution failures are deliberately vague: this action answers to
// forged and replayed POSTs, which should learn nothing about what exists.
const GENERIC = "This registration link is no longer available.";
const CLOSED = "This form is no longer accepting responses.";
const DUPLICATE = "You’re already registered for this event.";

export async function submitEventRegistrationAction(
  clubSlug: string,
  eventId: string,
  _prevState: RegistrationState,
  formData: FormData,
): Promise<RegistrationState> {
  // 1. Resolve club — ACTIVE only.
  const club = await prisma.club.findFirst({
    where: { slug: clubSlug, status: "ACTIVE" },
  });
  if (!club) return { error: GENERIC };

  // 2. Resolve event — compound scope; another club's id must not resolve here.
  const event = await prisma.event.findFirst({
    where: { id: eventId, clubId: club.id },
  });
  if (!event) return { error: GENERIC };

  // 3. Intake gate FIRST, before reading any answer. This is the hard boundary
  //    against replayed/scripted POSTs; the page banner is only cosmetic.
  const past = event.startsAt.getTime() < new Date().getTime();
  if (!event.acceptingResponses || past) return { error: CLOSED };

  // 4. Honeypot: a filled hidden field means a bot. Look successful, write nothing.
  const honeypot = formData.get("company");
  if (typeof honeypot === "string" && honeypot.trim() !== "") return { ok: true };

  // 5. Validate the custom answers against THIS event's schema. Strict: unknown
  //    custom_* keys and out-of-option select values are rejected, not stored.
  const formSchema = parseFormSchema(event.formSchema);
  const customInput: Record<string, FormDataEntryValue> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith(FIELD_PREFIX)) customInput[key] = value;
  }
  const responseResult = buildResponseValidator(formSchema).safeParse(customInput);

  const fieldErrors: Record<string, string> = {};
  let formError = responseResult.success
    ? undefined
    : collectErrors(responseResult.error, fieldErrors);

  // 6. Re-derive the viewer server-side (session → membership in THIS club). A
  //    member's identity comes from their account — submitted name/email are
  //    ignored entirely. Everyone else is a guest.
  const session = await auth();
  let membershipId: string | null = null;
  if (session?.user?.id) {
    const membership = await prisma.membership.findUnique({
      where: { clubId_userId: { clubId: club.id, userId: session.user.id } },
    });
    if (membership?.status === "ACTIVE") membershipId = membership.id;
  }

  let guest: { name: string; email: string } | null = null;
  if (!membershipId) {
    const coreResult = coreRegistrantSchema.safeParse({
      name: formData.get("name"),
      email: formData.get("email"),
    });
    if (coreResult.success) guest = coreResult.data;
    else formError = collectErrors(coreResult.error, fieldErrors) ?? formError;
  }

  if (!responseResult.success || (!membershipId && !guest)) {
    return {
      error: formError ?? (Object.keys(fieldErrors).length ? undefined : GENERIC),
      fieldErrors: Object.keys(fieldErrors).length ? fieldErrors : undefined,
    };
  }
  const responses = responseResult.data;

  // 7. Duplicate gate (the unique constraints backstop a race in step 8).
  const already = membershipId
    ? await prisma.attendance.findUnique({
        where: { eventId_membershipId: { eventId, membershipId } },
      })
    : await prisma.attendance.findUnique({
        where: { eventId_guestEmail: { eventId, guestEmail: guest!.email } },
      });
  if (already) return { error: DUPLICATE };

  // 8. Write. A row is EITHER a member OR a guest — never both (the XOR the
  //    schema can't express). rsvp GOING: registering is going.
  try {
    await prisma.attendance.create({
      data: membershipId
        ? { eventId, membershipId, rsvp: "GOING", formResponses: responses }
        : {
            eventId,
            guestName: guest!.name,
            guestEmail: guest!.email,
            rsvp: "GOING",
            formResponses: responses,
          },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: DUPLICATE };
    }
    return { error: "Something went wrong. Please try again." };
  }

  revalidatePath(`/${clubSlug}/events/${eventId}`);
  revalidatePath(`/${clubSlug}/events/${eventId}/register`);
  return { ok: true };
}

/**
 * Fold a Zod error into `fieldErrors` (keyed by input name) and return a
 * form-level message for any issue that can't be pinned to a field — e.g. a
 * rejected unknown `custom_*` key, which has no input the form knows about.
 */
function collectErrors(
  error: ZodError,
  fieldErrors: Record<string, string>,
): string | undefined {
  let formError: string | undefined;
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && key) {
      fieldErrors[key] ??= issue.message;
    } else {
      formError = "Please check your answers and try again.";
    }
  }
  return formError;
}
