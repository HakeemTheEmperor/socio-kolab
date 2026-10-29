// Lighthouse performance + accessibility (mobile preset: Slow 4G simulated throttling, 4x CPU) per route.
// Logs in inside a persistent Chromium, then points Lighthouse at that same browser (cookies are kept).
// Usage: node metrics/browser/lighthouse.mjs [outName] ; env RUNS, ONLY
import fs from "node:fs";
import { chromium } from "playwright";
import lighthouse from "lighthouse";
import { BASE, RUNS, median, range, ids, routeList, ADMIN_ROUTES, login, environment, browserVersion, save } from "./common.mjs";

const out = process.argv[2] ?? "lighthouse";
const id = await ids();
const PORT = 9341;
const routes = [...routeList(id).map((r) => ({ ...r, who: r.auth ? "president@club.test" : null })), ...ADMIN_ROUTES.map((r) => ({ ...r, who: "admin@platform.test" }))]
  .filter((r) => !process.env.ONLY || r.name.includes(process.env.ONLY));

const results = {};
let currentWho = "__none__", ctx = null;
async function session(who) {
  if (who === currentWho) return;
  if (ctx) await ctx.close();
  const dir = fs.mkdtempSync("/tmp/lh-profile-");
  ctx = await chromium.launchPersistentContext(dir, { headless: true, args: [`--remote-debugging-port=${PORT}`] });
  const p = await ctx.newPage();
  if (who) await login(p, who);
  await p.goto("about:blank");
  currentWho = who;
}
for (const r of routes.sort((a, b) => String(a.who).localeCompare(String(b.who)))) {
  await session(r.who);
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    const res = await lighthouse(BASE + r.path, { port: PORT, output: "json", logLevel: "error", onlyCategories: ["performance", "accessibility"], formFactor: "mobile", screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false }, throttlingMethod: "simulate" });
    const lhr = res.lhr;
    const a = lhr.audits;
    runs.push({
      perf: Math.round(lhr.categories.performance.score * 100), a11y: Math.round(lhr.categories.accessibility.score * 100),
      fcp: a["first-contentful-paint"].numericValue, lcp: a["largest-contentful-paint"].numericValue, tbt: a["total-blocking-time"].numericValue, cls: a["cumulative-layout-shift"].numericValue, si: a["speed-index"].numericValue,
      finalUrl: lhr.finalDisplayedUrl.replace(BASE, ""), a11yFails: Object.values(lhr.audits).filter((x) => x.scoreDisplayMode === "binary" && x.score === 0 && lhr.categories.accessibility.auditRefs.some((ref) => ref.id === x.id)).map((x) => x.id),
    });
  }
  const col = (k) => runs.map((x) => x[k]);
  results[r.name] = { path: r.path, runs, summary: Object.fromEntries(["perf", "a11y", "fcp", "lcp", "tbt", "cls", "si"].map((k) => [k, { median: median(col(k)), min: range(col(k))[0], max: range(col(k))[1] }])) };
  const s = results[r.name].summary;
  console.log(r.name.padEnd(32), `perf ${s.perf.median} [${s.perf.min}-${s.perf.max}]  a11y ${s.a11y.median} [${s.a11y.min}-${s.a11y.max}]  LCP ${s.lcp.median.toFixed(0)}  TBT ${s.tbt.median.toFixed(0)}  CLS ${s.cls.median.toFixed(3)}  ${runs[0].finalUrl !== r.path ? "REDIRECT→" + runs[0].finalUrl : ""} ${runs[0].a11yFails.join(",")}`);
}
if (ctx) await ctx.close();
save(out, { environment: { ...environment(await browserVersion()), lighthouse: "lighthouse 13.6.0, preset: mobile, simulate throttling (Slow 4G 150ms RTT/1638 Kbps, 4x CPU)" }, runs: RUNS, results });
process.exit(0);
