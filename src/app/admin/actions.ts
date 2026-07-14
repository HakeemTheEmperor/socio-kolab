"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/admin";

export type ActionResult = { ok: boolean; error?: string };

/**
 * Club lifecycle, admin-only (MULTI-CLUB §4.2). Admins manage whether a club
 * exists, never what is inside it — there is deliberately no action here that
 * touches a club's members, dues, events, or settings.
 *
 * Every action re-checks `isPlatformAdmin` server-side: the /admin page's guard
 * protects the page, not these entry points.
 */

/** A club's status only moves along the transitions the UI actually offers. */
async function transition(
  clubId: string,
  from: ("PENDING" | "ACTIVE" | "SUSPENDED")[],
  to: "ACTIVE" | "REJECTED" | "SUSPENDED",
  extra: { approvedAt?: Date } = {},
): Promise<ActionResult> {
  await requirePlatformAdmin();

  const club = await prisma.club.findUnique({ where: { id: clubId } });
  if (!club) return { ok: false, error: "Club not found." };
  if (!from.includes(club.status as (typeof from)[number])) {
    return {
      ok: false,
      error: `A ${club.status.toLowerCase()} club can't be ${to.toLowerCase()}.`,
    };
  }

  await prisma.club.update({
    where: { id: clubId },
    data: { status: to, ...extra },
  });
  revalidatePath("/admin");
  // The club's own pages appear or vanish with this flip, as does its card on
  // every member's /clubs page.
  revalidatePath("/clubs");
  return { ok: true };
}

export async function approveClub(clubId: string): Promise<ActionResult> {
  // Approval is a single status flip: the requester's PRESIDENT membership was
  // created with the club and has been waiting, dormant, behind the 404.
  return transition(clubId, ["PENDING"], "ACTIVE", { approvedAt: new Date() });
}

export async function rejectClub(clubId: string): Promise<ActionResult> {
  return transition(clubId, ["PENDING"], "REJECTED");
}

export async function suspendClub(clubId: string): Promise<ActionResult> {
  return transition(clubId, ["ACTIVE"], "SUSPENDED");
}

export async function reactivateClub(clubId: string): Promise<ActionResult> {
  // Reactivating an approved-then-suspended club: keep the original approvedAt.
  return transition(clubId, ["SUSPENDED"], "ACTIVE");
}
