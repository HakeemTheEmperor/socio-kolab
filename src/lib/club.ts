import { cache } from "react";
import { prisma } from "@/lib/prisma";

/** Shape of Club.settings (see SPEC §4). */
export interface ClubSettings {
  duesAmount: number;
  currency: string;
  currentPeriod: string;
  departments: string[];
  committees: string[];
  /** Whether the club accepts self-service membership applications. */
  membershipOpen: boolean;
}

const DEFAULT_SETTINGS: ClubSettings = {
  duesAmount: 0,
  currency: "NGN",
  currentPeriod: "",
  departments: [],
  committees: [],
  membershipOpen: true,
};

/**
 * Resolve the current club.
 *
 * @deprecated Multi-club routing resolves the club from the `[clubSlug]` URL
 * segment (see `lib/club-context.ts`). This remains only for the pages not yet
 * migrated, and resolves to the oldest ACTIVE club so its behaviour stays
 * deterministic now that more than one club row exists.
 */
export const getCurrentClub = cache(async () => {
  const club = await prisma.club.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
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
