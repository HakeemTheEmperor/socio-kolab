import { cache } from "react";
import { prisma } from "@/lib/prisma";

/** Shape of Club.settings (see SPEC §4). */
export interface ClubSettings {
  duesAmount: number;
  currency: string;
  currentPeriod: string;
  departments: string[];
  committees: string[];
}

const DEFAULT_SETTINGS: ClubSettings = {
  duesAmount: 0,
  currency: "NGN",
  currentPeriod: "",
  departments: [],
  committees: [],
};

/**
 * Resolve the current club. v1 is single-tenant: there is exactly one club row.
 * Every query is scoped through here rather than hardcoding a club id inline,
 * so multi-club support can be added later without a rewrite.
 */
export const getCurrentClub = cache(async () => {
  const club = await prisma.club.findFirst();
  if (!club) {
    throw new Error("No club configured. Run `npm run db:seed`.");
  }
  return club;
});

/** Parse Club.settings JSON into a typed object with safe defaults. */
export function getClubSettings(settings: unknown): ClubSettings {
  if (settings && typeof settings === "object") {
    return { ...DEFAULT_SETTINGS, ...(settings as Partial<ClubSettings>) };
  }
  return DEFAULT_SETTINGS;
}
