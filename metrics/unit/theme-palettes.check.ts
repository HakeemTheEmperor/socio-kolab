import { writeFileSync, mkdirSync } from "node:fs";
import { describe, it } from "vitest";
import { colord, extend } from "colord";
import a11yPlugin from "colord/plugins/a11y";

import { DEFAULT_THEME, generateTheme, validateTheme, type ThemeTokens } from "@/lib/theme";
import { mulberry32 } from "./prng";

extend([a11yPlugin]);

const N = Number(process.env.PALETTES ?? 10_000);
const SEED = Number(process.env.SEED ?? 20260101);
const AA_TEXT = 4.5;

/** [foreground token, background token, label]. Every pair is real text in the UI:
 *  body text, muted captions, button/chip labels, and badge labels on their tints.
 *  `--text-faint` is excluded: no component uses it for text (only globals.css defines it). */
const TEXT_PAIRS: [keyof ThemeTokens, keyof ThemeTokens][] = [
  ["--text", "--bg"],
  ["--text", "--surface"],
  ["--text-muted", "--bg"],
  ["--text-muted", "--surface"],
  ["--primary-fg", "--primary"],
  ["--accent-fg", "--accent"],
  ["--primary-tint-fg", "--primary-tint"],
  ["--accent-tint-fg", "--accent-tint"],
  ["--success-tint-fg", "--success-tint"],
  ["--danger-tint-fg", "--danger-tint"],
  ["--warning-tint-fg", "--warning-tint"],
  ["--info-tint-fg", "--info-tint"],
];

const hex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

function uniformRgb(rand: () => number) {
  const c = () => hex(rand() * 255, rand() * 255, rand() * 255);
  return [c(), c(), c()] as const;
}
/** Plausible brand colours: any hue, saturation 25–100%, lightness 15–85%. */
function brandHsl(rand: () => number) {
  const c = () =>
    colord({ h: rand() * 360, s: 25 + rand() * 75, l: 15 + rand() * 70 }).toHex();
  return [c(), c(), c()] as const;
}

function failingPairs(t: ThemeTokens) {
  const out: string[] = [];
  for (const [fg, bg] of TEXT_PAIRS) {
    if (colord(t[fg]).contrast(t[bg]) < AA_TEXT) out.push(`${fg} on ${bg}`);
  }
  return out;
}

function run(name: string, gen: (r: () => number) => readonly [string, string, string]) {
  const rand = mulberry32(SEED);
  let textFail = 0;
  let passedValidator = 0;
  let falsePass = 0; // validator ok:true but some text pair < 4.5
  let blockedAndFailing = 0;
  let blockedButTextFine = 0;
  const perPair: Record<string, number> = {};
  const perPairFalsePass: Record<string, number> = {};
  const examples: unknown[] = [];

  for (let i = 0; i < N; i++) {
    const [bg, primary, accent] = gen(rand);
    const tokens = generateTheme(bg, primary, accent);
    const fails = failingPairs(tokens);
    const v = validateTheme(bg, primary, accent);
    if (fails.length) {
      textFail++;
      for (const f of fails) perPair[f] = (perPair[f] ?? 0) + 1;
    }
    if (v.ok) passedValidator++;
    if (v.ok && fails.length) {
      falsePass++;
      for (const f of fails) perPairFalsePass[f] = (perPairFalsePass[f] ?? 0) + 1;
      if (examples.length < 5) examples.push({ bg, primary, accent, fails });
    }
    if (!v.ok && fails.length) blockedAndFailing++;
    if (!v.ok && !fails.length) blockedButTextFine++;
  }
  return {
    name, palettes: N, seed: SEED,
    paletteWithFailingText: textFail,
    validatorAccepted: passedValidator,
    validatorRejected: N - passedValidator,
    failingTextAndBlocked: blockedAndFailing,
    failingTextAndAccepted_falsePasses: falsePass,
    blockedButTextFine,
    perPairFailures: perPair,
    perPairFalsePasses: perPairFalsePass,
    examples,
  };
}

describe("theme palettes", () => {
  it("measures contrast failures and validator coverage", () => {
    const results = [run("uniform random RGB", uniformRgb), run("random brand-like HSL", brandHsl)];
    const d = generateTheme(DEFAULT_THEME.background, DEFAULT_THEME.primary, DEFAULT_THEME.accent);
    const defaults = { failingPairs: failingPairs(d), validator: validateTheme(DEFAULT_THEME.background, DEFAULT_THEME.primary, DEFAULT_THEME.accent) };
    mkdirSync("metrics/results", { recursive: true });
    const out = process.env.OUT ?? "metrics/results/theme-palettes.json";
    writeFileSync(out, JSON.stringify({ results, defaults }, null, 2));
    console.log(JSON.stringify({ results: results.map(({ examples, ...r }) => r), defaults }, null, 2));
  });
});
