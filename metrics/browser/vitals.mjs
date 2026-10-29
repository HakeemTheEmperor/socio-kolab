// Core Web Vitals per route on emulated mobile with Slow 4G + 4x CPU.
// Each run is a fresh browser context (cold cache, only the login cookie carried over).
// Usage: node metrics/browser/vitals.mjs [outName] ; env RUNS, ONLY (substring filter)
import { chromium } from "playwright";
import { BASE, RUNS, MOBILE, throttle, median, range, ids, routeList, ADMIN_ROUTES, makeStorage, environment, browserVersion, save } from "./common.mjs";

const out = process.argv[2] ?? "vitals";
const INIT = () => {
  const w = window;
  w.__m = { lcp: 0, cls: 0, fcp: 0, events: [] };
  const po = (type, cb, extra = {}) => { try { new PerformanceObserver((l) => l.getEntries().forEach(cb)).observe({ type, buffered: true, ...extra }); } catch {} };
  po("largest-contentful-paint", (e) => { w.__m.lcp = e.startTime; });
  po("paint", (e) => { if (e.name === "first-contentful-paint") w.__m.fcp = e.startTime; });
  // CLS: largest session window (1s gap, 5s cap), ignoring shifts right after input.
  let win = [], winVal = 0, best = 0;
  po("layout-shift", (e) => {
    if (e.hadRecentInput) return;
    const last = win[win.length - 1], first = win[0];
    if (win.length && e.startTime - last.startTime < 1000 && e.startTime - first.startTime < 5000) { win.push(e); winVal += e.value; }
    else { win = [e]; winVal = e.value; }
    best = Math.max(best, winVal); w.__m.cls = best;
  });
  // INP: group event entries by interactionId, take the worst per interaction, then p98 (== max for <50 interactions).
  const byId = new Map();
  po("event", (e) => { if (e.interactionId) byId.set(e.interactionId, Math.max(byId.get(e.interactionId) ?? 0, e.duration)); w.__m.events = [...byId.values()]; }, { durationThreshold: 16 });
};

async function interact(page) {
  // Route-agnostic, non-destructive interactions: switch a tab, type in a text input, open then close a menu/dialog trigger.
  const tab = page.locator('[role="tab"][aria-selected="false"]').first();
  if (await tab.count()) { await tab.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(250); }
  const input = page.locator('main input[type="text"], main input[type="search"], main input:not([type])').first();
  if (await input.count()) { await input.click({ timeout: 3000 }).catch(() => {}); await page.keyboard.type("ab", { delay: 40 }); await page.waitForTimeout(250); }
  const trig = page.locator('main button[aria-haspopup="dialog"], main button:has-text("Create event"), main button:has-text("Add partner")').first();
  if (await trig.count()) { await trig.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(400); await page.keyboard.press("Escape"); await page.waitForTimeout(250); }
  await page.waitForTimeout(300);
}

async function main() {
  const id = await ids();
  const exec = await makeStorage("president@club.test", `${"metrics/results/raw"}/state-exec.json`);
  const admin = await makeStorage("admin@platform.test", `metrics/results/raw/state-admin.json`);
  const routes = [...routeList(id).map((r) => ({ ...r, state: r.auth ? exec : null })), ...ADMIN_ROUTES.map((r) => ({ ...r, auth: true, state: admin }))]
    .filter((r) => !process.env.ONLY || r.name.includes(process.env.ONLY));
  const browser = await chromium.launch();
  const results = {};
  for (const r of routes) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      const ctx = await browser.newContext({ ...MOBILE, storageState: r.state ?? undefined });
      const page = await ctx.newPage();
      await page.addInitScript(INIT);
      await throttle(page);
      const resp = await page.goto(BASE + r.path, { waitUntil: "load", timeout: 90000 });
      await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const nav = await page.evaluate(() => { const n = performance.getEntriesByType("navigation")[0]; return { ttfb: n.responseStart, htmlEnd: n.responseEnd, load: n.loadEventEnd, dcl: n.domContentLoadedEventEnd }; });
      const before = await page.evaluate(() => ({ lcp: __m.lcp, cls: __m.cls, fcp: __m.fcp }));
      await interact(page);
      const m = await page.evaluate(() => ({ lcp: __m.lcp, cls: __m.cls, fcp: __m.fcp, inp: __m.events.length ? Math.max(...__m.events) : null, nInteractions: __m.events.length }));
      runs.push({ status: resp.status(), url: page.url().replace(BASE, ""), ttfb: nav.ttfb, htmlEnd: nav.htmlEnd, fcp: before.fcp, lcp: before.lcp, clsLoad: before.cls, clsTotal: m.cls, inp: m.inp, nInteractions: m.nInteractions, load: nav.load });
      await ctx.close();
    }
    const col = (k) => runs.map((x) => x[k]).filter((v) => v != null);
    results[r.name] = { path: r.path, runs, summary: Object.fromEntries(["ttfb", "htmlEnd", "fcp", "lcp", "clsLoad", "clsTotal", "inp"].map((k) => [k, col(k).length ? { median: median(col(k)), min: range(col(k))[0], max: range(col(k))[1], n: col(k).length } : null])) };
    const s = results[r.name].summary;
    console.log(r.name.padEnd(32), `status ${runs.map((x) => x.status).join(",")}`.padEnd(18), `TTFB ${s.ttfb.median.toFixed(0)}  FCP ${s.fcp.median.toFixed(0)}  LCP ${s.lcp.median.toFixed(0)}  CLS ${s.clsTotal.median.toFixed(4)}  INP ${s.inp ? s.inp.median.toFixed(0) : "n/a"}`);
  }
  await browser.close();
  save(out, { environment: environment(await browserVersion()), runs: RUNS, results });
}
main().catch((e) => { console.error(e); process.exit(1); });
