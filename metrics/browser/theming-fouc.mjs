// Flash of unthemed content: for a themed club (beta-club, dark custom theme) and the default theme,
// record every frame the browser paints during load (CDP screencast), plus --bg/--primary on every animation frame
// before first paint, plus CLS. Also loads once with JavaScript disabled.
// Usage: node metrics/browser/theming-fouc.mjs [outName]
import fs from "node:fs";
import { chromium } from "playwright";
import { BASE, RUNS, MOBILE, throttle, median, range, makeStorage, environment, browserVersion, save, RAW } from "./common.mjs";

const out = process.argv[2] ?? "theming-fouc";
const THEMED = { bg: "#0a0a0a", primary: "#dc2626" };       // beta-club (see metrics/fixture.sql)
const DEFAULT = { bg: "#f8fafc", primary: "#4f46e5" };       // DEFAULT_THEME
const cases = [
  { name: "beta-club register (public, themed)", path: "/beta-club/register", expect: THEMED, state: null },
  { name: "beta-club dashboard (member, themed)", path: "/beta-club/dashboard", expect: THEMED, state: "president@beta.test" },
  { name: "demo-club register (default theme)", path: "/demo-club/register", expect: DEFAULT, state: null },
  { name: "/login (must NOT take a club theme)", path: "/login", expect: DEFAULT, state: null },
];
const INIT = () => {
  const w = window; w.__t = { frames: [], cls: 0, fcp: null, lcp: null };
  const po = (type, cb) => { try { new PerformanceObserver((l) => l.getEntries().forEach(cb)).observe({ type, buffered: true }); } catch {} };
  po("paint", (e) => { if (e.name === "first-contentful-paint") w.__t.fcp = e.startTime; });
  po("largest-contentful-paint", (e) => { w.__t.lcp = e.startTime; });
  po("layout-shift", (e) => { if (!e.hadRecentInput) w.__t.cls += e.value; });
  const tick = () => {
    const root = document.documentElement; const cs = getComputedStyle(root);
    const body = document.body ? getComputedStyle(document.body).backgroundColor : null;
    w.__t.frames.push({ t: performance.now(), bg: cs.getPropertyValue("--bg").trim().toLowerCase(), primary: cs.getPropertyValue("--primary").trim().toLowerCase(), body, painted: w.__t.fcp !== null });
    if (performance.now() < 4000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};
const hexOf = (s) => s; // tokens are emitted as lower-case hex by colord

const browser = await chromium.launch();
const results = {};
for (const c of cases) {
  const state = c.state ? await makeStorage(c.state, `${RAW}/state-${c.state}.json`) : undefined;
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    const ctx = await browser.newContext({ ...MOBILE, storageState: state });
    const page = await ctx.newPage();
    await page.addInitScript(INIT);
    const cdp = await throttle(page);
    const frames = [];
    cdp.on("Page.screencastFrame", async (f) => { frames.push({ ts: f.metadata.timestamp, data: f.data }); await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {}); });
    await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
    await page.goto(BASE + c.path, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    await cdp.send("Page.stopScreencast");
    const t = await page.evaluate(() => ({ ...window.__t, origin: performance.timeOrigin }));
    // The screencast also emits a blank compositor frame ~10 ms after navigation starts, long before the
    // document paints anything (it is the browser's default white surface, not page output). Judge only
    // frames from first contentful paint onward: those are what the user can actually see of the page.
    const keep = frames.map((f) => f.ts * 1000 >= t.origin + (t.fcp ?? 0) - 2);
    const prePaintBlank = keep.filter((k) => !k).length;
    // Sample corner pixel of each captured frame.
    const probe = await ctx.newPage();
    const px = [];
    for (const f of frames) px.push(await probe.evaluate(async (d) => { const img = new Image(); img.src = "data:image/png;base64," + d; await img.decode(); const cv = new OffscreenCanvas(img.width, img.height); const g = cv.getContext("2d"); g.drawImage(img, 0, 0); const p = g.getImageData(4, 4, 1, 1).data; return "#" + [p[0], p[1], p[2]].map((v) => v.toString(16).padStart(2, "0")).join(""); }, f.data));
    await probe.close();
    if (i === 0) { // keep first and last captured frames of run 0 as the "screenshot at first paint"
      const slug = c.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      fs.mkdirSync("metrics/results/screenshots", { recursive: true });
      const firstReal = frames.find((_, i) => keep[i]);
      if (firstReal) fs.writeFileSync(`metrics/results/screenshots/${out}-${slug}-first-frame.png`, Buffer.from(firstReal.data, "base64"));
      if (frames.length > 1) fs.writeFileSync(`metrics/results/screenshots/${out}-${slug}-last-frame.png`, Buffer.from(frames[frames.length - 1].data, "base64"));
    }
    const painted = t.frames.filter((f) => f.painted || true);
    const beforeFcp = t.frames.filter((f) => !f.painted && f.bg !== "");
    runs.push({
      framesCaptured: frames.length, framePixels: [...new Set(px.filter((_, i) => keep[i]))], firstFramePixel: px.find((_, i) => keep[i]) ?? null,
      prePaintBlankFrames: prePaintBlank,
      framesNotMatchingThemeBg: px.filter((p, i) => keep[i] && p !== c.expect.bg).length,
      rafFramesBeforeFcp: t.frames.filter((f) => !f.painted).length,
      rafFramesBeforeFcpWithWrongTokens: t.frames.filter((f) => !f.painted && f.bg !== "" && (f.bg !== c.expect.bg || f.primary !== c.expect.primary)).length,
      rafFramesAfterFcpWithWrongTokens: t.frames.filter((f) => f.painted && (f.bg !== c.expect.bg || f.primary !== c.expect.primary)).length,
      cls: t.cls, fcp: t.fcp,
    });
    await ctx.close();
  }
  // JS-disabled load: theme must already be in the HTML.
  const ctx = await browser.newContext({ ...MOBILE, javaScriptEnabled: false, storageState: state });
  const page = await ctx.newPage();
  await page.goto(BASE + c.path, { waitUntil: "load" });
  const noJs = await page.evaluate(() => { const cs = getComputedStyle(document.documentElement); return { bg: cs.getPropertyValue("--bg").trim().toLowerCase(), primary: cs.getPropertyValue("--primary").trim().toLowerCase(), bodyBg: getComputedStyle(document.body).backgroundColor }; }).catch(() => null);
  const slug = c.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  await page.screenshot({ path: `metrics/results/screenshots/${out}-${slug}-nojs.png` });
  await ctx.close();
  const sum = (k) => runs.map((r) => r[k]);
  results[c.name] = { path: c.path, expected: c.expect, runs, noJs,
    summary: { cls: { median: median(sum("cls")), min: range(sum("cls"))[0], max: range(sum("cls"))[1] },
      totalFramesCaptured: sum("framesCaptured").reduce((a, b) => a + b, 0),
      totalPrePaintBlankFramesIgnored: sum("prePaintBlankFrames").reduce((a, b) => a + b, 0),
      totalFramesNotMatchingThemeBg: sum("framesNotMatchingThemeBg").reduce((a, b) => a + b, 0),
      totalRafFramesBeforeFcpWrongTokens: sum("rafFramesBeforeFcpWithWrongTokens").reduce((a, b) => a + b, 0),
      totalRafFramesAfterFcpWrongTokens: sum("rafFramesAfterFcpWithWrongTokens").reduce((a, b) => a + b, 0),
      noJsTokensMatch: !!noJs && noJs.bg === c.expect.bg && noJs.primary === c.expect.primary } };
  console.log(c.name.padEnd(42), JSON.stringify(results[c.name].summary), "noJS", JSON.stringify(noJs), "pixels", JSON.stringify([...new Set(runs.flatMap((r) => r.framePixels))]));
}
await browser.close();
save(out, { environment: environment(await browserVersion()), runs: RUNS, results });
