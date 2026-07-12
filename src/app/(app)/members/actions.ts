"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireMembership } from "@/lib/session";
import { getCurrentClub, getClubSettings } from "@/lib/club";
import { can } from "@/lib/permissions";
import {
  memberStatusSchema,
  roleSchema,
  committeeSchema,
} from "@/lib/validations/members";

export type ActionResult = { ok: boolean; error?: string };

/** Load a membership only if it belongs to the current club (tenant guard). */
async function loadTargetInClub(membershipId: string) {
  const club = await getCurrentClub();
  const target = await prisma.membership.findUnique({
    where: { id: membershipId },
  });
  if (!target || target.clubId !== club.id) return null;
  return target;
}

function revalidateMember(id: string) {
  revalidatePath("/members");
  revalidatePath(`/members/${id}`);
}

export async function approveMember(membershipId: string): Promise<ActionResult> {
  const me = await requireMembership();
  if (!can(me, "member:approve")) return { ok: false, error: "Not authorized." };

  const target = await loadTargetInClub(membershipId);
  if (!target) return { ok: false, error: "Member not found." };
  if (target.status !== "PENDING") {
    return { ok: false, error: "This member is not pending approval." };
  }

  await prisma.membership.update({
    where: { id: membershipId },
    data: { status: "ACTIVE" },
  });
  revalidateMember(membershipId);
  return { ok: true };
}

export async function rejectMember(membershipId: string): Promise<ActionResult> {
  const me = await requireMembership();
  if (!can(me, "member:approve")) return { ok: false, error: "Not authorized." };

  const target = await loadTargetInClub(membershipId);
  if (!target) return { ok: false, error: "Member not found." };
  if (target.status !== "PENDING") {
    return { ok: false, error: "This member is not pending approval." };
  }

  // Soft outcome (no hard delete, per SPEC §3): a rejected applicant is INACTIVE.
  await prisma.membership.update({
    where: { id: membershipId },
    data: { status: "INACTIVE" },
  });
  revalidateMember(membershipId);
  return { ok: true };
}

export async function changeMemberStatus(
  membershipId: string,
  status: string,
): Promise<ActionResult> {
  const me = await requireMembership();
  if (!can(me, "member:changeStatus")) {
    return { ok: false, error: "Not authorized." };
  }

  const parsed = memberStatusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, error: "Invalid status." };

  const target = await loadTargetInClub(membershipId);
  if (!target) return { ok: false, error: "Member not found." };
  if (target.id === me.id) {
    return { ok: false, error: "You can't change your own status." };
  }

  await prisma.membership.update({
    where: { id: membershipId },
    data: { status: parsed.data },
  });
  revalidateMember(membershipId);
  return { ok: true };
}

export async function changeMemberCommittee(
  membershipId: string,
  committee: string,
): Promise<ActionResult> {
  const me = await requireMembership();
  if (!can(me, "member:changeStatus")) {
    return { ok: false, error: "Not authorized." };
  }

  const parsed = committeeSchema.safeParse(committee);
  if (!parsed.success) return { ok: false, error: "Invalid committee." };

  const target = await loadTargetInClub(membershipId);
  if (!target) return { ok: false, error: "Member not found." };

  // If a value is given it must be one of the club's configured committees.
  if (parsed.data) {
    const club = await getCurrentClub();
    const { committees } = getClubSettings(club.settings);
    if (!committees.includes(parsed.data)) {
      return { ok: false, error: "Unknown committee." };
    }
  }

  await prisma.membership.update({
    where: { id: membershipId },
    data: { committee: parsed.data },
  });
  revalidateMember(membershipId);
  return { ok: true };
}

export async function changeMemberRole(
  membershipId: string,
  role: string,
): Promise<ActionResult> {
  const me = await requireMembership();
  if (!can(me, "member:changeRole")) {
    return { ok: false, error: "Not authorized." };
  }

  const parsed = roleSchema.safeParse(role);
  if (!parsed.success) return { ok: false, error: "Invalid role." };

  const target = await loadTargetInClub(membershipId);
  if (!target) return { ok: false, error: "Member not found." };
  if (target.id === me.id) {
    // Prevent a president from demoting themselves into a lockout.
    return { ok: false, error: "You can't change your own role." };
  }

  await prisma.membership.update({
    where: { id: membershipId },
    data: { role: parsed.data },
  });
  revalidateMember(membershipId);
  return { ok: true };
}
