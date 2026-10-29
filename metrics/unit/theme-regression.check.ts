import { mkdirSync, writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { colord, extend } from "colord";
import a11yPlugin from "colord/plugins/a11y";

import * as next from "@/lib/theme";
import * as legacy from "./legacy-theme";
import { mulberry32 } from "./prng";

extend([a11yPlugin]);
const N = Number(process.env.PALETTES ?? 10_000);
const SEED = Number(process.env.SEED ?? 20260101);
const PAIRS: [string, string][] = [
  ["--text", "--bg"], ["--text", "--surface"], ["--text-muted", "--bg"], ["--text-muted", "--surface"],
  ["--primary-fg", "--primary"], ["--accent-fg", "--accent"], ["--primary-tint-fg", "--primary-tint"],
  ["--accent-tint-fg", "--accent-tint"], ["--success-tint-fg", "--success-tint"], ["--danger-tint-fg", "--danger-tint"],
  ["--warning-tint-fg", "--warning-tint"], ["--info-tint-fg", "--info-tint"],
];
const readable = (t: Record<string, string>) => PAIRS.every(([f, b]) => colord(t[f]).contrast(t[b]) >= 4.5);

describe("theme fix does not change palettes that were already readable", () => {
  it("compares legacy and fixed generateTheme", () => {
    const rand = mulberry32(SEED);
    const hex = () => "#" + [0, 1, 2].map(() => Math.round(rand() * 255).toString(16).padStart(2, "0")).join("");
    let legacyReadable = 0, changedAmongReadable = 0, fixedNowReadable = 0, legacyUnreadable = 0, stillUnreadableAfterFix = 0;
    let validatorAcceptedLegacyReadable = 0, legacyReadableRejectedByNew = 0;
    for (let i = 0; i < N; i++) {
      const [bg, p, a] = [hex(), hex(), hex()];
      const old = legacy.generateTheme(bg, p, a) as Record<string, string>;
      const cur = next.generateTheme(bg, p, a) as Record<string, string>;
      if (readable(old)) {
        legacyReadable++;
        if (JSON.stringify(old) !== JSON.stringify(cur)) changedAmongReadable++;
        if (legacy.validateTheme(bg, p, a).ok) { validatorAcceptedLegacyReadable++; if (!next.validateTheme(bg, p, a).ok) legacyReadableRejectedByNew++; }
      } else {
        legacyUnreadable++;
        if (readable(cur)) fixedNowReadable++; else stillUnreadableAfterFix++;
      }
    }
    const r = { palettes: N, seed: SEED, legacyReadable, legacyUnreadable, changedAmongLegacyReadable: changedAmongReadable, legacyUnreadableNowReadable: fixedNowReadable, legacyUnreadableStillUnreadable: stillUnreadableAfterFix, legacyAcceptedAndReadable: validatorAcceptedLegacyReadable, ofThoseRejectedByNewValidator: legacyReadableRejectedByNew };
    mkdirSync("metrics/results", { recursive: true });
    writeFileSync("metrics/results/theme-regression.json", JSON.stringify(r, null, 2));
    console.log(JSON.stringify(r, null, 2));
  });
});
