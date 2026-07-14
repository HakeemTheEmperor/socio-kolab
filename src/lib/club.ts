/** Shape of Club.settings (see SPEC §4 and MULTI-CLUB.md §1). */
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
 * Parse Club.settings JSON into a typed object with safe defaults.
 *
 * The club itself is resolved from the URL slug — see `lib/club-context.ts`.
 */
export function getClubSettings(settings: unknown): ClubSettings {
  if (settings && typeof settings === "object") {
    return { ...DEFAULT_SETTINGS, ...(settings as Partial<ClubSettings>) };
  }
  return DEFAULT_SETTINGS;
}
