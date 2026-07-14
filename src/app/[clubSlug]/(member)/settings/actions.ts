"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireClubAccess } from "@/lib/club-context";
import { getClubSettings } from "@/lib/club";
import { can } from "@/lib/permissions";
import { settingsSchema, type SettingsInput } from "@/lib/validations/settings";

export type ActionResult = { ok: boolean; error?: string };

export async function updateSettings(
  clubSlug: string,
  input: SettingsInput,
): Promise<ActionResult> {
  const { club, membership: me } = await requireClubAccess(clubSlug);
  if (!can(me, "settings:edit")) return { ok: false, error: "Not authorized." };

  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const {
    name,
    duesAmount,
    currency,
    currentPeriod,
    departments,
    committees,
    membershipOpen,
  } = parsed.data;

  // De-duplicate list entries, preserving order.
  const uniq = (arr: string[]) => Array.from(new Set(arr));

  // Spread the current settings first so any key this form doesn't own survives.
  const current = getClubSettings(club.settings);

  await prisma.club.update({
    where: { id: club.id },
    data: {
      name,
      settings: {
        ...current,
        duesAmount,
        currency,
        currentPeriod,
        departments: uniq(departments),
        committees: uniq(committees),
        membershipOpen,
      },
    },
  });

  // Settings feed the dues dashboard, members filters, dashboard, and profile —
  // and membershipOpen decides whether the register page shows a form at all.
  revalidatePath(`/${clubSlug}/settings`);
  revalidatePath(`/${clubSlug}/dues`);
  revalidatePath(`/${clubSlug}/members`);
  revalidatePath(`/${clubSlug}/dashboard`);
  revalidatePath(`/${clubSlug}/profile`);
  revalidatePath(`/${clubSlug}/register`);
  return { ok: true };
}
