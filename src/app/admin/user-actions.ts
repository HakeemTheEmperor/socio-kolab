"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/admin";

export type ActionResult = { ok: boolean; error?: string };

/**
 * Platform-role management, admin-only. The Users view is read-only except for
 * this one lever: flipping `User.isPlatformAdmin`. Admins still cannot see or
 * edit any club's members, dues, events, or settings — "referees, not players"
 * (MULTI-CLUB §4.3) holds; what changes is that the referee bench is now managed
 * from the UI rather than the seed/DB only.
 *
 * Every action re-checks `requirePlatformAdmin()` server-side: the layout guard
 * protects the pages, not these entry points.
 */

/** Promote a user to platform admin. */
export async function grantPlatformAdmin(userId: string): Promise<ActionResult> {
  await requirePlatformAdmin();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      isPlatformAdmin: true,
      _count: { select: { memberships: true } },
    },
  });
  if (!user) return { ok: false, error: "User not found." };
  if (user.isPlatformAdmin) return { ok: true };

  // §4.3 invariant: admins hold no memberships. Promoting a current member would
  // break it the instant it took effect (and let them referee a club they play
  // in). Enforced here, not just in the UI.
  if (user._count.memberships > 0) {
    return {
      ok: false,
      error:
        "This user belongs to a club. A platform admin can't hold a membership — they must leave their clubs (or use a separate account) first.",
    };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { isPlatformAdmin: true },
  });
  revalidatePath("/admin/users");
  revalidatePath("/admin");
  return { ok: true };
}

/** Demote a platform admin back to an ordinary account. */
export async function revokePlatformAdmin(
  userId: string,
): Promise<ActionResult> {
  const me = await requirePlatformAdmin();

  // Revoking your own admin risks locking yourself out of /admin.
  if (userId === me.id) {
    return { ok: false, error: "You can't revoke your own admin access." };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isPlatformAdmin: true },
  });
  if (!user) return { ok: false, error: "User not found." };
  if (!user.isPlatformAdmin) return { ok: true };

  // The real invariant is the live count, not the session: a second admin
  // demoting the only *other* admin would also leave one — this catches both.
  const adminCount = await prisma.user.count({
    where: { isPlatformAdmin: true },
  });
  if (adminCount <= 1) {
    return { ok: false, error: "At least one platform admin must remain." };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { isPlatformAdmin: false },
  });
  revalidatePath("/admin/users");
  revalidatePath("/admin");
  return { ok: true };
}
