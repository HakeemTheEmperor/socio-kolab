import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { colord, extend } from "colord";
import a11yPlugin from "colord/plugins/a11y";

import {
  DEFAULT_THEME,
  generateTheme,
  isDarkBackground,
  validateTheme,
} from "./theme";

extend([a11yPlugin]);

const DARK = { background: "#0A0A0A", primary: "#DC2626", accent: "#F97316" };

const luminance = (hex: string) => colord(hex).luminance();
const contrast = (a: string, b: string) => colord(a).contrast(b);

describe("generateTheme — light background", () => {
  const t = generateTheme(
    DEFAULT_THEME.background,
    DEFAULT_THEME.primary,
    DEFAULT_THEME.accent,
  );

  it("keeps the three given colors verbatim", () => {
    expect(t["--bg"]).toBe("#f8fafc");
    expect(t["--primary"]).toBe("#4f46e5");
    expect(t["--accent"]).toBe("#f59e0b");
  });

  it("lifts the surface above the background", () => {
    expect(luminance(t["--surface"])).toBeGreaterThan(luminance(t["--bg"]));
  });

  it("uses near-black text, readable on the background", () => {
    expect(luminance(t["--text"])).toBeLessThan(0.1);
    expect(contrast(t["--text"], t["--bg"])).toBeGreaterThanOrEqual(4.5);
  });

  it("fades muted then faint text toward the background", () => {
    expect(contrast(t["--text"], t["--bg"])).toBeGreaterThan(
      contrast(t["--text-muted"], t["--bg"]),
    );
    expect(contrast(t["--text-muted"], t["--bg"])).toBeGreaterThan(
      contrast(t["--text-faint"], t["--bg"]),
    );
  });

  it("darkens primary on hover, and further on active", () => {
    expect(luminance(t["--primary-hover"])).toBeLessThan(luminance(t["--primary"]));
    expect(luminance(t["--primary-active"])).toBeLessThan(
      luminance(t["--primary-hover"]),
    );
  });

  it("makes borders visible but weaker than border-strong", () => {
    expect(t["--border"]).not.toBe(t["--bg"]);
    expect(contrast(t["--border-strong"], t["--bg"])).toBeGreaterThan(
      contrast(t["--border"], t["--bg"]),
    );
  });

  it("keeps the primary tint close to the background", () => {
    expect(contrast(t["--primary-tint"], t["--bg"])).toBeLessThan(1.5);
    expect(contrast(t["--text"], t["--primary-tint"])).toBeGreaterThanOrEqual(4.5);
  });
});

describe("generateTheme — dark background", () => {
  const t = generateTheme(DARK.background, DARK.primary, DARK.accent);

  it("detects the dark theme", () => {
    expect(isDarkBackground(DARK.background)).toBe(true);
    expect(isDarkBackground(DEFAULT_THEME.background)).toBe(false);
  });

  it("flips to near-white text, readable on the background", () => {
    expect(luminance(t["--text"])).toBeGreaterThan(0.8);
    expect(contrast(t["--text"], t["--bg"])).toBeGreaterThanOrEqual(4.5);
  });

  it("still lifts the surface above the background", () => {
    expect(luminance(t["--surface"])).toBeGreaterThan(luminance(t["--bg"]));
  });

  it("lightens primary on hover instead of darkening it", () => {
    expect(luminance(t["--primary-hover"])).toBeGreaterThan(luminance(t["--primary"]));
    expect(luminance(t["--primary-active"])).toBeGreaterThan(
      luminance(t["--primary-hover"]),
    );
  });

  it("keeps borders visible against a near-black background", () => {
    expect(luminance(t["--border"])).toBeGreaterThan(luminance(t["--bg"]));
    expect(luminance(t["--border-strong"])).toBeGreaterThan(luminance(t["--border"]));
  });

  it("darkens tints toward the background so they stay legible", () => {
    // On a dark theme a tint must be dark, not the pale wash a light theme gets.
    expect(luminance(t["--primary-tint"])).toBeLessThan(0.2);
    expect(contrast(t["--text"], t["--primary-tint"])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t["--text"], t["--danger-tint"])).toBeGreaterThanOrEqual(4.5);
  });
});

describe("generateTheme — --primary-fg flips with the primary color", () => {
  it("uses near-white text on a dark primary", () => {
    const t = generateTheme("#FFFFFF", "#4F46E5", "#F59E0B");
    expect(t["--primary-fg"]).toBe("#f8fafc");
    expect(contrast(t["--primary-fg"], t["--primary"])).toBeGreaterThanOrEqual(4.5);
  });

  it("uses near-black text on a light primary", () => {
    const t = generateTheme("#0A0A0A", "#FDE047", "#22D3EE");
    expect(t["--primary-fg"]).toBe("#0f172a");
    expect(contrast(t["--primary-fg"], t["--primary"])).toBeGreaterThanOrEqual(4.5);
  });

  it("flips the accent foreground independently of the primary one", () => {
    const t = generateTheme("#FFFFFF", "#1E1B4B", "#FDE047");
    expect(t["--primary-fg"]).toBe("#f8fafc");
    expect(t["--accent-fg"]).toBe("#0f172a");
  });
});

describe("generateTheme — semantic colors", () => {
  it("holds the base hues constant across themes", () => {
    const light = generateTheme(
      DEFAULT_THEME.background,
      DEFAULT_THEME.primary,
      DEFAULT_THEME.accent,
    );
    const dark = generateTheme(DARK.background, DARK.primary, DARK.accent);

    for (const token of ["--success", "--danger", "--warning", "--info"] as const) {
      expect(dark[token]).toBe(light[token]);
    }
    expect(light["--danger"]).toBe("#dc2626");
  });

  it("recomputes the tints against the club background", () => {
    const light = generateTheme(
      DEFAULT_THEME.background,
      DEFAULT_THEME.primary,
      DEFAULT_THEME.accent,
    );
    const dark = generateTheme(DARK.background, DARK.primary, DARK.accent);

    expect(dark["--success-tint"]).not.toBe(light["--success-tint"]);
    expect(luminance(light["--success-tint"])).toBeGreaterThan(0.7);
    expect(luminance(dark["--success-tint"])).toBeLessThan(0.2);
  });
});

describe("generateTheme — invalid input", () => {
  it("falls back to the platform default rather than throwing", () => {
    const t = generateTheme("not-a-color", DEFAULT_THEME.primary, DEFAULT_THEME.accent);
    expect(t["--bg"]).toBe("#f8fafc");
  });
});

describe("generateTheme — text on tints is readable (badges)", () => {
  const themes = {
    light: generateTheme(
      DEFAULT_THEME.background,
      DEFAULT_THEME.primary,
      DEFAULT_THEME.accent,
    ),
    dark: generateTheme(DARK.background, DARK.primary, DARK.accent),
    // A club whose brand happens to collide with the semantic hues.
    red: generateTheme("#FFF1F2", "#B91C1C", "#DC2626"),
  };

  for (const [name, t] of Object.entries(themes)) {
    for (const kind of [
      "primary",
      "accent",
      "success",
      "danger",
      "warning",
      "info",
    ] as const) {
      it(`${name}: --${kind}-tint-fg clears AA on --${kind}-tint`, () => {
        expect(
          contrast(t[`--${kind}-tint-fg`], t[`--${kind}-tint`]),
        ).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it("keeps the ink the same hue as the semantic color it deepens", () => {
    const t = themes.light;
    // A deepened red is still red: hue barely moves, only lightness does.
    expect(Math.abs(colord(t["--danger-tint-fg"]).hue() - colord(t["--danger"]).hue()))
      .toBeLessThan(10);
    expect(colord(t["--danger-tint-fg"]).luminance()).toBeLessThan(
      colord(t["--danger"]).luminance(),
    );
  });
});

describe("globals.css fallback", () => {
  it("declares exactly the platform default tokens generateTheme produces", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const root = css.match(/^:root \{$([\s\S]*?)^\}$/m)?.[1] ?? "";
    const declared = Object.fromEntries(
      [...root.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)].map(([, k, v]) => [k, v.trim()]),
    );

    const expected = generateTheme(
      DEFAULT_THEME.background,
      DEFAULT_THEME.primary,
      DEFAULT_THEME.accent,
    );
    for (const [token, value] of Object.entries(expected)) {
      expect(declared[token], `globals.css is missing or has drifted on ${token}`).toBe(
        value,
      );
    }
  });
});

describe("validateTheme", () => {
  it("accepts the platform default (amber accent warns, does not block)", () => {
    const { ok, warnings } = validateTheme(
      DEFAULT_THEME.background,
      DEFAULT_THEME.primary,
      DEFAULT_THEME.accent,
    );
    expect(ok).toBe(true);
    expect(warnings.some((w) => w.includes("low contrast"))).toBe(true);
  });

  it("accepts the red-on-black club theme with no warnings at all", () => {
    const { ok, warnings } = validateTheme(DARK.background, DARK.primary, DARK.accent);
    expect(ok).toBe(true);
    expect(warnings).toEqual([]);
  });

  it("blocks a yellow primary on a white background", () => {
    const { ok, warnings } = validateTheme("#FFFFFF", "#FDE047", "#F59E0B");
    expect(ok).toBe(false);
    expect(warnings.some((w) => w.includes("primary"))).toBe(true);
  });

  it("blocks an accent that is invisible on the background", () => {
    // Near-white accent on white: below the 1.8 floor, so it blocks.
    const { ok, warnings } = validateTheme("#FFFFFF", "#4F46E5", "#FEFCE8");
    expect(ok).toBe(false);
    expect(warnings.some((w) => w.includes("almost invisible"))).toBe(true);
  });

  it("warns without blocking on a merely low-contrast accent", () => {
    // Amber on white: 2.1:1 — usable as a filled badge, not for text.
    const { ok, warnings } = validateTheme("#FFFFFF", "#4F46E5", "#F59E0B");
    expect(ok).toBe(true);
    expect(warnings.some((w) => w.includes("low contrast"))).toBe(true);
  });

  it("warns without blocking when primary and accent are near-identical", () => {
    const { ok, warnings } = validateTheme("#FFFFFF", "#4F46E5", "#4F46E5");
    expect(ok).toBe(true);
    expect(warnings).toContain("Your primary and accent colors are very similar.");
  });

  it("rejects a malformed color", () => {
    const { ok, warnings } = validateTheme("#FFFFFF", "rgb(oops)", "#F59E0B");
    expect(ok).toBe(false);
    expect(warnings.some((w) => w.includes("Primary"))).toBe(true);
  });
});
