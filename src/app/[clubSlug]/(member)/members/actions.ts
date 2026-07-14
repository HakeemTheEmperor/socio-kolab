"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireClubAccess, findMemberInClub } from "@/lib/club-context";
import { getClubSettings } from "@/lib/club";
import { can } from "@/lib/permissions";
import {
  memberStatusSchema,
  roleSchema,
  committeeSchema,
} from "@/lib/validations/members";

export type ActionResult = { ok: boolean; error?: string };

function revalidateMember(clubSlug: string, id: string) {
  revalidatePath(`/${clubSlug}/members`);
  revalidatePath(`/${clubSlug}/members/${id}`);
}

export async function approveMember(
  clubSlug: string,
  membershipId: string,
): Promise<ActionResult> {
  const { club, membership: me } = await requireClubAccess(clubSlug);
  if (!can(me, "member:approve")) return { ok: false, error: "Not authorized." };

  const target = await findMemberInClub(club.id, membershipId);
  if (!target) return { ok: false, error: "Member not found." };
  if (target.status !== "PENDING") {
    return { ok: false, error: "This member is not pending approval." };
  }

  await prisma.membership.update({
    where: { id: membershipId, clubId: club.id },
    data: { status: "ACTIVE" },
  });
  revalidateMember(clubSlug, membershipId);
  return { ok: true };
}

export async function rejectMember(
  clubSlug: string,
  membershipId: string,
): Promise<ActionResult> {
  const { club, membership: me } = await requireClubAccess(clubSlug);
  if (!can(me, "member:approve")) return { ok: false, error: "Not authorized." };

  const target = await findMemberInClub(club.id, membershipId);
  if (!target) return { ok: false, error: "Member not found." };
  if (target.status !== "PENDING") {
    return { ok: false, error: "This member is not pending approval." };
  }

  // Soft outcome (no hard delete, per SPEC §3): a rejected applicant is INACTIVE.
  await prisma.membership.update({
    where: { id: membershipId, clubId: club.id },
    data: { status: "INACTIVE" },
  });
  revalidateMember(clubSlug, membershipId);
  return { ok: true };
}

export async function changeMemberStatus(
  clubSlug: string,
  membershipId: string,
  status: string,
): Promise<ActionResult> {
  const { club, membership: me } = await requireClubAccess(clubSlug);
  if (!can(me, "member:changeStatus")) {
    return { ok: false, error: "Not authorized." };
  }

  const parsed = memberStatusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, error: "Invalid status." };

  const target = await findMemberInClub(club.id, membershipId);
  if (!target) return { ok: false, error: "Member not found." };
  if (target.id === me.id) {
    return { ok: false, error: "You can't change your own status." };
  }

  await prisma.membership.update({
    where: { id: membershipId, clubId: club.id },
    data: { status: parsed.data },
  });
  revalidateMember(clubSlug, membershipId);
  return { ok: true };
}

export async function changeMemberCommittee(
  clubSlug: string,
  membershipId: string,
  committee: string,
): Promise<ActionResult> {
  const { club, membership: me } = await requireClubAccess(clubSlug);
  if (!can(me, "member:changeStatus")) {
    return { ok: false, error: "Not authorized." };
  }

  const parsed = committeeSchema.safeParse(committee);
  if (!parsed.success) return { ok: false, error: "Invalid committee." };

  const target = await findMemberInClub(club.id, membershipId);
  if (!target) return { ok: false, error: "Member not found." };

  // If a value is given it must be one of this club's configured committees.
  if (parsed.data) {
    const { committees } = getClubSettings(club.settings);
    if (!committees.includes(parsed.data)) {
      return { ok: false, error: "Unknown committee." };
    }
  }

  await prisma.membership.update({
    where: { id: membershipId, clubId: club.id },
    data: { committee: parsed.data },
  });
  revalidateMember(clubSlug, membershipId);
  return { ok: true };
}

export async function changeMemberRole(
  clubSlug: string,
  membershipId: string,
  role: string,
): Promise<ActionResult> {
  const { club, membership: me } = await requireClubAccess(clubSlug);
  if (!can(me, "member:changeRole")) {
    return { ok: false, error: "Not authorized." };
  }

  const parsed = roleSchema.safeParse(role);
  if (!parsed.success) return { ok: false, error: "Invalid role." };

  const target = await findMemberInClub(club.id, membershipId);
  if (!target) return { ok: false, error: "Member not found." };
  if (target.id === me.id) {
    // Prevent a president from demoting themselves into a lockout.
    return { ok: false, error: "You can't change your own role." };
  }

  await prisma.membership.update({
    where: { id: membershipId, clubId: club.id },
    data: { role: parsed.data },
  });
  revalidateMember(clubSlug, membershipId);
  return { ok: true };
}
