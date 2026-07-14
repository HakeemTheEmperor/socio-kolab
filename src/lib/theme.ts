import { colord, extend } from "colord";
import a11yPlugin from "colord/plugins/a11y";
import mixPlugin from "colord/plugins/mix";

extend([a11yPlugin, mixPlugin]);

/** The three colors a club chooses. Everything else is derived from them. */
export type ThemeColors = {
  background: string;
  primary: string;
  accent: string;
};

/** Platform default theme, used by non-club pages and by clubs that never customized. */
export const DEFAULT_THEME: ThemeColors = {
  background: "#F8FAFC",
  primary: "#4F46E5",
  accent: "#F59E0B",
};

/**
 * Semantic colors are fixed, not themeable: "Unpaid" must read as red under any
 * club's brand. Only their tints are recomputed against the club background.
 */
const SEMANTIC = {
  success: "#059669",
  danger: "#DC2626",
  warning: "#D97706",
  info: "#0284C7",
} as const;

const LIGHT_TEXT = "#F8FAFC";
const DARK_TEXT = "#0F172A";

/** Backgrounds below this relative luminance are treated as a dark theme. */
const DARK_LUMINANCE_THRESHOLD = 0.35;

/** WCAG minimum contrast for UI components. Primary must clear it: it carries
 *  links, icons and text drawn directly on the background. */
const MIN_PRIMARY_CONTRAST = 3;

/** Accent is used as a filled chip or tint — text on it gets `--accent-fg`, computed
 *  for contrast — so it need not be perceivable against the raw background the way
 *  primary must. Below this it disappears entirely; between the two we warn. */
const MIN_ACCENT_CONTRAST = 1.8;

/** Below this, primary and accent are too alike to distinguish. */
const MIN_PRIMARY_ACCENT_CONTRAST = 1.5;

/** Minimum contrast for text. Badge labels are 12px, so AA small text applies. */
const MIN_TEXT_CONTRAST = 4.5;

export type ThemeTokens = {
  "--bg": string;
  "--surface": string;
  "--surface-hover": string;
  "--border": string;
  "--border-strong": string;
  "--text": string;
  "--text-muted": string;
  "--text-faint": string;
  "--primary": string;
  "--primary-hover": string;
  "--primary-active": string;
  "--primary-tint": string;
  "--primary-tint-fg": string;
  "--primary-fg": string;
  "--accent": string;
  "--accent-hover": string;
  "--accent-tint": string;
  "--accent-tint-fg": string;
  "--accent-fg": string;
  "--success": string;
  "--success-tint": string;
  "--success-tint-fg": string;
  "--danger": string;
  "--danger-tint": string;
  "--danger-tint-fg": string;
  "--warning": string;
  "--warning-tint": string;
  "--warning-tint-fg": string;
  "--info": string;
  "--info-tint": string;
  "--info-tint-fg": string;
  "--ring": string;
};

/** Falls back to the platform default rather than throwing: a malformed color in
 *  a club's settings JSON should not take the page down. */
function safe(color: string, fallback: string): string {
  return colord(color).isValid() ? color : fallback;
}

export function isDarkBackground(background: string): boolean {
  return colord(background).luminance() < DARK_LUMINANCE_THRESHOLD;
}

/** Text color that sits ON `color`: white or near-black, whichever contrasts more. */
function foregroundOn(color: string): string {
  const c = colord(color);
  const winner = c.contrast(LIGHT_TEXT) >= c.contrast(DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT;
  return colord(winner).toHex();
}

/**
 * Derives the full token scale from a club's three colors. Pure — safe to call on
 * the server (layout injection) and on the client (settings live preview).
 */
/**
 * A legible text color for `color` drawn on its own tint.
 *
 * The raw hue is not it: amber on an amber tint is 2.7:1, well under AA for the
 * 12px text a badge is made of. Deepen it (or lighten it, on a dark theme) until
 * it clears the bar — it stays recognisably the same hue, so "Unpaid" still reads
 * as red, it just becomes readable.
 */
function inkOn(color: string, tint: string, dark: boolean): string {
  let ink = colord(color);
  for (let i = 0; i < 50 && ink.contrast(tint) < MIN_TEXT_CONTRAST; i++) {
    ink = dark ? ink.lighten(0.02) : ink.darken(0.02);
  }
  return ink.toHex();
}

export function generateTheme(
  background: string,
  primary: string,
  accent: string,
): ThemeTokens {
  const bg = colord(safe(background, DEFAULT_THEME.background));
  const brand = colord(safe(primary, DEFAULT_THEME.primary));
  const accentColor = colord(safe(accent, DEFAULT_THEME.accent));

  const dark = bg.luminance() < DARK_LUMINANCE_THRESHOLD;
  const text = colord(dark ? LIGHT_TEXT : DARK_TEXT);

  // On light themes the surface lifts toward white; on dark it lifts off the
  // background by a few percent. Either way it reads as raised.
  const surface = dark ? bg.mix("#FFFFFF", 0.06) : bg.mix("#FFFFFF", 0.7);

  // Shift a brand color for hover/active: down on light themes, up on dark.
  const shift = (c: ReturnType<typeof colord>, amount: number) =>
    dark ? c.lighten(amount) : c.darken(amount);

  const primaryTint = brand.mix(bg, 0.9).toHex();
  const accentTint = accentColor.mix(bg, 0.9).toHex();
  const tintOf = (color: string) => colord(color).mix(bg, 0.88).toHex();
  const semanticTints = {
    success: tintOf(SEMANTIC.success),
    danger: tintOf(SEMANTIC.danger),
    warning: tintOf(SEMANTIC.warning),
    info: tintOf(SEMANTIC.info),
  };

  return {
    "--bg": bg.toHex(),
    "--surface": surface.toHex(),
    "--surface-hover": surface.mix(text, 0.04).toHex(),
    "--border": bg.mix(text, 0.12).toHex(),
    "--border-strong": bg.mix(text, 0.24).toHex(),
    "--text": text.toHex(),
    "--text-muted": text.mix(bg, 0.45).toHex(),
    "--text-faint": text.mix(bg, 0.65).toHex(),

    "--primary": brand.toHex(),
    "--primary-hover": shift(brand, 0.08).toHex(),
    "--primary-active": shift(brand, 0.14).toHex(),
    "--primary-tint": primaryTint,
    "--primary-tint-fg": inkOn(brand.toHex(), primaryTint, dark),
    "--primary-fg": foregroundOn(brand.toHex()),

    "--accent": accentColor.toHex(),
    "--accent-hover": shift(accentColor, 0.08).toHex(),
    "--accent-tint": accentTint,
    "--accent-tint-fg": inkOn(accentColor.toHex(), accentTint, dark),
    "--accent-fg": foregroundOn(accentColor.toHex()),

    "--success": colord(SEMANTIC.success).toHex(),
    "--success-tint": semanticTints.success,
    "--success-tint-fg": inkOn(SEMANTIC.success, semanticTints.success, dark),
    "--danger": colord(SEMANTIC.danger).toHex(),
    "--danger-tint": semanticTints.danger,
    "--danger-tint-fg": inkOn(SEMANTIC.danger, semanticTints.danger, dark),
    "--warning": colord(SEMANTIC.warning).toHex(),
    "--warning-tint": semanticTints.warning,
    "--warning-tint-fg": inkOn(SEMANTIC.warning, semanticTints.warning, dark),
    "--info": colord(SEMANTIC.info).toHex(),
    "--info-tint": semanticTints.info,
    "--info-tint-fg": inkOn(SEMANTIC.info, semanticTints.info, dark),

    "--ring": brand.toHex(),
  };
}

export type ThemeValidation = {
  /** False when the theme must not be saved. `warnings` then holds the reasons. */
  ok: boolean;
  warnings: string[];
};

/**
 * Rejects themes that would be unreadable. Run server-side in the settings action —
 * the client preview calls it too, but the server is the boundary.
 */
export function validateTheme(
  background: string,
  primary: string,
  accent: string,
): ThemeValidation {
  const warnings: string[] = [];
  let ok = true;

  const inputs: [string, string][] = [
    ["Background", background],
    ["Primary", primary],
    ["Accent", accent],
  ];
  for (const [label, value] of inputs) {
    if (!colord(value).isValid()) {
      warnings.push(`${label} is not a valid color.`);
      ok = false;
    }
  }
  if (!ok) return { ok, warnings };

  const bg = colord(background);
  const primaryContrast = bg.contrast(primary);
  const accentContrast = bg.contrast(accent);

  if (primaryContrast < MIN_PRIMARY_CONTRAST) {
    ok = false;
    warnings.push(
      `Your primary color does not stand out enough against the background (contrast ${primaryContrast.toFixed(1)}:1, needs at least ${MIN_PRIMARY_CONTRAST}:1). Pick a darker or lighter primary.`,
    );
  }
  if (accentContrast < MIN_ACCENT_CONTRAST) {
    ok = false;
    warnings.push(
      `Your accent color is almost invisible against the background (contrast ${accentContrast.toFixed(1)}:1, needs at least ${MIN_ACCENT_CONTRAST}:1). Pick a darker or lighter accent.`,
    );
  } else if (accentContrast < MIN_PRIMARY_CONTRAST) {
    warnings.push(
      `Your accent color is low contrast against the background (${accentContrast.toFixed(1)}:1). It will work as a filled badge or button, but avoid relying on it for text or icons.`,
    );
  }
  if (colord(primary).contrast(accent) < MIN_PRIMARY_ACCENT_CONTRAST) {
    warnings.push("Your primary and accent colors are very similar.");
  }

  return { ok, warnings };
}
