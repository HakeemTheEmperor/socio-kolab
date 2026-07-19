"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import {
  requireClubAccess,
  findMemberInClub,
  findPartnerInClub,
} from "@/lib/club-context";
import { can, canSeePartner } from "@/lib/permissions";
import {
  partnerSchema,
  partnerNoteSchema,
  type PartnerInput,
} from "@/lib/validations/partners";

export type ActionResult = { ok: boolean; error?: string };

/**
 * A liaison must be an ACTIVE membership of THIS club (any role — a MEMBER
 * liaison is the case the module explicitly supports). Returns an error string
 * or null when valid/absent.
 */
async function checkLiaison(clubId: string, liaisonId: string | null) {
  if (!liaisonId) return null;
  const liaison = await findMemberInClub(clubId, liaisonId);
  if (!liaison) return "Liaison not found.";
  if (liaison.status !== "ACTIVE") {
    return "The liaison must be an active member.";
  }
  return null;
}

export async function createPartner(
  clubSlug: string,
  input: PartnerInput,
): Promise<ActionResult> {
  const { club, membership: me } = await requireClubAccess(clubSlug);
  if (!can(me, "partner:manage")) return { ok: false, error: "Not authorized." };

  const parsed = partnerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const liaisonError = await checkLiaison(club.id, parsed.data.liaisonId);
  if (liaisonError) return { ok: false, error: liaisonError };

  await prisma.partner.create({
    data: { clubId: club.id, ...parsed.data },
  });

  revalidatePath(`/${clubSlug}/partners`);
  return { ok: true };
}

export async function updatePartner(
  clubSlug: string,
  partnerId: string,
  input: PartnerInput,
): Promise<ActionResult> {
  const { club, membership: me } = await requireClubAccess(clubSlug);
  if (!can(me, "partner:manage")) return { ok: false, error: "Not authorized." };

  const parsed = partnerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const partner = await findPartnerInClub(club.id, partnerId);
  if (!partner) return { ok: false, error: "Partner not found." };
  if (partner.archivedAt) {
    return { ok: false, error: "Restore this partner before editing it." };
  }

  const liaisonError = await checkLiaison(club.id, parsed.data.liaisonId);
  if (liaisonError) return { ok: false, error: liaisonError };

  // Re-assert the club in the same statement (extended where-unique) rather
  // than trusting the preceding read.
  await prisma.partner.update({
    where: { id: partnerId, clubId: club.id },
    data: parsed.data,
  });

  revalidatePath(`/${clubSlug}/partners`);
  revalidatePath(`/${clubSlug}/partners/${partnerId}`);
  return { ok: true };
}

async function setArchived(
  clubSlug: string,
  partnerId: string,
  archived: boolean,
): Promise<ActionResult> {
  const { club, membership: me } = await requireClubAccess(clubSlug);
  if (!can(me, "partner:manage")) return { ok: false, error: "Not authorized." };

  const { count } = await prisma.partner.updateMany({
    where: { id: partnerId, clubId: club.id },
    data: { archivedAt: archived ? new Date() : null },
  });
  if (count === 0) return { ok: false, error: "Partner not found." };

  revalidatePath(`/${clubSlug}/partners`);
  revalidatePath(`/${clubSlug}/partners/${partnerId}`);
  return { ok: true };
}

export async function archivePartner(
  clubSlug: string,
  partnerId: string,
): Promise<ActionResult> {
  return setArchived(clubSlug, partnerId, true);
}

export async function restorePartner(
  clubSlug: string,
  partnerId: string,
): Promise<ActionResult> {
  return setArchived(clubSlug, partnerId, false);
}

export async function addPartnerNote(
  clubSlug: string,
  partnerId: string,
  body: string,
): Promise<ActionResult> {
  const { club, membership: me } = await requireClubAccess(clubSlug);

  const partner = await findPartnerInClub(club.id, partnerId);
  // Exec OR this partner's liaison — same "not found" for unauthorized members
  // as for cross-club ids, so a member can't probe which partners exist.
  if (!partner || !canSeePartner(me, partner)) {
    return { ok: false, error: "Partner not found." };
  }
  if (partner.archivedAt) {
    return { ok: false, error: "This partner is archived. Restore it to add log entries." };
  }

  const parsed = partnerNoteSchema.safeParse({ body });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  await prisma.partnerNote.create({
    data: { partnerId: partner.id, authorId: me.id, body: parsed.data.body },
  });

  revalidatePath(`/${clubSlug}/partners/${partnerId}`);
  revalidatePath(`/${clubSlug}/partners`);
  return { ok: true };
}
