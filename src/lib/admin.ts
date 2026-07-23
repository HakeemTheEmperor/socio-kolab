import { cache } from "react";
import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Platform admin guard (MULTI-CLUB §4.2).
 *
 * Anyone who isn't an admin — signed out, or an ordinary member — gets a 404,
 * not a redirect or a 403: the existence of the admin area is not something the
 * app confirms to people who can't use it.
 *
 * `isPlatformAdmin` is read from the database on every call rather than carried
 * in the session token, so revoking it takes effect immediately instead of
 * whenever the JWT happens to be reissued.
 */
export const requirePlatformAdmin = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) notFound();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (!user?.isPlatformAdmin) notFound();

  return user;
});

/**
 * Is this user a platform admin? Used to enforce the separation-of-duties rules
 * (MULTI-CLUB §4.3): a platform admin — the referee who approves and suspends
 * clubs — may neither create a club nor hold a membership in one. The guards
 * live in the mutation actions that could otherwise cross that line
 * (`requestClub`, `joinClubAction`, `importOne`); this is their shared check.
 *
 * Read from the DB, never the JWT, so revoking admin takes effect at once.
 */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isPlatformAdmin: true },
  });
  return user?.isPlatformAdmin ?? false;
}
