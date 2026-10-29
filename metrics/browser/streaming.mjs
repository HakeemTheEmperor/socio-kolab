// Streaming: when does the loading skeleton reach the DOM and get painted, versus when the real content is in?
// Skeleton = element[data-slot="skeleton"]. "Full content" = first moment after which no skeleton remains
// and the route's main landmark has content. Times are performance.now() from navigation start.
// Usage: node metrics/browser/streaming.mjs [outName] ; env RUNS, BASE, THROTTLE=0 to disable throttling
import { chromium } from "playwright";
import { BASE, RUNS, MOBILE, throttle, median, range, ids, makeStorage, environment, browserVersion, save } from "./common.mjs";

const out = process.argv[2] ?? "streaming";
const useThrottle = process.env.THROTTLE !== "0";
const INIT = () => {
  const w = window; w.__s = { skelDom: null, skelPaint: null, fullDom: null, fullPaint: null, skelSeen: false };
  const raf2 = (cb) => requestAnimationFrame(() => requestAnimationFrame(cb));
  const check = () => {
    const n = document.querySelectorAll('[data-slot="skeleton"]').length;
    if (n > 0 && w.__s.skelDom === null) { w.__s.skelDom = performance.now(); w.__s.skelSeen = true; raf2(() => { w.__s.skelPaint = performance.now(); }); }
    const main = document.querySelector("main, [data-slot], body");
    if (w.__s.skelSeen && n === 0 && w.__s.fullDom === null) { w.__s.fullDom = performance.now(); raf2(() => { w.__s.fullPaint = performance.now(); }); }
    if (!w.__s.skelSeen && n === 0 && document.readyState !== "loading" && w.__s.fullDom === null && document.body && document.body.innerText.length > 50) { w.__s.fullDom = performance.now(); raf2(() => { w.__s.fullPaint = performance.now(); }); }
  };
  new MutationObserver(check).observe(document, { childList: true, subtree: true });
  document.addEventListener("readystatechange", check); document.addEventListener("DOMContentLoaded", check);
};

const id = await ids();
const exec = await makeStorage("president@club.test", "metrics/results/raw/state-exec.json");
const s = "/demo-club";
const routes = [
  { name: "/[club]/events (in-page Suspense)", path: `${s}/events` },
  { name: "/[club]/members (in-page Suspense)", path: `${s}/members` },
  { name: "/[club]/partners (in-page Suspense)", path: `${s}/partners` },
  { name: "/[club]/elections (in-page Suspense)", path: `${s}/elections` },
  { name: "/[club]/dashboard (loading.tsx)", path: `${s}/dashboard` },
  { name: "/[club]/dues (loading.tsx)", path: `${s}/dues` },
  { name: "/[club]/events/[id] (loading.tsx)", path: `${s}/events/${id.event}` },
  { name: "/[club]/members/[id] (loading.tsx)", path: `${s}/members/${id.member}` },
  { name: "/[club]/partners/[id] (loading.tsx)", path: `${s}/partners/${id.partner}` },
  { name: "/[club]/settings (loading.tsx)", path: `${s}/settings` },
  { name: "/[club]/profile (loading.tsx)", path: `${s}/profile` },
].filter((r) => !process.env.ONLY || r.name.includes(process.env.ONLY));

const browser = await chromium.launch();
const results = {};
for (const r of routes) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    const ctx = await browser.newContext({ ...MOBILE, storageState: exec });
    const page = await ctx.newPage();
    await page.addInitScript(INIT);
    if (useThrottle) await throttle(page);
    await page.goto(BASE + r.path, { waitUntil: "load", timeout: 90000 });
    await page.waitForFunction(() => window.__s.fullPaint !== null || document.readyState === "complete", null, { timeout: 60000 });
    await page.waitForTimeout(1500);
    const m = await page.evaluate(() => ({ ...window.__s, ttfb: performance.getEntriesByType("navigation")[0].responseStart, htmlEnd: performance.getEntriesByType("navigation")[0].responseEnd, fcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null }));
    runs.push(m);
    await ctx.close();
  }
  const col = (k) => runs.map((x) => x[k]).filter((v) => v != null);
  const gaps = runs.filter((x) => x.skelPaint != null && x.fullPaint != null).map((x) => x.fullPaint - x.skelPaint);
  results[r.name] = { path: r.path, skeletonSeenInRuns: runs.filter((x) => x.skelSeen).length, runs,
    summary: { ttfb: col("ttfb"), skelDom: col("skelDom"), skelPaint: col("skelPaint"), fullPaint: col("fullPaint"), gap: gaps }
      && Object.fromEntries(Object.entries({ ttfb: col("ttfb"), fcp: col("fcp"), skelDom: col("skelDom"), skelPaint: col("skelPaint"), fullPaint: col("fullPaint"), gap: gaps }).map(([k, v]) => [k, v.length ? { median: median(v), min: range(v)[0], max: range(v)[1], n: v.length } : null])) };
  const q = results[r.name].summary;
  console.log(r.name.padEnd(40), `skeleton seen ${results[r.name].skeletonSeenInRuns}/${RUNS}`, `TTFB ${q.ttfb?.median.toFixed(0)}  skel ${q.skelPaint?.median.toFixed(0) ?? "-"}  full ${q.fullPaint?.median.toFixed(0) ?? "-"}  gap ${q.gap?.median.toFixed(0) ?? "-"}`);
}
await browser.close();
save(out, { environment: { ...environment(await browserVersion()), network: useThrottle ? "throttled" : "unthrottled" }, runs: RUNS, results });
