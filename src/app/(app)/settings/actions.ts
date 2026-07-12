"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireMembership } from "@/lib/session";
import { getCurrentClub } from "@/lib/club";
import { can } from "@/lib/permissions";
import { settingsSchema, type SettingsInput } from "@/lib/validations/settings";

export type ActionResult = { ok: boolean; error?: string };

export async function updateSettings(
  input: SettingsInput,
): Promise<ActionResult> {
  const me = await requireMembership();
  if (!can(me, "settings:edit")) return { ok: false, error: "Not authorized." };

  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const club = await getCurrentClub();
  const { name, duesAmount, currency, currentPeriod, departments, committees } =
    parsed.data;

  // De-duplicate list entries, preserving order.
  const uniq = (arr: string[]) => Array.from(new Set(arr));

  await prisma.club.update({
    where: { id: club.id },
    data: {
      name,
      settings: {
        duesAmount,
        currency,
        currentPeriod,
        departments: uniq(departments),
        committees: uniq(committees),
      },
    },
  });

  // Settings feed the dues dashboard, members filters, dashboard, and profile.
  revalidatePath("/settings");
  revalidatePath("/dues");
  revalidatePath("/members");
  revalidatePath("/dashboard");
  revalidatePath("/profile");
  return { ok: true };
}
