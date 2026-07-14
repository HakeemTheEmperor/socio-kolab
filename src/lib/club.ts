import { DEFAULT_THEME, type ThemeColors } from "@/lib/theme";

/** Shape of Club.settings (see SPEC §4, MULTI-CLUB.md §1, UI-REFACTOR.md §A6). */
export interface ClubSettings {
  duesAmount: number;
  currency: string;
  currentPeriod: string;
  departments: string[];
  committees: string[];
  /** Whether the club accepts self-service membership applications. */
  membershipOpen: boolean;
  /** The club's three theme colors. Absent = platform default. */
  theme?: ThemeColors;
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

/**
 * The club's three theme colors, falling back to the platform default per field.
 * A malformed color survives to `generateTheme`, which substitutes the default
 * rather than throwing — a bad hex must not take a club's pages down.
 */
export function getClubTheme(settings: unknown): ThemeColors {
  const theme = getClubSettings(settings).theme;
  return { ...DEFAULT_THEME, ...theme };
}
