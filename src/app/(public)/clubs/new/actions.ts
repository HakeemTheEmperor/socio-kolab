"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { validateSlug } from "@/lib/slug";
import { newClubSchema } from "@/lib/validations/club";

export type SlugCheck = { ok: true } | { ok: false; error: string };

/**
 * Live slug check for the create form (format + uniqueness).
 *
 * Advisory only: the create action re-checks both, because the answer can go
 * stale between the keystroke and the submit — two people can be typing the
 * same slug at once, and the unique index is the real arbiter.
 */
export async function checkSlug(slug: string): Promise<SlugCheck> {
  const format = validateSlug(slug);
  if (!format.ok) return format;

  const taken = await prisma.club.findUnique({ where: { slug } });
  // Every club holds its slug, whatever its status: a rejected or suspended
  // club still owns the URL, and saying "taken" reveals nothing a 404 wouldn't.
  if (taken) return { ok: false, error: `"${slug}" is already taken.` };

  return { ok: true };
}

export type NewClubState = { error?: string; submitted?: { name: string } };

/**
 * Request a club. Any signed-in user may ask; a platform admin decides.
 *
 * The club is created PENDING and the requester gets an ACTIVE PRESIDENT
 * membership straight away. That membership is dormant until approval — a
 * PENDING club resolves as 404 for everyone (`getClubBySlug`) — which means
 * approval is a single status flip rather than a second write that could half-fail.
 */
export async function requestClub(
  _prevState: NewClubState,
  formData: FormData,
): Promise<NewClubState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "You need to be signed in to start a club." };
  }

  const parsed = newClubSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { name, slug, description } = parsed.data;

  try {
    await prisma.club.create({
      data: {
        name,
        slug,
        description: description ?? null,
        status: "PENDING",
        requestedById: session.user.id,
        settings: {
          duesAmount: 0,
          currency: "NGN",
          currentPeriod: "",
          departments: [],
          committees: [],
          membershipOpen: true,
        },
        memberships: {
          create: {
            userId: session.user.id,
            role: "PRESIDENT",
            status: "ACTIVE",
          },
        },
      },
    });
  } catch {
    // The unique index on slug is the last word — someone may have taken it
    // between the live check and this write.
    return {
      error: `Could not create the club. "${slug}" may already be taken — try another.`,
    };
  }

  revalidatePath("/clubs");
  return { submitted: { name } };
}
