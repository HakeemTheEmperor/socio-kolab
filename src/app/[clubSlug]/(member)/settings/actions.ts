"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireClubAccess } from "@/lib/club-context";
import { getClubSettings } from "@/lib/club";
import { can } from "@/lib/permissions";
import { validateTheme } from "@/lib/theme";
import {
  settingsSchema,
  themeSchema,
  type SettingsInput,
  type ThemeInput,
} from "@/lib/validations/settings";

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

/**
 * Set the club's three theme colors, or reset to the platform default (`null`).
 *
 * The contrast rules run here, not just in the browser: the form disables its own
 * save button, but a replayed request must be refused all the same (UI-REFACTOR
 * §A5).
 */
export async function updateTheme(
  clubSlug: string,
  input: ThemeInput | null,
): Promise<ActionResult> {
  const { club, membership: me } = await requireClubAccess(clubSlug);
  if (!can(me, "settings:edit")) return { ok: false, error: "Not authorized." };

  const current = getClubSettings(club.settings);
  let settings: Record<string, unknown>;

  if (input === null) {
    // Reset: drop the key entirely, so the club follows the platform default
    // rather than pinning today's default into its settings row.
    settings = { ...current };
    delete settings.theme;
  } else {
    const parsed = themeSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid color." };
    }

    const { background, primary, accent } = parsed.data;
    const { ok, warnings } = validateTheme(background, primary, accent);
    if (!ok) return { ok: false, error: warnings.join(" ") };

    settings = { ...current, theme: { background, primary, accent } };
  }

  await prisma.club.update({
    where: { id: club.id },
    data: { settings: settings as never },
  });

  // The theme is injected by the [clubSlug] layout, so every page under the club
  // — including the public register page — has to be rebuilt.
  revalidatePath(`/${clubSlug}`, "layout");
  return { ok: true };
}
