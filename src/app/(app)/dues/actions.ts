"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireMembership } from "@/lib/session";
import { getCurrentClub, getClubSettings } from "@/lib/club";
import { can } from "@/lib/permissions";
import { paymentSchema, type PaymentInput } from "@/lib/validations/dues";

export type ActionResult = { ok: boolean; error?: string };

export async function recordPayment(input: PaymentInput): Promise<ActionResult> {
  const me = await requireMembership();
  if (!can(me, "dues:record")) return { ok: false, error: "Not authorized." };

  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { membershipId, period, amount, method, note } = parsed.data;

  const club = await getCurrentClub();
  const target = await prisma.membership.findUnique({
    where: { id: membershipId },
  });
  if (!target || target.clubId !== club.id) {
    return { ok: false, error: "Member not found." };
  }
  if (target.status !== "ACTIVE") {
    return { ok: false, error: "Dues can only be recorded for active members." };
  }

  // Only the current period, or a period that already has history, is allowed.
  const settings = getClubSettings(club.settings);
  if (period !== settings.currentPeriod) {
    const existing = await prisma.duesRecord.findFirst({
      where: { clubId: club.id, period },
    });
    if (!existing) return { ok: false, error: "Unknown dues period." };
  }

  // One record per member per period (unique [membershipId, period]).
  // Creating records a new payment; updating is a correction. paidAt (the
  // original payment date) is preserved on correction; note is the audit trail.
  await prisma.duesRecord.upsert({
    where: { membershipId_period: { membershipId, period } },
    create: {
      clubId: club.id,
      membershipId,
      period,
      amount,
      method: method ?? null,
      note,
      recordedById: me.id,
    },
    update: {
      amount,
      method: method ?? null,
      note,
      recordedById: me.id,
    },
  });

  revalidatePath("/dues");
  revalidatePath(`/members/${membershipId}`);
  return { ok: true };
}
